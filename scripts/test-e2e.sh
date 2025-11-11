#!/bin/bash

# E2E测试启动脚本
# 确保在运行E2E测试前正确构建和准备环境

set -e  # 遇到错误立即退出

echo "🚀 开始E2E测试准备..."

# 检查当前目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 检查pnpm是否安装
if ! command -v pnpm &> /dev/null; then
    echo "❌ 错误: pnpm未安装，请先安装pnpm"
    exit 1
fi

# 1. 安装依赖
echo "📦 安装依赖..."
pnpm install

# 2. 构建项目
echo "🔨 构建项目..."
pnpm build

# 3. 检查端口是否被占用
echo "🔍 检查端口占用情况..."
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  警告: 端口3001已被占用，可能影响oauth-service启动"
fi

if lsof -Pi :3002 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  警告: 端口3002已被占用，可能影响admin-portal启动"
fi

# 4. 准备测试数据库
echo "🗄️  准备测试数据库..."
cd apps/oauth-service

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

# 返回项目根目录
cd ../..

# 5. 安装Playwright浏览器
echo "🌐 安装Playwright浏览器..."
cd apps/admin-portal
pnpm exec playwright install chromium
cd ../..

# 6. 运行E2E测试
echo "🧪 运行E2E测试..."
cd apps/admin-portal

# 设置测试环境变量
export NODE_ENV=test
export DATABASE_URL="file:./test.db"
export NEXT_PUBLIC_OAUTH_SERVICE_URL="http://localhost:3001"
export NEXT_PUBLIC_APP_URL="http://localhost:3002"
export JWT_SECRET="test-jwt-secret-key-for-e2e-testing"
export ENCRYPTION_KEY="test-encryption-key-32-chars-long"

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

echo "✅ E2E测试完成！"

# 显示测试结果
if [ -f "test-results.json" ]; then
    echo "📊 测试结果已保存到: apps/admin-portal/test-results.json"
fi

if [ -d "test-results" ]; then
    echo "📁 测试输出目录: apps/admin-portal/test-results/"
fi