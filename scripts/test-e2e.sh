#!/bin/bash

# E2E测试启动脚本
# 确保在运行E2E测试前正确构建和准备环境，并启动所有必要服务

set -e  # 遇到错误立即退出

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 开始E2E测试准备...${NC}"

# 检查当前目录
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ 错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

# 检查pnpm是否安装
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}❌ 错误: pnpm未安装，请先安装pnpm${NC}"
    exit 1
fi

# 记录PIDs以便清理
PIDS=()

# 清理函数
cleanup() {
    echo -e "\n${YELLOW}🧹 清理后台进程...${NC}"
    for pid in "${PIDS[@]}"; do
        if kill -0 $pid 2>/dev/null; then
            echo "Killing process $pid"
            kill $pid
        fi
    done
    wait
    echo -e "${GREEN}✅ 清理完成${NC}"
}

# 注册清理钩子
trap cleanup EXIT INT TERM

# 1. 安装依赖
echo -e "${GREEN}📦 安装依赖...${NC}"
pnpm install

# 2. 构建项目
echo -e "${GREEN}🔨 构建项目...${NC}"
pnpm build

# 3. 准备测试数据库
echo -e "${GREEN}🗄️  准备测试数据库...${NC}"
cd apps/oauth-service-rust

# 确保测试数据库目录存在
mkdir -p data

# 如果测试数据库存在，先备份
if [ -f "test.db" ]; then
    echo "📋 备份现有测试数据库..."
    cp test.db "test.db.backup.$(date +%Y%m%d_%H%M%S)"
    rm test.db
fi

# 运行数据库迁移
echo "🔄 运行数据库迁移..."
DATABASE_URL="file:./test.db" pnpm db:migrate

# 运行种子数据
echo "🌱 插入种子数据..."
DATABASE_URL="file:./test.db" pnpm db:seed

cd ../..

# 4. 启动服务
echo -e "${GREEN}🚀 启动服务...${NC}"

# 4.1 启动 OAuth Service (Port 3001)
echo "Starting OAuth Service..."
export DATABASE_URL="file:$(pwd)/apps/oauth-service-rust/test.db"
export JWT_SECRET="test-jwt-secret-key-for-e2e-testing"
export ENCRYPTION_KEY="test-encryption-key-32-chars-long"
export RUST_LOG=info

# 使用 cargo run 启动 oauth-service
(cd apps/oauth-service-rust && cargo run --bin oauth-service > ../../oauth-service.log 2>&1) &
PIDS+=($!)

# 4.2 启动 Admin Portal (Port 3002)
echo "Starting Admin Portal..."
# 使用 pnpm start 启动生产构建
(cd apps/admin-portal && pnpm start -p 3002 > ../../admin-portal.log 2>&1) &
PIDS+=($!)

# 4.3 启动 Pingora Proxy (Port 6188)
echo "Starting Pingora Proxy..."
(cd apps/pingora-proxy && cargo run > ../../pingora-proxy.log 2>&1) &
PIDS+=($!)

# 5. 等待服务就绪
echo -e "${YELLOW}⏳ 等待服务启动...${NC}"

wait_for_port() {
    local port=$1
    local service=$2
    local max_attempts=60
    local attempt=1

    echo -n "Waiting for $service on port $port..."
    while ! nc -z localhost $port >/dev/null 2>&1; do
        if [ $attempt -ge $max_attempts ]; then
            echo -e "\n${RED}❌ Timeout waiting for $service${NC}"
            exit 1
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done
    echo -e " ${GREEN}OK${NC}"
}

wait_for_port 3001 "OAuth Service"
wait_for_port 3002 "Admin Portal"
wait_for_port 6188 "Pingora Proxy"

echo -e "${GREEN}✅ 所有服务已启动${NC}"

# 6. 安装Playwright浏览器 (如果需要)
if [ ! -d "apps/admin-portal/node_modules/@playwright" ]; then
    echo -e "${GREEN}🌐 安装Playwright浏览器...${NC}"
    cd apps/admin-portal
    pnpm exec playwright install chromium
    cd ../..
fi

# 7. 运行E2E测试
echo -e "${GREEN}🧪 运行E2E测试...${NC}"
cd apps/admin-portal

# 设置测试环境变量
export NODE_ENV=test
export NEXT_PUBLIC_OAUTH_SERVICE_URL="http://localhost:3001"
export NEXT_PUBLIC_APP_URL="http://localhost:3002"

# 运行测试
if [ "$1" = "--headed" ]; then
    echo "🖥️  运行有头模式测试..."
    pnpm exec playwright test --headed
elif [ "$1" = "--debug" ]; then
    echo "🐛 运行调试模式测试..."
    pnpm exec playwright test --debug
elif [ "$1" = "--ui" ]; then
    echo "🎨 运行UI模式测试..."
    pnpm exec playwright test --ui
else
    echo "🤖 运行无头模式测试..."
    pnpm exec playwright test
fi

TEST_EXIT_CODE=$?

echo -e "${GREEN}✅ E2E测试完成！${NC}"

# 显示测试结果
if [ -f "test-results.json" ]; then
    echo "📊 测试结果已保存到: apps/admin-portal/test-results.json"
fi

exit $TEST_EXIT_CODE