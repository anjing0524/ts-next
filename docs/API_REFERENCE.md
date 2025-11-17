# OAuth Service API 参考文档

**版本**: v2.0
**基础 URL**: `http://localhost:6188` (开发) / `https://api.yourdomain.com` (生产)
**协议**: HTTP/1.1
**内容类型**: application/json
**认证**: OAuth 2.1 Bearer Token

---

## 目录

1. [认证流程](#认证流程)
2. [OAuth 2.1 端点](#oauth-21-端点)
3. [用户管理 API](#用户管理-api)
4. [角色管理 API](#角色管理-api)
5. [权限管理 API](#权限管理-api)
6. [OAuth 客户端管理 API](#oauth-客户端管理-api)
7. [错误码](#错误码)
8. [速率限制](#速率限制)

---

## 认证流程

### OAuth 2.1 授权码流程 (推荐)

```
1. 客户端重定向到授权端点
   GET /api/v2/oauth/authorize

2. 用户登录并授权
   POST /api/v2/auth/login

3. 重定向回客户端，带授权码
   → {redirect_uri}?code=xxx&state=xxx

4. 客户端交换授权码为令牌
   POST /api/v2/oauth/token

5. 使用 access_token 访问受保护资源
   Authorization: Bearer {access_token}
```

---

## OAuth 2.1 端点

### 1. 授权端点

#### `GET /api/v2/oauth/authorize`

启动 OAuth 2.1 授权码流程（带 PKCE）。

**查询参数**:

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `client_id` | string | ✓ | OAuth 客户端 ID |
| `redirect_uri` | string | ✓ | 授权后重定向 URI（必须在白名单中） |
| `response_type` | string | ✓ | 固定值：`code` |
| `scope` | string | ✓ | 请求的权限范围，空格分隔（如 `openid profile email`） |
| `state` | string | ✓ | CSRF 防护随机字符串（客户端生成） |
| `code_challenge` | string | ✓ | PKCE code challenge（SHA256 哈希，Base64URL 编码） |
| `code_challenge_method` | string | ✓ | 固定值：`S256` |
| `nonce` | string | ✗ | OpenID Connect nonce（可选） |

**响应**:

```
HTTP/1.1 302 Found
Location: {redirect_uri}?code={authorization_code}&state={state}
```

**错误响应**:

```
HTTP/1.1 302 Found
Location: {redirect_uri}?error=invalid_request&error_description=...&state={state}
```

**示例**:

```bash
curl -X GET "http://localhost:6188/api/v2/oauth/authorize?client_id=admin-portal&redirect_uri=http://localhost:6188/auth/callback&response_type=code&scope=openid+profile+email&state=xyz&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256"
```

---

### 2. Token 端点

#### `POST /api/v2/oauth/token`

交换授权码为访问令牌，或刷新访问令牌。

**Content-Type**: `application/x-www-form-urlencoded` 或 `application/json`

#### 2.1 授权码交换

**请求体**:

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `grant_type` | string | ✓ | 固定值：`authorization_code` |
| `code` | string | ✓ | 授权码（来自 authorize 端点） |
| `redirect_uri` | string | ✓ | 必须与 authorize 请求一致 |
| `client_id` | string | ✓ | OAuth 客户端 ID |
| `code_verifier` | string | ✓ | PKCE code verifier（原始字符串） |
| `client_secret` | string | ✗ | 客户端密钥（CONFIDENTIAL 客户端需要） |

**成功响应** (`200 OK`):

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "scope": "openid profile email"
}
```

**字段说明**:
- `access_token`: JWT 访问令牌，有效期 1 小时
- `refresh_token`: JWT 刷新令牌，有效期 7 天
- `id_token`: OpenID Connect ID Token（如果 scope 包含 `openid`）
- `expires_in`: access_token 有效期（秒）

#### 2.2 刷新令牌

**请求体**:

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `grant_type` | string | ✓ | 固定值：`refresh_token` |
| `refresh_token` | string | ✓ | 刷新令牌 |
| `scope` | string | ✗ | 请求的权限范围（必须 ≤ 原始范围） |

**成功响应** (`200 OK`):

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "scope": "openid profile email"
}
```

**注意**: 刷新时会撤销旧的 refresh_token（Token 轮转）

#### 2.3 客户端凭证

**请求体**:

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `grant_type` | string | ✓ | 固定值：`client_credentials` |
| `client_id` | string | ✓ | OAuth 客户端 ID |
| `client_secret` | string | ✓ | 客户端密钥 |
| `scope` | string | ✗ | 请求的权限范围 |

**成功响应** (`200 OK`):

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "api:read api:write"
}
```

**错误响应** (`400 Bad Request`):

```json
{
  "error": "invalid_grant",
  "error_description": "Invalid authorization code"
}
```

**示例**:

```bash
# 授权码交换
curl -X POST "http://localhost:6188/api/v2/oauth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "abc123",
    "redirect_uri": "http://localhost:6188/auth/callback",
    "client_id": "admin-portal",
    "code_verifier": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
  }'

# 刷新令牌
curl -X POST "http://localhost:6188/api/v2/oauth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

---

### 3. 用户信息端点

#### `GET /api/v2/oauth/userinfo`

获取当前认证用户的信息（OpenID Connect 标准端点）。

**认证**: Bearer Token

**请求头**:

```
Authorization: Bearer {access_token}
```

**成功响应** (`200 OK`):

```json
{
  "sub": "user-uuid",
  "name": "张三",
  "given_name": "三",
  "family_name": "张",
  "email": "zhangsan@example.com",
  "email_verified": true,
  "picture": "https://example.com/avatar.jpg",
  "updated_at": 1699999999
}
```

**错误响应** (`401 Unauthorized`):

```json
{
  "error": "invalid_token",
  "error_description": "The access token is invalid or expired"
}
```

**示例**:

```bash
curl -X GET "http://localhost:6188/api/v2/oauth/userinfo" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 4. Token 撤销端点

#### `POST /api/v2/oauth/revoke`

撤销访问令牌或刷新令牌（符合 RFC 7009）。

**Content-Type**: `application/x-www-form-urlencoded` 或 `application/json`

**请求体**:

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `token` | string | ✓ | 要撤销的令牌 |
| `token_type_hint` | string | ✗ | 令牌类型提示：`access_token` 或 `refresh_token` |
| `client_id` | string | ✓ | OAuth 客户端 ID |
| `client_secret` | string | ✗ | 客户端密钥（CONFIDENTIAL 客户端需要） |

**成功响应** (`200 OK`):

```json
{
  "success": true
}
```

**注意**:
- 即使令牌无效或已撤销，也返回 200（符合 RFC 7009 幂等性要求）
- 撤销 refresh_token 会同时使所有相关的 access_token 失效

**示例**:

```bash
curl -X POST "http://localhost:6188/api/v2/oauth/revoke" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type_hint": "refresh_token",
    "client_id": "admin-portal"
  }'
```

---

### 5. Token 内省端点

#### `POST /api/v2/oauth/introspect`

检查令牌的有效性和元数据（符合 RFC 7662）。

**Content-Type**: `application/x-www-form-urlencoded` 或 `application/json`

**请求体**:

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `token` | string | ✓ | 要检查的令牌 |
| `token_type_hint` | string | ✗ | 令牌类型提示：`access_token` 或 `refresh_token` |

**成功响应** (`200 OK`) - 有效令牌:

```json
{
  "active": true,
  "scope": "openid profile email",
  "client_id": "admin-portal",
  "username": "admin",
  "token_type": "Bearer",
  "exp": 1699999999,
  "iat": 1699996399,
  "sub": "user-uuid"
}
```

**成功响应** (`200 OK`) - 无效令牌:

```json
{
  "active": false
}
```

**示例**:

```bash
curl -X POST "http://localhost:6188/api/v2/oauth/introspect" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

---

### 6. 登录端点

#### `POST /api/v2/auth/login`

用户名/密码登录，返回 session token。

**Content-Type**: `application/json`

**请求体**:

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `username` | string | ✓ | 用户名 |
| `password` | string | ✓ | 密码 |
| `redirect` | string | ✗ | 登录后重定向 URL |

**成功响应** (`200 OK`):

```json
{
  "success": true,
  "redirect_url": "http://localhost:6188/api/v2/oauth/authorize?..."
}
```

**响应头**:

```
Set-Cookie: session_token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600
```

**错误响应** (`401 Unauthorized`):

```json
{
  "error": "invalid_credentials",
  "error_description": "Invalid username or password"
}
```

**错误响应** (`423 Locked`):

```json
{
  "error": "account_locked",
  "error_description": "Account locked until 2024-01-01 12:00:00 UTC",
  "locked_until": "2024-01-01T12:00:00Z"
}
```

**示例**:

```bash
curl -X POST "http://localhost:6188/api/v2/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123",
    "redirect": "http://localhost:6188/api/v2/oauth/authorize?..."
  }'
```

---

## 用户管理 API

### 1. 列出用户

#### `GET /api/v2/admin/users`

获取用户列表（支持分页和过滤）。

**认证**: Bearer Token
**权限**: `users:list` 或 `users:read`

**查询参数**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | integer | 1 | 页码（从 1 开始） |
| `page_size` | integer | 20 | 每页数量（最大 100） |
| `search` | string | - | 搜索关键词（username, display_name, email） |
| `is_active` | boolean | - | 过滤活跃状态 |
| `sort_by` | string | created_at | 排序字段：`created_at`, `username`, `last_login_at` |
| `sort_order` | string | desc | 排序方向：`asc`, `desc` |

**成功响应** (`200 OK`):

```json
{
  "data": [
    {
      "id": "user-uuid",
      "username": "admin",
      "display_name": "管理员",
      "email": "admin@example.com",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z",
      "last_login_at": "2024-01-01T12:00:00Z",
      "roles": ["super_admin"]
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

**示例**:

```bash
curl -X GET "http://localhost:6188/api/v2/admin/users?page=1&page_size=20&search=admin&is_active=true" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 2. 获取用户详情

#### `GET /api/v2/admin/users/{user_id}`

获取指定用户的详细信息。

**认证**: Bearer Token
**权限**: `users:read`

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `user_id` | string | 用户 UUID |

**成功响应** (`200 OK`):

```json
{
  "id": "user-uuid",
  "username": "admin",
  "display_name": "管理员",
  "first_name": "三",
  "last_name": "张",
  "email": "admin@example.com",
  "avatar": "https://example.com/avatar.jpg",
  "organization": "公司名称",
  "department": "技术部",
  "is_active": true,
  "must_change_password": false,
  "failed_login_attempts": 0,
  "locked_until": null,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "last_login_at": "2024-01-01T12:00:00Z",
  "created_by": "admin-uuid",
  "roles": [
    {
      "id": "role-uuid",
      "name": "super_admin",
      "display_name": "超级管理员"
    }
  ],
  "permissions": [
    "users:read",
    "users:create",
    "users:update",
    "users:delete"
  ]
}
```

**错误响应** (`404 Not Found`):

```json
{
  "error": "user_not_found",
  "error_description": "User not found"
}
```

**示例**:

```bash
curl -X GET "http://localhost:6188/api/v2/admin/users/user-uuid" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 3. 创建用户

#### `POST /api/v2/admin/users`

创建新用户。

**认证**: Bearer Token
**权限**: `users:create`

**Content-Type**: `application/json`

**请求体**:

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `username` | string | ✓ | 用户名（3-50 字符，唯一） |
| `password` | string | ✓ | 密码（最少 8 字符） |
| `display_name` | string | ✗ | 显示名称 |
| `email` | string | ✗ | 邮箱地址 |
| `first_name` | string | ✗ | 名 |
| `last_name` | string | ✗ | 姓 |
| `avatar` | string | ✗ | 头像 URL |
| `organization` | string | ✗ | 组织 |
| `department` | string | ✗ | 部门 |
| `is_active` | boolean | ✗ | 是否激活（默认 true） |
| `must_change_password` | boolean | ✗ | 首次登录强制修改密码（默认 false） |
| `role_ids` | array | ✗ | 角色 ID 列表 |

**成功响应** (`201 Created`):

```json
{
  "id": "new-user-uuid",
  "username": "newuser",
  "display_name": "新用户",
  "email": "newuser@example.com",
  "is_active": true,
  "created_at": "2024-01-01T00:00:00Z"
}
```

**错误响应** (`409 Conflict`):

```json
{
  "error": "username_exists",
  "error_description": "Username already exists"
}
```

**错误响应** (`400 Bad Request`):

```json
{
  "error": "validation_error",
  "error_description": "Password must be at least 8 characters"
}
```

**示例**:

```bash
curl -X POST "http://localhost:6188/api/v2/admin/users" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "password": "SecurePass123",
    "display_name": "新用户",
    "email": "newuser@example.com",
    "role_ids": ["role-uuid"]
  }'
```

---

### 4. 更新用户

#### `PUT /api/v2/admin/users/{user_id}`

更新用户信息。

**认证**: Bearer Token
**权限**: `users:update`

**Content-Type**: `application/json`

**请求体** (所有字段可选):

```json
{
  "display_name": "更新的名称",
  "email": "newemail@example.com",
  "is_active": false,
  "must_change_password": true
}
```

**成功响应** (`200 OK`):

```json
{
  "id": "user-uuid",
  "username": "admin",
  "display_name": "更新的名称",
  "email": "newemail@example.com",
  "updated_at": "2024-01-01T12:00:00Z"
}
```

**示例**:

```bash
curl -X PUT "http://localhost:6188/api/v2/admin/users/user-uuid" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "更新的名称",
    "is_active": false
  }'
```

---

### 5. 删除用户

#### `DELETE /api/v2/admin/users/{user_id}`

删除用户（软删除，设置 `is_active = false`）。

**认证**: Bearer Token
**权限**: `users:delete`

**成功响应** (`204 No Content`)

**错误响应** (`404 Not Found`):

```json
{
  "error": "user_not_found",
  "error_description": "User not found"
}
```

**错误响应** (`403 Forbidden`):

```json
{
  "error": "cannot_delete_self",
  "error_description": "Cannot delete your own account"
}
```

**示例**:

```bash
curl -X DELETE "http://localhost:6188/api/v2/admin/users/user-uuid" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 角色管理 API

### 1. 列出角色

#### `GET /api/v2/admin/roles`

获取角色列表。

**认证**: Bearer Token
**权限**: `roles:list` 或 `roles:read`

**成功响应** (`200 OK`):

```json
{
  "data": [
    {
      "id": "role-uuid",
      "name": "super_admin",
      "display_name": "超级管理员",
      "description": "拥有所有权限",
      "is_system_role": true,
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "permission_count": 50
    }
  ]
}
```

---

### 2. 创建角色

#### `POST /api/v2/admin/roles`

创建新角色。

**认证**: Bearer Token
**权限**: `roles:create`

**请求体**:

```json
{
  "name": "custom_role",
  "display_name": "自定义角色",
  "description": "角色描述",
  "is_active": true
}
```

**成功响应** (`201 Created`):

```json
{
  "id": "new-role-uuid",
  "name": "custom_role",
  "display_name": "自定义角色",
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

### 3. 获取角色权限

#### `GET /api/v2/admin/roles/{role_id}/permissions`

获取角色的所有权限。

**认证**: Bearer Token
**权限**: `roles:read`

**成功响应** (`200 OK`):

```json
{
  "role_id": "role-uuid",
  "permissions": [
    {
      "id": "perm-uuid",
      "name": "users:read",
      "display_name": "查看用户",
      "type": "API"
    }
  ]
}
```

---

### 4. 分配权限到角色

#### `POST /api/v2/admin/roles/{role_id}/permissions`

为角色添加权限。

**认证**: Bearer Token
**权限**: `roles:update`

**请求体**:

```json
{
  "permission_ids": ["perm-uuid-1", "perm-uuid-2"]
}
```

**成功响应** (`200 OK`):

```json
{
  "role_id": "role-uuid",
  "added_count": 2
}
```

---

### 5. 分配角色到用户

#### `POST /api/v2/admin/users/{user_id}/roles`

为用户添加角色。

**认证**: Bearer Token
**权限**: `users:update`

**请求体**:

```json
{
  "role_ids": ["role-uuid-1", "role-uuid-2"]
}
```

**成功响应** (`200 OK`):

```json
{
  "user_id": "user-uuid",
  "assigned_roles": 2
}
```

---

## 权限管理 API

### 1. 列出权限

#### `GET /api/v2/admin/permissions`

获取权限列表。

**认证**: Bearer Token
**权限**: `permissions:list`

**查询参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `type` | string | 过滤权限类型：`API`, `MENU`, `DATA` |
| `resource` | string | 过滤资源名称 |

**成功响应** (`200 OK`):

```json
{
  "data": [
    {
      "id": "perm-uuid",
      "name": "users:read",
      "display_name": "查看用户",
      "description": "允许查看用户列表和详情",
      "resource": "users",
      "action": "read",
      "type": "API",
      "is_system_perm": true,
      "is_active": true
    }
  ]
}
```

---

### 2. 创建权限

#### `POST /api/v2/admin/permissions`

创建新权限。

**认证**: Bearer Token
**权限**: `permissions:create`

**请求体**:

```json
{
  "name": "orders:read",
  "display_name": "查看订单",
  "description": "允许查看订单列表",
  "resource": "orders",
  "action": "read",
  "type": "API",
  "is_active": true
}
```

**成功响应** (`201 Created`):

```json
{
  "id": "new-perm-uuid",
  "name": "orders:read",
  "display_name": "查看订单",
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

## OAuth 客户端管理 API

### 1. 列出客户端

#### `GET /api/v2/admin/clients`

获取 OAuth 客户端列表。

**认证**: Bearer Token
**权限**: `clients:list`

**成功响应** (`200 OK`):

```json
{
  "data": [
    {
      "id": "client-uuid",
      "client_id": "admin-portal",
      "name": "Admin Portal",
      "client_type": "PUBLIC",
      "is_active": true,
      "redirect_uris": ["http://localhost:6188/auth/callback"],
      "grant_types": ["authorization_code", "refresh_token"],
      "allowed_scopes": ["openid", "profile", "email"]
    }
  ]
}
```

---

### 2. 创建客户端

#### `POST /api/v2/admin/clients`

创建新的 OAuth 客户端。

**认证**: Bearer Token
**权限**: `clients:create`

**请求体**:

```json
{
  "client_id": "my-app",
  "name": "My Application",
  "client_type": "CONFIDENTIAL",
  "redirect_uris": ["https://myapp.com/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "allowed_scopes": ["openid", "profile", "email"],
  "require_pkce": true,
  "require_consent": false
}
```

**成功响应** (`201 Created`):

```json
{
  "id": "new-client-uuid",
  "client_id": "my-app",
  "client_secret": "generated-secret-xyz123",
  "name": "My Application",
  "created_at": "2024-01-01T00:00:00Z"
}
```

**注意**: `client_secret` 只在创建时返回一次，请妥善保存。

---

## 错误码

### OAuth 2.1 标准错误

| 错误码 | HTTP 状态 | 说明 |
|--------|-----------|------|
| `invalid_request` | 400 | 请求参数无效或缺失 |
| `invalid_client` | 401 | 客户端认证失败 |
| `invalid_grant` | 400 | 授权码无效、过期或已使用 |
| `unauthorized_client` | 400 | 客户端无权使用此授权类型 |
| `unsupported_grant_type` | 400 | 不支持的 grant_type |
| `invalid_scope` | 400 | 请求的 scope 无效或超出范围 |
| `server_error` | 500 | 服务器内部错误 |

### 自定义错误

| 错误码 | HTTP 状态 | 说明 |
|--------|-----------|------|
| `invalid_credentials` | 401 | 用户名或密码错误 |
| `account_locked` | 423 | 账户已锁定 |
| `token_expired` | 401 | Token 已过期 |
| `token_revoked` | 401 | Token 已撤销 |
| `insufficient_permissions` | 403 | 权限不足 |
| `user_not_found` | 404 | 用户不存在 |
| `username_exists` | 409 | 用户名已存在 |
| `validation_error` | 400 | 数据验证失败 |
| `rate_limit_exceeded` | 429 | 超过速率限制 |

### 错误响应格式

```json
{
  "error": "error_code",
  "error_description": "Human-readable error description",
  "error_uri": "https://docs.example.com/errors/error_code"
}
```

---

## 速率限制

**限制**: 100 请求/分钟/IP

**响应头**:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699999999
```

**超限响应** (`429 Too Many Requests`):

```json
{
  "error": "rate_limit_exceeded",
  "error_description": "Too many requests. Please try again later.",
  "retry_after": 60
}
```

---

## JWT Token 结构

### Access Token Claims

```json
{
  "sub": "user-uuid",
  "client_id": "admin-portal",
  "scope": "openid profile email",
  "permissions": ["users:read", "users:create"],
  "exp": 1699999999,
  "iat": 1699996399,
  "jti": "token-uuid",
  "iss": "https://auth.example.com"
}
```

### ID Token Claims (OpenID Connect)

```json
{
  "sub": "user-uuid",
  "name": "张三",
  "given_name": "三",
  "family_name": "张",
  "email": "zhangsan@example.com",
  "email_verified": true,
  "picture": "https://example.com/avatar.jpg",
  "aud": "admin-portal",
  "iss": "https://auth.example.com",
  "iat": 1699996399,
  "exp": 1699999999
}
```

---

## 最佳实践

### 1. Token 存储

- ✅ **推荐**: `access_token` 存储在内存或 sessionStorage
- ✅ **推荐**: `refresh_token` 存储在 HttpOnly cookie
- ❌ **不推荐**: localStorage（XSS 风险）

### 2. Token 刷新

```javascript
// 自动刷新 Token (access_token 过期前 5 分钟)
const tokenExpiresIn = 3600; // 1 hour
const refreshBeforeExpiry = 300; // 5 minutes
setTimeout(() => refreshAccessToken(), (tokenExpiresIn - refreshBeforeExpiry) * 1000);
```

### 3. PKCE 实现

```javascript
// 生成 code_verifier
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

// 生成 code_challenge
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}
```

### 4. 错误处理

```javascript
try {
  const response = await fetch('/api/v2/admin/users', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (response.status === 401) {
    // Token 过期，尝试刷新
    await refreshAccessToken();
    // 重试请求
  } else if (response.status === 403) {
    // 权限不足
    showPermissionDenied();
  } else if (response.status === 429) {
    // 速率限制
    const retryAfter = response.headers.get('Retry-After');
    await delay(retryAfter * 1000);
    // 重试请求
  }
} catch (error) {
  handleNetworkError(error);
}
```

---

## 变更日志

### v2.0.0 (2024-01-01)
- ✅ 完整的 OAuth 2.1 实现
- ✅ 强制 PKCE (S256 方法)
- ✅ RBAC 权限系统
- ✅ Token 撤销和内省
- ✅ 账户锁定机制
- ✅ 速率限制

---

## 支持

- **文档**: https://docs.example.com
- **问题反馈**: https://github.com/your-org/oauth-service/issues
- **邮箱**: support@example.com

---

**最后更新**: 2024-11-12
**API 版本**: v2.0
