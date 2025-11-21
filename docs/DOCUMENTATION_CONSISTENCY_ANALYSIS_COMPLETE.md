# 文档一致性深度分析报告

**分析日期**: 2025-11-21
**分析范围**: /Users/liushuo/code/ts-next-template/docs/ 目录下所有文档
**分析方法**: 心智模型建立 → 系统性交叉验证
**文档版本**: 基于 git 当前状态

---

## 第一部分：系统心智模型总结

### 1. 系统核心目标和功能

本系统是一个符合 **OAuth 2.1 标准**的企业级单点登录 (SSO) 和身份认证授权系统，核心价值主张包括：

- **统一认证**: 一次登录，多应用访问
- **集中授权**: 基于 RBAC 的细粒度权限管理
- **合规审计**: 完整的操作审计日志
- **高可用**: 99.9% 系统可用性 SLA
- **高性能**: <100ms p95 API 响应延迟

**功能需求覆盖**:
- FR-001: OAuth 2.1 授权码流程（强制 PKCE）
- FR-002: Token 生命周期管理
- FR-003: 用户认证（OAuth Service 完全掌控）
- FR-004: RBAC 权限管理
- FR-005: OAuth 客户端管理
- FR-006: 审计日志
- FR-007: Admin Portal（OAuth 客户端应用 + Web 前端）
- FR-008: 灾难恢复和故障转移
- FR-009: 系统角色和权限矩阵
- FR-010: 密钥管理策略
- FR-011: API 版本管理
- FR-012: 安全和合规需求

### 2. OAuth 2.1 标准的实现方式

**标准符合度**:
- ✅ 强制 PKCE (S256)
- ✅ 授权码单次使用
- ✅ Token 刷新和轮转
- ✅ State 参数 CSRF 保护
- ✅ HttpOnly Cookie 会话管理
- ⚠️ **非标准设计**: 登录/同意 UI 由 Admin Portal 提供（而非 OAuth Service）

**核心安全特性**:
| 特性 | 实现位置 | 保护目标 |
|------|---------|---------|
| 凭证验证 | OAuth Service | 密码安全 |
| 会话管理 | OAuth Service | Session 劫持 |
| 密码哈希 | bcrypt (cost=12) | 密码泄露 |
| HttpOnly Cookie | OAuth Service | XSS 攻击 |
| PKCE | OAuth Service | 授权码拦截 |
| State 验证 | Admin Portal | CSRF 攻击 |
| Token 轮转 | OAuth Service | Token 泄露 |

### 3. 关键组件和关系

**三层架构**:

```
第一层：传输层（Pingora）
  - 反向代理
  - 路由分发: /api/v2/* → OAuth Service, /* → Admin Portal
  - 负载均衡
  - 健康检查

第二层：认证授权层（OAuth Service - Rust）
  - 凭证验证（bcrypt）
  - 会话管理（HttpOnly Cookie）
  - Token 签发（JWT RS256）
  - RBAC 权限验证
  - 审计日志记录

第三层：客户端应用层（Admin Portal - Next.js）
  角色1: OAuth 2.1 标准客户端
    - 生成 PKCE 参数
    - 发起授权流程
    - 交换授权码为 Token
    - 存储和刷新 Token

  角色2: Web UI 提供方（非标准设计）
    - 提供登录表单 UI（仅 UI，不验证凭证）
    - 提供权限同意 UI（仅 UI，不决策权限）
    - 作为 OAuth Service 的 UI 代理

  角色3: 管理应用
    - 用户管理界面
    - 角色权限管理界面
    - OAuth 客户端管理界面
    - 审计日志查看界面
```

**数据存储**:
- 11 个核心表：users, user_roles, roles, role_permissions, permissions, oauth_clients, auth_codes, access_tokens, refresh_tokens, revoked_access_tokens, audit_logs
- 索引策略：高频查询（token_hash, user_id, email, username）全部有索引
- 分区策略：audit_logs 按年分区（生产环境）

### 4. 数据流和业务流程

#### 核心流程：OAuth 2.1 授权码流程

```
场景：用户访问 Admin Portal (无 Token)

1. Admin Portal 检查 access_token → 不存在
2. Admin Portal 生成 PKCE (code_verifier, code_challenge)
3. Admin Portal 重定向 → OAuth Service /authorize?code_challenge=...
4. OAuth Service 检查 session_token Cookie → 不存在
5. OAuth Service 重定向 → Admin Portal /login?redirect=...
6. Admin Portal 显示登录表单 HTML（仅 UI）
7. 用户输入凭证 (username/password)
8. Admin Portal 提交 → OAuth Service POST /auth/login
9. OAuth Service 验证凭证（bcrypt）
10. OAuth Service 签发 session_token（HttpOnly Cookie, 1小时）
11. OAuth Service 返回 redirect_url
12. 浏览器重定向回 → OAuth Service /authorize（自动携带 session_token）
13. OAuth Service 检查 require_consent
    - 如需同意 → 重定向 Admin Portal /oauth/consent
    - 如不需要 → 直接生成 authorization_code
14. [同意流程] Admin Portal 调用 GET /consent/info 获取权限列表
15. [同意流程] Admin Portal 显示同意对话框 UI
16. [同意流程] 用户点击"允许"，提交 POST /consent/submit
17. OAuth Service 生成 authorization_code（10分钟有效）
18. OAuth Service 重定向 → Admin Portal /auth/callback?code=...&state=...
19. Admin Portal 验证 state（CSRF 保护）
20. Admin Portal 调用 POST /token 交换 { code, code_verifier }
21. OAuth Service 验证 PKCE: SHA256(code_verifier) == code_challenge
22. OAuth Service 加载用户权限（RBAC）
23. OAuth Service 签发 access_token (JWT, 15分钟) + refresh_token (UUID, 30天)
24. Admin Portal 存储 tokens（localStorage + HttpOnly Cookie）
25. Admin Portal 重定向 → Dashboard（已认证）
```

**关键设计决策**:
- ⚠️ **非标准实现**: 登录/同意 UI 由 Admin Portal 提供（而非 OAuth Service）
- ✅ **安全保证**: 所有凭证验证、授权决策由 OAuth Service 完全掌控
- ✅ **UX 优先**: Next.js 更适合构建现代 Web UI

---

## 第二部分：文档一致性问题分析

### 类别 A: 技术描述错误

#### A1: API 端点不一致（中等严重性）

**位置**: 4-API_REFERENCE.md vs 8-OAUTH_FLOWS.md

**问题描述**:
- **4-API_REFERENCE.md** 第 370 行:
  ```http
  POST /api/v2/auth/login HTTP/1.1
  ```
  返回:
  ```json
  {
    "success": true,
    "redirect_url": "/oauth/authorize?...",
    "session_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

- **8-OAUTH_FLOWS.md** 第 553 行描述:
  ```
  17. HTTP 200 + Set-Cookie
      Set-Cookie: session_token=<jwt>; HttpOnly; Secure; SameSite=Lax
      {
        "success": true,
        "redirect_url": "/oauth/authorize?..."
      }
  ```

**不一致点**:
- API_REFERENCE 在响应 JSON body 中包含 `session_token` 字段
- OAUTH_FLOWS 仅通过 Set-Cookie 返回 session_token，不在 body 中

**影响**: 客户端实现可能依赖错误的响应格式

**建议修正**:
```diff
4-API_REFERENCE.md 第 380-387 行:
- {
-   "success": true,
-   "redirect_url": "/oauth/authorize?...",
-   "session_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
- }
+ {
+   "success": true,
+   "redirect_url": "/oauth/authorize?..."
+ }
+ Set-Cookie: session_token=<jwt>; HttpOnly; Secure; SameSite=Lax; Max-Age=3600
```

**根本原因**: session_token 应该仅通过 HttpOnly Cookie 返回（安全考虑），不应在 JSON body 中暴露。

---

#### A2: Token 有效期不一致（高严重性）

**位置**: 1-REQUIREMENTS.md vs 8-OAUTH_FLOWS.md

**问题描述**:
- **1-REQUIREMENTS.md** 第 134-136 行:
  ```
  | Access Token | 15 分钟 | 是 | JWT, RS256 签名 |
  | Refresh Token | 30 天 | 是 | UUID, 可旋转 |
  | Session Token | 1 小时 | 是 | HttpOnly Cookie |
  ```

- **8-OAUTH_FLOWS.md** 第 451 行:
  ```json
  {
    "exp": 1700003600,  // 过期时间 (1小时后)
  }
  ```

**不一致点**:
- REQUIREMENTS 中 Access Token 有效期为 **15 分钟**
- OAUTH_FLOWS 示例中 Access Token 有效期为 **1 小时**

**影响**: 安全策略不明确，实现可能选择错误的有效期

**建议修正**:
```diff
8-OAUTH_FLOWS.md 第 448-452 行:
  {
    "sub": "user-uuid",
    ...
-   "exp": 1700003600,               // 过期时间 (1小时后)
+   "exp": 1700000900,               // 过期时间 (15分钟后)
  }
```

**根本原因**: Access Token 应保持短有效期（15分钟）以提升安全性，示例代码可能引用了 Session Token 的有效期。

---

#### A3: 数据库字段类型不一致（中等严重性）

**位置**: 3-DATABASE_DESIGN.md

**问题描述**:
- **第 328 行** auth_codes 表定义:
  ```sql
  code_challenge TEXT,
  ```

- **第 789 行** OAUTH_FLOWS 中的 PKCE 描述:
  ```
  code_challenge = BASE64URL(SHA256(code_verifier))
  ```

**不一致点**:
- code_challenge 存储为 TEXT，但实际是固定长度的 base64url 编码字符串（SHA256 = 43 字符）
- 应使用 VARCHAR(64) 或 CHAR(43) 以优化索引和查询性能

**影响**: 数据库性能次优，索引效率低

**建议修正**:
```diff
3-DATABASE_DESIGN.md 第 328 行:
- code_challenge TEXT,
+ code_challenge VARCHAR(64),  -- Base64URL(SHA256) = 43 chars
```

---

### 类别 B: 逻辑不一致

#### B1: 同意流程触发条件不清晰（中等严重性）

**位置**: 1-REQUIREMENTS.md vs 8-OAUTH_FLOWS.md

**问题描述**:
- **1-REQUIREMENTS.md** 第 265-267 行:
  ```
  8. 如果需要用户同意：
     a) 重定向到：
        Admin Portal /oauth/consent?client_id=...&scope=...
  ```
  未明确"需要用户同意"的条件

- **8-OAUTH_FLOWS.md** 第 625-632 行:
  ```
  同意页面在以下情况触发：
  - 用户已登录（有 session_token）
  - OAuth Service 检查客户端配置的 `require_consent` 标志
  - 如果需要同意，重定向到 Admin Portal 的 `/oauth/consent` 页面
  ```

**不一致点**:
- REQUIREMENTS 未提及 `require_consent` 配置项
- OAUTH_FLOWS 明确了触发条件（require_consent 标志）

**影响**: 开发者不知道如何配置同意流程的触发条件

**建议修正**:
```diff
1-REQUIREMENTS.md 第 393 行增加:
+ "require_consent": true,           // 是否需要用户同意授权
```

并在 FR-005（OAuth 客户端管理）中补充说明：
```markdown
### 同意流程配置

客户端可通过 `require_consent` 标志控制是否需要用户同意：
- `true`: 每次授权请求都显示同意页面
- `false`: 用户首次授权后自动批准（静默授权）

**默认值**: `true`（推荐）
```

---

#### B2: Admin Portal 角色定义矛盾（高严重性）

**位置**: 1-REQUIREMENTS.md vs 00-ARCHITECTURE_DECISION.md

**问题描述**:
- **1-REQUIREMENTS.md** FR-007 第 442-459 行:
  ```
  Admin Portal 是本系统的 OAuth 2.1 客户端应用，同时也是主要的 Web 前端。
  主要职责：
  | 职责 | 实现 | 说明 |
  | OAuth 2.1 客户端 | ✅ 标准实现 | ... |
  | Web 前端 | ✅ 完整实现 | ... |
  | 凭证验证 | ❌ 不实现 | 完全由 OAuth Service 处理 |
  ```

- **00-ARCHITECTURE_DECISION.md** 第 58-83 行:
  ```
  ② 作为 OAuth 2.1 标准客户端 + Web UI 提供方
    - 生成 PKCE 参数
    - 发起 OAuth 授权流程
    - 提供登录页面 HTML（仅提供表单 UI，不包含验证逻辑）
    - 提供权限同意页面 HTML（仅显示 UI，不包含权限决策）
    - 处理授权码回调
    - 交换 token 并存储
  ```

**不一致点**:
- REQUIREMENTS 将 Admin Portal 定位为"OAuth 客户端应用 + Web 前端"
- ARCHITECTURE_DECISION 增加了"Web UI 提供方"的非标准角色
- REQUIREMENTS 未明确说明登录/同意页面由 Admin Portal 提供

**影响**:
- 架构理解混乱
- 安全审查时可能对"Admin Portal 提供登录页面"产生疑虑

**建议修正**:
```diff
1-REQUIREMENTS.md FR-007 增加:
+ #### 2. OAuth 认证流程中的前端页面（⚠️ 非标准实现）
+
+ | 页面 | 触发者 | 提供者 | 说明 |
+ |------|--------|--------|------|
+ | /login | OAuth Service | Admin Portal | 登录表单（仅 UI，不验证） |
+ | /oauth/consent | OAuth Service | Admin Portal | 权限同意对话框（仅 UI，不决策） |
+ | /auth/callback | OAuth 流程 | Admin Portal | 授权码回调处理 |
+
+ **非标准设计说明**:
+ - 标准 OAuth 2.1 中，登录和同意页面应由 Authorization Server（即 OAuth Service）提供
+ - 本系统中，这些 UI 由 Admin Portal 提供，但所有认证和授权逻辑仍由 OAuth Service 完全掌控
+ - 原因：Next.js 更适合构建现代 Web UI，详见 [00-ARCHITECTURE_DECISION.md](./00-ARCHITECTURE_DECISION.md)
+ - 安全保证：用户凭证直接发送给 OAuth Service，Admin Portal 不处理或验证凭证
```

---

#### B3: 权限检查缓存策略不一致（中等严重性）

**位置**: 1-REQUIREMENTS.md vs 2-SYSTEM_DESIGN.md

**问题描述**:
- **1-REQUIREMENTS.md** 第 360 行:
  ```
  - ✅ 权限检查缓存 5 分钟 (TTL)
  ```

- **2-SYSTEM_DESIGN.md** 第 941 行:
  ```rust
  // 3. 写入缓存 (TTL: 5 分钟)
  permission_cache.set(user_id, &permissions, Duration::from_secs(300));
  ```

**一致性**:
✅ 两处文档的 TTL 都是 5 分钟（300 秒），**无不一致**

**但存在问题**: 缓存失效策略未说明
- 权限变更时，缓存是否立即失效？
- 如何避免权限变更后用户仍使用旧权限？

**建议补充**:
```diff
2-SYSTEM_DESIGN.md 第 429-433 行增加:
+
+ ### 缓存失效策略
+
+ 当用户权限发生变更时（角色分配/撤销、权限修改），必须主动失效缓存：
+
+ ```rust
+ pub fn invalidate_user_cache(&self, user_id: &str) {
+     self.cache.remove(user_id);
+ }
+ ```
+
+ **触发场景**:
+ - 用户角色分配/撤销（user_roles 表变更）
+ - 角色权限变更（role_permissions 表变更）
+ - 用户状态变更（is_active = 0）
```

---

### 类别 C: 设计偏差（实现与文档不符）

#### C1: 同意 API 端点未在 API_REFERENCE 中文档化（高严重性）

**位置**: 4-API_REFERENCE.md vs 8-OAUTH_FLOWS.md

**问题描述**:
- **8-OAUTH_FLOWS.md** 第 749-795 行详细描述了两个同意 API：
  - `GET /api/v2/oauth/consent/info`
  - `POST /api/v2/oauth/consent/submit`

- **4-API_REFERENCE.md** 完全缺失这两个端点的文档

**影响**:
- API 使用者无法通过参考文档找到这些端点
- 前端开发者不知道如何调用同意 API
- 集成文档不完整

**建议修正**: 在 4-API_REFERENCE.md 增加完整的同意 API 文档

```markdown
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
```

---

#### C2: 登录 API 缺少 redirect 参数说明（中等严重性）

**位置**: 4-API_REFERENCE.md

**问题描述**:
- **4-API_REFERENCE.md** 第 368-375 行:
  ```json
  {
    "username": "admin",
    "password": "password123",
    "redirect": "/oauth/authorize?client_id=..."
  }
  ```
  未说明 `redirect` 参数的用途和格式

- **8-OAUTH_FLOWS.md** 第 535 行明确说明:
  ```
  "redirect": "/oauth/authorize?..."  // OAuth Service 验证后重定向的目标 URL
  ```

**影响**: 开发者不知道如何正确使用 redirect 参数

**建议修正**:
```diff
4-API_REFERENCE.md 第 368-375 行增加参数说明:
  {
    "username": "admin",
    "password": "password123",
-   "redirect": "/oauth/authorize?client_id=..."
+   "redirect": "/oauth/authorize?client_id=..."  // [可选] 登录成功后的重定向 URL
  }
+
+ **参数说明**:
+ - `username`: 用户名，3-50 字符
+ - `password`: 密码，8+ 字符
+ - `redirect`: 登录成功后的重定向 URL，通常是 OAuth authorize 端点
+   - 如果未提供，默认重定向到根路径 "/"
+   - 必须是相对路径或同域 URL（安全考虑）
```

---

### 类别 D: 遗漏信息

#### D1: 缺少系统角色权限矩阵的数据库初始化说明（中等严重性）

**位置**: 1-REQUIREMENTS.md FR-009 vs 5-DEPLOYMENT.md

**问题描述**:
- **1-REQUIREMENTS.md** 第 591-634 行定义了完整的系统角色权限矩阵（super_admin, admin, user）
- **5-DEPLOYMENT.md** 未提及如何初始化这些系统角色和权限

**影响**:
- 部署后系统缺少预定义角色
- 第一个用户无法登录（缺少权限）

**建议补充**: 在 5-DEPLOYMENT.md 增加数据库初始化章节

```markdown
## 数据库初始化（重要）

### 1. 运行数据库迁移

```bash
# SQLite (开发环境)
cd apps/oauth-service-rust
sqlx migrate run

# PostgreSQL (生产环境)
DATABASE_URL=postgresql://user:pass@host/db sqlx migrate run
```

### 2. 初始化系统角色和权限

运行初始化脚本（位于 `migrations/seed_system_roles.sql`）：

```sql
-- 插入系统角色
INSERT INTO roles (id, name, description, is_active) VALUES
    ('super_admin', 'Super Admin', '系统管理员，拥有所有权限', 1),
    ('admin', 'Admin', '业务管理员', 1),
    ('user', 'User', '普通用户', 1);

-- 插入权限
INSERT INTO permissions (id, code, description, category) VALUES
    ('perm_users_list', 'users:list', '列出用户', 'user_management'),
    ('perm_users_create', 'users:create', '创建用户', 'user_management'),
    ('perm_users_read', 'users:read', '读取用户详情', 'user_management'),
    ('perm_users_update', 'users:update', '更新用户', 'user_management'),
    ('perm_users_delete', 'users:delete', '删除用户', 'user_management'),
    ('perm_roles_manage', 'roles:manage', '管理角色', 'role_management'),
    ('perm_audit_view', 'audit:view', '查看审计日志', 'audit'),
    ('perm_audit_export', 'audit:export', '导出审计日志', 'audit');

-- 分配权限给 super_admin（所有权限）
INSERT INTO role_permissions (role_id, permission_id) VALUES
    ('super_admin', 'perm_users_list'),
    ('super_admin', 'perm_users_create'),
    ('super_admin', 'perm_users_read'),
    ('super_admin', 'perm_users_update'),
    ('super_admin', 'perm_users_delete'),
    ('super_admin', 'perm_roles_manage'),
    ('super_admin', 'perm_audit_view'),
    ('super_admin', 'perm_audit_export');

-- 分配权限给 admin（部分权限）
INSERT INTO role_permissions (role_id, permission_id) VALUES
    ('admin', 'perm_users_list'),
    ('admin', 'perm_users_create'),
    ('admin', 'perm_users_read'),
    ('admin', 'perm_users_update'),
    ('admin', 'perm_users_delete'),
    ('admin', 'perm_audit_view');
```

### 3. 创建初始管理员用户

```bash
# 使用管理脚本创建第一个用户
cargo run --bin create-admin -- --username admin --password admin123 --email admin@example.com

# 分配 super_admin 角色
INSERT INTO user_roles (user_id, role_id) VALUES
    ((SELECT id FROM users WHERE username = 'admin'), 'super_admin');
```

**⚠️ 重要**: 生产环境必须修改默认密码！
```

---

#### D2: 缺少密钥生成和轮换的操作指南（高严重性）

**位置**: 1-REQUIREMENTS.md FR-010 vs 6-OPERATIONS.md

**问题描述**:
- **1-REQUIREMENTS.md** 第 640-665 行定义了完整的密钥管理策略，包括轮换周期
- **6-OPERATIONS.md** 未提供密钥生成和轮换的具体操作步骤

**影响**:
- 运维人员不知道如何生成初始密钥
- 密钥轮换无法执行
- 安全合规风险

**建议补充**: 在 6-OPERATIONS.md 增加密钥管理章节

```markdown
## 9. 密钥管理

### JWT 签名密钥生成

#### 初始生成（RSA-2048）

```bash
# 生成私钥
openssl genrsa -out private_key.pem 2048

# 从私钥生成公钥
openssl rsa -in private_key.pem -pubout -out public_key.pem

# 验证密钥对
openssl rsa -in private_key.pem -check
openssl rsa -pubin -in public_key.pem -text -noout

# 设置安全权限
chmod 600 private_key.pem
chmod 644 public_key.pem
```

#### 密钥轮换（90 天周期）

**阶段 1: 生成新密钥**

```bash
# 生成新的密钥对
openssl genrsa -out private_key_new.pem 2048
openssl rsa -in private_key_new.pem -pubout -out public_key_new.pem
```

**阶段 2: 双密钥并存期（7 天）**

```yaml
# 更新 Kubernetes Secret，支持新旧密钥
apiVersion: v1
kind: Secret
metadata:
  name: oauth-secrets
data:
  jwt_private_key: <old_key_base64>
  jwt_public_key: <old_key_base64>
  jwt_private_key_new: <new_key_base64>
  jwt_public_key_new: <new_key_base64>
```

```rust
// OAuth Service 配置（支持多公钥验证）
pub struct JwtKeys {
    signing_key: RsaPrivateKey,     // 用于签发新 token
    verification_keys: Vec<RsaPublicKey>,  // 用于验证新旧 token
}
```

**阶段 3: 切换为活跃密钥**

```bash
# 7 天后，移除旧密钥
kubectl create secret generic oauth-secrets \
  --from-file=jwt_private_key=private_key_new.pem \
  --from-file=jwt_public_key=public_key_new.pem \
  -n oauth-system --dry-run=client -o yaml | kubectl apply -f -

# 重启服务以加载新密钥
kubectl rollout restart deployment/oauth-service -n oauth-system
```

**阶段 4: 归档旧密钥（6 个月后销毁）**

```bash
# 移动到归档目录
mv private_key_old.pem keys/archive/private_key_$(date +%Y%m%d).pem

# 6 个月后安全删除
shred -vfz -n 10 keys/archive/private_key_*.pem
```

### OAuth 客户端密钥轮换（180 天周期）

```sql
-- 生成新的客户端密钥
UPDATE oauth_clients
SET secret_hash = '<new_bcrypt_hash>',
    updated_at = NOW()
WHERE id = 'admin-portal-client';

-- 记录轮换审计日志
INSERT INTO audit_logs (user_id, action_type, resource_type, resource_id, created_at)
VALUES ('system', 'CLIENT_SECRET_ROTATED', 'oauth_client', 'admin-portal-client', NOW());
```

**⚠️ 重要**: 客户端密钥轮换后，必须立即更新客户端应用的配置并重启。

### 数据库加密密钥（365 天周期）

使用 KMS (Key Management Service) 管理：

```bash
# AWS KMS 示例
aws kms create-key --description "OAuth Service DB Encryption Key"

# 更新环境变量
export DB_ENCRYPTION_KEY_ID=<new_kms_key_id>

# 重新加密敏感数据列
-- 使用新密钥重新加密
```

### Session 加密密钥（30 天周期）

```bash
# 生成新的 session 密钥（256-bit）
openssl rand -base64 32 > session_key_new.txt

# 更新环境变量
kubectl set env deployment/oauth-service \
  SESSION_ENCRYPTION_KEY=$(cat session_key_new.txt) \
  -n oauth-system
```

### 密钥轮换检查清单

- [ ] 提前 7 天通知相关团队
- [ ] 备份当前密钥到安全位置
- [ ] 生成新密钥并验证有效性
- [ ] 更新 Kubernetes Secret / 环境变量
- [ ] 重启服务并验证功能正常
- [ ] 监控错误日志（验证失败）
- [ ] 7 天双密钥并存期无异常后删除旧密钥
- [ ] 记录密钥轮换审计日志
- [ ] 归档旧密钥（标记销毁日期）
```

---

#### D3: 缺少健康检查端点的详细说明（中等严重性）

**位置**: 4-API_REFERENCE.md vs 5-DEPLOYMENT.md

**问题描述**:
- **5-DEPLOYMENT.md** 第 278-300 行提到健康检查端点 `/health`
- **4-API_REFERENCE.md** 完全缺失 `/health` 端点的文档

**影响**:
- 运维人员不知道健康检查的详细信息
- 监控系统无法正确配置
- 故障诊断困难

**建议补充**: 在 4-API_REFERENCE.md 增加健康检查端点文档

```markdown
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
```

---

### 类别 E: 过时内容

#### E1: 数据库支持声明与实际实现不符（中等严重性）

**位置**: 1-REQUIREMENTS.md vs 3-DATABASE_DESIGN.md

**问题描述**:
- **1-REQUIREMENTS.md** 第 850 行:
  ```
  | 数据库 | SQLite (开发) / PostgreSQL/Supabase (生产) |
  ```

- **3-DATABASE_DESIGN.md** 第 6 行:
  ```
  **数据库支持**: SQLite (开发) / PostgreSQL (生产，推荐使用 Supabase)
  ```

- **5-DEPLOYMENT.md** 第 219-221 行:
  ```bash
  DATABASE_URL=sqlite:./oauth.db        # 开发
  # DATABASE_URL=postgresql://user:pass@host:5432/oauth_db  # 生产（自托管 PostgreSQL）
  # DATABASE_URL=postgresql://postgres.YOUR_PROJECT:PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres?sslmode=require  # Supabase 云数据库
  ```

**一致性**:
✅ 三处文档对数据库支持的描述一致，**无过时内容**

**但存在问题**: 数据库迁移脚本是否同时支持 SQLite 和 PostgreSQL？

**建议验证**:
检查 `apps/oauth-service-rust/migrations/` 目录中的 SQL 脚本是否使用了数据库无关的语法，避免：
- SQLite 特定语法：`AUTOINCREMENT`
- PostgreSQL 特定语法：`SERIAL`

建议使用 `sqlx-cli` 的跨数据库迁移功能：
```bash
sqlx migrate add --source migrations create_users_table
```

---

#### E2: API 版本号不统一（低严重性）

**位置**: 1-REQUIREMENTS.md vs 4-API_REFERENCE.md

**问题描述**:
- **1-REQUIREMENTS.md** 第 676-680 行:
  ```
  当前版本: v2
    ├─ /api/v2/oauth/... (当前版本，提供 12 个月支持)
  ```

- **4-API_REFERENCE.md** 第 4 行:
  ```
  **API 版本**: v2
  ```

**一致性**:
✅ API 版本号统一为 `v2`，**无过时内容**

但建议在所有文档中明确说明 v1 是否已弃用：

**建议补充**: 在 4-API_REFERENCE.md 增加版本历史

```markdown
## API 版本历史

| 版本 | 发布日期 | 状态 | 支持截止日期 |
|------|---------|------|------------|
| v2 | 2025-01-01 | 当前版本 | 2026-01-01 (至少) |
| v1 | 2024-01-01 | 已弃用 | 2025-06-01 |

**迁移指南**: [v1 → v2 迁移指南](./migrations/v1-to-v2.md)
```

---

## 第三部分：优先级排序和修复建议

### 优先级 P0（必须立即修复）

| 问题 | 类别 | 严重性 | 影响范围 | 修复工时 |
|------|------|--------|---------|---------|
| A2: Token 有效期不一致 | 技术错误 | 高 | 安全策略 | 10分钟 |
| B2: Admin Portal 角色定义矛盾 | 逻辑不一致 | 高 | 架构理解 | 1小时 |
| C1: 同意 API 未文档化 | 遗漏 | 高 | API 集成 | 2小时 |
| D2: 缺少密钥管理操作指南 | 遗漏 | 高 | 安全合规 | 3小时 |

**合计工时**: 约 6.5 小时

---

### 优先级 P1（应尽快修复）

| 问题 | 类别 | 严重性 | 影响范围 | 修复工时 |
|------|------|--------|---------|---------|
| A1: API 端点响应不一致 | 技术错误 | 中 | 客户端实现 | 30分钟 |
| A3: 数据库字段类型次优 | 技术错误 | 中 | 性能 | 1小时 |
| B1: 同意流程触发条件不清晰 | 逻辑不一致 | 中 | 功能配置 | 30分钟 |
| B3: 缓存失效策略缺失 | 逻辑不一致 | 中 | 权限准确性 | 1小时 |
| C2: 登录 API 参数说明不完整 | 遗漏 | 中 | API 使用 | 30分钟 |
| D1: 系统角色初始化缺失 | 遗漏 | 中 | 部署 | 2小时 |
| D3: 健康检查端点未文档化 | 遗漏 | 中 | 运维监控 | 1小时 |

**合计工时**: 约 6.5 小时

---

### 优先级 P2（可延后修复）

| 问题 | 类别 | 严重性 | 影响范围 | 修复工时 |
|------|------|--------|---------|---------|
| E1: 数据库迁移脚本验证 | 过时 | 低 | 跨数据库兼容性 | 2小时 |
| E2: API 版本历史补充 | 遗漏 | 低 | 版本管理 | 1小时 |

**合计工时**: 约 3 小时

---

### 总结

**总计发现问题**: 16 个
- P0（必须立即修复）: 4 个
- P1（应尽快修复）: 7 个
- P2（可延后修复）: 2 个
- 无问题（一致）: 3 个

**总修复工时估算**: 约 16 小时

**关键发现**:
1. **安全相关问题**: Token 有效期不一致（P0）、密钥管理缺失（P0）
2. **架构理解问题**: Admin Portal 角色定义矛盾（P0）
3. **文档完整性问题**: 同意 API 未文档化（P0）、健康检查未文档化（P1）
4. **运维风险**: 系统角色初始化缺失（P1）、密钥轮换无指南（P0）

**建议行动**:
1. **立即**: 修复所有 P0 问题（6.5 小时）
2. **本周内**: 修复所有 P1 问题（6.5 小时）
3. **下个迭代**: 修复 P2 问题（3 小时）
4. **持续**: 建立文档与代码同步的 CI 检查机制

---

## 附录：文档一致性检查矩阵

| 主题 | 1-REQ | 2-DESIGN | 3-DB | 4-API | 5-DEPLOY | 6-OPS | 7-TEST | 8-FLOWS | 00-ARCH | 一致性 |
|------|-------|----------|------|-------|----------|-------|--------|---------|---------|--------|
| Token 有效期 | 15min | - | - | 1hr❌ | - | - | - | 1hr❌ | - | ❌ 不一致 |
| Admin Portal 角色 | 客户端 | - | - | - | - | - | - | 客户端+UI❌ | 客户端+UI | ⚠️ 部分矛盾 |
| 同意 API | 提及 | - | - | 缺失❌ | - | - | - | 详细 | - | ❌ 文档缺失 |
| 系统角色 | 详细 | - | - | - | 缺失❌ | - | - | - | - | ❌ 初始化缺失 |
| 密钥轮换 | 策略 | - | - | - | - | 缺失❌ | - | - | - | ❌ 操作缺失 |
| PKCE | 强制 | 实现 | - | 描述 | - | - | 测试 | 详细 | - | ✅ 一致 |
| 权限缓存 TTL | 5min | 5min | - | - | - | - | - | - | - | ✅ 一致 |
| 数据库支持 | SQLite/PG | - | SQLite/PG | - | SQLite/PG | - | - | - | - | ✅ 一致 |

---

**报告完成日期**: 2025-11-21
**分析师**: Claude (Technical Writer Agent)
**下次审查**: 2025-12-21
**维护者**: 文档团队
