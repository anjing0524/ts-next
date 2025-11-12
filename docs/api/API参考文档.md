# API 参考文档

> **文档版本**: v2.0.0
> **最后更新**: 2025-11-11
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

对于需要客户端身份验证的端点，使用HTTP Basic Auth:

```http
Authorization: Basic <Base64-encoded client_id:client_secret>
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

## OAuth 2.1 标准端点

### 1. 授权端点

#### GET /api/v2/oauth/authorize

启动 OAuth 2.1 授权流程。

**请求参数**:

| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `response_type` | string | 是 | 必须为 `"code"` |
| `client_id` | string | 是 | 客户端标识符 |
| `redirect_uri` | string | 是 | 重定向URI，必须预先注册 |
| `scope` | string | 是 | 请求的权限范围，空格分隔 |
| `state` | string | 是 | CSRF防护令牌 |
| `code_challenge` | string | 是 | PKCE挑战码 |
| `code_challenge_method` | string | 是 | 必须为 `"S256"` |

**响应**:
- 成功：重定向到 `redirect_uri` 并包含授权码。
- 失败：重定向到 `redirect_uri` 并包含错误信息。

### 2. 令牌端点

#### POST /api/v2/oauth/token

交换授权码或刷新令牌以获取访问令牌。

**请求头**:
```
Content-Type: application/x-www-form-urlencoded
```

**支持的 `grant_type`**:

- **`authorization_code`**:
  - `code`: 从授权端点获取的授权码。
  - `redirect_uri`: 必须与授权请求中的 `redirect_uri` 一致。
  - `code_verifier`: PKCE验证码。
  - `client_id`: 客户端ID。
  - `client_secret`: 客户端密钥。
- **`refresh_token`**:
  - `refresh_token`: 用于获取新访问令牌的刷新令牌。
  - `scope` (可选): 请求一个范围更小的权限。
- **`client_credentials`**:
    - `scope` (可选): 请求的权限范围。

**成功响应**:
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

使用访问令牌获取已认证用户的信息。

**请求头**:
```
Authorization: Bearer <access_token>
```

**成功响应**:
```json
{
  "sub": "user123",
  "name": "张三",
  "email": "zhangsan@example.com",
  "roles": ["USER_ADMIN"],
  "permissions": ["user:list", "user:create"]
}
```

### 4. 令牌撤销端点

#### POST /api/v2/oauth/revoke

撤销一个访问令牌或刷新令牌。

**请求体**:
| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `token` | string | 是 | 要撤销的令牌。 |
| `token_type_hint` (可选) | string | 否 | "access_token" 或 "refresh_token"。 |

**成功响应**: `HTTP 200 OK`

### 5. 令牌内省端点

#### POST /api/v2/oauth/introspect

检查令牌的有效性。

**请求体**:
| 参数 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `token` | string | 是 | 要验证的令牌。 |

**成功响应**:
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

### 6. 服务发现端点

- **GET `/.well-known/openid-configuration`**: 获取OpenID Connect提供者的元数据配置。
- **GET `/.well-known/jwks.json`**: 获取用于验证JWT签名的JSON Web Key Set (JWKS)。

## 管理端点

所有管理端点都需要一个具有相应权限的Bearer Token。

### 用户管理
- `GET /api/v2/users`: 获取用户列表 (权限: `user:list`)
- `POST /api/v2/users`: 创建新用户 (权限: `user:create`)
- `GET /api/v2/users/{id}`: 获取用户详情 (权限: `user:read`)
- `PUT /api/v2/users/{id}`: 更新用户信息 (权限: `user:update`)
- `DELETE /api/v2/users/{id}`: 删除用户 (权限: `user:delete`)

### 角色管理
- `GET /api/v2/roles`: 获取角色列表 (权限: `role:list`)
- `POST /api/v2/roles`: 创建新角色 (权限: `role:create`)
- `GET /api/v2/roles/{id}`: 获取角色详情 (权限: `role:read`)
- `PUT /api/v2/roles/{id}`: 更新角色 (权限: `role:update`)
- `DELETE /api/v2/roles/{id}`: 删除角色 (权限: `role:delete`)
- `GET /api/v2/roles/{id}/permissions`: 获取角色的权限 (权限: `roles:permissions:read`)
- `POST /api/v2/roles/{id}/permissions`: 为角色分配权限 (权限: `roles:permissions:assign`)

### 客户端管理
- `GET /api/v2/clients`: 获取OAuth客户端列表 (权限: `client:list`)
- `POST /api/v2/clients`: 注册新OAuth客户端 (权限: `client:create`)
- `GET /api/v2/clients/{id}`: 获取客户端详情 (权限: `client:read`)
- `PUT /api/v2/clients/{id}`: 更新客户端 (权限: `client:update`)
- `DELETE /api/v2/clients/{id}`: 删除客户端 (权限: `client:delete`)
- `POST /api/v2/clients/{id}/secret`: 重置客户端密钥 (权限: `oauth:clients:manage`)

## 认证端点

### POST /api/v2/auth/login

`admin-portal` 使用此端点为管理员登录。

**请求体**:
```json
{
  "username": "admin",
  "password": "SecurePass123!"
}
```

**成功响应**:
返回包含`access_token`和用户信息的JSON对象。

### POST /api/v2/auth/logout

登出，使当前令牌失效。

**请求头**:
```
Authorization: Bearer <access_token>
```

### GET /api/v2/auth/me

获取当前已认证用户的信息。

**请求头**:
```
Authorization: Bearer <access_token>
```

## 错误码

### OAuth 2.1 错误码

| 错误码 | 描述 |
|---|---|
| `invalid_request` | 请求格式无效或缺少参数。 |
| `unauthorized_client` | 客户端无权执行此操作。 |
| `access_denied` | 资源所有者或授权服务器拒绝了请求。 |
| `unsupported_response_type` | 不支持的`response_type`。 |
| `invalid_scope` | 请求的`scope`无效。 |
| `server_error` | 服务器内部错误。 |
| `temporarily_unavailable` | 服务器暂时不可用。 |

### 业务错误码

| HTTP状态码 | 错误码 | 描述 |
|---|---|---|
| 400 | `INVALID_CREDENTIALS` | 用户名或密码错误。 |
| 400 | `USER_LOCKED` | 用户账户被锁定。 |
| 403 | `INSUFFICIENT_PERMISSIONS` | 权限不足。 |
| 404 | `RESOURCE_NOT_FOUND` | 请求的资源不存在。 |
| 409 | `RESOURCE_ALREADY_EXISTS` | 尝试创建的资源已存在。 |
| 429 | `RATE_LIMIT_EXCEEDED` | 请求频率超过限制。 |
