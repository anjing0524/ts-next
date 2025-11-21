# OAuth 2.1 认证授权系统 - 系统设计文档

**文档版本**: 1.0
**最后更新**: 2025-11-20
**文档状态**: ✅ 生产就绪
**目标受众**: 开发人员、技术主管、架构师

---

## 目录

1. [设计原则](#设计原则)
2. [核心模块设计](#核心模块设计)
3. [类和接口设计](#类和接口设计)
4. [关键算法](#关键算法)
5. [状态管理](#状态管理)
6. [错误处理](#错误处理)
7. [并发和线程安全](#并发和线程安全)

---

## 设计原则

### 1. 安全第一 (Security First)
- 所有用户输入都需验证
- 关键操作使用常量时间比较
- 敏感数据不日志记录
- 最小权限原则

### 2. 高性能 (High Performance)
- 多级缓存策略 (内存 + Redis)
- 数据库连接池化
- 异步 I/O (Tokio 异步运行时)
- 批量操作支持

### 3. 易维护 (Maintainability)
- 模块清晰分离
- 接口定义明确
- 错误类型完整
- 日志结构化

### 4. 易测试 (Testability)
- 依赖注入
- 接口导向设计
- Mock 友好
- 确定性的时间处理

---

## 核心模块设计

### OAuth Service 架构

```
┌─────────────────────────────────────┐
│        HTTP Request Handler         │
├─────────────────────────────────────┤
│    [Middleware Pipeline Layer]      │
│ ┌──────────────────────────────────┐│
│ │1. Rate Limit Middleware          ││
│ │2. Request Logging                ││
│ │3. Auth Middleware (JWT验证)      ││
│ │4. Permission Middleware (RBAC)   ││
│ │5. CORS Layer                     ││
│ │6. Tracing Layer (Distributed)    ││
│ └──────────────────────────────────┘│
├─────────────────────────────────────┤
│      [Router Layer]                  │
│  ├─ /api/v2/oauth/*                │
│  ├─ /api/v2/auth/*                 │
│  ├─ /api/v2/admin/*                │
│  └─ /health                        │
├─────────────────────────────────────┤
│    [Service Layer]                   │
│  ├─ TokenService                   │
│  ├─ UserService                    │
│  ├─ ClientService                  │
│  ├─ RBACService                    │
│  └─ AuditService                   │
├─────────────────────────────────────┤
│    [Cache Layer]                     │
│  ├─ PermissionCache (In-memory)     │
│  ├─ SessionCache (可选 Redis)       │
│  └─ Token Revocation List           │
├─────────────────────────────────────┤
│    [Database Layer]                  │
│  ├─ SQLx Connection Pool            │
│  └─ SQLite/MySQL Adapter            │
├─────────────────────────────────────┤
│    [Cryptography Layer]              │
│  ├─ JWT Signing (RS256/HS256)       │
│  ├─ Password Hashing (bcrypt)       │
│  ├─ PKCE Verification               │
│  └─ Random Token Generation         │
└─────────────────────────────────────┘
```

### 模块职责

#### 1. **TokenService** (令牌服务)

**职责**: 令牌的生成、验证、刷新、撤销

```rust
pub struct TokenService {
    pool: SqlitePool,
    jwt_key: JwtKey,
    cache: Arc<RwLock<TokenCache>>,
}

impl TokenService {
    // 生成 Access Token + Refresh Token
    pub async fn issue_tokens(
        &self,
        user_id: &str,
        client_id: &str,
        scope: &str,
    ) -> Result<TokenPair>;

    // 验证并解析 JWT Token
    pub async fn verify_token(&self, token: &str) -> Result<TokenClaims>;

    // 使用 refresh_token 获取新的 access_token
    pub async fn refresh_token(
        &self,
        refresh_token: &str,
        client_id: &str,
    ) -> Result<TokenPair>;

    // 撤销令牌
    pub async fn revoke_token(
        &self,
        token: &str,
        token_type: TokenType,
    ) -> Result<()>;

    // Token 内省 (Introspection)
    pub async fn introspect_token(&self, token: &str) -> Result<TokenInfo>;
}
```

**关键数据结构**:

```rust
pub struct TokenPair {
    pub access_token: String,           // JWT
    pub refresh_token: String,          // UUID
    pub id_token: String,               // JWT (OIDC)
    pub expires_in: i32,                // 秒
    pub token_type: String,             // "Bearer"
}

pub struct TokenClaims {
    pub sub: String,                    // user_id
    pub aud: String,                    // client_id
    pub scope: String,
    pub permissions: Vec<String>,       // ["users:list", "roles:manage"]
    pub roles: Vec<String>,
    pub exp: i64,                       // 过期时间 (Unix timestamp)
    pub iat: i64,                       // 签发时间
    pub jti: String,                    // JWT ID (用于撤销)
}
```

**Token 存储**:

```sql
-- Access Token (缓存,不持久化)
// 可选存储在内存中,用于快速查询

-- Refresh Token (持久化)
CREATE TABLE refresh_tokens (
    id TEXT PRIMARY KEY,
    token_hash TEXT UNIQUE NOT NULL,    -- SHA256(token)
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    parent_token_hash TEXT,             -- Token rotation chain
    scope TEXT,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME,
    created_at DATETIME NOT NULL
);

-- Authorization Code (临时)
CREATE TABLE auth_codes (
    id TEXT PRIMARY KEY,
    code_hash TEXT UNIQUE NOT NULL,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    code_challenge TEXT,                -- PKCE
    scope TEXT,
    expires_at DATETIME NOT NULL,
    is_used INTEGER DEFAULT 0,          -- 单次使用
    created_at DATETIME NOT NULL
);

-- Revoked Access Tokens (黑名单)
CREATE TABLE revoked_access_tokens (
    jti TEXT PRIMARY KEY,               -- JWT ID
    revoked_at DATETIME NOT NULL
);
```

---

#### 2. **UserService** (用户服务)

**职责**: 用户的创建、查询、认证、权限加载

```rust
pub struct UserService {
    pool: SqlitePool,
    cache: Arc<PermissionCache>,
}

impl UserService {
    // 用户登录认证
    pub async fn authenticate(
        &self,
        username: &str,
        password: &str,
    ) -> Result<User>;

    // 创建新用户
    pub async fn create_user(
        &self,
        email: &str,
        username: &str,
        password: &str,
        first_name: &str,
        last_name: &str,
    ) -> Result<User>;

    // 加载用户权限
    pub async fn load_user_permissions(
        &self,
        user_id: &str,
    ) -> Result<Vec<String>>;

    // 获取用户信息
    pub async fn get_user(&self, user_id: &str) -> Result<User>;

    // 检查密码是否有效
    fn is_password_valid(&self, password: &str) -> bool;
}
```

**用户模型**:

```rust
pub struct User {
    pub id: String,                     // CUID
    pub email: String,
    pub username: String,
    pub password_hash: String,          // bcrypt(12)
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub is_active: bool,
    pub is_verified: bool,
    pub last_login_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// 前端返回 (敏感字段删除)
pub struct UserInfo {
    pub id: String,
    pub email: String,
    pub username: String,
    pub name: String,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
}
```

**认证流程** (bcrypt 验证):

```rust
pub async fn authenticate(
    &self,
    username: &str,
    password: &str,
) -> Result<User> {
    // 1. 查询用户
    let user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE username = ? AND is_active = 1"
    )
    .bind(username)
    .fetch_optional(&self.pool)?
    .ok_or(AuthError::InvalidCredentials)?;

    // 2. 验证密码 (bcrypt 常量时间比较)
    let password_valid = bcrypt::verify(password, &user.password_hash)
        .map_err(|_| AuthError::InvalidCredentials)?;

    if !password_valid {
        return Err(AuthError::InvalidCredentials);
    }

    // 3. 更新最后登录时间
    sqlx::query("UPDATE users SET last_login_at = ? WHERE id = ?")
        .bind(Utc::now())
        .bind(&user.id)
        .execute(&self.pool)
        .await?;

    Ok(user)
}
```

---

#### 3. **RBACService** (权限管理服务)

**职责**: 基于角色的访问控制实现

```rust
pub struct RBACService {
    pool: SqlitePool,
    cache: Arc<PermissionCache>,
}

impl RBACService {
    // 获取用户的所有权限
    pub async fn get_user_permissions(
        &self,
        user_id: &str,
    ) -> Result<Vec<String>>;

    // 检查用户是否有特定权限
    pub async fn has_permission(
        &self,
        user_id: &str,
        permission: &str,
    ) -> Result<bool>;

    // 获取用户的所有角色
    pub async fn get_user_roles(
        &self,
        user_id: &str,
    ) -> Result<Vec<Role>>;

    // 为用户分配角色
    pub async fn assign_role(
        &self,
        user_id: &str,
        role_id: &str,
    ) -> Result<()>;

    // 撤销用户角色
    pub async fn revoke_role(
        &self,
        user_id: &str,
        role_id: &str,
    ) -> Result<()>;
}
```

**权限检查流程** (中间件中执行):

```rust
pub struct PermissionMiddleware;

impl<S> Middleware<S> for PermissionMiddleware {
    async fn handle(
        &self,
        req: &Request,
        next: Next<S>,
    ) -> Response {
        // 1. 从 request extensions 获取 AuthContext
        let auth = req.extensions()
            .get::<AuthContext>()
            .cloned()
            .ok_or(AuthError::Unauthorized)?;

        // 2. 查询路由所需权限
        let required_perms = get_required_permissions(req.method(), req.path());

        // 3. 检查是否所有权限都满足
        for perm in required_perms {
            if !auth.permissions.contains(&perm) {
                return Err(AuthError::InsufficientPermissions);
            }
        }

        // 4. 继续处理请求
        next.run(req).await
    }
}
```

**权限缓存机制**:

```rust
pub struct PermissionCache {
    cache: Arc<DashMap<String, CachedEntry>>,
}

struct CachedEntry {
    permissions: Vec<String>,
    expires_at: SystemTime,
}

impl PermissionCache {
    pub fn get(&self, user_id: &str) -> Option<Vec<String>> {
        self.cache.get(user_id)
            .and_then(|entry| {
                if SystemTime::now() < entry.expires_at {
                    Some(entry.permissions.clone())
                } else {
                    None  // 缓存过期
                }
            })
    }

    pub fn set(
        &self,
        user_id: &str,
        permissions: Vec<String>,
        ttl: Duration,
    ) {
        let expires_at = SystemTime::now() + ttl;
        self.cache.insert(
            user_id.to_string(),
            CachedEntry { permissions, expires_at },
        );
    }

    // 权限变更时失效缓存
    pub fn invalidate(&self, user_id: &str) {
        self.cache.remove(user_id);
    }
}

### 缓存失效策略

当用户权限发生变更时（角色分配/撤销、权限修改），必须主动失效缓存：

```rust
pub fn invalidate_user_cache(&self, user_id: &str) {
    self.cache.remove(user_id);
}
```

**触发场景**:
- 用户角色分配/撤销（user_roles 表变更）
- 角色权限变更（role_permissions 表变更）
- 用户状态变更（is_active = 0）

**实现示例**:

```rust
// 分配角色时失效缓存
pub async fn assign_role(&self, user_id: &str, role_id: &str) -> Result<()> {
    // 1. 插入角色关联
    sqlx::query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)")
        .bind(user_id)
        .bind(role_id)
        .execute(&self.pool)
        .await?;

    // 2. 立即失效权限缓存
    self.permission_cache.invalidate(user_id);

    Ok(())
}
```

```

---

#### 4. **ClientService** (OAuth 客户端管理)

**职责**: OAuth 客户端的注册、配置、密钥管理

```rust
pub struct ClientService {
    pool: SqlitePool,
}

impl ClientService {
    // 创建新的 OAuth 客户端
    pub async fn create_client(
        &self,
        name: &str,
        redirect_uris: Vec<String>,
        is_confidential: bool,
    ) -> Result<OAuthClient>;

    // 获取客户端信息
    pub async fn get_client(&self, client_id: &str) -> Result<OAuthClient>;

    // 验证客户端凭证 (client_id + secret)
    pub async fn verify_client_credentials(
        &self,
        client_id: &str,
        client_secret: &str,
    ) -> Result<OAuthClient>;

    // 验证 redirect_uri 是否被授权
    pub async fn verify_redirect_uri(
        &self,
        client_id: &str,
        redirect_uri: &str,
    ) -> Result<bool>;
}
```

**客户端模型**:

```rust
pub struct OAuthClient {
    pub id: String,                     // client_id
    pub secret_hash: String,            // bcrypt(client_secret)
    pub name: String,
    pub owner_id: String,               // 创建人
    pub redirect_uris: Vec<String>,     // JSON array
    pub allowed_scopes: Vec<String>,    // openid, profile, email
    pub token_lifetime: i32,            // 秒
    pub refresh_token_lifetime: i32,    // 秒
    pub require_pkce: bool,             // 强制 PKCE
    pub is_confidential: bool,          // 机密客户端
    pub is_active: bool,
}
```

---

#### 5. **AuditService** (审计日志服务)

**职责**: 记录和检索审计日志

```rust
pub struct AuditService {
    pool: SqlitePool,
}

impl AuditService {
    // 记录审计日志
    pub async fn log_action(
        &self,
        action: &AuditAction,
    ) -> Result<()>;

    // 查询审计日志
    pub async fn query_logs(
        &self,
        filter: &LogFilter,
        page: u32,
        limit: u32,
    ) -> Result<PaginatedLogs>;

    // 导出审计日志
    pub async fn export_logs(
        &self,
        filter: &LogFilter,
        format: ExportFormat,  // CSV, JSON
    ) -> Result<Vec<u8>>;
}
```

**审计日志模型**:

```rust
pub struct AuditAction {
    pub user_id: Option<String>,        // 操作人
    pub action_type: String,            // USER_LOGIN, PERMISSION_GRANT
    pub resource_type: String,          // user, role, permission
    pub resource_id: Option<String>,
    pub changes: Option<serde_json::Value>,  // 变更前后数据
    pub ip_address: String,
    pub user_agent: String,
    pub status: String,                 // success, failure
    pub error_message: Option<String>,
}
```

---

### Admin Portal 架构 (OAuth 2.1 标准客户端应用)

**核心原则**:

1. **作为 OAuth 2.1 客户端应用**:
   - 按照 OAuth 2.1 标准实现
   - 生成 PKCE 参数
   - 发起授权请求
   - 交换授权码为 token
   - 完全不接触凭证验证

2. **作为 Web 前端**:
   - 提供管理界面 (用户、角色、权限、客户端管理)
   - 提供登录表单 UI (当 OAuth Service 需要用户认证时)
   - 提供权限同意对话框 UI (当 OAuth Service 需要用户授权时)
   - 所有逻辑都由 OAuth Service 驱动，前端仅提供 UI

```
┌──────────────────────────────────────────────────────────┐
│     Next.js App (Frontend - 纯客户端应用)                 │
├──────────────────────────────────────────────────────────┤
│    [Layout & Pages]                                      │
│ ├─ (dashboard) - 管理页面 (需要 OAuth token)            │
│ ├─ (auth)                                                │
│ │  ├─ /login - 登录页面 (由 OAuth Service 触发)          │
│ │  └─ /callback - OAuth 回调处理                         │
│ ├─ /oauth/consent - 同意确认页面 (由 OAuth Service 触发) │
│ └─ /unauthorized - 权限不足页面                          │
├──────────────────────────────────────────────────────────┤
│    [Features (DDD)]                                      │
│ ├─ users/ - 用户管理 (管理界面)                          │
│ ├─ roles/ - 角色管理 (管理界面)                          │
│ ├─ permissions/ - 权限查看 (管理界面)                    │
│ ├─ clients/ - 客户端管理 (管理界面)                      │
│ ├─ audit/ - 审计日志查看 (管理界面)                      │
│ └─ dashboard/ - 仪表盘 (管理界面)                        │
├──────────────────────────────────────────────────────────┤
│    [Web UI 组件 (由 OAuth Service 驱动)]                  │
│ ├─ components/auth/username-password-form (登录表单)     │
│ │  └─ 提交凭证给 OAuth Service，无验证逻辑              │
│ ├─ app/oauth/consent/page (同意确认页)                   │
│ │  └─ 提交决定给 OAuth Service，无权限决策              │
│ └─ 这些页面由 OAuth Service 完全控制流程                 │
├──────────────────────────────────────────────────────────┤
│    [Shared Auth Lib]                                     │
│ ├─ oauth-client.ts (OAuth 2.1 流程 - 客户端角色)        │
│ │  ├─ generatePKCE()                                    │
│ │  ├─ redirectToOAuth()                                 │
│ │  ├─ handleCallback()                                  │
│ │  └─ exchangeCodeForToken()                            │
│ ├─ token-storage.ts (Token 存储 - 客户端角色)           │
│ │  ├─ saveTokens()                                      │
│ │  ├─ getAccessToken()                                  │
│ │  └─ refreshToken()                                    │
│ ├─ auth-provider.tsx (全局 Auth 状态)                   │
│ └─ use-auth.ts (Auth Hook)                             │
├──────────────────────────────────────────────────────────┤
│    [API Routes]                                          │
│ ├─ /api/auth/callback - 处理 OAuth 回调                 │
│ │  └─ 交换 code 为 token (客户端角色)                   │
│ ├─ /api/auth/login - 转发凭证到 OAuth Service (UI助手)  │
│ └─ /api/health - 健康检查                               │
├──────────────────────────────────────────────────────────┤
│    [State Management]                                    │
│ ├─ TanStack Query (Server State)                        │
│ ├─ Zustand (Client State)                               │
│ └─ HttpOnly Cookies (Token 存储)                         │
├──────────────────────────────────────────────────────────┤
│    [HTTP Client]                                         │
│ ├─ API Client (自动注入 Authorization header)           │
│ ├─ Circuit Breaker (容错)                               │
│ └─ 401 处理 (自动触发 OAuth 重新认证)                    │
└──────────────────────────────────────────────────────────┘
```

**两个不同的使用场景**:

#### 场景 1: 用户直接访问 Admin Portal（标准 OAuth 客户端流程）

```
用户访问 Admin Portal (主应用)
    ↓
Admin Portal 检查是否有有效的 access_token
    ├─ 有效的 token → 直接加载 Dashboard
    └─ 无 token/过期 → 发起 OAuth 流程:
        ↓
    1. 生成 PKCE 参数 (code_verifier, code_challenge)
    2. 保存 code_verifier 到 sessionStorage
    3. 重定向到：OAuth Service /api/v2/oauth/authorize?...
        ↓
    4. OAuth Service 检查 session_token (是否已登录)
       ├─ 已登录 → 检查 require_consent 标志
       └─ 未登录 → 重定向到 /login (见场景 2)
        ↓
    5. OAuth Service 检查 require_consent
       ├─ true → 重定向到 /oauth/consent (见场景 2)
       └─ false → 生成授权码，重定向到 /auth/callback
        ↓
    6. Admin Portal 处理回调 (/auth/callback)
       - 验证 state 参数 (CSRF 保护)
       - 使用 code_verifier 交换 access_token
       - 存储 token
       ↓
    7. 重定向到 Dashboard，完成认证
```

#### 场景 2: OAuth Service 需要用户交互（前端代理流程）

这个场景由 OAuth Service 驱动，当用户未登录或需要同意时：

##### 2a) 登录页面 (当用户未认证时)

```
OAuth Service 检测到用户未认证
    ↓
OAuth Service 重定向到：Admin Portal /login?redirect=<authorize_url>
    ↓
Admin Portal 显示登录表单
    - username 输入框
    - password 输入框
    - submit 按钮
    (仅提供 HTML 表单，不做任何验证)
    ↓
用户输入凭证
    ↓
Admin Portal 提交表单到：POST /api/v2/auth/login
    请求体：{ username, password, redirect: "..." }
    ↓
OAuth Service 处理：
    ✓ bcrypt 验证密码
    ✓ 检查账户状态
    ✓ 加载用户权限
    ✓ 签发 session_token (HttpOnly Cookie)
    ↓
返回响应：{ success: true, redirect_url: "..." }
    Set-Cookie: session_token=<jwt>; HttpOnly; Secure; SameSite=Lax
    ↓
Admin Portal 前端重定向到 redirect_url
    (浏览器自动携带 session_token cookie)
    ↓
继续 OAuth 流程（进入场景 1 的第 4-5 步）
```

##### 2b) 权限同意页面 (当需要用户授权时)

```
OAuth Service 检查 require_consent=true
    ↓
OAuth Service 重定向到：Admin Portal /oauth/consent?client_id=...&scope=...
    ↓
Admin Portal 页面加载时：
    - 调用 GET /api/v2/oauth/consent/info
    - 获取：客户端信息、权限范围、当前用户
    ↓
Admin Portal 显示同意对话框
    - 客户端名称和 logo
    - 请求的权限范围列表
    - 当前登录用户
    - "允许"和"拒绝"按钮
    (仅提供 UI，不做任何决策)
    ↓
用户点击"允许"或"拒绝"
    ↓
Admin Portal 调用：POST /api/v2/oauth/consent/submit
    请求体：{ decision: "allow"|"deny", ... }
    ↓
OAuth Service 处理决定：
    - 如果 allow: 生成 authorization_code
    - 如果 deny: 返回错误信息
    ↓
返回响应：{ redirect_uri: "..." }
    (包含授权码或错误信息)
    ↓
Admin Portal 重定向到 redirect_uri
    ↓
继续 OAuth 流程（进入场景 1 的第 6-7 步）
```

**关键设计点**:

| 特性 | 实现 | 目的 |
|------|------|------|
| **凭证处理** | OAuth Service 完全掌控 | 用户凭证从不进入 Admin Portal |
| **授权决策** | OAuth Service 完全掌控 | Admin Portal 不决定用户权限 |
| **UI 提供** | Admin Portal 提供 | 一致的用户体验 |
| **流程控制** | OAuth Service 完全掌控 | 所有重定向都由 OAuth Service 发起 |
| **Session 管理** | 通过 HttpOnly Cookie | XSS 安全,自动传输 |
| **Token 管理** | Admin Portal 存储/使用 | 本地资源访问 |

**核心组件**:

```typescript
// 1. OAuth Client - 处理完整的 OAuth 2.1 流程
export const oauth2Client = {
  // 第 1 步: 生成 PKCE
  generatePKCE() {
    const codeVerifier = generateRandomString(128);
    const codeChallenge = sha256(codeVerifier);
    localStorage.setItem('pkce_verifier', codeVerifier);
    return { codeVerifier, codeChallenge };
  },

  // 第 2 步: 重定向到 OAuth Service
  redirectToOAuth(codeChallenge: string) {
    const authUrl = new URL('https://auth.yourdomain.com/api/v2/oauth/authorize');
    authUrl.searchParams.set('client_id', 'admin-portal-client');
    authUrl.searchParams.set('redirect_uri', window.location.origin + '/auth/callback');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('state', generateRandomString(32));

    window.location.href = authUrl.toString();
  },

  // 第 9 步: 处理 /auth/callback
  async handleCallback(code: string) {
    const verifier = localStorage.getItem('pkce_verifier');
    const response = await fetch('/api/auth/callback', {
      method: 'POST',
      body: JSON.stringify({
        code,
        code_verifier: verifier,
      }),
    });
    const { access_token, refresh_token } = await response.json();
    saveTokens(access_token, refresh_token);
    localStorage.removeItem('pkce_verifier');
  }
};

// 2. AuthProvider - 仅管理 token 状态
export const AuthProvider: React.FC = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      // 无 token,触发 OAuth 登录
      oauth2Client.redirectToOAuth(...);
      return;
    }

    // 有 token,加载用户信息
    loadUserInfo(token).then(setUser);
  }, []);

  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>;
};

// 3. API Client - 自动注入 token
export const apiClient = {
  async request(url: string, options = {}) {
    const token = getAccessToken();
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });

    // 自动处理 401 - 触发重新认证
    if (response.status === 401) {
      oauth2Client.redirectToOAuth(...);
      return;
    }

    return response;
  }
};
```

**关键改变**:
- ✅ 移除登录页面 - 由 OAuth Service 统一提供
- ✅ 后端 `/api/auth/callback` 只处理 code → token 交换
- ✅ 不存储用户凭证 - OAuth Service 完全掌控
- ✅ 完全的 OAuth 2.1 标准实现

---

## 类和接口设计

### 错误类型层级

```
AppError
├─ AuthError
│  ├─ InvalidCredentials
│  ├─ InvalidToken
│  ├─ TokenExpired
│  ├─ InsufficientPermissions
│  └─ TokenRevoked
├─ ServiceError
│  ├─ NotFound
│  ├─ Conflict
│  ├─ ValidationError
│  └─ DatabaseError
├─ PkceError
│  └─ ChallengeMismatch
└─ ConfigError
   └─ InvalidConfiguration
```

### 关键接口

```rust
// TokenProvider - 令牌提供者接口
pub trait TokenProvider {
    async fn issue_token(
        &self,
        claims: &TokenClaims,
    ) -> Result<String>;

    async fn verify_token(&self, token: &str) -> Result<TokenClaims>;
}

// PermissionResolver - 权限解析器
pub trait PermissionResolver {
    async fn resolve_permissions(
        &self,
        user_id: &str,
    ) -> Result<Vec<Permission>>;
}

// CacheBackend - 缓存后端
pub trait CacheBackend: Send + Sync {
    fn get(&self, key: &str) -> Option<Vec<u8>>;
    fn set(&self, key: &str, value: Vec<u8>, ttl: Duration);
    fn delete(&self, key: &str);
}
```

---

## 关键算法

### PKCE 验证算法

```rust
pub fn verify_pkce_challenge(
    code_verifier: &str,
    code_challenge: &str,
) -> Result<()> {
    // S256 方法: code_challenge = BASE64URL(SHA256(code_verifier))

    let verifier_bytes = code_verifier.as_bytes();
    let mut hasher = Sha256::new();
    hasher.update(verifier_bytes);
    let hash = hasher.finalize();

    let computed_challenge = base64_url::encode(&hash);

    // 常量时间比较 (防止时序攻击)
    if constant_time_compare(
        computed_challenge.as_bytes(),
        code_challenge.as_bytes(),
    ) {
        Ok(())
    } else {
        Err(PkceError::ChallengeMismatch)
    }
}

// 常量时间比较
fn constant_time_compare(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }

    let mut result = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        result |= x ^ y;
    }
    result == 0
}
```

### 权限检查算法 (带缓存)

```rust
pub async fn check_permission(
    user_id: &str,
    required_permission: &str,
) -> Result<bool> {
    // 1. 尝试缓存命中
    if let Some(cached_perms) = permission_cache.get(user_id) {
        return Ok(cached_perms.contains(&required_permission.to_string()));
    }

    // 2. 缓存未命中,查询数据库
    let permissions = load_user_permissions(user_id).await?;

    // 3. 写入缓存 (TTL: 5 分钟)
    permission_cache.set(user_id, &permissions, Duration::from_secs(300));

    // 4. 返回结果
    Ok(permissions.contains(&required_permission.to_string()))
}
```

---

## 状态管理

### 会话状态生命周期

```
用户登录
  ↓
签发 session_token (JWT, 1小时)
  ↓
存储在 HttpOnly Cookie
  ↓
每个请求自动携带 Cookie
  ↓
Token 快要过期?
  ├─ 是 → 自动刷新 (refresh token)
  └─ 否 → 继续使用
  ↓
用户登出
  ↓
清除 Cookie + 撤销 refresh_token
```

### 令牌状态图

```
┌──────────────────────────────────────────────┐
│         Authorization Code (10 min)          │
└─────────────────────────┬──────────────────┐
                          │                  │
                    交换为 Token          过期 → 失效
                          │
                          ▼
            ┌──────────────────────────────┐
            │   Access Token (15 min)      │
            └──────────────────────────────┘
                          │
                  ┌───────┴───────┐
                  │               │
              正常使用         过期或撤销
                  │               │
                  │          → 失效
            使用 Refresh Token
                  │
                  ▼
      ┌───────────────────────────────┐
      │   Refresh Token (30 days)     │
      └───────────────────────────────┘
              │               │
          正常使用      过期或撤销
              │               │
          获取新的 AT  → 失效
```

---

## 错误处理

### 错误映射到 HTTP 状态码

```
AuthError::InvalidCredentials      → 401 Unauthorized
AuthError::InvalidToken             → 401 Unauthorized
AuthError::TokenExpired             → 401 Unauthorized
AuthError::InsufficientPermissions  → 403 Forbidden
AuthError::TokenRevoked             → 401 Unauthorized

ServiceError::NotFound              → 404 Not Found
ServiceError::Conflict              → 409 Conflict
ServiceError::ValidationError       → 400 Bad Request
ServiceError::DatabaseError         → 500 Internal Server Error

PkceError::*                        → 400 Bad Request
```

### 错误响应格式

```json
{
  "error": "INVALID_GRANT",
  "error_description": "The authorization code has expired",
  "error_uri": "https://api.example.com/docs/errors/invalid-grant"
}
```

---

## 并发和线程安全

### Tokio 异步模型

所有 I/O 操作都是异步的,使用 Tokio 任务:

```rust
#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/api/v2/oauth/token", post(token_endpoint))
        .layer(middleware::from_fn(auth_middleware))
        .with_state(AppState {
            pool: create_pool().await,
            cache: Arc::new(PermissionCache::new()),
        });

    // 运行服务器 (默认多线程)
    axum::Server::bind(&"0.0.0.0:3001".parse()?)
        .serve(app.into_make_service())
        .await?;
}
```

### 线程安全的共享数据

```rust
// 使用 Arc<RwLock<T>> 或 Arc<DashMap<K, V>>

// 权限缓存 (DashMap 支持并发读写)
pub struct PermissionCache {
    cache: Arc<DashMap<String, Vec<String>>>,
}

// 应用状态 (AppState 被所有请求共享)
pub struct AppState {
    pool: SqlitePool,              // 连接池管理并发访问
    cache: Arc<PermissionCache>,   // 并发安全
}
```

### 数据库连接池

```rust
let pool = SqlitePoolOptions::new()
    .max_connections(100)          // 最多 100 个并发连接
    .min_connections(20)           // 至少保持 20 个连接
    .max_lifetime(Duration::from_secs(1800))
    .connect(&database_url)
    .await?;
```

---

**文档完成日期**: 2025-11-20
**下一次审查**: 2026-02-20
**维护者**: 开发团队
