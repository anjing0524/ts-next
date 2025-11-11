#!/bin/bash

# Color definitions
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Production Setup Verification${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if Admin Portal is running
echo -ne "检查 Admin Portal (3002)... "
if curl -s http://localhost:3002/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 运行中${NC}"
else
    echo -e "${RED}❌ 未响应${NC}"
    echo "请先运行: cd apps/admin-portal && pnpm start"
    exit 1
fi

# Check OAuth Service
echo -ne "检查 OAuth Service (3001)... "
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 运行中${NC}"
else
    echo -e "${RED}❌ 未响应${NC}"
fi

# Check Pingora
echo -ne "检查 Pingora Proxy (6188)... "
if curl -s -I http://localhost:6188 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 运行中${NC}"
else
    echo -e "${RED}❌ 未响应${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ 所有服务已启动！${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "下一步:"
echo "1. 浏览器打开: http://localhost:6188/admin"
echo "2. 用凭证登录: admin / adminpassword"
echo "3. 运行 E2E 测试: cd apps/admin-portal && pnpm test:e2e"
echo ""
