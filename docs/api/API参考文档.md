# API 参考文档

> **文档版本**: v1.0.0  
> **最后更新**: 2025-07-22  
> **维护团队**: 开发团队

## 概述

本文档提供 OAuth 2.1 认证中心的完整 API 参考，包含所有端点的详细说明、请求/响应格式和错误码定义。

## 认证方式

### Bearer Token 认证

大多数 API 需要在请求头中包含有效的访问令牌：

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 客户端认证

对于需要客户端身份验证的端点，使用以下方式之一：

```http
# Authorization Header 方式
Authorization: Basic Y2xpZW50X2lkOmNsaWVudF9zZWNyZXQ=

# 请求体方式（推荐）
client_id=your_client_id
client_secret=your_client_secret
```

## 错误响应格式

所有 API 错误响应遵循统一格式：

```json
{
  "error": "error_type",
  "error_description": "详细错误描述",
  "error_uri": "https://example.com/errors/error_type"
}
```

## OAuth 2.1 端点

### 1. 授权端点

#### GET /api/v2/oauth/authorize

启动 OAuth 2.1 授权流程

**请求参数**：

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| response_type | string | 是 | 必须为 "code" |
| client_id | string | 是 | 客户端标识符 |
| redirect_uri | string | 是 | 重定向URI，必须预先注册 |
| scope | string | 是 | 请求的权限范围，空格分隔 |
| state | string | 是 | CSRF防护令牌 |
| code_challenge | string | 是 | PKCE挑战码 |
| code_challenge_method | string | 是 | 必须为 "S256" |

**响应**：
- 成功：重定向到 `redirect_uri` 并包含授权码
- 失败：重定向到 `redirect_uri` 并包含错误信息

**示例**：
```http
GET /api/v2/oauth/authorize?
  response_type=code&
  client_id=admin-portal&
  redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback&
  scope=openid+profile+admin%3Aread&
  state=abc123&
  code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&
  code_challenge_method=S256
```

### 2. 令牌端点

#### POST /api/v2/oauth/token

交换授权码获取访问令牌

**请求头**：
```
Content-Type: application/x-www-form-urlencoded
```

**请求体**（授权码模式）：
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| grant_type | string | 是 | 必须为 "authorization_code" |
| client_id | string | 是 | 客户端标识符 |
| client_secret | string | 是 | 客户端密钥 |
| code | string | 是 | 授权码 |
| redirect_uri | string | 是 | 必须与授权请求一致 |
| code_verifier | string | 是 | PKCE验证码 |

**成功响应**：
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "scope": "openid profile admin:read"
}
```

### 3. 用户信息端点

#### GET /api/v2/oauth/userinfo

获取已认证用户的信息

**请求头**：
```
Authorization: Bearer <access_token>
```

**成功响应**：
```json
{
  "sub": "user123",
  "name": "张三",
  "preferred_username": "zhangsan",
  "email": "zhangsan@example.com",
  "roles": ["USER_ADMIN"],
  "permissions": ["user:list", "user:create", "user:update"],
  "exp": 1735689600
}
```

### 4. 令牌撤销端点

#### POST /api/v2/oauth/revoke

撤销访问令牌或刷新令牌

**请求头**：
```
Content-Type: application/x-www-form-urlencoded
```

**请求体**：
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| token | string | 是 | 要撤销的令牌 |
| token_type_hint | string | 否 | 令牌类型："access_token" 或 "refresh_token" |

**成功响应**：
```
HTTP/1.1 200 OK
```

### 5. 令牌验证端点

#### POST /api/v2/oauth/introspect

验证令牌的有效性

**请求头**：
```
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <client_credentials>
```

**请求体**：
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| token | string | 是 | 要验证的令牌 |

**成功响应**：
```json
{
  "active": true,
  "client_id": "admin-portal",
  "username": "zhangsan",
  "scope": "openid profile admin:read",
  "sub": "user123",
  "exp": 1735689600,
  "iat": 1735688700
}
```

### 6. JWKS 端点

#### GET /.well-known/jwks.json

获取用于验证 JWT 签名的公钥

**成功响应**：
```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "key-1",
      "use": "sig",
      "n": "vJt_Q...Q",
      "e": "AQAB",
      "alg": "RS256"
    }
  ]
}
```

### 7. OpenID Connect 发现端点

#### GET /.well-known/openid-configuration

获取 OpenID Connect 提供者配置

**成功响应**：
```json
{
  "issuer": "https://oauth.example.com",
  "authorization_endpoint": "https://oauth.example.com/api/v2/oauth/authorize",
  "token_endpoint": "https://oauth.example.com/api/v2/oauth/token",
  "userinfo_endpoint": "https://oauth.example.com/api/v2/oauth/userinfo",
  "revocation_endpoint": "https://oauth.example.com/api/v2/oauth/revoke",
  "introspection_endpoint": "https://oauth.example.com/api/v2/oauth/introspect",
  "jwks_uri": "https://oauth.example.com/.well-known/jwks.json",
  "scopes_supported": ["openid", "profile", "email", "admin:read", "admin:write"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token", "client_credentials"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"],
  "code_challenge_methods_supported": ["S256"]
}
```

## 管理端点

### 用户管理

#### GET /api/v2/users

获取用户列表

**权限要求**：`user:list`

**请求参数**：
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| page | number | 否 | 页码，默认 1 |
| limit | number | 否 | 每页数量，默认 20 |
| search | string | 否 | 搜索关键词 |
| role | string | 否 | 按角色筛选 |

**成功响应**：
```json
{
  "data": [
    {
      "id": "user123",
      "username": "zhangsan",
      "displayName": "张三",
      "email": "zhangsan@example.com",
      "isActive": true,
      "roles": ["USER_ADMIN"],
      "createdAt": "2025-07-22T10:00:00Z",
      "updatedAt": "2025-07-22T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### POST /api/v2/users

创建新用户

**权限要求**：`user:create`

**请求体**：
```json
{
  "username": "lisi",
  "password": "SecurePass123!",
  "displayName": "李四",
  "email": "lisi@example.com",
  "roleIds": ["role123"]
}
```

**成功响应**：
```json
{
  "id": "user456",
  "username": "lisi",
  "displayName": "李四",
  "email": "lisi@example.com",
  "isActive": true,
  "roles": ["USER"],
  "createdAt": "2025-07-22T10:30:00Z",
  "updatedAt": "2025-07-22T10:30:00Z"
}
```

#### GET /api/v2/users/{id}

获取用户详情

**权限要求**：`user:read`

**成功响应**：
```json
{
  "id": "user123",
  "username": "zhangsan",
  "displayName": "张三",
  "email": "zhangsan@example.com",
  "isActive": true,
  "mustChangePassword": false,
  "failedLoginAttempts": 0,
  "lockedUntil": null,
  "roles": [
    {
      "id": "role123",
      "name": "USER_ADMIN",
      "displayName": "用户管理员"
    }
  ],
  "permissions": [
    "user:list",
    "user:create",
    "user:update",
    "user:read"
  ],
  "createdAt": "2025-07-22T10:00:00Z",
  "updatedAt": "2025-07-22T10:00:00Z"
}
```

#### PUT /api/v2/users/{id}

更新用户信息

**权限要求**：`user:update`

**请求体**：
```json
{
  "displayName": "张三（更新）",
  "email": "zhangsan.new@example.com",
  "isActive": true,
  "roleIds": ["role123", "role456"]
}
```

#### DELETE /api/v2/users/{id}

删除用户

**权限要求**：`user:delete`

**成功响应**：
```
HTTP/1.1 204 No Content
```

### 角色管理

#### GET /api/v2/roles

获取角色列表

**权限要求**：`role:list`

#### POST /api/v2/roles

创建新角色

**权限要求**：`role:create`

**请求体**：
```json
{
  "name": "CONTENT_ADMIN",
  "displayName": "内容管理员",
  "description": "负责内容管理的角色",
  "permissionIds": ["perm123", "perm456"]
}
```

#### GET /api/v2/roles/{id}/permissions

获取角色的权限

**权限要求**：`roles:permissions:read`

**成功响应**：
```json
{
  "data": [
    {
      "id": "perm123",
      "name": "content:list",
      "resource": "content",
      "action": "list",
      "type": "API"
    },
    {
      "id": "perm456",
      "name": "content:create",
      "resource": "content",
      "action": "create",
      "type": "API"
    }
  ]
}
```

#### POST /api/v2/roles/{id}/permissions

为角色分配权限

**权限要求**：`roles:permissions:assign`

**请求体**：
```json
{
  "permissionIds": ["perm123", "perm456", "perm789"]
}
```

### 客户端管理

#### GET /api/v2/clients

获取 OAuth 客户端列表

**权限要求**：`client:list`

#### POST /api/v2/clients

注册新的 OAuth 客户端

**权限要求**：`client:create`

**请求体**：
```json
{
  "clientName": "示例应用",
  "clientType": "CONFIDENTIAL",
  "redirectUris": ["https://app.example.com/callback"],
  "allowedScopes": ["openid", "profile", "email"],
  "grantTypes": ["authorization_code", "refresh_token"]
}
```

**成功响应**：
```json
{
  "id": "client789",
  "clientId": "example_app_12345",
  "clientSecret": "secret_abc123",
  "clientName": "示例应用",
  "clientType": "CONFIDENTIAL",
  "redirectUris": ["https://app.example.com/callback"],
  "allowedScopes": ["openid", "profile", "email"],
  "grantTypes": ["authorization_code", "refresh_token"],
  "requirePkce": true,
  "createdAt": "2025-07-22T11:00:00Z"
}
```

#### POST /api/v2/clients/{id}/secret

重置客户端密钥

**权限要求**：`oauth:clients:manage`

**成功响应**：
```json
{
  "clientSecret": "new_secret_xyz789"
}
```

## 认证端点

### POST /api/v2/auth/login

管理员登录

**请求体**：
```json
{
  "username": "admin",
  "password": "SecurePass123!"
}
```

**成功响应**：
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user123",
    "username": "admin",
    "displayName": "系统管理员",
    "roles": ["SYSTEM_ADMIN"],
    "permissions": ["*.*"]
  }
}
```

### POST /api/v2/auth/logout

登出

**请求头**：
```
Authorization: Bearer <access_token>
```

**成功响应**：
```
HTTP/1.1 200 OK
```

### GET /api/v2/auth/me

获取当前用户信息

**权限要求**：`profile:view`

**成功响应**：
```json
{
  "id": "user123",
  "username": "admin",
  "displayName": "系统管理员",
  "email": "admin@example.com",
  "roles": ["SYSTEM_ADMIN"],
  "permissions": ["*.*"],
  "lastLoginAt": "2025-07-22T10:00:00Z"
}
```

## 错误码

### OAuth 2.1 错误码

| 错误码 | 描述 |
|--------|------|
| invalid_request | 请求无效，缺少必需参数 |
| unauthorized_client | 客户端无权使用此授权类型 |
| access_denied | 资源所有者或授权服务器拒绝请求 |
| unsupported_response_type | 授权服务器不支持此响应类型 |
| invalid_scope | 请求的 scope 无效、未知或格式错误 |
| server_error | 授权服务器遇到意外错误 |
| temporarily_unavailable | 授权服务器暂时无法处理请求 |

### 业务错误码

| HTTP状态码 | 错误码 | 描述 |
|------------|--------|------|
| 400 | INVALID_CREDENTIALS | 用户名或密码错误 |
| 400 | USER_LOCKED | 用户账户已锁定 |
| 400 | PASSWORD_EXPIRED | 密码已过期 |
| 400 | INVALID_TOKEN | 令牌无效或已过期 |
| 403 | INSUFFICIENT_PERMISSIONS | 权限不足 |
| 404 | RESOURCE_NOT_FOUND | 资源不存在 |
| 409 | RESOURCE_ALREADY_EXISTS | 资源已存在 |
| 429 | RATE_LIMIT_EXCEEDED | 请求频率超限 |

## 速率限制

- **登录端点**：每分钟 5 次尝试
- **令牌端点**：每分钟 60 次请求
- **管理端点**：每分钟 100 次请求
- **其他端点**：每分钟 200 次请求

超出限制时返回 HTTP 429 状态码，响应头包含：
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1735689600
```