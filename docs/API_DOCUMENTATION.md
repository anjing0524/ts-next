# OAuth 2.1 Service - API 文档

> **API 版本**: v2
> **文档版本**: 1.0
> **基础 URL**: `https://api.yourdomain.com/api/v2`
> **协议**: HTTPS
> **认证方式**: OAuth 2.1

---

## 目录

1. [概述](#概述)
2. [认证和授权](#认证和授权)
3. [API 端点](#api-端点)
   - [OAuth 核心端点](#oauth-核心端点)
   - [用户管理端点](#用户管理端点)
   - [客户端管理端点](#客户端管理端点)
   - [角色和权限管理](#角色和权限管理)
4. [数据模型](#数据模型)
5. [错误处理](#错误处理)
6. [速率限制](#速率限制)
7. [示例代码](#示例代码)

---

## 概述

OAuth 2.1 Service 提供符合 OAuth 2.1 标准的认证授权服务,支持:

- ✅ **Authorization Code Flow** with PKCE (推荐)
- ✅ **Refresh Token Grant**
- ✅ **Client Credentials Grant**
- ✅ **Token Introspection** (RFC 7662)
- ✅ **Token Revocation** (RFC 7009)
- ✅ **OpenID Connect** (OIDC) UserInfo

### 核心特性

- **强制 PKCE**: 所有授权码流程必须使用 PKCE
- **RBAC 权限**: 基于角色的访问控制
- **审计日志**: 所有操作自动记录
- **速率限制**: 100 请求/分钟 (per IP)

---

## 认证和授权

### Bearer Token 认证

大多数 API 端点需要 Bearer Token 认证:

```http
GET /api/v2/admin/users HTTP/1.1
Host: api.yourdomain.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 权限要求

每个端点都有特定的权限要求,格式为 `resource:action`:

| 权限 | 描述 |
|------|------|
| `users:list` | 列出用户 |
| `users:create` | 创建用户 |
| `users:read` | 读取用户详情 |
| `users:update` | 更新用户 |
| `users:delete` | 删除用户 |
| `roles:manage` | 管理角色 |
| `clients:manage` | 管理OAuth客户端 |

---

## API 端点

### OAuth 核心端点

#### 1. 授权端点 (Authorization)

**获取授权码**

```http
GET /api/v2/oauth/authorize HTTP/1.1
Host: api.yourdomain.com
```

**Query Parameters**:

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `client_id` | string | ✅ | OAuth 客户端 ID |
| `redirect_uri` | string | ✅ | 回调 URI (必须预注册) |
| `response_type` | string | ✅ | 固定值: `code` |
| `scope` | string | ✅ | 请求的权限范围 |
| `code_challenge` | string | ✅ | PKCE code challenge (SHA256) |
| `code_challenge_method` | string | ✅ | 固定值: `S256` |
| `state` | string | 推荐 | CSRF 保护令牌 |
| `nonce` | string | 可选 | ID Token 重放保护 |

**示例请求**:

```http
GET /api/v2/oauth/authorize?client_id=admin-portal-client&redirect_uri=https%3A%2F%2Fadmin.yourdomain.com%2Fauth%2Fcallback&response_type=code&scope=openid+profile+email&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&state=random-csrf-token&nonce=random-nonce HTTP/1.1
```

**成功响应** (302 Redirect):

```http
HTTP/1.1 302 Found
Location: https://admin.yourdomain.com/auth/callback?code=AUTH_CODE_HERE&state=random-csrf-token
```

**错误响应**:

```json
{
  "error": "invalid_request",
  "error_description": "Missing required parameter: code_challenge"
}
```

---

#### 2. Token 端点

**交换授权码获取 Token**

```http
POST /api/v2/oauth/token HTTP/1.1
Host: api.yourdomain.com
Content-Type: application/json
```

**Request Body**:

```json
{
  "grant_type": "authorization_code",
  "code": "AUTH_CODE_HERE",
  "redirect_uri": "https://admin.yourdomain.com/auth/callback",
  "code_verifier": "PKCE_CODE_VERIFIER_HERE",
  "client_id": "admin-portal-client",
  "client_secret": "CLIENT_SECRET_HERE"
}
```

**成功响应** (200 OK):

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "550e8400-e29b-41d4-a716-446655440000",
  "scope": "openid profile email",
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Grant Types**:

1. **authorization_code** - 授权码流程
2. **refresh_token** - 刷新令牌
3. **client_credentials** - 客户端凭证

---

#### 3. 刷新 Token

**Request**:

```json
{
  "grant_type": "refresh_token",
  "refresh_token": "550e8400-e29b-41d4-a716-446655440000",
  "client_id": "admin-portal-client",
  "client_secret": "CLIENT_SECRET_HERE"
}
```

**响应**: 同 authorization_code 响应

---

#### 4. Token 内省

**验证 Token 有效性**

```http
POST /api/v2/oauth/introspect HTTP/1.1
Host: api.yourdomain.com
Content-Type: application/x-www-form-urlencoded

token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

**成功响应**:

```json
{
  "active": true,
  "scope": "openid profile email",
  "client_id": "admin-portal-client",
  "username": null,
  "sub": "user-uuid-here",
  "exp": 1700003600
}
```

**Token 无效响应**:

```json
{
  "active": false
}
```

---

#### 5. Token 撤销

**撤销 Access Token 或 Refresh Token**

```http
POST /api/v2/oauth/revoke HTTP/1.1
Host: api.yourdomain.com
Content-Type: application/x-www-form-urlencoded

token=550e8400-e29b-41d4-a716-446655440000&client_id=admin-portal-client&client_secret=CLIENT_SECRET_HERE&token_type_hint=refresh_token
```

**成功响应** (200 OK):

```
(空响应体)
```

> **注意**: 根据 RFC 7009,即使 Token 无效也返回 200 OK

---

#### 6. UserInfo 端点

**获取用户信息** (OIDC)

```http
GET /api/v2/oauth/userinfo HTTP/1.1
Host: api.yourdomain.com
Authorization: Bearer ACCESS_TOKEN_HERE
```

**成功响应**:

```json
{
  "sub": "user-uuid-here"
}
```

---

#### 7. 用户登录

**浏览器登录流程**

```http
POST /api/v2/auth/login HTTP/1.1
Host: api.yourdomain.com
Content-Type: application/json
```

**Request Body**:

```json
{
  "username": "admin",
  "password": "admin123",
  "redirect": "/api/v2/oauth/authorize?..."
}
```

**成功响应** (200 OK):

```http
HTTP/1.1 200 OK
Set-Cookie: session_token=JWT_HERE; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600
Content-Type: application/json

{
  "success": true,
  "redirect_url": "/api/v2/oauth/authorize?..."
}
```

**错误响应** (401 Unauthorized):

```json
{
  "error": "Invalid credentials"
}
```

---

### 用户管理端点

#### 1. 列出用户

```http
GET /api/v2/admin/users HTTP/1.1
Authorization: Bearer ACCESS_TOKEN
```

**权限要求**: `users:list`

**Query Parameters**:

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `page` | integer | 1 | 页码 |
| `limit` | integer | 20 | 每页数量 |
| `search` | string | - | 搜索关键词 (用户名/邮箱) |
| `status` | string | - | 过滤状态: `active`, `inactive`, `locked` |

**成功响应** (200 OK):

```json
{
  "users": [
    {
      "id": "uuid-1",
      "username": "admin",
      "email": "admin@example.com",
      "display_name": "Administrator",
      "is_active": true,
      "created_at": "2025-01-01T00:00:00Z",
      "last_login_at": "2025-11-17T10:00:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20,
  "total_pages": 5
}
```

---

#### 2. 创建用户

```http
POST /api/v2/admin/users HTTP/1.1
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

**权限要求**: `users:create`

**Request Body**:

```json
{
  "username": "john.doe",
  "email": "john@example.com",
  "password": "SecurePassword123!",
  "display_name": "John Doe",
  "is_active": true,
  "must_change_password": true
}
```

**成功响应** (201 Created):

```json
{
  "id": "uuid-new",
  "username": "john.doe",
  "email": "john@example.com",
  "display_name": "John Doe",
  "is_active": true,
  "must_change_password": true,
  "created_at": "2025-11-17T10:00:00Z"
}
```

**错误响应** (409 Conflict):

```json
{
  "error": "Username already exists"
}
```

---

#### 3. 获取用户详情

```http
GET /api/v2/admin/users/{user_id} HTTP/1.1
Authorization: Bearer ACCESS_TOKEN
```

**权限要求**: `users:read`

**成功响应** (200 OK):

```json
{
  "id": "uuid-1",
  "username": "admin",
  "email": "admin@example.com",
  "display_name": "Administrator",
  "is_active": true,
  "must_change_password": false,
  "failed_login_attempts": 0,
  "locked_until": null,
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-11-17T10:00:00Z",
  "last_login_at": "2025-11-17T10:00:00Z"
}
```

---

#### 4. 更新用户

```http
PUT /api/v2/admin/users/{user_id} HTTP/1.1
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

**权限要求**: `users:update`

**Request Body**:

```json
{
  "email": "newemail@example.com",
  "display_name": "Updated Name",
  "is_active": false
}
```

**成功响应** (200 OK):

```json
{
  "id": "uuid-1",
  "username": "admin",
  "email": "newemail@example.com",
  "display_name": "Updated Name",
  "is_active": false,
  "updated_at": "2025-11-17T11:00:00Z"
}
```

---

#### 5. 删除用户

```http
DELETE /api/v2/admin/users/{user_id} HTTP/1.1
Authorization: Bearer ACCESS_TOKEN
```

**权限要求**: `users:delete`

**成功响应** (204 No Content):

```
(空响应体)
```

---

### 客户端管理端点

#### 1. 列出 OAuth 客户端

```http
GET /api/v2/admin/clients HTTP/1.1
Authorization: Bearer ACCESS_TOKEN
```

**权限要求**: `clients:read`

**成功响应** (200 OK):

```json
{
  "clients": [
    {
      "id": "uuid-1",
      "client_id": "admin-portal-client",
      "client_name": "Admin Portal",
      "client_type": "CONFIDENTIAL",
      "redirect_uris": ["https://admin.yourdomain.com/auth/callback"],
      "allowed_scopes": ["openid", "profile", "email"],
      "grant_types": ["authorization_code", "refresh_token"],
      "require_pkce": true,
      "is_active": true,
      "created_at": "2025-01-01T00:00:00Z"
    }
  ],
  "total": 5
}
```

---

#### 2. 创建 OAuth 客户端

```http
POST /api/v2/admin/clients HTTP/1.1
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

**权限要求**: `clients:create`

**Request Body**:

```json
{
  "client_id": "new-app-client",
  "client_name": "New Application",
  "client_type": "CONFIDENTIAL",
  "redirect_uris": ["https://app.example.com/callback"],
  "allowed_scopes": ["openid", "profile"],
  "grant_types": ["authorization_code", "refresh_token"],
  "require_pkce": true,
  "access_token_ttl": 3600,
  "refresh_token_ttl": 2592000
}
```

**成功响应** (201 Created):

```json
{
  "id": "uuid-new",
  "client_id": "new-app-client",
  "client_secret": "GENERATED_SECRET_HERE",
  "client_name": "New Application",
  "client_type": "CONFIDENTIAL",
  "redirect_uris": ["https://app.example.com/callback"],
  "allowed_scopes": ["openid", "profile"],
  "grant_types": ["authorization_code", "refresh_token"],
  "require_pkce": true,
  "is_active": true,
  "created_at": "2025-11-17T10:00:00Z"
}
```

> **重要**: `client_secret` 只在创建时返回一次,请妥善保存!

---

### 角色和权限管理

#### 1. 列出角色

```http
GET /api/v2/admin/roles HTTP/1.1
Authorization: Bearer ACCESS_TOKEN
```

**权限要求**: `roles:list`

**成功响应**:

```json
{
  "roles": [
    {
      "id": "uuid-1",
      "name": "admin",
      "display_name": "Administrator",
      "is_system_role": true,
      "is_active": true,
      "created_at": "2025-01-01T00:00:00Z"
    }
  ],
  "total": 3
}
```

---

#### 2. 获取角色权限

```http
GET /api/v2/admin/roles/{role_id}/permissions HTTP/1.1
Authorization: Bearer ACCESS_TOKEN
```

**成功响应**:

```json
{
  "role_id": "uuid-1",
  "role_name": "admin",
  "permissions": [
    {
      "id": "uuid-p1",
      "name": "users:list",
      "resource": "users",
      "action": "list",
      "type": "API"
    },
    {
      "id": "uuid-p2",
      "name": "users:create",
      "resource": "users",
      "action": "create",
      "type": "API"
    }
  ],
  "total": 25
}
```

---

#### 3. 分配权限到角色

```http
POST /api/v2/admin/roles/{role_id}/permissions HTTP/1.1
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

**Request Body**:

```json
{
  "permission_ids": [
    "uuid-p1",
    "uuid-p2",
    "uuid-p3"
  ]
}
```

**成功响应** (200 OK):

```json
{
  "role_id": "uuid-1",
  "assigned_permissions": 3,
  "message": "Permissions assigned successfully"
}
```

---

#### 4. 分配角色给用户

```http
POST /api/v2/admin/users/{user_id}/roles HTTP/1.1
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

**Request Body**:

```json
{
  "role_id": "uuid-role-1"
}
```

**成功响应** (200 OK):

```json
{
  "user_id": "uuid-user-1",
  "role_id": "uuid-role-1",
  "message": "Role assigned successfully"
}
```

---

## 数据模型

### User (用户)

```typescript
interface User {
  id: string;                      // UUID
  username: string;                // 唯一用户名
  email: string | null;            // 邮箱
  password_hash: string;           // bcrypt 密码哈希
  display_name: string | null;     // 显示名称
  is_active: boolean;              // 是否激活
  must_change_password: boolean;   // 是否需要修改密码
  failed_login_attempts: number;   // 失败登录次数
  locked_until: string | null;     // 锁定到期时间
  created_at: string;              // 创建时间 (ISO 8601)
  updated_at: string;              // 更新时间
  last_login_at: string | null;    // 最后登录时间
}
```

### OAuthClient (OAuth 客户端)

```typescript
interface OAuthClient {
  id: string;
  client_id: string;               // 客户端 ID
  client_secret: string | null;    // 客户端密钥 (CONFIDENTIAL 类型)
  client_name: string;             // 客户端名称
  client_type: "PUBLIC" | "CONFIDENTIAL";
  redirect_uris: string[];         // 允许的回调 URI
  allowed_scopes: string[];        // 允许的权限范围
  grant_types: string[];           // 支持的授权类型
  response_types: string[];        // 支持的响应类型
  require_pkce: boolean;           // 是否强制 PKCE
  require_consent: boolean;        // 是否需要用户同意
  access_token_ttl: number;        // Access Token 有效期(秒)
  refresh_token_ttl: number;       // Refresh Token 有效期(秒)
  is_active: boolean;
  created_at: string;
}
```

### Role (角色)

```typescript
interface Role {
  id: string;
  name: string;                    // 角色名称 (唯一)
  display_name: string;            // 显示名称
  is_system_role: boolean;         // 是否系统角色
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

### Permission (权限)

```typescript
interface Permission {
  id: string;
  name: string;                    // 权限名称 (resource:action)
  resource: string;                // 资源名称
  action: string;                  // 操作类型
  type: "API" | "MENU" | "DATA";   // 权限类型
  is_system_perm: boolean;         // 是否系统权限
  is_active: boolean;
  created_at: string;
}
```

### TokenClaims (JWT Payload)

```typescript
interface TokenClaims {
  sub: string | null;              // Subject (用户ID)
  client_id: string;               // 客户端 ID
  scope: string;                   // 权限范围
  permissions: string[];           // 用户权限列表
  iat: number;                     // 签发时间 (Unix timestamp)
  exp: number;                     // 过期时间 (Unix timestamp)
  jti: string;                     // Token ID (UUID)
  iss: string;                     // 签发者
  nonce?: string;                  // Nonce (OIDC)
}
```

---

## 错误处理

### 错误响应格式

```json
{
  "error": "error_code",
  "error_description": "Human readable description"
}
```

### HTTP 状态码

| 状态码 | 含义 | 示例 |
|--------|------|------|
| 200 | 成功 | 请求成功处理 |
| 201 | 已创建 | 资源创建成功 |
| 204 | 无内容 | 删除成功 |
| 400 | 请求错误 | 参数缺失或格式错误 |
| 401 | 未认证 | Token 无效或已过期 |
| 403 | 禁止访问 | 权限不足 |
| 404 | 未找到 | 资源不存在 |
| 409 | 冲突 | 资源已存在 (如用户名重复) |
| 429 | 请求过多 | 触发速率限制 |
| 500 | 服务器错误 | 内部错误 |

### 常见错误码

| 错误码 | HTTP 状态 | 描述 |
|--------|-----------|------|
| `invalid_request` | 400 | 缺少必需参数或参数格式错误 |
| `invalid_client` | 401 | 客户端认证失败 |
| `invalid_grant` | 400 | 授权码无效或已使用 |
| `unauthorized_client` | 400 | 客户端未授权使用此授权类型 |
| `unsupported_grant_type` | 400 | 不支持的授权类型 |
| `invalid_scope` | 400 | 请求的权限范围无效 |
| `invalid_token` | 401 | Token 无效或已过期 |
| `insufficient_scope` | 403 | Token 权限不足 |

---

## 速率限制

### 限制规则

- **限流方式**: 基于 IP 地址
- **限制**: 100 请求 / 分钟
- **响应头**:
  ```http
  X-RateLimit-Limit: 100
  X-RateLimit-Remaining: 95
  X-RateLimit-Reset: 1700000000
  ```

### 超限响应

**HTTP 429 Too Many Requests**:

```json
{
  "error": "rate_limit_exceeded",
  "error_description": "Too many requests. Please try again later.",
  "retry_after": 60
}
```

---

## 示例代码

### JavaScript/TypeScript

#### 完整 OAuth 2.1 授权码流程

```typescript
// 1. 生成 PKCE 参数
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(new Uint8Array(hash));
}

// 2. 发起授权请求
async function initiateOAuthFlow() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(32);

  // 保存到 session storage
  sessionStorage.setItem('pkce_code_verifier', codeVerifier);
  sessionStorage.setItem('oauth_state', state);

  const authUrl = new URL('https://api.yourdomain.com/api/v2/oauth/authorize');
  authUrl.searchParams.set('client_id', 'admin-portal-client');
  authUrl.searchParams.set('redirect_uri', 'https://admin.yourdomain.com/auth/callback');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  window.location.href = authUrl.toString();
}

// 3. 处理回调
async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  // 验证 state (CSRF 保护)
  const savedState = sessionStorage.getItem('oauth_state');
  if (state !== savedState) {
    throw new Error('Invalid state parameter');
  }

  // 交换 Token
  const codeVerifier = sessionStorage.getItem('pkce_code_verifier')!;

  const response = await fetch('https://api.yourdomain.com/api/v2/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'https://admin.yourdomain.com/auth/callback',
      code_verifier: codeVerifier,
      client_id: 'admin-portal-client',
      client_secret: 'CLIENT_SECRET',
    }),
  });

  const tokens = await response.json();

  // 保存 tokens
  sessionStorage.setItem('access_token', tokens.access_token);
  sessionStorage.setItem('refresh_token', tokens.refresh_token);

  // 清理 PKCE 数据
  sessionStorage.removeItem('pkce_code_verifier');
  sessionStorage.removeItem('oauth_state');

  return tokens;
}

// 4. 使用 Access Token 调用 API
async function fetchUsers() {
  const accessToken = sessionStorage.getItem('access_token');

  const response = await fetch('https://api.yourdomain.com/api/v2/admin/users', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401) {
    // Token 过期,尝试刷新
    await refreshToken();
    return fetchUsers(); // 重试
  }

  return response.json();
}

// 5. 刷新 Token
async function refreshToken() {
  const refreshToken = sessionStorage.getItem('refresh_token');

  const response = await fetch('https://api.yourdomain.com/api/v2/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: 'admin-portal-client',
      client_secret: 'CLIENT_SECRET',
    }),
  });

  const tokens = await response.json();

  sessionStorage.setItem('access_token', tokens.access_token);
  sessionStorage.setItem('refresh_token', tokens.refresh_token);

  return tokens;
}
```

### Python

```python
import requests
import hashlib
import base64
import secrets

# PKCE 辅助函数
def generate_code_verifier():
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('utf-8').rstrip('=')

def generate_code_challenge(verifier):
    digest = hashlib.sha256(verifier.encode('utf-8')).digest()
    return base64.urlsafe_b64encode(digest).decode('utf-8').rstrip('=')

# 客户端凭证流程 (服务间调用)
def get_client_credentials_token():
    response = requests.post(
        'https://api.yourdomain.com/api/v2/oauth/token',
        json={
            'grant_type': 'client_credentials',
            'client_id': 'backend-service-client',
            'client_secret': 'CLIENT_SECRET',
            'scope': 'api:read api:write'
        }
    )
    return response.json()

# 使用 Token 调用 API
def fetch_users(access_token):
    response = requests.get(
        'https://api.yourdomain.com/api/v2/admin/users',
        headers={'Authorization': f'Bearer {access_token}'}
    )
    return response.json()
```

### cURL

```bash
# 1. 交换授权码获取 Token
curl -X POST https://api.yourdomain.com/api/v2/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "AUTH_CODE_HERE",
    "redirect_uri": "https://admin.yourdomain.com/auth/callback",
    "code_verifier": "CODE_VERIFIER_HERE",
    "client_id": "admin-portal-client",
    "client_secret": "CLIENT_SECRET"
  }'

# 2. 使用 Access Token 获取用户列表
curl -X GET https://api.yourdomain.com/api/v2/admin/users \
  -H "Authorization: Bearer ACCESS_TOKEN_HERE"

# 3. 创建新用户
curl -X POST https://api.yourdomain.com/api/v2/admin/users \
  -H "Authorization: Bearer ACCESS_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john.doe",
    "email": "john@example.com",
    "password": "SecurePassword123!",
    "display_name": "John Doe"
  }'

# 4. 撤销 Refresh Token
curl -X POST https://api.yourdomain.com/api/v2/oauth/revoke \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=REFRESH_TOKEN_HERE&client_id=admin-portal-client&client_secret=CLIENT_SECRET&token_type_hint=refresh_token"
```

---

## 附录

### A. OAuth 2.1 vs OAuth 2.0 主要区别

| 特性 | OAuth 2.0 | OAuth 2.1 |
|------|-----------|-----------|
| PKCE | 可选 | **强制要求** |
| Implicit Flow | 支持 | **已移除** |
| Resource Owner Password | 支持 | **已移除** |
| Refresh Token | 建议轮换 | **强制轮换** |
| Redirect URI | 精确匹配 | **必须精确匹配** |

### B. 安全最佳实践

1. ✅ 始终使用 HTTPS
2. ✅ 验证 `state` 参数 (CSRF 保护)
3. ✅ 使用 PKCE (授权码流程)
4. ✅ 验证 `redirect_uri` 精确匹配
5. ✅ 限制 Token 有效期
6. ✅ 启用 Refresh Token 轮换
7. ✅ 使用 HttpOnly Cookie 存储敏感 Token
8. ✅ 实施速率限制

### C. 相关标准和 RFC

- [RFC 6749](https://tools.ietf.org/html/rfc6749) - OAuth 2.0 核心
- [RFC 7636](https://tools.ietf.org/html/rfc7636) - PKCE
- [RFC 7662](https://tools.ietf.org/html/rfc7662) - Token Introspection
- [RFC 7009](https://tools.ietf.org/html/rfc7009) - Token Revocation
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)

---

**文档版本**: 1.0
**最后更新**: 2025-11-17
**维护者**: OAuth Service Team

如有问题,请联系: support@yourdomain.com
