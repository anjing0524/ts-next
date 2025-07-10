#!/bin/bash

# 环境配置设置脚本
# 用于设置 admin-portal 和 oauth-service 的环境配置

echo "设置环境配置文件..."

# 生成JWT密钥 - 使用正确的PKCS#8格式
JWT_SECRET=$(openssl rand -base64 32)

# 生成RSA密钥对 - PKCS#8格式
echo "生成RSA密钥对..."
openssl genrsa -out /tmp/private_key.pem 2048 2>/dev/null
openssl pkcs8 -topk8 -inform PEM -outform PEM -in /tmp/private_key.pem -out /tmp/private_key_pkcs8.pem -nocrypt 2>/dev/null
openssl rsa -in /tmp/private_key.pem -pubout -out /tmp/public_key.pem 2>/dev/null

# 读取密钥内容
JWT_PRIVATE_KEY=$(cat /tmp/private_key_pkcs8.pem)
JWT_PUBLIC_KEY=$(cat /tmp/public_key.pem)

# 验证密钥格式
echo "验证密钥格式..."
echo "私钥前50字符: ${JWT_PRIVATE_KEY:0:50}"
echo "公钥前50字符: ${JWT_PUBLIC_KEY:0:50}"

# 清理临时文件
rm -f /tmp/private_key.pem /tmp/private_key_pkcs8.pem /tmp/public_key.pem

# 创建 admin-portal 环境配置
cat > apps/admin-portal/.env.local << EOF
# Admin Portal 环境配置
# 服务配置
NEXT_PUBLIC_OAUTH_SERVICE_URL=http://localhost:3001
NEXT_PUBLIC_ADMIN_PORTAL_URL=http://localhost:3002

# 数据库配置
DATABASE_URL=file:../../packages/database/prisma/dev.db

# OAuth 客户端配置
NEXT_PUBLIC_OAUTH_CLIENT_ID=auth-center-admin-client
NEXT_PUBLIC_OAUTH_REDIRECT_URI=http://localhost:3002/auth/callback

# 安全配置
NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=http://localhost:3002

# 开发环境配置
NODE_ENV=development
NEXT_PUBLIC_APP_ENV=development

# 日志配置
LOG_LEVEL=debug
EOF

# 创建 oauth-service 环境配置
cat > apps/oauth-service/.env.local << EOF
# OAuth Service 环境配置
# 服务配置
PORT=3001
NODE_ENV=development

# 数据库配置
DATABASE_URL=file:../../packages/database/prisma/dev.db

# JWT配置
JWT_SECRET=${JWT_SECRET}
JWT_PRIVATE_KEY=${JWT_PRIVATE_KEY}
JWT_PUBLIC_KEY=${JWT_PUBLIC_KEY}
JWT_ISSUER=http://localhost:3001
JWT_AUDIENCE=auth-center-admin-client

# JWKS配置
JWKS_URI=http://localhost:3001/.well-known/jwks.json

# OAuth配置
OAUTH_ISSUER=http://localhost:3001
OAUTH_AUTHORIZATION_ENDPOINT=http://localhost:3001/api/v2/oauth/authorize
OAUTH_TOKEN_ENDPOINT=http://localhost:3001/api/v2/oauth/token
OAUTH_USERINFO_ENDPOINT=http://localhost:3001/api/v2/oauth/userinfo

# 安全配置
CORS_ORIGIN=http://localhost:3002
SESSION_SECRET=your-session-secret-here

# 日志配置
LOG_LEVEL=debug
EOF

echo "环境配置文件已创建完成！"
echo "JWT密钥已生成并配置到oauth-service中" 