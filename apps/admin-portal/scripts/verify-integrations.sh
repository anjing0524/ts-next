#!/bin/bash

# 生产就绪集成验证脚本
# 验证 CSP、Sentry 和 Web Vitals 的正确配置

set -e

echo "=========================================="
echo "生产就绪集成验证脚本"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查计数
PASSED=0
FAILED=0
WARNINGS=0

# 辅助函数
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++)) || true
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++)) || true
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++)) || true
}

echo "1. 检查 Sentry 集成"
echo "-------------------"

# 检查 Sentry 配置文件
if [ -f "sentry.client.config.ts" ]; then
    check_pass "Sentry 客户端配置文件存在"
else
    check_fail "Sentry 客户端配置文件缺失"
fi

if [ -f "sentry.server.config.ts" ]; then
    check_pass "Sentry 服务端配置文件存在"
else
    check_fail "Sentry 服务端配置文件缺失"
fi

if [ -f "sentry.edge.config.ts" ]; then
    check_pass "Sentry Edge 配置文件存在"
else
    check_fail "Sentry Edge 配置文件缺失"
fi

# 检查 ErrorBoundary
if [ -f "components/error/ErrorBoundary.tsx" ]; then
    check_pass "ErrorBoundary 组件存在"
else
    check_fail "ErrorBoundary 组件缺失"
fi

# 检查 Sentry 依赖
if grep -q "@sentry/nextjs" package.json; then
    check_pass "Sentry 依赖已安装"
else
    check_fail "Sentry 依赖未安装"
fi

# 检查 next.config.js 中的 Sentry 配置
if grep -q "withSentryConfig" next.config.js; then
    check_pass "Next.js 配置包含 Sentry"
else
    check_fail "Next.js 配置缺少 Sentry"
fi

# 检查环境变量示例
if grep -q "SENTRY_DSN" .env.example; then
    check_pass "环境变量示例包含 SENTRY_DSN"
else
    check_warn "环境变量示例缺少 SENTRY_DSN"
fi

echo ""
echo "2. 检查 Web Vitals 集成"
echo "----------------------"

# 检查 Web Vitals 模块
if [ -f "lib/analytics/web-vitals.ts" ]; then
    check_pass "Web Vitals 监控模块存在"
else
    check_fail "Web Vitals 监控模块缺失"
fi

# 检查 web-vitals 依赖
if grep -q "web-vitals" package.json; then
    check_pass "web-vitals 依赖已安装"
else
    check_fail "web-vitals 依赖未安装"
fi

# 检查 WebVitalsReporter 是否集成到 app-providers
if grep -q "WebVitalsReporter" providers/app-providers.tsx; then
    check_pass "WebVitalsReporter 已集成到 app-providers"
else
    check_fail "WebVitalsReporter 未集成到 app-providers"
fi

echo ""
echo "3. 检查 CSP 策略"
echo "----------------"

# 检查 proxy.ts 中的 nonce 实现
if grep -q "generateNonce" proxy.ts; then
    check_pass "CSP nonce 生成函数存在"
else
    check_fail "CSP nonce 生成函数缺失"
fi

if grep -q "getContentSecurityPolicy" proxy.ts; then
    check_pass "CSP 策略函数存在"
else
    check_fail "CSP 策略函数缺失"
fi

# 检查是否移除了 unsafe-inline
if grep -q "unsafe-inline" proxy.ts; then
    check_fail "CSP 仍包含 unsafe-inline (安全风险)"
else
    check_pass "CSP 已移除 unsafe-inline"
fi

# 检查是否移除了 unsafe-eval
if grep -q "unsafe-eval" proxy.ts; then
    check_fail "CSP 仍包含 unsafe-eval (安全风险)"
else
    check_pass "CSP 已移除 unsafe-eval"
fi

# 检查是否使用 nonce
if grep -q "'nonce-" proxy.ts; then
    check_pass "CSP 使用 nonce 机制"
else
    check_fail "CSP 未使用 nonce 机制"
fi

echo ""
echo "4. 检查环境变量配置"
echo "------------------"

if [ -f ".env.example" ]; then
    check_pass ".env.example 文件存在"

    # 检查必需的环境变量
    if grep -q "NEXT_PUBLIC_SENTRY_DSN" .env.example; then
        check_pass "包含 NEXT_PUBLIC_SENTRY_DSN"
    else
        check_warn "缺少 NEXT_PUBLIC_SENTRY_DSN"
    fi

    if grep -q "NEXT_PUBLIC_APP_VERSION" .env.example; then
        check_pass "包含 NEXT_PUBLIC_APP_VERSION"
    else
        check_warn "缺少 NEXT_PUBLIC_APP_VERSION"
    fi
else
    check_fail ".env.example 文件缺失"
fi

echo ""
echo "5. 检查文档"
echo "----------"

if [ -f "../../PRODUCTION_READINESS_FIXES_SUMMARY.md" ]; then
    check_pass "生产就绪修复总结文档存在"
else
    check_warn "生产就绪修复总结文档缺失"
fi

if [ -f "../../FRONTEND_IMPLEMENTATION_COMPREHENSIVE_REVIEW.md" ]; then
    check_pass "前端审查文档存在"
else
    check_warn "前端审查文档缺失"
fi

echo ""
echo "=========================================="
echo "验证结果总结"
echo "=========================================="
echo -e "${GREEN}通过: $PASSED${NC}"
echo -e "${RED}失败: $FAILED${NC}"
echo -e "${YELLOW}警告: $WARNINGS${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ 所有关键集成验证通过！${NC}"
    echo ""
    echo "下一步："
    echo "1. 在 .env.local 中配置 SENTRY_DSN"
    echo "2. 启动开发服务器测试集成"
    echo "3. 触发错误测试 Sentry 上报"
    echo "4. 检查浏览器控制台的 Web Vitals 日志"
    exit 0
else
    echo -e "${RED}✗ 有 $FAILED 项检查失败，请修复后重试${NC}"
    exit 1
fi
