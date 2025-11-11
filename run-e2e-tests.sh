#!/bin/bash

set -e

# 清除代理环境变量，防止干扰测试
unset http_proxy
unset https_proxy

echo "给服务一些启动时间..."
sleep 5

echo "=================================================="
echo "🧪 OAuth 2.1 & Admin Portal E2E 测试执行脚本"
echo "=================================================="
echo ""

# 色彩输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 配置
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ADMIN_PORTAL_DIR="$PROJECT_ROOT/apps/admin-portal"
DATABASE_DIR="$PROJECT_ROOT/packages/database"
OAUTH_SERVICE_DIR="$PROJECT_ROOT/apps/oauth-service-rust"

echo -e "${YELLOW}📋 环境检查${NC}"
echo ""

# 检查服务是否运行
echo "检查 OAuth Service (端口 3001)..."
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
  echo -e "${GREEN}✅ OAuth Service 运行中${NC}"
else
  echo -e "${RED}❌ OAuth Service 未运行${NC}"
  echo "   请在另一个终端启动: cd apps/oauth-service-rust && cargo run"
  exit 1
fi

echo ""
echo "检查 Admin Portal (端口 3002)..."
if curl -s http://localhost:3002 > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Admin Portal 运行中${NC}"
else
  echo -e "${RED}❌ Admin Portal 未运行${NC}"
  echo "   请在另一个终端启动: cd apps/admin-portal && pnpm dev"
  exit 1
fi

echo ""
echo "检查 Pingora (端口 6188)..."
if curl -s http://localhost:6188 > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Pingora 运行中${NC}"
else
  echo -e "${RED}❌ Pingora 未运行${NC}"
  echo "   请在另一个终端启动: cd apps/pingora-proxy && cargo run"
  exit 1
fi

echo ""
echo -e "${YELLOW}🔧 数据库准备${NC}"
echo ""

# 检查是否需要重新初始化数据库
if [ -f "$DATABASE_DIR/prisma/dev.db" ]; then
  echo "检测到现有数据库文件..."
  echo "为了确保E2E测试环境干净，将重新初始化数据库"
  rm -f "$DATABASE_DIR/prisma/dev.db"
  echo -e "${GREEN}✅ 旧数据库已删除${NC}"
fi

echo ""
echo "初始化Prisma数据库..."
cd "$DATABASE_DIR"

# 生成Prisma客户端
echo "生成Prisma客户端..."
npx prisma generate

# 推送schema到数据库
echo "应用数据库schema..."
npx prisma db push --skip-generate

# 种子化数据
echo "加载测试数据..."
npx tsx prisma/seed.ts

echo -e "${GREEN}✅ 数据库初始化完成${NC}"

echo ""
echo -e "${YELLOW}🧪 运行E2E测试${NC}"
echo ""

cd "$ADMIN_PORTAL_DIR"

# 检查测试文件是否存在
# if [ ! -d "tests/e2e/specs" ]; then
#   echo -e "${RED}❌ 测试目录不存在${NC}"
#   exit 1
# fi

echo "测试用例发现:"
find tests/e2e/specs -name "*.spec.ts" | wc -l | xargs echo "  共" && echo "  个测试文件"
echo ""

# 运行测试
echo "启动Playwright测试运行器..."
pnpm test:e2e

TEST_EXIT_CODE=$?

echo ""
echo "=================================================="

if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✅ 所有E2E测试通过！${NC}"
  echo ""
  echo "📊 查看测试报告:"
  echo "   npx playwright show-report"
  echo ""
else
  echo -e "${RED}❌ 部分E2E测试失败${NC}"
  echo ""
  echo "📊 查看测试报告:"
  echo "   npx playwright show-report"
  echo ""
  exit 1
fi

echo "=================================================="
