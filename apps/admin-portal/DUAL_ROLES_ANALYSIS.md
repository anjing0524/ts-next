# Admin Portal - 两重角色深度分析

## 核心理解

Admin Portal 有两个明确的、并行运作的角色：

### 角色 1：OAuth 2.1 第三方客户端
- **主要功能**：为管理员提供管理后台 UI
- **受保护路由**：`/admin`, `/profile`, `/admin/*`
- **认证方式**：OAuth 2.1 授权码流程 + PKCE
- **中间件驱动**：`middleware.ts` 在检测到无 token 时启动 OAuth 流程
- **Token 存储**：Access Token + Refresh Token (cookies/localStorage)

### 角色 2：OAuth Service UI 提供者
- **主要功能**：为 OAuth Service 提供登陆和同意确认页面
- **公开路由**：`/login`, `/oauth/consent`
- **交互方式**：OAuth Service 通过重定向调用这些页面
- **数据流向**：OAuth Service → 重定向到 admin-portal → 用户交互 → 重定向回 OAuth Service

---

## 完整的 OAuth 流程分析

### 场景 1：未登陆用户访问受保护页面

```
用户                Admin Portal              OAuth Service           Pingora
  |                    |                         |                      |
  | GET /admin         |                         |                      |
  |------------------→ | (通过 6188)            |                      |
  |                    |                         |                      |
  |                    | middleware.ts 检查 token|                      |
  |                    | (无 token)              |                      |
  |                    |                         |                      |
  |                    | 生成 PKCE 参数:        |                      |
  |                    | - state (32 chars)     |                      |
  |                    | - code_verifier (128)  |                      |
  |                    | - code_challenge       |                      |
  |                    |                         |                      |
  |                    | 存储到 cookies:       |                      |
  |                    | - oauth_state          |                      |
  |                    | - oauth_code_verifier  |                      |
  |                    | - oauth_redirect_path  |                      |
  |                    |                         |                      |
  |<-- Redirect -------|                         |                      |
  | to /authorize?...  |                         |                      |
  | (with PKCE params) |                         |                      |
  |                    |                         |                      |
  | GET /authorize     |                         |                      |
  |------------------→ | (通过 6188) -------→ oauth-service (3001)   |
  |                    |                       | (Pingora 路由)        |
  |                    |                       |                      |
  |                    |                       | Check session_token   |
  |                    |                       | (缺少)                |
  |                    |                       |                      |
  |<----------- Redirect to /login?redirect=... ← |                  |
  | (redirect = original authorize URL)           |                  |
  |                    |                          |                  |
  | GET /login?...     |                          |                  |
  |------------------→ (通过 6188) -------→ admin-portal (3002)   |
  |                    | (Pingora 路由)        |                      |
  |                    |                       |                      |
  | [显示登陆表单]     |                       |                      |
```

### 场景 2：在登陆页面输入凭证

```
用户                Admin Portal              OAuth Service
  |                    |                         |
  | 输入用户名/密码    |                         |
  | POST /login        |                         |
  |--→ username-password-form.tsx                |
  |    (form.tsx 提交) |                         |
  |                    |                         |
  |                    | POST /api/v2/auth/login |
  |                    | (凭证在 body 中)       |
  |                    |--→ (通过 6188)      |
  |                    |    ↓ Pingora 路由   |
  |                    |    /api/v2/auth/* → oauth-service (3001)   |
  |                    |                       |
  |                    |                       | 验证凭证
  |                    |                       | ✓ 有效              |
  |                    |                       |
  |                    |                       | 设置 session_token cookie
  |                    |                       | (httpOnly, Lax, Secure)
  |                    |                       |
  |                    |← 200 OK              |
  |                    | Set-Cookie: session_token=...                |
  |                    |                      |
  | [JS 重定向]        |                      |
  | window.location = redirect param           |
  | (redirect = 原始 authorize URL)            |
  |                    |                      |
  | GET /authorize     |                      |
  |--→ (通过 6188)  |                      |
  |    ↓ Pingora 路由  |                      |
  |    /api/v2/oauth/* → oauth-service (3001)|
  |                    |                      |
  |                    |                      | Check session_token  |
  |                    |                      | ✓ 有效              |
  |                    |                      |
  |                    |                      | 检查是否需要用户同意|
  |                    |                      | (scope 权限)        |
  |                    |                      |
  | [可能: 显示同意页]| ← (如果需要同意)      |
  | 或直接生成 code   | ← (如果已同意或不需要)|
```

### 场景 3：用户在同意页面批准权限

```
用户                Admin Portal              OAuth Service
  |                    |                         |
  | GET /oauth/consent | ?client_id=...        |
  | ?client_id=...     | &redirect_uri=...     |
  | &scope=...         | &state=...            |
  | &code_challenge=...| &code_challenge_method|
  |--→ (通过 6188)  |                      |
  |    ↓ Pingora 路由  |                      |
  |    /oauth/consent → admin-portal (3002)   |
  |                    |                      |
  |                    | ConsentPage 组件    |
  |                    | 调用 apiRequest()    |
  |                    | GET /api/v2/oauth/   |
  |                    | consent?params...    |
  |                    |--→ (通过 6188)      |
  |                    |   ↓ Pingora 路由    |
  |                    |   → oauth-service   |
  |                    |                     |
  |                    |                     | 返回同意信息:
  |                    |← Response:          | - client 信息
  |                    | {                   | - requested_scopes
  |                    |   client: {...},    | - 用户信息
  |                    |   requested_scopes: [...],
  |                    |   user: {...},      |
  |                    | }                   |
  |                    |                     |
  | [显示同意页面]    |                      |
  | 用户点击"允许"    |                      |
  |                    |                      |
  | [JS 处理]         |                      |
  | 调用 adminApi.submitConsent('allow')     |
  |                    |                      |
  |                    | POST /oauth/consent |
  |                    | decision=allow      |
  |                    | + 所有 OAuth 参数   |
  |                    |--→ (通过 6188)      |
  |                    |   ↓ Pingora 路由    |
  |                    |   → oauth-service   |
  |                    |                     |
  |                    |                     | 存储用户同意        |
  |                    |                     | 生成 authorization_code|
  |                    |                     |
  |                    |← Response:          |
  |                    | {                   |
  |                    |   redirect_uri:     |
  |                    |   "...callback?code=|
  |                    |    ...&state=..."   |
  |                    | }                   |
  |                    |                      |
  | [JS 重定向]       |                      |
  | window.location =  |                      |
  | callback URL       |                      |
```

### 场景 4：交换授权码获取 Token

```
用户                Admin Portal              OAuth Service
  |                    |                         |
  | GET /auth/callback | ?code=...              |
  | ?code=...          | &state=...             |
  | &state=...         |                        |
  |--→ (通过 6188)  |                      |
  |    ↓ Pingora 路由  |                      |
  |    /auth/* → admin-portal (3002)           |
  |                    |                       |
  |                    | callback/page.tsx   |
  |                    | 检查 query 参数     |
  |                    | - 从 cookie 获取:  |
  |                    |   oauth_state       |
  |                    |   oauth_code_verifier|
  |                    |   oauth_redirect_path|
  |                    |                     |
  |                    | 验证 state (CSRF)  |
  |                    | ✓ 匹配             |
  |                    |                     |
  |                    | POST /api/v2/oauth/ |
  |                    | token               |
  |                    | grant_type=         |
  |                    |  authorization_code |
  |                    | code=...            |
  |                    | code_verifier=...   |
  |                    | client_id=...       |
  |                    | redirect_uri=...    |
  |                    |--→ (通过 6188)      |
  |                    |   ↓ Pingora 路由    |
  |                    |   → oauth-service   |
  |                    |                     |
  |                    |                     | 验证 PKCE
  |                    |                     | code_challenge ==
  |                    |                     | sha256(code_verifier)|
  |                    |                     | ✓ 有效              |
  |                    |                     |
  |                    |← 200 OK             |
  |                    | {                   |
  |                    |   access_token,     |
  |                    |   refresh_token,    |
  |                    |   expires_in,       |
  |                    |   token_type        |
  |                    | }                   |
  |                    |                     |
  |                    | 存储 tokens:       |
  |                    | - TokenStorage      |
  |                    | - localStorage      |
  |                    | - 清理 OAuth cookies|
  |                    |                     |
  |                    | GET /api/v2/oauth/  |
  |                    | userinfo            |
  |                    | (带 access_token)   |
  |                    |--→ (通过 6188)      |
  |                    |   ↓ Pingora 路由    |
  |                    |   → oauth-service   |
  |                    |                     |
  |                    |← 200 OK             |
  |                    | {                   |
  |                    |   id, username,     |
  |                    |   email, ...        |
  |                    | }                   |
  |                    |                     |
  |                    | login(userData)    |
  |                    | (更新 auth context)|
  |                    |                     |
  |<-- Redirect -------|                      |
  | to original path   |                      |
  | (/admin)           |                      |
  |                    |                      |
  | GET /admin         |                      |
  |--→ (通过 6188)  |                      |
  |    middleware 检查 |                      |
  |    access_token    |                      |
  |    ✓ 有效         |                      |
  |                    |                      |
  | [显示 Dashboard]  |                      |
```

---

## Pingora 路由关键点

```yaml
# 请求如何通过 Pingora 路由

PATH                          ROUTE TO              BACKEND PORT
────────────────────────────────────────────────────────────────
/api/v2/oauth/*              oauth-service         3001
/api/v2/auth/*               oauth-service         3001
/api/v2/admin/*              oauth-service         3001
/login                        admin-portal          3002
/auth/*                       admin-portal          3002
/oauth/consent                admin-portal          3002
/*                            admin-portal (默认)   3002
```

### 关键理解
- ✅ Admin Portal 的 `/login` 和 `/oauth/consent` **不** 受 middleware 保护
- ✅ 这两个路由是 **公开的**，由 OAuth Service 直接重定向到达
- ✅ 所有 API 调用都通过 Pingora (6188) 路由，确保同域 Cookie
- ✅ `/api/v2/oauth/*` 和 `/api/v2/auth/*` 由 Pingora 正确路由到 OAuth Service

---

## 参数传递链分析

### PKCE 参数流向

```
middleware.ts
├─ 生成: state, code_verifier, code_challenge
├─ 存储: cookies (oauth_state, oauth_code_verifier, oauth_redirect_path)
├─ 传递: 在 authorize URL 的 query params 中
│
OAuth Service /authorize
├─ 接收: code_challenge, code_challenge_method
├─ 在会话中存储
├─ 传递: 在 authorize URL 的 query params 返回给 callback
│
callback/page.tsx
├─ 从 query 获取: code, state
├─ 从 cookie 获取: oauth_code_verifier, oauth_state
├─ 验证: state 匹配
├─ 使用: code_verifier 交换 token
└─ 清理: 删除所有 OAuth cookies
```

### Redirect 参数流向

```
middleware.ts
├─ 生成: redirect URL (to OAuth /authorize)
├─ 存储: oauth_redirect_path cookie (原始路径)
│
OAuth Service /authorize
├─ 检查是否需要登陆
├─ 重定向到 /login?redirect=<authorize URL>
│
login/page.tsx
├─ 接收: redirect 参数
├─ 传递: 给 UsernamePasswordForm
│
username-password-form.tsx
├─ 接收: redirect 参数
├─ 使用: window.location.href = decodeURIComponent(redirect)
│
OAuth Service /authorize (第二次)
├─ 现在有 session_token
├─ 生成 authorization_code
├─ 重定向到 callback?code=...&state=...
│
callback/page.tsx
├─ 从 cookie 获取: oauth_redirect_path
├─ 交换 token 后，重定向到该路径
└─ 用户回到原始页面 (/admin)
```

---

## 可能的问题及解决方案

### 问题 1：Redirect 参数验证缺失

**位置**: `app/(auth)/login/page.tsx` + `components/auth/username-password-form.tsx`

**问题**: Redirect 参数来自 OAuth Service，如果 OAuth Service 被攻击或配置不当，可能导致 open redirect

**风险**: 用户被重定向到恶意网站

**解决方案**:
```typescript
// 验证 redirect 参数必须指向合法的 authorize URL
function validateRedirectUrl(redirect: string): boolean {
  try {
    const url = new URL(decodeURIComponent(redirect));
    const oauthServiceUrl = new URL(
      process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001'
    );

    // 检查 origin 是否匹配
    return url.origin === oauthServiceUrl.origin &&
           url.pathname === '/api/v2/oauth/authorize';
  } catch {
    return false;
  }
}
```

### 问题 2：API 路由可能错误

**位置**: `app/oauth/consent/page.tsx` line 70

**问题**: `apiRequest('/oauth/consent?...')` 会调用 `/api/v2/oauth/consent`

**理解**: 这实际上是正确的！Pingora 会将其路由到 OAuth Service

**确认**: 根据 Pingora 配置，`/api/v2/oauth/*` → oauth-service (3001) ✅

### 问题 3：登陆表单的表单数据传递

**位置**: `components/auth/username-password-form.tsx` line 26-37

**问题**: HiddenFields 组件包含所有 URL 参数，但 handleSubmit 使用 JavaScript 处理，忽略了这些字段

**分析**: 这是 OK 的，因为：
- HiddenFields 主要用于向 OAuth Service 传递 redirect 等参数
- 但 handleSubmit 是自定义的 JavaScript，不做表单提交
- redirect 参数通过 searchParams 获取，直接使用

**改进**: 可以简化代码，移除不必要的 HiddenFields

### 问题 4：Consent 页面认证状态

**位置**: `app/oauth/consent/page.tsx` line 35 (`const { user } = useAuth()`)

**问题**: 同意页面使用 useAuth()，这需要有效的 access_token

**分析**:
- Consent 页面由 OAuth Service 重定向到达
- 此时用户已有 session_token（OAuth 会话）
- 但可能没有 access_token（admin-portal 的 token）
- useAuth() 可能失败

**解决方案**:
- 不依赖 useAuth()，而是从 API 响应中获取用户信息
- 同意信息中已包含 user 数据

---

## 实现检查清单

- [ ] 登陆页面验证 redirect 参数
  - [ ] 确保 redirect 指向合法的 authorize URL
  - [ ] 防止 open redirect 攻击

- [ ] 确认表单提交到正确的端点
  - [ ] `POST /api/v2/auth/login`
  - [ ] 通过 Pingora 路由到 OAuth Service

- [ ] 验证 PKCE 参数完整传递
  - [ ] middleware 生成并存储
  - [ ] 在 authorize URL 中传递
  - [ ] callback 页面正确验证和使用

- [ ] 同意页面数据流
  - [ ] 从 OAuth Service 获取同意信息
  - [ ] 显示正确的作用域说明
  - [ ] 提交决策到 OAuth Service

- [ ] Cookie 管理
  - [ ] oauth_state, oauth_code_verifier, oauth_redirect_path 正确设置
  - [ ] httpOnly 标志正确设置
  - [ ] SameSite=Lax for Pingora 代理
  - [ ] token 交换后正确清理

---

## 总结

Admin Portal 的两重角色运作流程：

1. **第三方客户端角色**：middleware 检测到无 token，生成 PKCE 参数，启动 OAuth 流程

2. **UI 提供者角色**：当用户需要登陆或确认权限时，OAuth Service 重定向到 admin-portal 的公开页面

3. **Pingora 同域**：所有请求通过 6188 端口，确保 Cookie 在同一域名下共享

4. **完整安全**：PKCE 保护授权码，state 防止 CSRF，session_token 和 access_token 分离管理

