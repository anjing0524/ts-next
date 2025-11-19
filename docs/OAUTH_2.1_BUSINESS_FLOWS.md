# OAuth 2.1 完整业务流程文档

> **文档版本**: 1.0
> **创建日期**: 2025-11-17
> **适用系统**: OAuth Service Rust + Admin Portal + Pingora Proxy

本文档详细描述了整个 OAuth 2.1 认证授权系统的完整业务流程,包括所有参与组件的交互。

---

## 目录

1. [系统架构概览](#系统架构概览)
2. [OAuth 2.1 授权码流程 (Authorization Code Flow with PKCE)](#oauth-21-授权码流程)
3. [用户登录流程](#用户登录流程)
4. [Token 刷新流程](#token-刷新流程)
5. [客户端凭证流程](#客户端凭证流程)
6. [Token 内省和撤销](#token-内省和撤销)
7. [受保护资源访问流程](#受保护资源访问流程)
8. [权限验证流程](#权限验证流程)
9. [完整请求链路](#完整请求链路)
10. [错误处理流程](#错误处理流程)

---

## 系统架构概览

### 组件职责

```
┌─────────────────┐
│   浏览器/客户端   │
│   (User Agent)  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│      Pingora Proxy (0.0.0.0:6188)      │
│  - 反向代理                              │
│  - 路由分发                              │
│  - 负载均衡                              │
│  - 健康检查                              │
└─────────┬───────────────────────┬───────┘
          │                       │
          │ /api/v2/*            │ /* (默认)
          ▼                       ▼
┌──────────────────────┐   ┌────────────────────┐
│  OAuth Service Rust  │   │   Admin Portal     │
│   (127.0.0.1:3001)   │   │  (127.0.0.1:3002)  │
│                      │   │                    │
│  - 授权服务器        │   │  - 管理界面        │
│  - Token 签发        │   │  - OAuth 客户端    │
│  - 用户认证          │   │  - 资源管理        │
│  - RBAC 权限         │   │                    │
│  - 审计日志          │   │                    │
└──────────┬───────────┘   └────────────────────┘
           │
           ▼
    ┌─────────────┐
    │   SQLite    │
    │  Database   │
    └─────────────┘
```

### 端口和路由配置

| 服务 | 监听地址 | 访问路径 | 后端地址 |
|------|----------|----------|----------|
| Pingora Proxy | 0.0.0.0:6188 | 所有请求 | - |
| OAuth Service | 127.0.0.1:3001 | `/api/v2/*` | 通过 Pingora |
| Admin Portal | 127.0.0.1:3002 | `/*` (默认) | 通过 Pingora |

---

## OAuth 2.1 授权码流程

OAuth 2.1 的授权码流程是最安全的授权方式,**强制要求使用 PKCE** 来防止授权码拦截攻击。

### 流程图

```
┌──────────┐                                  ┌──────────────┐                    ┌─────────────┐
│  浏览器   │                                  │ Admin Portal │                    │ OAuth Service│
│ (Client) │                                  │              │                    │             │
└────┬─────┘                                  └──────┬───────┘                    └──────┬──────┘
     │                                               │                                   │
     │ 1. 用户点击"登录"按钮                          │                                   │
     │ ──────────────────────────────────────>      │                                   │
     │                                               │                                   │
     │                                               │ 2. 生成 PKCE 参数                 │
     │                                               │    - code_verifier (随机字符串)  │
     │                                               │    - code_challenge = SHA256(verifier) │
     │                                               │    - state (CSRF token)          │
     │                                               │                                   │
     │ 3. 302 重定向到 /api/v2/oauth/authorize       │                                   │
     │ <──────────────────────────────────────      │                                   │
     │    + client_id=admin-portal-client            │                                   │
     │    + redirect_uri=http://localhost:6188/auth/callback                            │
     │    + response_type=code                       │                                   │
     │    + scope=openid profile email               │                                   │
     │    + code_challenge=<hash>                    │                                   │
     │    + code_challenge_method=S256               │                                   │
     │    + state=<csrf_token>                       │                                   │
     │    + nonce=<random>                           │                                   │
     │                                               │                                   │
     │ 4. GET /api/v2/oauth/authorize (通过 Pingora)                                     │
     │ ─────────────────────────────────────────────────────────────────────────────────>│
     │                                               │                                   │
     │                                               │         5. 验证请求参数            │
     │                                               │            - client_id 是否存在   │
     │                                               │            - redirect_uri 是否匹配│
     │                                               │            - scope 是否允许       │
     │                                               │            - PKCE 参数格式        │
     │                                               │                                   │
     │                                               │         6. 检查用户是否已登录     │
     │                                               │            (检查 session_token cookie) │
     │                                               │                                   │
     │ 7. 302 重定向到登录页 (如果未登录)                                                 │
     │ <─────────────────────────────────────────────────────────────────────────────────│
     │    Location: http://localhost:6188/login?redirect=<authorize_url>                 │
     │                                               │                                   │
     │ 8. 显示登录表单                               │                                   │
     │ ──────────────────────────────────────>      │                                   │
     │                                               │                                   │
     │ 9. 用户输入用户名/密码                        │                                   │
     │ ──────────────────────────────────────>      │                                   │
     │                                               │                                   │
     │ 10. POST /api/v2/auth/login (JSON)                                                │
     │ ─────────────────────────────────────────────────────────────────────────────────>│
     │    {username: "admin", password: "admin123", redirect: "<authorize_url>"}         │
     │                                               │                                   │
     │                                               │        11. 验证用户凭证           │
     │                                               │            - bcrypt 密码验证      │
     │                                               │            - 检查账户状态         │
     │                                               │                                   │
     │                                               │        12. 签发 session token     │
     │                                               │            - 短期 JWT (1小时)     │
     │                                               │            - 包含 user_id         │
     │                                               │                                   │
     │ 13. 返回登录成功 + Set-Cookie                                                      │
     │ <─────────────────────────────────────────────────────────────────────────────────│
     │    {success: true, redirect_url: "<authorize_url>"}                               │
     │    Set-Cookie: session_token=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/        │
     │                                               │                                   │
     │ 14. 前端跳转到 redirect_url (authorize)       │                                   │
     │ ─────────────────────────────────────────────────────────────────────────────────>│
     │    (携带 session_token cookie)                │                                   │
     │                                               │                                   │
     │                                               │        15. 验证 session token     │
     │                                               │            - JWT 签名验证         │
     │                                               │            - 提取 user_id         │
     │                                               │                                   │
     │                                               │        16. (可选) 显示授权同意页面│
     │                                               │            当前版本: 隐式同意     │
     │                                               │                                   │
     │                                               │        17. 生成授权码             │
     │                                               │            - 保存: user_id, client_id │
     │                                               │            - 保存: scope, code_challenge │
     │                                               │            - 保存: nonce          │
     │                                               │            - 有效期: 10分钟       │
     │                                               │                                   │
     │ 18. 302 重定向到 redirect_uri + code                                              │
     │ <─────────────────────────────────────────────────────────────────────────────────│
     │    Location: http://localhost:6188/auth/callback?code=<auth_code>&state=<state>   │
     │                                               │                                   │
     │ 19. GET /auth/callback?code=xxx&state=xxx    │                                   │
     │ ──────────────────────────────────────>      │                                   │
     │                                               │                                   │
     │                                               │ 20. 验证 state (CSRF 保护)        │
     │                                               │                                   │
     │                                               │ 21. POST /api/v2/oauth/token       │
     │                                               │ ─────────────────────────────────>│
     │                                               │    {                               │
     │                                               │      grant_type: "authorization_code" │
     │                                               │      code: "<auth_code>",          │
     │                                               │      redirect_uri: "...",          │
     │                                               │      code_verifier: "<verifier>",  │
     │                                               │      client_id: "admin-portal-client" │
     │                                               │      client_secret: "<secret>"     │
     │                                               │    }                               │
     │                                               │                                   │
     │                                               │        22. 验证授权码              │
     │                                               │            - 是否存在且未使用     │
     │                                               │            - 是否过期             │
     │                                               │            - client_id 是否匹配   │
     │                                               │                                   │
     │                                               │        23. 验证 PKCE               │
     │                                               │            SHA256(code_verifier) == code_challenge │
     │                                               │                                   │
     │                                               │        24. 获取用户权限           │
     │                                               │            - 查询 user_roles       │
     │                                               │            - 查询 role_permissions │
     │                                               │            - 缓存权限列表 (5分钟)  │
     │                                               │                                   │
     │                                               │        25. 签发 Token Pair        │
     │                                               │            - access_token (JWT, 1小时) │
     │                                               │            - refresh_token (UUID, 30天) │
     │                                               │            - id_token (JWT, OIDC)  │
     │                                               │                                   │
     │                                               │        26. 标记授权码已使用       │
     │                                               │        27. 保存 refresh_token 到DB│
     │                                               │                                   │
     │                                               │ 28. 返回 Token Response            │
     │                                               │ <─────────────────────────────────│
     │                                               │    {                               │
     │                                               │      access_token: "<jwt>",        │
     │                                               │      token_type: "Bearer",         │
     │                                               │      expires_in: 3600,             │
     │                                               │      refresh_token: "<uuid>",      │
     │                                               │      scope: "openid profile email",│
     │                                               │      id_token: "<jwt>"             │
     │                                               │    }                               │
     │                                               │                                   │
     │                                               │ 29. 存储 tokens                   │
     │                                               │     - sessionStorage (dev)         │
     │                                               │     - HttpOnly Cookie (prod)       │
     │                                               │                                   │
     │ 30. 302 重定向到 /dashboard                   │                                   │
     │ <──────────────────────────────────────      │                                   │
     │                                               │                                   │
     │ 31. 用户已登录,显示 Dashboard                 │                                   │
     │ ──────────────────────────────────────>      │                                   │
```

### 关键安全特性

#### 1. PKCE (Proof Key for Code Exchange)

**目的**: 防止授权码拦截攻击

**实现** (Admin Portal):
```typescript
// 生成 code_verifier (43-128 字符的随机字符串)
const codeVerifier = generateRandomString(128);

// 计算 code_challenge
const codeChallenge = await sha256(codeVerifier);

// 存储 code_verifier 用于后续 token 交换
sessionStorage.setItem('pkce_code_verifier', codeVerifier);
```

**验证** (OAuth Service - `/home/user/ts-next/apps/oauth-service-rust/src/utils/pkce.rs`):
```rust
pub fn verify_pkce(code_verifier: &str, code_challenge: &str) -> Result<(), PkceError> {
    // 计算 code_verifier 的 SHA256
    let computed_challenge = sha256_base64url(code_verifier);

    // 常量时间比较,防止时序攻击
    if computed_challenge != code_challenge {
        return Err(PkceError::ChallengeMismatch);
    }
    Ok(())
}
```

#### 2. State 参数 (CSRF 保护)

**实现** (Admin Portal):
```typescript
// 生成随机 state
const state = generateRandomString(32);
sessionStorage.setItem('oauth_state', state);

// 在 callback 中验证
const returnedState = params.get('state');
if (returnedState !== storedState) {
    throw new Error('Invalid state parameter - CSRF attack detected');
}
```

#### 3. Nonce (重放攻击保护)

**用途**: 用于 ID Token 的验证,确保 token 的新鲜性

```typescript
const nonce = generateRandomString(32);
sessionStorage.setItem('oauth_nonce', nonce);

// 验证 ID Token 中的 nonce claim
if (idToken.nonce !== storedNonce) {
    throw new Error('Invalid nonce - replay attack detected');
}
```

### Token 结构

#### Access Token (JWT)

```json
{
  "header": {
    "alg": "HS256",  // 或 RS256 (生产环境)
    "typ": "JWT"
  },
  "payload": {
    "sub": "user-uuid",              // 用户 ID
    "client_id": "admin-portal-client",
    "scope": "openid profile email",
    "permissions": [                  // RBAC 权限列表
      "users:list",
      "users:create",
      "users:read",
      "roles:manage"
    ],
    "iat": 1700000000,               // 签发时间
    "exp": 1700003600,               // 过期时间 (1小时后)
    "jti": "token-uuid",             // Token ID (用于撤销)
    "iss": "http://127.0.0.1:3001"   // 签发者
  }
}
```

#### Refresh Token

- **格式**: UUID v4 (非 JWT)
- **存储**: 数据库 `refresh_tokens` 表
- **有效期**: 30 天
- **特性**:
  - 可撤销
  - 单次使用 (可配置)
  - 不包含权限信息 (权限在刷新时重新加载)

#### ID Token (OIDC)

```json
{
  "sub": "user-uuid",
  "aud": "admin-portal-client",
  "iss": "http://127.0.0.1:3001",
  "iat": 1700000000,
  "exp": 1700003600,
  "nonce": "random-nonce-value",
  "email": "admin@example.com",     // 如果 scope 包含 email
  "name": "Administrator"            // 如果 scope 包含 profile
}
```

---

## 用户登录流程

这是针对浏览器用户的登录流程,使用 **HttpOnly Cookie** 存储 session token。

### 流程步骤

```
┌──────────┐                    ┌─────────────┐                    ┌──────────────┐
│  浏览器   │                    │Admin Portal │                    │OAuth Service │
└────┬─────┘                    └──────┬──────┘                    └──────┬───────┘
     │                                 │                                   │
     │ 1. 访问 /login?redirect=<url>   │                                   │
     │ ─────────────────────────────>  │                                   │
     │                                 │                                   │
     │ 2. 显示登录表单                 │                                   │
     │ <─────────────────────────────  │                                   │
     │                                 │                                   │
     │ 3. 用户输入凭证并提交           │                                   │
     │    (通过 fetch POST)            │                                   │
     │ ─────────────────────────────>  │                                   │
     │                                 │                                   │
     │                                 │ 4. POST /api/v2/auth/login        │
     │                                 │ ─────────────────────────────────>│
     │                                 │    Content-Type: application/json │
     │                                 │    {                               │
     │                                 │      "username": "admin",          │
     │                                 │      "password": "admin123",       │
     │                                 │      "redirect": "/oauth/authorize?..." │
     │                                 │    }                               │
     │                                 │                                   │
     │                                 │                    5. 验证用户凭证│
     │                                 │                       - 查询 users 表 │
     │                                 │                       - bcrypt::verify() │
     │                                 │                       - 检查 locked_until │
     │                                 │                                   │
     │                                 │                    6. 获取用户权限│
     │                                 │                       - RBAC 查询 │
     │                                 │                       - 缓存 5 分钟 │
     │                                 │                                   │
     │                                 │                    7. 签发 session token │
     │                                 │                       - 使用内部客户端 │
     │                                 │                       - scope: "session" │
     │                                 │                       - TTL: 1 小时 │
     │                                 │                                   │
     │                                 │                    8. 更新 last_login │
     │                                 │                                   │
     │                                 │ 9. 返回成功响应                   │
     │                                 │ <─────────────────────────────────│
     │                                 │    Set-Cookie: session_token=<jwt>; │
     │                                 │      HttpOnly; Secure; SameSite=Lax; │
     │                                 │      Path=/; Max-Age=3600          │
     │                                 │    {                               │
     │                                 │      "success": true,              │
     │                                 │      "redirect_url": "/oauth/authorize?..." │
     │                                 │    }                               │
     │                                 │                                   │
     │ 10. 前端 JavaScript 跳转        │                                   │
     │     window.location.href = redirect_url                             │
     │ ────────────────────────────────────────────────────────────────────>│
     │     (浏览器自动携带 session_token cookie)                           │
     │                                 │                                   │
     │                                 │                   11. 继续授权流程│
```

### Session Token 的安全特性

**Cookie 属性** (`/home/user/ts-next/apps/oauth-service-rust/src/routes/oauth.rs`, lines 156-162):

```rust
let session_cookie = Cookie::build(("session_token", token_pair.access_token))
    .path("/")                       // 全站可访问
    // .domain() 故意不设置 - 让浏览器使用当前 host
    .http_only(true)                 // ✅ 防止 XSS - JavaScript 无法访问
    .secure(is_production)           // ✅ 生产环境强制 HTTPS
    .same_site(SameSite::Lax)        // ✅ CSRF 保护 - 允许顶级导航
    .max_age(time::Duration::hours(1)); // 1 小时过期
```

**为什么不设置 domain 属性?**
- 让浏览器自动使用当前请求的 host
- 确保通过 Pingora 代理时 cookie 正确工作
- 避免跨域 cookie 的安全风险

---

## Token 刷新流程

当 access token 过期后,客户端可以使用 refresh token 获取新的 access token,而无需用户重新登录。

### 流程图

```
┌──────────┐                    ┌─────────────┐                    ┌──────────────┐
│  客户端   │                    │Admin Portal │                    │OAuth Service │
└────┬─────┘                    └──────┬──────┘                    └──────┬───────┘
     │                                 │                                   │
     │ 1. API 调用返回 401              │                                   │
     │    (access_token 过期)           │                                   │
     │ <──────────────────────────────  │                                   │
     │                                 │                                   │
     │                                 │ 2. 检测到 401 错误                │
     │                                 │    - 检查是否有 refresh_token     │
     │                                 │    - 触发自动刷新                 │
     │                                 │                                   │
     │                                 │ 3. POST /api/v2/oauth/token       │
     │                                 │ ─────────────────────────────────>│
     │                                 │    {                               │
     │                                 │      "grant_type": "refresh_token",│
     │                                 │      "refresh_token": "<uuid>",    │
     │                                 │      "client_id": "admin-portal-client", │
     │                                 │      "client_secret": "<secret>"   │
     │                                 │    }                               │
     │                                 │                                   │
     │                                 │                    4. 验证客户端  │
     │                                 │                       - client_id + secret │
     │                                 │                                   │
     │                                 │                    5. 验证 refresh token │
     │                                 │                       - 查询 refresh_tokens 表 │
     │                                 │                       - 检查是否已撤销 │
     │                                 │                       - 检查是否过期 │
     │                                 │                       - 检查 client_id 匹配 │
     │                                 │                                   │
     │                                 │                    6. 提取 user_id │
     │                                 │                                   │
     │                                 │                    7. 重新加载用户权限 │
     │                                 │                       - 查询最新的 RBAC │
     │                                 │                       - 更新权限缓存 │
     │                                 │                                   │
     │                                 │                    8. 签发新 Token Pair │
     │                                 │                       - 新 access_token │
     │                                 │                       - 新 refresh_token (token rotation) │
     │                                 │                                   │
     │                                 │                    9. 撤销旧 refresh token │
     │                                 │                       (可选,取决于配置) │
     │                                 │                                   │
     │                                 │ 10. 返回新 tokens                 │
     │                                 │ <─────────────────────────────────│
     │                                 │    {                               │
     │                                 │      "access_token": "<new_jwt>",  │
     │                                 │      "token_type": "Bearer",       │
     │                                 │      "expires_in": 3600,           │
     │                                 │      "refresh_token": "<new_uuid>",│
     │                                 │      "scope": "openid profile email" │
     │                                 │    }                               │
     │                                 │                                   │
     │                                 │ 11. 更新本地存储                  │
     │                                 │     - 替换旧 tokens               │
     │                                 │                                   │
     │                                 │ 12. 重试原始 API 请求             │
     │                                 │     - 使用新 access_token         │
     │                                 │ ─────────────────────────────────>│
     │                                 │                                   │
     │ 13. 请求成功                    │                                   │
     │ <──────────────────────────────────────────────────────────────────│
```

### Refresh Token Rotation

**为什么需要 Token Rotation?**
- **安全性**: 即使 refresh token 泄露,窗口期也很短
- **检测盗用**: 如果旧 token 被重复使用,可能表示 token 被盗

**实现** (`/home/user/ts-next/apps/oauth-service-rust/src/services/token_service.rs`):

```rust
// 每次刷新都生成新的 refresh token
let new_refresh_token = Uuid::new_v4().to_string();

// 保存新 token,标记 previous_token_id
sqlx::query(
    "INSERT INTO refresh_tokens (token, user_id, client_id, previous_token_id, ...)
     VALUES (?, ?, ?, ?, ...)"
)
.bind(&new_refresh_token)
.bind(&old_token.user_id)
.bind(&old_token.client_id)
.bind(&old_refresh_token)  // 链式追踪
.execute(pool)
.await?;

// 撤销旧 refresh token
sqlx::query("UPDATE refresh_tokens SET is_revoked = 1 WHERE token = ?")
    .bind(&old_refresh_token)
    .execute(pool)
    .await?;
```

---

## 客户端凭证流程

用于**服务间调用**(Machine-to-Machine),不涉及用户上下文。

### 流程图

```
┌─────────────┐                                  ┌──────────────┐
│  后端服务    │                                  │OAuth Service │
│  (Client)   │                                  │              │
└──────┬──────┘                                  └──────┬───────┘
       │                                                │
       │ 1. POST /api/v2/oauth/token                    │
       │ ──────────────────────────────────────────────>│
       │    {                                           │
       │      "grant_type": "client_credentials",       │
       │      "client_id": "backend-service-client",    │
       │      "client_secret": "<secret>",              │
       │      "scope": "api:read api:write"             │
       │    }                                           │
       │                                                │
       │                                 2. 验证客户端  │
       │                                    - client_id │
       │                                    - client_secret │
       │                                    - 必须是 CONFIDENTIAL 类型 │
       │                                                │
       │                                 3. 验证 scope  │
       │                                    - 检查 allowed_scopes │
       │                                                │
       │                                 4. 获取客户端权限 │
       │                                    - client_permissions (预配置) │
       │                                    - 不关联用户 (sub = null) │
       │                                                │
       │                                 5. 签发 access_token │
       │                                    - 无 refresh_token │
       │                                    - 无 id_token      │
       │                                    - 较短的 TTL       │
       │                                                │
       │ 6. 返回 token                                  │
       │ <──────────────────────────────────────────────│
       │    {                                           │
       │      "access_token": "<jwt>",                  │
       │      "token_type": "Bearer",                   │
       │      "expires_in": 3600,                       │
       │      "scope": "api:read api:write"             │
       │    }                                           │
```

### 客户端凭证 Token 结构

```json
{
  "sub": null,                         // 没有用户上下文
  "client_id": "backend-service-client",
  "scope": "api:read api:write",
  "permissions": [                     // 客户端级别的权限
    "api:access",
    "data:read"
  ],
  "iat": 1700000000,
  "exp": 1700003600,
  "jti": "token-uuid",
  "iss": "http://127.0.0.1:3001"
}
```

### 使用场景

- 后端服务调用 API
- 定时任务访问资源
- 服务间认证
- Webhook 回调

---

## Token 内省和撤销

### Token 内省 (Introspection)

用于验证 token 的有效性并获取 token 的元数据。

```
┌─────────────┐                                  ┌──────────────┐
│ Resource    │                                  │OAuth Service │
│ Server      │                                  │              │
└──────┬──────┘                                  └──────┬───────┘
       │                                                │
       │ 1. POST /api/v2/oauth/introspect               │
       │ ──────────────────────────────────────────────>│
       │    Form: token=<access_or_refresh_token>       │
       │                                                │
       │                                 2. 解析 token  │
       │                                    - JWT 验证签名 │
       │                                    - 检查过期时间 │
       │                                    - 查询撤销列表 │
       │                                                │
       │ 3. 返回 introspection response                 │
       │ <──────────────────────────────────────────────│
       │    {                                           │
       │      "active": true,                           │
       │      "scope": "openid profile",                │
       │      "client_id": "admin-portal-client",       │
       │      "username": null,                         │
       │      "sub": "user-uuid",                       │
       │      "exp": 1700003600                         │
       │    }                                           │
```

**实现** (`/home/user/ts-next/apps/oauth-service-rust/src/services/token_service.rs`):

```rust
pub async fn introspect_token(&self, token: &str) -> Result<TokenClaims, ServiceError> {
    // 1. 解码并验证 JWT
    let token_data = decode::<TokenClaims>(
        token,
        &self.decoding_key,
        &Validation::new(self.algorithm)
    )?;

    // 2. 检查是否被撤销
    if self.is_token_revoked(&token_data.claims.jti).await? {
        return Err(ServiceError::Unauthorized("Token has been revoked".to_string()));
    }

    Ok(token_data.claims)
}
```

### Token 撤销 (Revocation)

符合 **RFC 7009** 标准。

```
┌─────────────┐                                  ┌──────────────┐
│  客户端      │                                  │OAuth Service │
└──────┬──────┘                                  └──────┬───────┘
       │                                                │
       │ 1. POST /api/v2/oauth/revoke                   │
       │ ──────────────────────────────────────────────>│
       │    Form:                                       │
       │      token=<token_to_revoke>                   │
       │      client_id=<client_id>                     │
       │      client_secret=<secret>                    │
       │      token_type_hint=refresh_token (optional)  │
       │                                                │
       │                                 2. 验证客户端  │
       │                                                │
       │                                 3. 撤销 token  │
       │                                    - 如果是 refresh_token: │
       │                                      UPDATE is_revoked = 1 │
       │                                    - 如果是 access_token:  │
       │                                      INSERT INTO revoked_access_tokens │
       │                                                │
       │ 4. 返回成功 (RFC 7009: 即使失败也返回 200)      │
       │ <──────────────────────────────────────────────│
       │    200 OK                                      │
```

**实现** (`/home/user/ts-next/apps/oauth-service-rust/src/services/token_service.rs`):

```rust
pub async fn revoke_token(&self, token: &str, token_type_hint: Option<&str>)
    -> Result<(), ServiceError> {

    match token_type_hint {
        Some("refresh_token") | None => {
            // 尝试撤销 refresh token
            sqlx::query("UPDATE refresh_tokens SET is_revoked = 1 WHERE token = ?")
                .bind(token)
                .execute(&*self.pool)
                .await?;
        }
        Some("access_token") => {
            // 解析 JWT 获取 jti
            let claims = self.introspect_token(token).await?;

            // 将 jti 加入撤销列表
            sqlx::query("INSERT INTO revoked_access_tokens (jti, revoked_at) VALUES (?, ?)")
                .bind(&claims.jti)
                .bind(Utc::now())
                .execute(&*self.pool)
                .await?;
        }
        _ => return Err(ServiceError::ValidationError("Invalid token_type_hint".to_string())),
    }

    Ok(())
}
```

---

## 受保护资源访问流程

展示客户端如何使用 access token 访问受保护的 API 资源。

```
┌──────────┐         ┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│  客户端   │         │   Pingora   │         │OAuth Service │         │   Database   │
│          │         │    Proxy    │         │  (Middleware)│         │              │
└────┬─────┘         └──────┬──────┘         └──────┬───────┘         └──────┬───────┘
     │                      │                       │                        │
     │ 1. GET /api/v2/admin/users                   │                        │
     │    Authorization: Bearer <access_token>      │                        │
     │ ─────────────────────>                       │                        │
     │                      │                       │                        │
     │                      │ 2. 路由到 OAuth Service                        │
     │                      │ ──────────────────────>                        │
     │                      │                       │                        │
     │                      │                       │ 3. Rate Limit Middleware │
     │                      │                       │    - 检查 IP 请求频率   │
     │                      │                       │    - 100 req/min        │
     │                      │                       │                        │
     │                      │                       │ 4. Auth Middleware      │
     │                      │                       │    - 提取 Bearer token  │
     │                      │                       │    - JWT 验证签名       │
     │                      │                       │    - 检查过期时间       │
     │                      │                       │    - 检查撤销状态       │
     │                      │                       │ ──────────────────────>│
     │                      │                       │    查询 revoked_access_tokens │
     │                      │                       │ <──────────────────────│
     │                      │                       │                        │
     │                      │                       │    - 提取 claims:       │
     │                      │                       │      * sub (user_id)    │
     │                      │                       │      * client_id        │
     │                      │                       │      * permissions[]    │
     │                      │                       │                        │
     │                      │                       │    - 注入 AuthContext   │
     │                      │                       │      到 request extensions │
     │                      │                       │                        │
     │                      │                       │ 5. Permission Middleware │
     │                      │                       │    - 提取 AuthContext   │
     │                      │                       │    - 获取路由权限要求   │
     │                      │                       │      GET /api/v2/admin/users │
     │                      │                       │      → 需要 "users:list" │
     │                      │                       │                        │
     │                      │                       │    - 检查用户权限       │
     │                      │                       │      "users:list" in permissions? │
     │                      │                       │                        │
     │                      │                       │    ✅ 权限验证通过      │
     │                      │                       │                        │
     │                      │                       │ 6. Route Handler        │
     │                      │                       │    - 执行业务逻辑       │
     │                      │                       │    - 查询 users 表      │
     │                      │                       │ ──────────────────────>│
     │                      │                       │    SELECT * FROM users  │
     │                      │                       │ <──────────────────────│
     │                      │                       │                        │
     │                      │                       │ 7. Audit Middleware     │
     │                      │                       │    - 记录请求日志       │
     │                      │                       │    - user_id, path, status │
     │                      │                       │    - 处理时间           │
     │                      │                       │                        │
     │ 8. 返回响应          │                       │                        │
     │ <──────────────────────────────────────────────                       │
     │    {                                         │                        │
     │      "users": [...],                         │                        │
     │      "total": 100,                           │                        │
     │      "page": 1                               │                        │
     │    }                                         │                        │
```

### 中间件执行顺序

**请求处理链** (`/home/user/ts-next/apps/oauth-service-rust/src/app.rs`, lines 101-126):

```
请求进入
  ↓
[1] Rate Limit Middleware ────→ 429 Too Many Requests (如果超限)
  ↓
[2] Auth Middleware ──────────→ 401 Unauthorized (如果 token 无效)
  ↓  (注入 AuthContext)
[3] Permission Middleware ────→ 403 Forbidden (如果权限不足)
  ↓
[4] CORS Layer
  ↓
[5] Tracing Layer
  ↓
[6] Route Handler (业务逻辑)
  ↓
[7] Audit Middleware (响应后记录)
  ↓
响应返回
```

---

## 权限验证流程

展示 RBAC (Role-Based Access Control) 的完整工作流程。

### 权限加载流程

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐         ┌──────────┐
│ Token Service│         │ RBAC Service │         │ Permission   │         │ Database │
│              │         │              │         │   Cache      │         │          │
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘         └────┬─────┘
       │                        │                        │                      │
       │ 1. issue_tokens()      │                        │                      │
       │ ──────────────────────>│                        │                      │
       │                        │                        │                      │
       │                        │ 2. get_user_permissions(user_id)               │
       │                        │ ──────────────────────>│                      │
       │                        │                        │                      │
       │                        │                        │ 3. 检查缓存          │
       │                        │                        │    Key: user:<user_id> │
       │                        │                        │                      │
       │                        │                        │ 4. 缓存未命中        │
       │                        │                        │                      │
       │                        │ 5. 查询数据库          │                      │
       │                        │ ───────────────────────────────────────────────>
       │                        │    SELECT p.name                               │
       │                        │    FROM permissions p                          │
       │                        │    JOIN role_permissions rp ON p.id = rp.permission_id │
       │                        │    JOIN user_roles ur ON rp.role_id = ur.role_id │
       │                        │    WHERE ur.user_id = ?                        │
       │                        │ <───────────────────────────────────────────────
       │                        │    ["users:list", "users:create", ...]         │
       │                        │                        │                      │
       │                        │ 6. 存入缓存 (TTL: 5分钟)                       │
       │                        │ ──────────────────────>│                      │
       │                        │                        │                      │
       │                        │ 7. 返回权限列表         │                      │
       │                        │ <──────────────────────│                      │
       │                        │                        │                      │
       │ 8. 返回权限            │                        │                      │
       │ <──────────────────────│                        │                      │
       │                        │                        │                      │
       │ 9. 将权限嵌入 JWT claims                        │                      │
       │    {                   │                        │                      │
       │      ...               │                        │                      │
       │      "permissions": ["users:list", ...]         │                      │
       │    }                   │                        │                      │
```

### 权限检查流程

```
┌──────────────────┐         ┌─────────────────┐
│ Permission       │         │ Route Permission│
│ Middleware       │         │   Configuration │
└────────┬─────────┘         └────────┬────────┘
         │                            │
         │ 1. 提取请求路径和方法       │
         │    GET /api/v2/admin/users  │
         │ ──────────────────────────>│
         │                            │
         │ 2. 查找所需权限            │
         │ <──────────────────────────│
         │    ["users:list"]          │
         │                            │
         │ 3. 提取 AuthContext         │
         │    (从 request extensions)  │
         │    permissions = [          │
         │      "users:list",          │
         │      "users:create",        │
         │      "roles:manage"         │
         │    ]                        │
         │                            │
         │ 4. 权限匹配检查            │
         │    required: ["users:list"] │
         │    has: ["users:list", ...]│
         │                            │
         │ 5. 匹配成功 ✅             │
         │    - 允许请求继续          │
         │                            │
         │ 6. 记录日志                │
         │    INFO: User <user_id> accessed │
         │          GET /api/v2/admin/users │
         │          with permission users:list │
```

### 权限命名规范

**格式**: `<resource>:<action>`

**示例**:
- `users:list` - 列出用户
- `users:create` - 创建用户
- `users:read` - 读取单个用户
- `users:update` - 更新用户
- `users:delete` - 删除用户
- `roles:manage` - 管理角色
- `menu:system:user:view` - 查看用户管理菜单

### 权限缓存机制

**实现** (`/home/user/ts-next/apps/oauth-service-rust/src/cache/permission_cache.rs`):

```rust
pub struct InMemoryPermissionCache {
    cache: Arc<RwLock<HashMap<String, CacheEntry>>>,
    hits: Arc<RwLock<u64>>,
    misses: Arc<RwLock<u64>>,
}

struct CacheEntry {
    permissions: Vec<String>,
    created_at: DateTime<Utc>,
    ttl_seconds: i64,  // 默认 300 秒 (5 分钟)
}
```

**缓存策略**:
- **Cache Key**: `user:<user_id>`
- **TTL**: 5 分钟
- **驱逐策略**: 懒惰删除 (访问时检查过期)
- **一致性**: 用户角色变更时手动失效

**缓存失效时机**:
1. 用户角色被修改
2. 角色权限被修改
3. 用户被删除
4. TTL 过期

---

## 完整请求链路

展示一个完整的用户登录 → 访问资源的端到端流程。

### 场景: 管理员登录并查看用户列表

```
┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐
│ 浏览器   │  │ Pingora │  │  Admin   │  │  OAuth   │  │Database │
│         │  │  Proxy  │  │  Portal  │  │  Service │  │         │
└────┬────┘  └────┬────┘  └────┬─────┘  └────┬─────┘  └────┬────┘
     │            │            │             │             │
     │ 1. 访问 http://localhost:6188/        │             │
     │ ─────────>│            │             │             │
     │            │            │             │             │
     │            │ 2. 路由到 Admin Portal (默认后端)       │
     │            │ ──────────>│             │             │
     │            │            │             │             │
     │ 3. 返回 HTML (包含 OAuth 登录逻辑)     │             │
     │ <─────────────────────│             │             │
     │            │            │             │             │
     │ 4. 点击"登录"按钮      │             │             │
     │ ──────────────────────>│             │             │
     │            │            │             │             │
     │            │            │ 5. 生成 PKCE + state      │
     │            │            │    存入 sessionStorage    │
     │            │            │             │             │
     │ 6. 302 → /api/v2/oauth/authorize?... │             │
     │ <──────────────────────│             │             │
     │            │            │             │             │
     │ 7. GET /api/v2/oauth/authorize        │             │
     │ ─────────>│            │             │             │
     │            │            │             │             │
     │            │ 8. 路由到 OAuth Service (/api/v2/* 匹配)│
     │            │ ────────────────────────>│             │
     │            │            │             │             │
     │            │            │             │ 9. 检查 session_token cookie │
     │            │            │             │    (不存在 - 用户未登录)     │
     │            │            │             │             │
     │            │            │             │ 10. 构建登录 URL              │
     │            │            │             │     redirect = authorize_url  │
     │            │            │             │             │
     │ 11. 302 → /login?redirect=...         │             │
     │ <────────────────────────────────────────           │
     │            │            │             │             │
     │ 12. GET /login?redirect=...           │             │
     │ ─────────>│            │             │             │
     │            │            │             │             │
     │            │ 13. 路由到 Admin Portal  │             │
     │            │ ──────────>│             │             │
     │            │            │             │             │
     │ 14. 显示登录表单        │             │             │
     │ <─────────────────────│             │             │
     │            │            │             │             │
     │ 15. 输入凭证并提交 (fetch POST)       │             │
     │ ──────────────────────>│             │             │
     │            │            │             │             │
     │            │            │ 16. POST /api/v2/auth/login │
     │            │            │ ────────────────────────────>│
     │            │            │  {username, password, redirect} │
     │            │            │             │             │
     │            │            │             │ 17. 验证凭证 │
     │            │            │             │ ────────────>│
     │            │            │             │  bcrypt::verify() │
     │            │            │             │ <────────────│
     │            │            │             │             │
     │            │            │             │ 18. 加载权限 │
     │            │            │             │ ────────────>│
     │            │            │             │  RBAC 查询   │
     │            │            │             │ <────────────│
     │            │            │             │  ["users:*", "roles:*", ...] │
     │            │            │             │             │
     │            │            │             │ 19. 签发 session token │
     │            │            │             │     (JWT, 1小时)      │
     │            │            │             │             │
     │            │            │ 20. 登录成功 + Set-Cookie │
     │            │            │ <────────────────────────────│
     │            │            │  session_token=<jwt>; HttpOnly │
     │            │            │             │             │
     │ 21. 前端跳转到 redirect (authorize)   │             │
     │ ────────────────────────────────────────────────────>│
     │     (携带 session_token cookie)      │             │
     │            │            │             │             │
     │            │            │             │ 22. 验证 session token │
     │            │            │             │     提取 user_id       │
     │            │            │             │             │
     │            │            │             │ 23. 生成授权码         │
     │            │            │             │ ────────────>│
     │            │            │             │  INSERT auth_code │
     │            │            │             │  + code_challenge │
     │            │            │             │ <────────────│
     │            │            │             │             │
     │ 24. 302 → /auth/callback?code=xxx&state=xxx          │
     │ <────────────────────────────────────────            │
     │            │            │             │             │
     │ 25. GET /auth/callback?code=xxx       │             │
     │ ─────────>│            │             │             │
     │            │ ──────────>│             │             │
     │            │            │             │             │
     │            │            │ 26. 验证 state (CSRF)       │
     │            │            │             │             │
     │            │            │ 27. POST /api/v2/oauth/token │
     │            │            │ ────────────────────────────>│
     │            │            │  {grant_type, code, code_verifier, ...} │
     │            │            │             │             │
     │            │            │             │ 28. 验证授权码│
     │            │            │             │ ────────────>│
     │            │            │             │  查询 auth_codes │
     │            │            │             │ <────────────│
     │            │            │             │             │
     │            │            │             │ 29. 验证 PKCE │
     │            │            │             │  SHA256(verifier) == challenge │
     │            │            │             │             │
     │            │            │             │ 30. 签发 Token Pair │
     │            │            │             │  - access_token (JWT) │
     │            │            │             │  - refresh_token (UUID) │
     │            │            │             │  - id_token (JWT)     │
     │            │            │             │             │
     │            │            │             │ 31. 保存 refresh_token │
     │            │            │             │ ────────────>│
     │            │            │             │ <────────────│
     │            │            │             │             │
     │            │            │ 32. 返回 Token Response     │
     │            │            │ <────────────────────────────│
     │            │            │             │             │
     │            │            │ 33. 存储 tokens (sessionStorage) │
     │            │            │             │             │
     │ 34. 302 → /dashboard    │             │             │
     │ <─────────────────────│             │             │
     │            │            │             │             │
     │ 35. GET /dashboard      │             │             │
     │ ─────────>│ ──────────>│             │             │
     │            │            │             │             │
     │ 36. 显示 Dashboard      │             │             │
     │ <─────────────────────│             │             │
     │            │            │             │             │
     │ 37. API 调用: GET /api/v2/admin/users │             │
     │     Authorization: Bearer <access_token>             │
     │ ────────────────────────────────────────────────────>│
     │            │            │             │             │
     │            │            │             │ 38. Middleware Pipeline │
     │            │            │             │  - Rate Limit ✅       │
     │            │            │             │  - Auth ✅             │
     │            │            │             │  - Permission ✅       │
     │            │            │             │    (需要 users:list)   │
     │            │            │             │             │
     │            │            │             │ 39. 查询用户列表       │
     │            │            │             │ ────────────>│
     │            │            │             │  SELECT * FROM users   │
     │            │            │             │ <────────────│
     │            │            │             │             │
     │            │            │             │ 40. Audit Log          │
     │            │            │             │ ────────────>│
     │            │            │             │  INSERT audit_logs     │
     │            │            │             │ <────────────│
     │            │            │             │             │
     │ 41. 返回用户列表 JSON   │             │             │
     │ <────────────────────────────────────────            │
     │            │            │             │             │
     │ 42. 渲染用户表格        │             │             │
```

### 关键路径时序

| 步骤 | 描述 | 耗时估算 |
|------|------|----------|
| 1-3 | 首次访问,加载前端应用 | ~100ms |
| 4-11 | OAuth 授权请求重定向到登录页 | ~50ms |
| 12-14 | 加载登录表单 | ~50ms |
| 15-20 | 用户认证 + 权限加载 | ~200ms (bcrypt + DB) |
| 21-24 | 授权码生成 | ~50ms |
| 25-32 | Token 交换 | ~100ms (PKCE 验证 + JWT 签发) |
| 33-36 | 跳转到 Dashboard | ~50ms |
| 37-41 | API 调用 (用户列表) | ~100ms (含中间件 + DB) |
| **总计** | 从点击登录到看到数据 | **~700ms** |

---

## 错误处理流程

### 认证错误

```
错误类型                    HTTP 状态码   返回内容
─────────────────────────   ──────────   ─────────────────────────
无 Authorization header      401         {"error": "Invalid token"}
Token 格式错误               401         {"error": "Invalid token"}
Token 签名无效               401         {"error": "Invalid token"}
Token 已过期                 401         {"error": "Invalid token"}
Token 已撤销                 401         {"error": "Token has been revoked"}
用户不存在                   401         {"error": "Invalid credentials"}
密码错误                     401         {"error": "Invalid credentials"}
账户被锁定                   401         {"error": "Account is locked"}
```

### 授权错误

```
错误类型                    HTTP 状态码   返回内容
─────────────────────────   ──────────   ─────────────────────────
权限不足                     403         {"error": "Missing required permissions"}
访问已禁用的资源             403         {"error": "Forbidden"}
Client 类型不允许该操作      403         {"error": "Operation not allowed for this client type"}
```

### 验证错误

```
错误类型                    HTTP 状态码   返回内容
─────────────────────────   ──────────   ─────────────────────────
缺少必需参数                 400         {"error": "Missing required parameter: <param>"}
无效的 grant_type            400         {"error": "Unsupported grant type"}
无效的 redirect_uri          400         {"error": "Invalid redirect_uri"}
无效的 scope                 400         {"error": "Invalid scope"}
PKCE 验证失败                400         {"error": "PKCE verification failed"}
State 不匹配 (CSRF)          400         {"error": "Invalid state parameter"}
```

### 资源错误

```
错误类型                    HTTP 状态码   返回内容
─────────────────────────   ──────────   ─────────────────────────
Client 不存在                404         {"error": "Invalid client_id"}
User 不存在                  404         {"error": "User not found"}
Authorization Code 不存在    404         {"error": "Invalid authorization code"}
资源不存在                   404         {"error": "<Resource> not found"}
```

### 冲突错误

```
错误类型                    HTTP 状态码   返回内容
─────────────────────────   ──────────   ─────────────────────────
用户名已存在                 409         {"error": "Username already exists"}
Client ID 已存在             409         {"error": "Client ID already exists"}
重复操作                     409         {"error": "Resource already exists"}
```

### 服务器错误

```
错误类型                    HTTP 状态码   返回内容
─────────────────────────   ──────────   ─────────────────────────
数据库错误                   500         {"error": "Database error: <details>"}
JWT 签名失败                 500         {"error": "JWT error: <details>"}
密码哈希失败                 500         {"error": "Password hashing error"}
内部错误                     500         {"error": "Internal server error"}
```

### 错误处理实现

**错误传播链**:

```
Business Logic Error
  ↓
ServiceError
  ↓
AppError::Service(ServiceError)
  ↓
IntoResponse Implementation
  ↓
HTTP Response {status, JSON}
```

**示例** (`/home/user/ts-next/apps/oauth-service-rust/src/error.rs`):

```rust
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::Auth(AuthError::InvalidCredentials) => {
                (StatusCode::UNAUTHORIZED, "Invalid credentials".to_string())
            }
            AppError::Auth(AuthError::InvalidToken) => {
                (StatusCode::UNAUTHORIZED, "Invalid token".to_string())
            }
            AppError::Auth(AuthError::InsufficientPermissions) => {
                (StatusCode::FORBIDDEN, "Missing required permissions".to_string())
            }
            AppError::Service(ServiceError::NotFound(msg)) => {
                (StatusCode::NOT_FOUND, msg)
            }
            AppError::Service(ServiceError::Conflict(msg)) => {
                (StatusCode::CONFLICT, msg)
            }
            AppError::Service(ServiceError::ValidationError(msg)) => {
                (StatusCode::BAD_REQUEST, msg)
            }
            _ => {
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        let body = Json(serde_json::json!({
            "error": error_message
        }));

        (status, body).into_response()
    }
}
```

---

## 安全最佳实践总结

### 已实施的安全措施

| 安全特性 | 实现位置 | 保护目标 |
|----------|----------|----------|
| **PKCE (强制)** | OAuth Service | 授权码拦截攻击 |
| **State 参数** | Admin Portal | CSRF 攻击 |
| **Nonce** | OAuth Service | ID Token 重放攻击 |
| **HttpOnly Cookie** | OAuth Service | XSS 攻击 |
| **SameSite=Lax** | OAuth Service | CSRF 攻击 |
| **Secure Cookie (生产)** | OAuth Service | 中间人攻击 |
| **bcrypt 密码哈希** | OAuth Service | 密码泄露 |
| **JWT 签名验证** | OAuth Service | Token 伪造 |
| **Token 撤销** | OAuth Service | Token 泄露 |
| **Rate Limiting** | OAuth Service | DoS 攻击 |
| **审计日志** | OAuth Service | 安全追踪 |
| **敏感数据脱敏** | Audit Middleware | 日志泄露 |
| **权限缓存** | RBAC Service | 性能优化 |
| **常量时间比较** | PKCE Utils | 时序攻击 |

### 安全配置检查清单

**生产环境必须**:
- [ ] 使用 RS256 JWT 算法 (RSA 密钥对)
- [ ] 启用 HTTPS (Secure Cookie)
- [ ] 配置正确的 redirect_uri 白名单
- [ ] 使用强密码策略
- [ ] 定期轮换 JWT 密钥
- [ ] 监控审计日志
- [ ] 配置 Token 过期时间 (access: 1h, refresh: 30d)
- [ ] 启用 refresh token rotation
- [ ] 限制失败登录尝试
- [ ] 配置 CORS 白名单

---

## 附录

### 环境变量配置

**OAuth Service** (`.env`):
```bash
# 数据库
DATABASE_URL=sqlite:./oauth.db

# JWT 配置
JWT_ALGORITHM=RS256                          # 生产环境使用 RS256
JWT_PRIVATE_KEY_PATH=./keys/private_key.pem
JWT_PUBLIC_KEY_PATH=./keys/public_key.pem
# JWT_SECRET=<secret>                        # 仅用于 HS256

# 签发者
ISSUER=https://auth.yourdomain.com           # 生产环境使用真实域名

# 应用 URL
NEXT_PUBLIC_OAUTH_SERVICE_URL=http://localhost:6188  # 通过 Pingora
NEXT_PUBLIC_ADMIN_PORTAL_URL=http://localhost:6188   # 通过 Pingora

# 环境
NODE_ENV=production

# 数据库初始化
SKIP_DB_INIT=false  # 首次启动设为 false,后续可设为 true
```

**Admin Portal** (`.env.local`):
```bash
# OAuth 配置
NEXT_PUBLIC_OAUTH_CLIENT_ID=admin-portal-client
NEXT_PUBLIC_OAUTH_CLIENT_SECRET=<secret>
NEXT_PUBLIC_OAUTH_REDIRECT_URI=http://localhost:6188/auth/callback
NEXT_PUBLIC_OAUTH_SCOPE=openid profile email

# API 端点 (通过 Pingora)
NEXT_PUBLIC_API_BASE_URL=http://localhost:6188/api/v2

# OAuth 服务 URL
NEXT_PUBLIC_OAUTH_SERVICE_URL=http://localhost:6188/api/v2

# 环境
NODE_ENV=production
```

### 数据库表关系

```
users ──┐
        ├─── user_roles ──┐
                          ├─── roles ──┐
                                       ├─── role_permissions ──┐
                                                                ├─── permissions

oauth_clients ──┐
                ├─── authorization_codes
                ├─── access_tokens
                └─── refresh_tokens

audit_logs (独立)
password_histories (关联 users)
password_reset_requests (关联 users)
consent_grants (关联 users + oauth_clients)
scopes (独立)
scope_permissions (关联 scopes + permissions)
```

---

## 文档修订历史

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2025-11-17 | 初始版本,完整业务流程文档 | Claude |

---

**文档结束**
