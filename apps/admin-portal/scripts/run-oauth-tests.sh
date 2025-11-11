#!/bin/bash

# OAuth 2.1 集成测试脚本
# 专为 Next.js 15 + Playwright E2E 测试设计

set -e

echo "🚀 OAuth 2.1 集成测试启动"
echo "================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查依赖
command -v pnpm >/dev/null 2>&1 || { echo -e "${RED}❌ pnpm 未安装${NC}"; exit 1; }
command -v node >/dev/null 2>&1 || { echo -e "${RED}❌ Node.js 未安装${NC}"; exit 1; }

# 安装Playwright浏览器
echo -e "${BLUE}📦 安装Playwright浏览器...${NC}"
cd "$(dirname "$0")/.."
pnpm playwright:install

# 检查数据库连接
echo -e "${BLUE}🔍 检查数据库状态...${NC}"
if [ -f "../../packages/database/prisma/dev.db" ]; then
    echo -e "${GREEN}✅ 数据库文件存在${NC}"
else
    echo -e "${YELLOW}⚠️  数据库文件不存在，正在初始化...${NC}"
    cd ../../packages/database
    pnpm db:generate
    pnpm db:push --force-reset
    pnpm db:seed
    cd ../../apps/admin-portal
fi

# 启动服务（如果未运行）
echo -e "${BLUE}🔄 启动测试服务...${NC}"

# 检查服务是否已在运行
if ! curl -s http://localhost:3001/api/v2/health > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  OAuth服务未运行，正在启动...${NC}"
    cd ../oauth-service
    nohup pnpm dev > oauth-service.log 2>&1 &
    OAUTH_PID=$!
    cd ../admin-portal
    
    # 等待服务启动
    echo -e "${BLUE}⏳ 等待OAuth服务启动...${NC}"
    for i in {1..30}; do
        if curl -s http://localhost:3001/api/v2/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ OAuth服务已启动${NC}"
            break
        fi
        if [ $i -eq 30 ]; then
            echo -e "${RED}❌ OAuth服务启动超时${NC}"
            exit 1
        fi
        sleep 2
    done
else
    echo -e "${GREEN}✅ OAuth服务已在运行${NC}"
fi

if ! curl -s http://localhost:3002/api/v2/health > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Admin门户未运行，正在启动...${NC}"
    nohup pnpm dev > admin-portal.log 2>&1 &
    ADMIN_PID=$!
    
    # 等待服务启动
    echo -e "${BLUE}⏳ 等待Admin门户启动...${NC}"
    for i in {1..30}; do
        if curl -s http://localhost:3002/api/v2/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Admin门户已启动${NC}"
            break
        fi
        if [ $i -eq 30 ]; then
            echo -e "${RED}❌ Admin门户启动超时${NC}"
            exit 1
        fi
        sleep 2
    done
else
    echo -e "${GREEN}✅ Admin门户已在运行${NC}"
fi

# 运行测试
echo -e "${BLUE}🧪 开始OAuth集成测试...${NC}"
echo "测试内容包括："
echo "  • 用户名密码登录流程"
echo "  • OAuth按钮授权流程"
echo "  • PKCE实现验证"
echo "  • 令牌交换和会话管理"
echo "  • 错误处理和边界情况"
echo ""

# 设置测试环境变量
export NODE_ENV=test
export DATABASE_URL="file:./test.db"

# 运行测试并生成报告
test_result=0
if pnpm test:e2e:integration --reporter=line; then
    echo -e "${GREEN}🎉 所有OAuth集成测试通过！${NC}"
else
    echo -e "${RED}❌ 部分测试失败${NC}"
    test_result=1
fi

# 生成详细报告
echo -e "${BLUE}📊 生成测试报告...${NC}"
pnpm test:e2e:report

# 清理（可选）
if [ "$CLEANUP" != "false" ]; then
    echo -e "${BLUE}🧹 清理测试环境...${NC}"
    
    # 清理日志文件
    rm -f oauth-service.log admin-portal.log
    
    # 清理测试数据库
    if [ -f "../../packages/database/prisma/test.db" ]; then
        rm -f ../../packages/database/prisma/test.db
    fi
fi

echo "================================="
if [ $test_result -eq 0 ]; then
    echo -e "${GREEN}✅ OAuth 2.1 集成测试完成成功！${NC}"
    echo ""
    echo "📋 测试摘要："
    echo "  • 用户名密码登录: ✅"
    echo "  • OAuth按钮授权: ✅"
    echo "  • PKCE安全验证: ✅"
    echo "  • 会话管理: ✅"
    echo "  • 错误处理: ✅"
    echo ""
    echo "🔗 访问链接："
    echo "  • 管理后台: http://localhost:3002"
    echo "  • 测试账号: admin/adminpassword"
    echo "  • 测试报告: file://$(pwd)/playwright-report/index.html"
else
    echo -e "${RED}❌ 测试完成，但存在失败项${NC}"
fi

exit $test_result