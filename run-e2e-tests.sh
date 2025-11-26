#!/bin/bash

# E2E 测试启动脚本
# 启动所有必要的服务并运行 E2E 测试

set -e

echo "════════════════════════════════════════════════════════════════"
echo "  E2E 测试启动脚本"
echo "════════════════════════════════════════════════════════════════"

# 检查依赖
echo "📦 检查依赖..."
if ! command -v pnpm &> /dev/null; then
    echo "❌ 错误: 未找到 pnpm"
    exit 1
fi

echo "✅ pnpm 已安装: $(pnpm --version)"

# 检查 Node 版本
echo "✅ Node 版本: $(node --version)"

# 清理旧的进程
echo "🧹 清理旧的进程..."
pkill -f "next dev" || true
pkill -f "cargo run" || true
pkill -f "pingora-proxy" || true
sleep 2

# 检查端口是否被占用
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null 2>&1; then
        echo "⚠️  端口 $port 已被占用，尝试清理..."
        lsof -i :$port | awk 'NR!=1 {print $2}' | xargs -r kill -9 || true
        sleep 1
    fi
}

echo "🔍 检查端口..."
check_port 3001  # oauth-service-rust
check_port 3002  # admin-portal
check_port 6188  # pingora-proxy

# 启动服务
echo ""
echo "🚀 启动服务..."
echo "   - OAuth Service (port 3001)"
echo "   - Admin Portal (port 3002)"
echo "   - Pingora Proxy (port 6188)"
echo ""

# 启动服务在后台
pnpm turbo dev --parallel --filter=admin-portal --filter=oauth-service-rust --filter=pingora-proxy > /tmp/services.log 2>&1 &
SERVICES_PID=$!

echo "⏳ 等待服务启动..."
sleep 10

# 检查服务是否启动
echo "✓ 检查服务状态..."

# 检查 admin-portal
if nc -z localhost 3002 2>/dev/null; then
    echo "   ✅ Admin Portal (3002) 已启动"
else
    echo "   ❌ Admin Portal (3002) 未启动"
    kill $SERVICES_PID || true
    tail -50 /tmp/services.log
    exit 1
fi

# 检查 oauth-service
if nc -z localhost 3001 2>/dev/null; then
    echo "   ✅ OAuth Service (3001) 已启动"
else
    echo "   ❌ OAuth Service (3001) 未启动"
    kill $SERVICES_PID || true
    tail -50 /tmp/services.log
    exit 1
fi

# 检查 pingora-proxy
if nc -z localhost 6188 2>/dev/null; then
    echo "   ✅ Pingora Proxy (6188) 已启动"
else
    echo "   ⚠️  Pingora Proxy (6188) 未启动，可能需要额外时间..."
    sleep 5
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  运行 E2E 测试"
echo "════════════════════════════════════════════════════════════════"
echo ""

# 运行 E2E 测试
cd apps/admin-portal

pnpm test:e2e

TEST_EXIT_CODE=$?

# 清理
echo ""
echo "🧹 清理..."
kill $SERVICES_PID || true
sleep 2

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "  ✅ 所有 E2E 测试通过！"
    echo "════════════════════════════════════════════════════════════════"
else
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "  ❌ 部分 E2E 测试失败"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "查看完整日志:"
    echo "  cat /tmp/services.log"
    echo ""
    echo "查看测试报告:"
    echo "  pnpm --filter=admin-portal test:e2e:report"
fi

exit $TEST_EXIT_CODE
