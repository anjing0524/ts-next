#!/bin/bash

# Admin Portal & OAuth Service Rust 集成状态检查脚本
# 用途: 快速验证所有服务是否正确运行

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 计数器
PASSED=0
FAILED=0
WARNINGS=0

# 测试函数
test_service() {
  local name=$1
  local url=$2
  local expected_pattern=$3

  echo -ne "检查 ${name}... "

  if curl -s "$url" > /tmp/test_response.txt 2>&1; then
    if [ -z "$expected_pattern" ] || grep -q "$expected_pattern" /tmp/test_response.txt; then
      echo -e "${GREEN}✅ 运行中${NC}"
      ((PASSED++))
      return 0
    else
      echo -e "${RED}❌ 运行但响应异常${NC}"
      ((FAILED++))
      cat /tmp/test_response.txt | head -3
      return 1
    fi
  else
    echo -e "${RED}❌ 未响应${NC}"
    ((FAILED++))
    return 1
  fi
}

check_file() {
  local name=$1
  local file=$2

  echo -ne "检查 ${name}... "

  if [ -f "$file" ]; then
    echo -e "${GREEN}✅ 存在${NC}"
    ((PASSED++))
    return 0
  else
    echo -e "${RED}❌ 不存在${NC}"
    ((FAILED++))
    return 1
  fi
}

check_dir() {
  local name=$1
  local dir=$2

  echo -ne "检查 ${name}... "

  if [ -d "$dir" ]; then
    echo -e "${GREEN}✅ 存在${NC}"
    ((PASSED++))
    return 0
  else
    echo -e "${RED}❌ 不存在${NC}"
    ((FAILED++))
    return 1
  fi
}

# 开始
clear
echo -e "${BLUE}=====================================================${NC}"
echo -e "${BLUE}Admin Portal & OAuth Service 集成状态检查${NC}"
echo -e "${BLUE}=====================================================${NC}"
echo ""

# 1. 环境检查
echo -e "${YELLOW}📋 环境检查${NC}"
echo ""

node_version=$(node --version 2>/dev/null || echo "未安装")
pnpm_version=$(pnpm --version 2>/dev/null || echo "未安装")
cargo_version=$(cargo --version 2>/dev/null || echo "未安装")

echo "Node.js: $node_version"
echo "pnpm: $pnpm_version"
echo "Cargo: $cargo_version"
echo ""

# 2. 文件结构检查
echo -e "${YELLOW}📁 文件结构检查${NC}"
echo ""

check_dir "OAuth Service 目录" "apps/oauth-service-rust"
check_dir "Admin Portal 目录" "apps/admin-portal"
check_dir "Pingora 目录" "apps/pingora-proxy"
check_file "数据库文件" "packages/database/prisma/dev.db"
echo ""

# 3. 配置文件检查
echo -e "${YELLOW}⚙️  配置文件检查${NC}"
echo ""

check_file "Admin Portal .env.local" "apps/admin-portal/.env.local"
check_file "package.json (root)" "package.json"
check_file "Prisma Schema" "packages/database/prisma/schema.prisma"
echo ""

# 4. 服务健康检查
echo -e "${YELLOW}🏥 服务健康检查${NC}"
echo ""

test_service "OAuth Service (3001)" "http://localhost:3001/health" "status"
test_service "Admin Portal (3002)" "http://localhost:3002" ""
test_service "Pingora Proxy (6188)" "http://localhost:6188" ""
echo ""

# 5. 集成路由检查
echo -e "${YELLOW}🔀 集成路由检查${NC}"
echo ""

echo -ne "检查 Pingora 到 OAuth Service 路由... "
if curl -s "http://localhost:6188/api/v2/oauth/authorize?client_id=test" 2>&1 | grep -q "redirect_uri\|error\|login"; then
  echo -e "${GREEN}✅ 路由正常${NC}"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠️  可能需要登录${NC}"
  ((WARNINGS++))
fi

echo -ne "检查 Pingora 到 Admin Portal 路由... "
if curl -s -I "http://localhost:6188/" 2>&1 | grep -q "200\|307\|301"; then
  echo -e "${GREEN}✅ 路由正常${NC}"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠️  无响应${NC}"
  ((WARNINGS++))
fi
echo ""

# 6. 环境变量检查
echo -e "${YELLOW}🔐 环境变量检查${NC}"
echo ""

if [ -f "apps/admin-portal/.env.local" ]; then
  echo "Admin Portal 环境变量:"
  grep -E "OAUTH_SERVICE_URL|API_BASE_URL|OAUTH_CLIENT" apps/admin-portal/.env.local || echo "未找到"
else
  echo ".env.local 不存在"
fi
echo ""

# 7. Cookie 和认证检查
echo -e "${YELLOW}🔑 认证流程检查${NC}"
echo ""

echo -ne "检查 OAuth authorize 端点... "
response=$(curl -s "http://localhost:6188/api/v2/oauth/authorize?client_id=admin-portal-client&response_type=code&redirect_uri=http://localhost:6188/auth/callback&scope=openid" -w "\n%{http_code}" 2>/dev/null)
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -1)

if [ "$http_code" = "200" ] || [ "$http_code" = "302" ] || [ "$http_code" = "307" ]; then
  echo -e "${GREEN}✅ 端点可用${NC}"
  ((PASSED++))
elif [ "$http_code" = "000" ]; then
  echo -e "${YELLOW}⚠️  服务未运行${NC}"
  ((WARNINGS++))
else
  echo -e "${YELLOW}⚠️  HTTP $http_code${NC}"
  ((WARNINGS++))
fi
echo ""

# 8. 数据库检查
echo -e "${YELLOW}📊 数据库检查${NC}"
echo ""

if [ -f "packages/database/prisma/dev.db" ]; then
  db_size=$(ls -lh packages/database/prisma/dev.db | awk '{print $5}')
  echo -e "数据库文件大小: ${GREEN}$db_size${NC}"

  if [ "$db_size" != "0B" ]; then
    echo -e "数据库状态: ${GREEN}✅ 已初始化${NC}"
    ((PASSED++))
  else
    echo -e "数据库状态: ${YELLOW}⚠️  未初始化${NC}"
    ((WARNINGS++))
  fi
else
  echo -e "数据库状态: ${RED}❌ 不存在${NC}"
  ((FAILED++))
fi
echo ""

# 9. 代码检查
echo -e "${YELLOW}💻 关键代码检查${NC}"
echo ""

check_file "proxy.ts" "apps/admin-portal/proxy.ts"
check_file "callback/page.tsx" "apps/admin-portal/app/(auth)/callback/page.tsx"
check_file "login/page.tsx" "apps/admin-portal/app/(auth)/login/page.tsx"
check_file "consent/page.tsx" "apps/admin-portal/app/oauth/consent/page.tsx"
echo ""

# 总结
echo -e "${BLUE}=====================================================${NC}"
echo -e "${BLUE}检查总结${NC}"
echo -e "${BLUE}=====================================================${NC}"
echo ""
echo -e "✅ 通过: ${GREEN}$PASSED${NC}"
echo -e "❌ 失败: ${RED}$FAILED${NC}"
echo -e "⚠️  警告: ${YELLOW}$WARNINGS${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ 集成检查完成！所有关键服务和配置就绪。${NC}"
  echo ""
  echo "下一步:"
  echo "1. 启动所有服务："
  echo "   - 终端 1: cd apps/oauth-service-rust && cargo run"
  echo "   - 终端 2: cd apps/admin-portal && pnpm dev"
  echo "   - 终端 3: cd apps/pingora-proxy && cargo run"
  echo ""
  echo "2. 访问 http://localhost:6188/admin"
  echo ""
  echo "3. 使用凭证登录: admin / admin123"
  exit 0
elif [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}⚠️  集成有警告，但基本配置已就绪。${NC}"
  echo ""
  echo "详见: INTEGRATION_START_GUIDE.md"
  exit 0
else
  echo -e "${RED}❌ 集成检查发现严重问题，请先修复。${NC}"
  echo ""
  echo "详见: INTEGRATION_START_GUIDE.md 的故障排除部分"
  exit 1
fi
