#!/bin/bash

# Production Build Script for OAuth 2.1 Integration
set -e

echo "🚀 Starting Production Build Process..."

# 1. 环境检查
echo "📋 Checking environment..."
if [[ -z "$NODE_ENV" ]]; then
  export NODE_ENV=production
fi

echo "Environment: $NODE_ENV"

# 2. 清理旧构建
echo "🧹 Cleaning previous builds..."
rm -rf apps/oauth-service/.next
rm -rf apps/admin-portal/.next
rm -rf node_modules/.cache

# 3. 安装依赖
echo "📦 Installing production dependencies..."
pnpm install --frozen-lockfile

# 4. 数据库准备
echo "🗄️ Preparing database..."
cd packages/database
pnpm prisma generate
pnpm prisma db push --force-reset
pnpm prisma db seed
cd ../..

# 5. 构建所有应用
echo "🏗️ Building applications..."
pnpm turbo build --filter=oauth-service --filter=admin-portal

# 6. 验证构建结果
echo "✅ Validating builds..."
if [ -d "apps/oauth-service/.next" ]; then
  echo "✅ oauth-service build successful"
else
  echo "❌ oauth-service build failed"
  exit 1
fi

if [ -d "apps/admin-portal/.next" ]; then
  echo "✅ admin-portal build successful"
else
  echo "❌ admin-portal build failed"
  exit 1
fi

# 7. 优化构建产物
echo "⚡ Optimizing build outputs..."
# 可以添加压缩、tree-shaking等优化步骤

# 8. 生成构建报告
echo "📊 Build Summary:"
echo "- oauth-service: $(du -sh apps/oauth-service/.next | cut -f1)"
echo "- admin-portal: $(du -sh apps/admin-portal/.next | cut -f1)"

echo "🎉 Production build completed successfully!"