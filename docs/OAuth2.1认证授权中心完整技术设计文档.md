# OAuth2.1认证授权中心技术设计文档

**版本**: 2.0  
**创建日期**: 2024-12-19  
**状态**: 生产就绪  
**团队**: 认证授权团队  

## 目录

1. [系统概述](#系统概述)
2. [核心功能](#核心功能)
3. [技术架构](#技术架构)
4. [数据库设计](#数据库设计)
5. [API设计](#api设计)
6. [安全机制](#安全机制)
7. [JWT认证授权使用说明](#jwt认证授权使用说明)
8. [管理页面设计](#管理页面设计)
9. [权限体系设计](#权限体系设计)
10. [部署指南](#部署指南)

## 系统概述

本系统是基于OAuth2.1标准的认证授权中心，专为内网环境设计，支持授权码模式和客户端凭证模式，强制使用PKCE，支持OIDC公钥获取，采用RBAC权限模型。

### 设计原则

- **内网专用**: 专为内网环境设计，无需邮箱/手机验证
- **管理员驱动**: 用户和客户端由管理员创建和管理
- **安全优先**: 强制PKCE，支持JWT签名验证
- **标准兼容**: 完全兼容OAuth2.1和OIDC标准
- **简洁高效**: 专注认证授权核心功能

## 核心功能

### 支持的授权模式

1. **授权码模式 (Authorization Code)**
   - 强制PKCE (Proof Key for Code Exchange)
   - 支持刷新令牌
   - 适用于Web应用和移动应用

2. **客户端凭证模式 (Client Credentials)**
   - 用于服务间通信
   - 无需用户交互
   - 基于客户端身份的权限控制

### OIDC支持

- 标准的用户信息端点
- JWT ID Token
- 公钥端点 (/.well-known/jwks.json)
- 发现端点 (/.well-known/openid-configuration)

## 技术架构

### 技术栈

- **框架**: Next.js 14 (App Router)
- **数据库**: PostgreSQL + Prisma ORM
- **认证**: JWT (RS256签名)
- **加密**: bcrypt (密码哈希)
- **验证**: Zod (数据验证)

### 系统架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   客户端应用     │    │   认证授权中心   │    │   资源服务器     │
│                │    │                │    │                │
│ - Web App      │◄──►│ - OAuth2.1     │◄──►│ - API Services │
│ - Mobile App   │    │ - OIDC         │    │ - Microservices│
│ - Service      │    │ - JWT          │    │                │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 数据库设计

### 核心模型

#### User (用户)
```sql
model User {
  id           String    @id @default(cuid())
  username     String    @unique
  passwordHash String
  isActive     Boolean   @default(true)
  displayName  String?
  firstName    String?
  lastName     String?
  organization String?
  department   String?
  mustChangePassword Boolean @default(true)
  createdBy    String?   // 创建者ID（管理员）
  // 关联关系
  userRoles          UserRole[]
  authorizationCodes AuthorizationCode[]
  accessTokens       AccessToken[]
  refreshTokens      RefreshToken[]
}
```

#### OAuthClient (OAuth客户端)
```sql
model OAuthClient {
  id                String     @id @default(cuid())
  clientId          String     @unique
  clientSecret      String?    // 机密客户端的密钥
  clientType        ClientType // PUBLIC 或 CONFIDENTIAL
  name              String
  description       String?
  redirectUris      String[]   // 重定向URI列表
  allowedScopes     String     // 允许的权限范围
  accessTokenTtl    Int        @default(3600)  // 访问令牌TTL(秒)
  refreshTokenTtl   Int        @default(2592000) // 刷新令牌TTL(秒)
  requirePkce       Boolean    @default(true)   // 强制PKCE
  isActive          Boolean    @default(true)
}
```

#### Role & Permission (角色和权限)
```sql
model Role {
  id          String @id @default(cuid())
  name        String @unique
  description String?
  isActive    Boolean @default(true)
  userRoles   UserRole[]
  rolePermissions RolePermission[]
}

model Permission {
  id          String @id @default(cuid())
  name        String @unique
  description String?
  resource    String  // 资源标识
  action      String  // 操作类型
  isActive    Boolean @default(true)
  rolePermissions RolePermission[]
}
```

## API设计

### OAuth2.1端点

#### 1. 授权端点
```
GET /api/v2/oauth/authorize
```

**参数**:
- `response_type`: 固定为 "code"
- `client_id`: 客户端ID
- `redirect_uri`: 重定向URI
- `scope`: 请求的权限范围
- `state`: 防CSRF状态参数
- `code_challenge`: PKCE挑战码
- `code_challenge_method`: 固定为 "S256"

#### 2. 令牌端点
```
POST /api/v2/oauth/token
```

**授权码模式**:
```json
{
  "grant_type": "authorization_code",
  "code": "授权码",
  "redirect_uri": "重定向URI",
  "client_id": "客户端ID",
  "code_verifier": "PKCE验证码"
}
```

**客户端凭证模式**:
```json
{
  "grant_type": "client_credentials",
  "scope": "请求的权限范围"
}
```

**刷新令牌**:
```json
{
  "grant_type": "refresh_token",
  "refresh_token": "刷新令牌"
}
```

#### 3. 用户信息端点
```
GET /api/v2/oauth/userinfo
Authorization: Bearer {access_token}
```

#### 4. 令牌撤销端点
```
POST /api/v2/oauth/revoke
```

### OIDC发现端点

#### 1. 配置发现
```
GET /.well-known/openid-configuration
```

#### 2. 公钥端点
```
GET /.well-known/jwks.json
```

## 安全机制

### 1. PKCE (强制)
- 所有授权码流程必须使用PKCE
- 使用SHA256哈希算法
- 防止授权码拦截攻击

### 2. JWT安全
- 使用RS256算法签名
- 支持公钥验证
- 包含标准声明 (iss, aud, exp, iat, sub)

### 3. 客户端认证
- 机密客户端使用HTTP Basic认证
- 公开客户端仅验证client_id
- 支持客户端密钥轮换

### 4. 权限控制
- 基于RBAC模型
- 细粒度权限控制
- 支持资源级别权限

## JWT认证授权使用说明

### JWT结构

#### Header
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-id"
}
```

#### Payload (Access Token)
```json
{
  "iss": "https://auth.company.com",
  "aud": "api.company.com",
  "sub": "user-id",
  "client_id": "client-id",
  "scope": "openid profile read:users",
  "permissions": ["user:read", "user:write"],
  "iat": 1640995200,
  "exp": 1640998800,
  "jti": "token-id"
}
```

### 令牌验证流程

1. **获取公钥**: 从 `/.well-known/jwks.json` 获取
2. **验证签名**: 使用RS256算法验证
3. **检查声明**: 验证iss, aud, exp等
4. **权限检查**: 验证scope和permissions

### 使用示例

#### 1. 获取访问令牌
```javascript
// 授权码模式
const tokenResponse = await fetch('/api/v2/oauth/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier
  })
});

const tokens = await tokenResponse.json();
```

#### 2. 使用访问令牌
```javascript
const apiResponse = await fetch('/api/v2/users', {
  headers: {
    'Authorization': `Bearer ${tokens.access_token}`
  }
});
```

#### 3. 刷新令牌
```javascript
const refreshResponse = await fetch('/api/v2/oauth/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token
  })
});
```

## 管理页面设计

### 页面结构

```
管理控制台
├── 仪表板
│   ├── 系统概览
│   ├── 活跃用户统计
│   └── 令牌使用统计
├── 用户管理
│   ├── 用户列表
│   ├── 创建用户
│   ├── 编辑用户
│   └── 用户权限
├── 客户端管理
│   ├── 客户端列表
│   ├── 注册客户端
│   ├── 编辑客户端
│   └── 客户端密钥
├── 权限管理
│   ├── 角色管理
│   ├── 权限管理
│   └── 权限分配
├── 审计日志
│   ├── 登录日志
│   ├── 操作日志
│   └── 安全事件
└── 系统设置
    ├── 安全策略
    ├── 令牌配置
    └── 系统配置
```

### 页面权限设计

#### 权限矩阵

| 页面/功能 | 超级管理员 | 用户管理员 | 客户端管理员 | 审计员 | 普通用户 |
|-----------|------------|------------|--------------|--------|----------|
| 仪表板 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 用户管理 | ✓ | ✓ | ✗ | ✗ | ✗ |
| 客户端管理 | ✓ | ✗ | ✓ | ✗ | ✗ |
| 权限管理 | ✓ | ✓ | ✗ | ✗ | ✗ |
| 审计日志 | ✓ | ✓ | ✓ | ✓ | ✗ |
| 系统设置 | ✓ | ✗ | ✗ | ✗ | ✗ |

#### 菜单权限配置

```typescript
const menuPermissions = {
  dashboard: ['admin:read', 'user:read'],
  userManagement: ['admin:users:read', 'admin:users:write'],
  clientManagement: ['admin:clients:read', 'admin:clients:write'],
  permissionManagement: ['admin:permissions:read', 'admin:permissions:write'],
  auditLogs: ['admin:audit:read'],
  systemSettings: ['admin:system:read', 'admin:system:write']
};
```

## 权限体系设计

### RBAC模型

```
用户 (User) ←→ 用户角色 (UserRole) ←→ 角色 (Role)
                                        ↓
                                   角色权限 (RolePermission)
                                        ↓
                                   权限 (Permission)
```

### 预定义角色

1. **超级管理员 (super_admin)**
   - 系统最高权限
   - 可管理所有资源

2. **用户管理员 (user_admin)**
   - 用户和角色管理
   - 权限分配

3. **客户端管理员 (client_admin)**
   - OAuth客户端管理
   - 客户端配置

4. **审计员 (auditor)**
   - 查看审计日志
   - 生成合规报告

5. **普通用户 (user)**
   - 基本用户权限
   - 个人信息管理

### 权限命名规范

```
格式: {resource}:{action}

示例:
- user:read          # 读取用户信息
- user:write         # 修改用户信息
- client:read        # 读取客户端信息
- client:write       # 修改客户端信息
- admin:users:read   # 管理员读取用户
- admin:users:write  # 管理员修改用户
```

## 部署指南

### 环境要求

- Node.js 18+
- PostgreSQL 14+
- Redis (可选，用于会话存储)

### 环境变量

```bash
# 数据库
DATABASE_URL="postgresql://user:password@localhost:5432/oauth_db"

# JWT密钥
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

# 应用配置
NEXTAUTH_URL="https://auth.company.com"
NEXTAUTH_SECRET="your-secret-key"

# 安全配置
BCRYPT_ROUNDS=12
TOKEN_ISSUER="https://auth.company.com"
TOKEN_AUDIENCE="api.company.com"
```

### 部署步骤

1. **安装依赖**
```bash
npm install
```

2. **数据库迁移**
```bash
npx prisma migrate deploy
npx prisma db seed
```

3. **构建应用**
```bash
npm run build
```

4. **启动服务**
```bash
npm start
```

### 健康检查

```bash
# 检查服务状态
curl https://auth.company.com/api/v2/health

# 检查OIDC配置
curl https://auth.company.com/.well-known/openid-configuration

# 检查公钥端点
curl https://auth.company.com/.well-known/jwks.json
```

---

**文档维护**: 本文档应随系统更新而更新，确保与实际实现保持一致。
**联系方式**: 如有问题，请联系认证授权团队。