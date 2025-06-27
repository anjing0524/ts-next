#!/bin/bash

# OAuth2认证中心端到端测试执行脚本
# 用于启动服务并执行Playwright测试

set -e

echo "🚀 开始OAuth2认证中心端到端测试..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 清理函数
cleanup() {
    echo -e "${YELLOW}🧹 清理测试环境...${NC}"
    
    # 杀掉可能运行的服务
    pkill -f "pnpm.*dev.*3002" || true
    pkill -f "pnpm.*start.*3001" || true
    pkill -f "next.*dev.*3002" || true
    pkill -f "next.*start.*3001" || true
    
    echo -e "${GREEN}✅ 测试环境已清理${NC}"
}

# 设置清理陷阱
trap cleanup EXIT

# 检查依赖
echo "📋 检查依赖..."
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}❌ pnpm 未安装，请先安装 pnpm${NC}"
    exit 1
fi

if ! command -v npx &> /dev/null; then
    echo -e "${RED}❌ npx 未安装，请先安装 Node.js${NC}"
    exit 1
fi

# 安装依赖
echo "📦 安装依赖..."
pnpm install

# 构建项目
echo "🔨 构建OAuth服务..."
cd apps/oauth-service
pnpm build
cd ../..

echo "🔨 构建Admin Portal..."
cd apps/admin-portal  
pnpm build
cd ../..

# 启动OAuth服务
echo "🌐 启动OAuth服务 (端口3001)..."
cd apps/oauth-service
pnpm start &
OAUTH_PID=$!
cd ../..

# 等待OAuth服务启动
echo "⏳ 等待OAuth服务启动..."
for i in {1..30}; do
    if curl -s http://localhost:3001/api/v2/.well-known/openid-configuration > /dev/null; then
        echo -e "${GREEN}✅ OAuth服务已启动${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ OAuth服务启动超时${NC}"
        exit 1
    fi
    sleep 2
done

# 启动Admin Portal
echo "🌐 启动Admin Portal (端口3002)..."
cd apps/admin-portal
pnpm dev --port 3002 &
ADMIN_PID=$!
cd ../..

# 等待Admin Portal启动
echo "⏳ 等待Admin Portal启动..."
for i in {1..30}; do
    if curl -s http://localhost:3002/api/menu > /dev/null; then
        echo -e "${GREEN}✅ Admin Portal已启动${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Admin Portal启动超时${NC}"
        exit 1
    fi
    sleep 2
done

# 运行健康检查
echo "🏥 运行服务健康检查..."

# 检查OAuth服务健康
OAUTH_HEALTH=$(curl -s -w "%{http_code}" http://localhost:3001/api/v2/.well-known/openid-configuration -o /dev/null)
if [ "$OAUTH_HEALTH" != "200" ]; then
    echo -e "${RED}❌ OAuth服务健康检查失败 (HTTP $OAUTH_HEALTH)${NC}"
    exit 1
fi

# 检查Admin Portal健康
ADMIN_HEALTH=$(curl -s -w "%{http_code}" http://localhost:3002/api/menu -o /dev/null)
if [ "$ADMIN_HEALTH" != "200" ]; then
    echo -e "${RED}❌ Admin Portal健康检查失败 (HTTP $ADMIN_HEALTH)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 所有服务健康检查通过${NC}"

# 安装Playwright浏览器
echo "🎭 安装Playwright浏览器..."
npx playwright install

# 运行Playwright测试
echo "🧪 运行端到端测试..."
npx playwright test

# 检查测试结果
if [ $? -eq 0 ]; then
    echo -e "${GREEN}🎉 所有测试通过！${NC}"
    
    # 生成测试报告
    echo "📊 生成测试报告..."
    npx playwright show-report --host 0.0.0.0 --port 9323 &
    REPORT_PID=$!
    
    echo -e "${GREEN}📊 测试报告已生成，访问 http://localhost:9323 查看详细报告${NC}"
    echo -e "${YELLOW}💡 按 Ctrl+C 关闭报告服务器${NC}"
    
    # 等待用户中断
    wait $REPORT_PID
else
    echo -e "${RED}❌ 测试失败，查看详细信息：${NC}"
    echo "   - 测试报告: playwright-report/index.html"
    echo "   - 测试结果: test-results/"
    echo "   - 失败截图: test-results/*/test-failed-*.png"
    exit 1
fi 