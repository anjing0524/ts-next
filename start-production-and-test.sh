#!/bin/bash

# Admin Portal Production Startup and Testing Script
# 一键启动生产版本并运行所有验证

set -e

# Color definitions
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ROOT="/Users/liushuo/code/ts-next-template"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Admin Portal Production Setup & Testing${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Check if all services are running
echo -e "${YELLOW}步骤 1: 检查服务状态${NC}"
echo ""

check_service() {
    local name=$1
    local port=$2
    local url=$3
    
    echo -ne "检查 $name ($port)... "
    if curl -s "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 运行中${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  未响应${NC}"
        return 1
    fi
}

OAUTH_OK=0
ADMIN_OK=0
PINGORA_OK=0

check_service "OAuth Service" "3001" "http://localhost:3001/health" && OAUTH_OK=1 || OAUTH_OK=0
check_service "Admin Portal" "3002" "http://localhost:3002/health" && ADMIN_OK=1 || ADMIN_OK=0
check_service "Pingora Proxy" "6188" "http://localhost:6188" && PINGORA_OK=1 || PINGORA_OK=0

echo ""

if [ $OAUTH_OK -eq 0 ]; then
    echo -e "${RED}❌ OAuth Service 未运行！${NC}"
    echo "请在终端 1 运行: cd $PROJECT_ROOT/apps/oauth-service-rust && cargo run"
    exit 1
fi

if [ $ADMIN_OK -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Admin Portal 未运行或正在运行 dev 模式${NC}"
    echo ""
    echo "你需要在另一个终端执行以下命令："
    echo ""
    echo -e "${BLUE}cd $PROJECT_ROOT/apps/admin-portal${NC}"
    echo -e "${BLUE}pnpm start${NC}"
    echo ""
    echo "然后重新运行此脚本"
    exit 1
fi

if [ $PINGORA_OK -eq 0 ]; then
    echo -e "${RED}❌ Pingora Proxy 未运行！${NC}"
    echo "请在终端 3 运行: cd $PROJECT_ROOT/apps/pingora-proxy && cargo run"
    exit 1
fi

echo -e "${GREEN}✅ 所有服务已启动！${NC}"
echo ""

# Step 2: Verify database
echo -e "${YELLOW}步骤 2: 验证数据库${NC}"
echo ""

DB_PATH="$PROJECT_ROOT/packages/database/prisma/dev.db"
if [ -f "$DB_PATH" ]; then
    DB_SIZE=$(ls -lh "$DB_PATH" | awk '{print $5}')
    echo -e "数据库文件大小: ${GREEN}$DB_SIZE${NC}"
    echo -e "${GREEN}✅ 数据库已初始化${NC}"
else
    echo -e "${RED}❌ 数据库不存在！${NC}"
    exit 1
fi

echo ""

# Step 3: Run integration check
echo -e "${YELLOW}步骤 3: 运行集成检查${NC}"
echo ""

cd "$PROJECT_ROOT"
if [ -f "check-integration.sh" ]; then
    chmod +x check-integration.sh
    ./check-integration.sh | tail -20
else
    echo -e "${YELLOW}⚠️  check-integration.sh 不存在${NC}"
fi

echo ""

# Step 4: Run OAuth flow tests
echo -e "${YELLOW}步骤 4: 运行 OAuth 流程测试${NC}"
echo ""

if [ -f "$PROJECT_ROOT/test-oauth-flow.sh" ]; then
    chmod +x "$PROJECT_ROOT/test-oauth-flow.sh"
    "$PROJECT_ROOT/test-oauth-flow.sh"
else
    echo -e "${YELLOW}⚠️  test-oauth-flow.sh 不存在${NC}"
fi

echo ""

# Step 5: Run E2E tests
echo -e "${YELLOW}步骤 5: 运行 E2E 测试套件${NC}"
echo ""

cd "$PROJECT_ROOT/apps/admin-portal"

echo "运行 E2E 测试..."
echo ""

if pnpm test:e2e; then
    echo ""
    echo -e "${GREEN}✅ E2E 测试全部通过！${NC}"
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${GREEN}✅ 集成验证完成！${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "成功的下一步:"
    echo "1. 浏览器打开: http://localhost:6188/admin"
    echo "2. 用凭证登录: admin / adminpassword"
    echo "3. 验证管理后台功能"
    echo "4. 可选: 运行更详细的测试 pnpm test:e2e:ui"
    exit 0
else
    echo ""
    echo -e "${YELLOW}⚠️  某些 E2E 测试失败${NC}"
    echo ""
    echo "调试建议:"
    echo "1. 查看上面的错误信息"
    echo "2. 运行交互式测试: pnpm test:e2e:ui"
    echo "3. 查看测试报告: pnpm test:e2e:report"
    echo "4. 运行调试模式: pnpm test:e2e:debug"
    exit 1
fi
