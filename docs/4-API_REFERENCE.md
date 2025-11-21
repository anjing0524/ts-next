# OAuth 2.1 认证授权系统 - API 参考文档

**文档版本**: 1.0
**API 版本**: v2
**基础 URL**: `https://api.yourdomain.com/api/v2`  (开发: `http://localhost:6188/api/v2`)
**协议**: HTTPS (生产) / HTTP (开发)

## API 版本历史

| 版本 | 发布日期 | 状态 | 支持截止日期 | 说明 |
|------|---------|------|------------|------|
| v2 | 2025-01-01 | 当前版本 | 2026-01-01 (至少) | OAuth 2.1 标准实现 |
| v1 | 2024-01-01 | 已弃用 | 2025-06-01 | 旧版 OAuth 2.0 实现 |

**迁移指南**: 如需从 v1 升级到 v2，请参考 [v1 → v2 迁移指南](./migrations/v1-to-v2.md)

---

## 概述

OAuth 2.1 Service 提供完整的认证授权服务,包括:
- ✅ OAuth 2.1 授权码流程 (PKCE 强制)
- ✅ Token 管理 (生成、刷新、撤销)
- ✅ 用户管理
- ✅ RBAC 权限管理
- ✅ 审计日志

---

## 端点分类 (OAuth 2.1 去中心化架构)

### OAuth Service (认证中心) 端点

这些端点仅由 **OAuth Service** 提供,处理所有认证相关的操作:

| 端点 | 方法 | 用途 | 调用者 |
|------|------|------|--------|
| `/api/v2/oauth/authorize` | GET | 授权请求,检查 session 并重定向到登录页 | Admin Portal (浏览器) |
| `/api/v2/oauth/token` | POST | Token 交换 (授权码/刷新令牌) | Admin Portal 后端 |
| `/api/v2/oauth/revoke` | POST | Token 撤销 | Admin Portal 后端 |
| `/api/v2/oauth/introspect` | POST | Token 内省 | 任何客户端 |
| `/api/v2/auth/login` | POST | 用户登录 (凭证验证) | 浏览器 (OAuth Service 登录页) |
| `/login` | GET | 登录页面显示 | 浏览器 |
| `/api/v2/admin/users` | GET/POST/PUT/DELETE | 用户管理 | Admin Portal 或授权客户端 |
| `/api/v2/admin/roles` | GET/POST/PUT/DELETE | 角色管理 | Admin Portal 或授权客户端 |
| `/api/v2/admin/permissions` | GET | 权限管理 | Admin Portal 或授权客户端 |

**关键点**:
- 所有凭证处理仅在 OAuth Service 进行
- Admin Portal **永不直接调用** `/api/v2/auth/login`
- Admin Portal **永不处理**用户密码

### Admin Portal (第三方客户端) 端点

这些端点仅由 **Admin Portal** 提供:

| 端点 | 方法 | 用途 | 调用者 |
|------|------|------|--------|
| `/auth/callback` | GET | OAuth callback 处理,交换授权码为 token | 浏览器 (由 OAuth Service 重定向) |
| `/dashboard` | GET | 仪表板 (需要有效 token) | 浏览器 |
| 其他前端路由 | GET | React 应用页面 | 浏览器 |

**关键点**:
- `/auth/callback` 处理 OAuth Service 返回的授权码
- Admin Portal 仅存储和使用 token,不验证凭证
- Admin Portal 使用 Bearer token 调用 OAuth Service API

---

## 认证

### Bearer Token

所有 API 端点都需要 Bearer Token:

```http
GET /api/v2/admin/users HTTP/1.1
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 权限要求

每个端点都有权限要求,格式: `resource:action`

---

## OAuth 2.1 核心端点

### 1. 授权端点 (Authorization Endpoint)

获取授权码,重定向用户到登录页面。

```http
GET /api/v2/oauth/authorize HTTP/1.1

Query Parameters:
  client_id=string                    [必需] OAuth 客户端 ID
  redirect_uri=string                 [必需] 回调 URI (白名单检查)
  response_type=code                  [必需] 固定值: code
  scope=string                        [必需] 请求的权限范围
  code_challenge=string               [必需] PKCE code_challenge (SHA256)
  code_challenge_method=S256           [必需] 固定值: S256
  state=string                        [推荐] CSRF 保护令牌
  nonce=string                        [可选] OIDC nonce
```

**Response (重定向)**:
```http
302 Found
Location: http://localhost:6188/login?redirect=/oauth/authorize?...
```

**验证逻辑**:
1. 检查 client_id 是否存在
2. 检查 redirect_uri 是否在白名单中
3. 检查 scope 是否被允许
4. 检查用户是否已登录 (session_token cookie)
5. 如果未登录,重定向到登录页

---

### 2. Token 端点 (Token Endpoint)

用授权码或刷新令牌交换访问令牌。

```http
POST /api/v2/oauth/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

Authorization Code Grant:
  grant_type=authorization_code       [必需]
  code=string                         [必需] 授权码
  redirect_uri=string                 [必需] 必须与授权时一致
  code_verifier=string                [必需] PKCE code_verifier
  client_id=string                    [必需]
  client_secret=string                [必需] 机密客户端

Refresh Token Grant:
  grant_type=refresh_token            [必需]
  refresh_token=string                [必需]
  client_id=string                    [必需]
  client_secret=string                [必需]

Client Credentials Grant:
  grant_type=client_credentials       [必需]
  scope=string                        [必需]
  client_id=string                    [必需]
  client_secret=string                [必需]
```

**Response (成功)**:
```json
200 OK
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "550e8400-e29b-41d4-a716-446655440000",
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 900,
  "token_type": "Bearer",
  "scope": "openid profile email"
}
```

**错误响应**:
```json
400 Bad Request
{
  "error": "invalid_grant",
  "error_description": "Invalid authorization code"
}
```

---

### 3. Token 撤销端点 (Revocation Endpoint)

撤销访问令牌或刷新令牌。符合 RFC 7009。

```http
POST /api/v2/oauth/revoke HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Authorization: Bearer <token>

  token=string                        [必需] 令牌
  token_type_hint=string              [可选] access_token|refresh_token
  client_id=string                    [必需]
  client_secret=string                [必需]
```

**Response**:
```http
200 OK
(即使令牌不存在或已过期,也返回 200)
```

---

### 4. Token 内省端点 (Introspection Endpoint)

获取令牌的元数据。符合 RFC 7662。

```http
POST /api/v2/oauth/introspect HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Authorization: Bearer <token>

  token=string                        [必需] 令牌
```

**Response (活跃令牌)**:
```json
200 OK
{
  "active": true,
  "scope": "openid profile email",
  "client_id": "admin-portal-client",
  "sub": "user-uuid",
  "exp": 1700000000,
  "iat": 1699999100,
  "permissions": ["users:list", "roles:manage"]
}
```

**Response (已撤销/过期)**:
```json
200 OK
{
  "active": false
}
```

---

### 5. UserInfo 端点 (OpenID Connect)

获取已认证用户的信息。

```http
GET /api/v2/oauth/userinfo HTTP/1.1
Authorization: Bearer <access_token>
```

**Response**:
```json
200 OK
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "given_name": "John",
  "family_name": "Doe",
  "roles": ["admin", "user"],
  "permissions": ["users:list", "roles:manage"]
}
```

---

## 用户管理端点

### 获取用户列表

```http
GET /api/v2/admin/users HTTP/1.1
Authorization: Bearer <token>

Query Parameters:
  page=integer                        [默认: 1]
  limit=integer                       [默认: 20]
  search=string                       [可选] 搜索邮箱/用户名
  role_id=string                      [可选] 按角色过滤
  is_active=boolean                   [可选] 按状态过滤

Required Permission: users:list
```

**Response**:
```json
200 OK
{
  "success": true,
  "data": [
    {
      "id": "user-uuid",
      "email": "user@example.com",
      "username": "john.doe",
      "first_name": "John",
      "last_name": "Doe",
      "is_active": true,
      "created_at": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

---

### 创建用户

```http
POST /api/v2/admin/users HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "newuser@example.com",
  "username": "newuser",
  "password": "SecurePassword123!",
  "first_name": "New",
  "last_name": "User",
  "role_ids": ["role-uuid-1", "role-uuid-2"]
}

Required Permission: users:create
```

**Response**:
```json
201 Created
{
  "id": "user-uuid",
  "email": "newuser@example.com",
  "username": "newuser",
  "first_name": "New",
  "last_name": "User",
  "created_at": "2025-11-20T10:30:00Z"
}
```

---

### 更新用户

```http
PUT /api/v2/admin/users/{user_id} HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "first_name": "Updated",
  "last_name": "Name",
  "is_active": true
}

Required Permission: users:update
```

---

### 删除用户

```http
DELETE /api/v2/admin/users/{user_id} HTTP/1.1
Authorization: Bearer <token>

Required Permission: users:delete
```

**Response**:
```http
204 No Content
```

---

## 同意管理端点

### 6. 同意信息端点 (Consent Info Endpoint)

获取同意页面所需的信息。

```http
GET /api/v2/oauth/consent/info HTTP/1.1
Authorization: Cookie session_token=<jwt>

Query Parameters:
  client_id=string                    [必需]
  redirect_uri=string                 [必需]
  response_type=code                  [必需]
  scope=string                        [必需]
  code_challenge=string               [必需]
  code_challenge_method=S256          [必需]
  state=string                        [可选]
  nonce=string                        [可选]
```

**Response (成功)**:
```json
200 OK
{
  "client": {
    "id": "admin-portal-client",
    "name": "Admin Portal",
    "logo_uri": "https://example.com/logo.png"
  },
  "requested_scopes": [
    {
      "name": "read",
      "description": "读取用户信息的权限"
    }
  ],
  "user": {
    "id": "user-123",
    "username": "admin"
  },
  "client_id": "admin-portal-client",
  "redirect_uri": "https://example.com/callback",
  "scope": "read write",
  "response_type": "code",
  "code_challenge": "...",
  "code_challenge_method": "S256",
  "state": "...",
  "nonce": null,
  "consent_form_action_url": "http://localhost:3001/api/v2/oauth/consent/submit"
}
```

**错误响应**:
```json
401 Unauthorized
{
  "error": "unauthorized",
  "error_description": "User not authenticated"
}
```

---

### 7. 同意提交端点 (Consent Submit Endpoint)

提交用户的同意决定。

```http
POST /api/v2/oauth/consent/submit HTTP/1.1
Authorization: Cookie session_token=<jwt>
Content-Type: application/json

{
  "decision": "allow",                [必需] "allow" 或 "deny"
  "client_id": "admin-portal-client", [必需]
  "redirect_uri": "...",              [必需]
  "response_type": "code",            [必需]
  "scope": "read write",              [必需]
  "state": "...",                     [可选]
  "code_challenge": "...",            [必需]
  "code_challenge_method": "S256",    [必需]
  "nonce": null                       [可选]
}
```

**Response (允许)**:
```json
200 OK
{
  "redirect_uri": "https://example.com/callback?code=AUTH_CODE&state=..."
}
```

**Response (拒绝)**:
```json
200 OK
{
  "redirect_uri": "https://example.com/callback?error=access_denied&state=..."
}
```

**错误响应**:
```json
401 Unauthorized
{
  "error": "unauthorized",
  "error_description": "User not authenticated"
}
```

---

## 认证端点

### 登录

```http
POST /api/v2/auth/login HTTP/1.1
Content-Type: application/json

{
  "username": "admin",
  "password": "password123",
  "redirect": "/oauth/authorize?client_id=..."  // [可选] 登录成功后的重定向 URL
}
```

**参数说明**:
- `username`: 用户名，3-50 字符
- `password`: 密码，8+ 字符
- `redirect`: 登录成功后的重定向 URL，通常是 OAuth authorize 端点
  - 如果未提供，默认重定向到根路径 "/"
  - 必须是相对路径或同域 URL（安全考虑）

**Response**:
```json
200 OK
{
  "success": true,
  "redirect_url": "/oauth/authorize?client_id=..."
}
Set-Cookie: session_token=<jwt>; HttpOnly; Secure; SameSite=Lax; Max-Age=3600
```

**错误响应**:
```json
401 Unauthorized
{
  "success": false,
  "error": "Invalid credentials"
}
```

---

## 权限管理端点

### 获取权限列表

```http
GET /api/v2/admin/permissions HTTP/1.1
Authorization: Bearer <token>

Required Permission: permissions:list
```

**Response**:
```json
200 OK
{
  "data": [
    {
      "id": "perm-uuid",
      "code": "users:list",
      "description": "列出用户",
      "category": "user_management"
    }
  ]
}
```

---

## 角色管理端点

### 获取角色列表

```http
GET /api/v2/admin/roles HTTP/1.1
Authorization: Bearer <token>

Required Permission: roles:list
```

**Response**:
```json
200 OK
{
  "data": [
    {
      "id": "role-uuid",
      "name": "Administrator",
      "description": "系统管理员",
      "permissions": ["users:*", "roles:*"]
    }
  ]
}
```

---

## 审计日志端点

### 获取审计日志

```http
GET /api/v2/admin/audit-logs HTTP/1.1
Authorization: Bearer <token>

Query Parameters:
  page=integer
  limit=integer
  action_type=string
  user_id=string
  start_date=ISO8601
  end_date=ISO8601

Required Permission: audit:view
```

**Response**:
```json
200 OK
{
  "data": [
    {
      "id": "audit-uuid",
      "user_id": "user-uuid",
      "action_type": "USER_LOGIN",
      "resource_type": "user",
      "ip_address": "192.168.1.1",
      "status": "success",
      "created_at": "2025-11-20T10:30:00Z"
    }
  ],
  "pagination": {...}
}
```

---

### 导出审计日志

```http
GET /api/v2/admin/audit-logs/export HTTP/1.1
Authorization: Bearer <token>

Query Parameters:
  format=string                       [csv|json]
  start_date=ISO8601
  end_date=ISO8601

Required Permission: audit:export
```

**Response**:
```
200 OK
Content-Type: text/csv
Content-Disposition: attachment; filename="audit-logs.csv"

[CSV 数据]
```

---

## OAuth 客户端管理端点

### 获取客户端列表

```http
GET /api/v2/admin/clients HTTP/1.1
Authorization: Bearer <token>

Required Permission: clients:list
```

---

### 创建客户端

```http
POST /api/v2/admin/clients HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My App",
  "redirect_uris": [
    "https://myapp.com/callback"
  ],
  "allowed_scopes": ["openid", "profile", "email"],
  "is_confidential": true,
  "require_pkce": true
}

Required Permission: clients:create
```

**Response**:
```json
201 Created
{
  "id": "client-id",
  "secret": "client-secret-value",
  "name": "My App",
  "redirect_uris": [...]
}
```

---

## 错误处理

### 标准错误响应格式

```json
{
  "error": "error_code",
  "error_description": "详细错误描述",
  "error_uri": "https://docs.example.com/errors/error_code"
}
```

### HTTP 状态码

| 状态码 | 说明 | 常见错误 |
|--------|------|---------|
| 200 | 成功 | - |
| 201 | 资源创建 | - |
| 204 | 无内容 | - |
| 400 | 请求错误 | invalid_request, invalid_grant |
| 401 | 未认证 | unauthorized, invalid_token |
| 403 | 权限不足 | forbidden, insufficient_permissions |
| 404 | 未找到 | not_found |
| 409 | 冲突 | conflict, already_exists |
| 429 | 限流 | rate_limit_exceeded |
| 500 | 服务器错误 | server_error |

---

## 速率限制

所有端点都受到速率限制:

```
100 请求 / 分钟 (per IP)

登录端点特殊限制:
5 请求 / 分钟 (防暴力破解)
```

**限流响应**:
```http
429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1700000060
```

---

## 使用示例

### 完整的 OAuth 2.1 流程

```bash
# 1. 生成 PKCE 参数
code_verifier=$(openssl rand -base64 48 | tr -d '\n' | cut -c1-128)
code_challenge=$(echo -n $code_verifier | sha256sum | awk '{print $1}' | base64)

# 2. 重定向用户到授权端点
curl "http://localhost:6188/api/v2/oauth/authorize?client_id=admin-portal-client&code_challenge=$code_challenge&code_challenge_method=S256&redirect_uri=http://localhost:6188/auth/callback&scope=openid profile email"

# 3. 用户登录后,获得授权码
# Authorization: http://localhost:6188/auth/callback?code=AUTH_CODE&state=STATE

# 4. 交换令牌
curl -X POST http://localhost:6188/api/v2/oauth/token \
  -d "grant_type=authorization_code&code=AUTH_CODE&code_verifier=$code_verifier&redirect_uri=http://localhost:6188/auth/callback&client_id=admin-portal-client&client_secret=CLIENT_SECRET"

# 5. 使用访问令牌调用 API
curl -H "Authorization: Bearer ACCESS_TOKEN" http://localhost:6188/api/v2/admin/users
```

---

## 健康检查端点

### Health Check

获取服务健康状态。

```http
GET /health HTTP/1.1
```

**Response (健康)**:
```json
200 OK
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2025-11-20T10:30:00Z",
  "checks": {
    "database": "ok",
    "cache": "ok"
  }
}
```

**Response (不健康)**:
```json
503 Service Unavailable
{
  "status": "unhealthy",
  "version": "1.0.0",
  "timestamp": "2025-11-20T10:30:00Z",
  "checks": {
    "database": "error: connection timeout",
    "cache": "ok"
  }
}
```

**使用场景**:
- Kubernetes liveness probe
- Kubernetes readiness probe
- 监控系统健康检查
- 负载均衡器健康检查

---

### Readiness Check

检查服务是否准备好接收流量。

```http
GET /ready HTTP/1.1
```

**Response**:
```json
200 OK
{
  "ready": true,
  "timestamp": "2025-11-20T10:30:00Z"
}
```

**检查项**:
- 数据库连接池可用
- 必要的配置已加载
- 依赖服务可访问

---

### Liveness Check

检查服务是否存活。

```http
GET /live HTTP/1.1
```

**Response**:
```json
200 OK
{
  "alive": true,
  "timestamp": "2025-11-20T10:30:00Z"
}
```

---

**文档完成日期**: 2025-11-20
**最后修订**: 2025-11-20
**下一次审查**: 2026-02-20
