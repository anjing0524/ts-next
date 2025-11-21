# OAuth 2.1 认证授权系统 - 需求文档

**文档版本**: 1.0
**最后更新**: 2025-11-20
**文档状态**: ✅ 生产就绪
**目标受众**: 产品经理、架构师、开发团队

---

## 目录

1. [执行摘要](#执行摘要)
2. [业务需求](#业务需求)
3. [功能需求](#功能需求)
4. [非功能需求](#非功能需求)
5. [约束条件](#约束条件)
6. [依赖关系](#依赖关系)
7. [成功标准](#成功标准)

---

## 执行摘要

### 项目目标

构建一个符合 **OAuth 2.1** 标准的企业级单点登录 (SSO) 和身份认证授权系统,为多个业务应用提供统一的认证和权限管理服务。

### 核心价值主张

| 价值 | 描述 |
|------|------|
| **统一认证** | 一次登录,多应用访问 |
| **集中授权** | 细粒度角色权限管理 |
| **合规审计** | 完整的操作审计日志 |
| **高可用** | 99.9% 系统可用性 SLA |
| **高性能** | <100ms p95 延迟 |

---

## 业务需求

### BR-001: 企业级SSO能力

**需求描述**
系统应提供企业级单点登录能力,支持多个业务应用集成,员工一次登录即可访问所有授权应用。

**业务背景**
当前各应用各自管理用户和认证,导致:
- 用户管理成本高
- 密码管理繁琐
- 安全性无法统一控制

**成功标准**
- 支持 50+ OAuth 客户端接入
- 单点登录成功率 99%+
- 新应用接入时间 < 2 小时

---

### BR-002: 细粒度权限控制

**需求描述**
支持基于角色的访问控制 (RBAC),实现细粒度的权限管理,精确到资源和操作级别。

**业务背景**
组织需要:
- 根据岗位不同授予不同权限
- 快速支持临时权限变更
- 追踪权限变更历史

**成功标准**
- 支持 100+ 角色定义
- 权限变更实时生效
- 权限检查延迟 < 20ms (缓存命中)

---

### BR-003: 合规和审计

**需求描述**
记录所有重要操作的审计日志,支持GDPR、SOX、HIPAA等法规的合规要求。

**业务背景**
- 监管机构要求完整的操作审计
- 需要能追溯人员权限变更
- 需要导出审计报告

**成功标准**
- 审计日志保留 2 年
- 支持审计日志导出
- 审计日志完整性 100%

---

## 功能需求

### FR-001: OAuth 2.1 授权码流程 (PKCE 强制)

**需求描述**
实现 OAuth 2.1 授权码流程,强制要求 PKCE (Proof Key for Code Exchange),防止授权码拦截攻击。

**功能规格**

```
用户流程:
1. 客户端生成 code_verifier (128字符随机字符串)
2. 计算 code_challenge = SHA256(code_verifier)
3. 重定向用户到 /authorize?code_challenge=xxx&code_challenge_method=S256
4. 用户登录并授权
5. 系统返回 authorization_code (10分钟有效期)
6. 客户端使用 code + code_verifier 交换 token
7. 系统验证: SHA256(code_verifier) == code_challenge
8. 返回 access_token (15分钟) + refresh_token (30天)
```

**验收标准**
- ✅ PKCE 验证必须强制执行
- ✅ 授权码单次使用
- ✅ 支持 openid, profile, email 标准 scope
- ✅ 返回 id_token (OIDC 兼容)

---

### FR-002: Token 生命周期管理

**需求描述**
完整的令牌生命周期管理,包括生成、刷新、撤销。

**详细需求**

| 令牌类型 | 有效期 | 可撤销 | 特征 |
|---------|--------|--------|------|
| **Access Token** | 15 分钟 | 是 | JWT, RS256 签名 |
| **Refresh Token** | 30 天 | 是 | UUID, 可旋转 |
| **Authorization Code** | 10 分钟 | 是 | 单次使用 |
| **Session Token** | 1 小时 | 是 | HttpOnly Cookie |

**验收标准**
- ✅ 支持 token 刷新不超过 100ms
- ✅ 支持 token 撤销 (RFC 7009)
- ✅ 支持 token 内省 (RFC 7662)
- ✅ 刷新时自动轮转 refresh token

---

### FR-003: 用户认证 (OAuth Service 完全掌控凭证验证)

**需求描述**
OAuth Service 作为唯一的认证中心，处理所有用户凭证验证和会话管理。Admin Portal 作为 OAuth 2.1 标准客户端应用，提供登录和权限同意的 Web UI，但完全不处理或验证用户凭证。

**架构核心原则**:

```
✅ 凭证验证：OAuth Service 完全掌控
   - 用户凭证只提交到 OAuth Service
   - OAuth Service 使用 bcrypt 验证密码
   - 凭证从不存储在 Admin Portal

✅ 会话管理：OAuth Service 完全掌控
   - Session token 由 OAuth Service 签发
   - Session token 存储在 HttpOnly Cookie
   - 浏览器自动携带，XSS 无法访问

✅ 权限授权：OAuth Service 完全掌控
   - OAuth Service 检查用户权限
   - OAuth Service 决定是否需要用户同意
   - OAuth Service 签发授权码和 Token

⚠️ 前端 UI：Admin Portal 提供
   - 为什么：Next.js 更适合构建现代 Web UI
   - 范围：仅提供表单界面，不做任何验证
   - 流程控制：完全由 OAuth Service 驱动
```

**认证完整流程**:

```
第一部分：用户访问 Admin Portal 作为管理应用
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 用户访问 Admin Portal (主要应用)
2. Admin Portal 检查 access_token (localStorage/cookie)
   ├─ 有有效 token → 直接加载 Dashboard
   └─ 无 token → 发起 OAuth 流程

第二部分：OAuth 2.1 授权流程
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. Admin Portal 生成 PKCE 参数 (code_verifier, code_challenge)
4. Admin Portal 重定向到：
   GET /api/v2/oauth/authorize?client_id=...&code_challenge=...

5. OAuth Service 验证请求参数
   - 检查 client_id, redirect_uri, scope, PKCE 格式
   - 检查 session_token cookie (用户是否已认证)

6. 如果用户未认证：
   a) OAuth Service 返回 302，重定向到：
      Admin Portal /login?redirect=<original_authorize_url>

   b) Admin Portal 显示登录表单
      - 仅提供 HTML 表单
      - 不进行任何凭证验证

   c) 用户输入 username 和 password

   d) 前端提交到：POST /api/v2/auth/login
      {
        "username": "admin",
        "password": "secret123",
        "redirect": "/api/v2/oauth/authorize?..."
      }

   e) OAuth Service 验证凭证：
      ✓ bcrypt::verify(password, stored_hash)
      ✓ 检查账户状态 (is_active, 未锁定)
      ✓ 更新 last_login_at
      ✓ 加载用户权限
      ✓ 签发 session_token (短期，1小时)

   f) 返回响应：
      {
        "success": true,
        "redirect_url": "/api/v2/oauth/authorize?..."
      }
      Set-Cookie: session_token=<jwt>; HttpOnly; Secure; SameSite=Lax

   g) Admin Portal 前端重定向到 redirect URL
      浏览器自动携带 session_token cookie

第三部分：权限授权（OAuth Service 继续处理）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. OAuth Service 继续处理 authorize 请求
   - 从 session_token 提取 user_id
   - 检查 require_consent 标志

8. 如果需要用户同意：
   a) 重定向到：
      Admin Portal /oauth/consent?client_id=...&scope=...

   b) Admin Portal 调用：GET /api/v2/oauth/consent/info
      获取：客户端信息、权限范围、当前用户

   c) Admin Portal 显示同意对话框 UI
      - 列出请求的权限范围
      - 显示当前登录用户
      - 提供"允许"和"拒绝"按钮

   d) 用户点击"允许"或"拒绝"

   e) Admin Portal 调用：POST /api/v2/oauth/consent/submit
      {
        "decision": "allow" | "deny",
        "client_id": "...",
        ...其他参数
      }

   f) OAuth Service 验证决定并响应：
      如果 allow:
        - 生成 authorization_code
        - 返回 redirect_uri?code=<code>&state=<state>
      如果 deny:
        - 返回 redirect_uri?error=access_denied&state=<state>

   g) Admin Portal 重定向到 redirect_uri

9. 如果不需要用户同意：
   a) OAuth Service 直接生成 authorization_code
   b) 重定向到 redirect_uri?code=<code>&state=<state>

第四部分：Token 交换
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
10. Admin Portal 接收授权码（/auth/callback）
    - 验证 state 参数 (CSRF 保护)
    - 调用：POST /api/v2/oauth/token
      {
        "grant_type": "authorization_code",
        "code": "<auth_code>",
        "code_verifier": "<stored_verifier>",
        "client_id": "admin-portal-client",
        "client_secret": "<secret>"
      }

11. OAuth Service 验证并签发 Token：
    - 验证授权码有效性
    - 验证 PKCE (SHA256(code_verifier) == code_challenge)
    - 加载用户权限
    - 签发 access_token (15分钟)
    - 签发 refresh_token (30天)
    - 签发 id_token (OIDC)

12. Admin Portal 存储 tokens 并重定向到 Dashboard
    - 已完成认证流程
```

**关键安全特性**:

| 特性 | 实现位置 | 保护目标 |
|------|---------|---------|
| **凭证验证** | OAuth Service | 密码安全 |
| **会话管理** | OAuth Service | Session 劫持 |
| **密码哈希** | bcrypt (cost=12) | 密码泄露 |
| **HttpOnly Cookie** | OAuth Service | XSS 攻击 |
| **PKCE** | OAuth Service | 授权码拦截 |
| **State 验证** | Admin Portal | CSRF 攻击 |
| **Token 轮转** | OAuth Service | Token 泄露 |

**用户密码规则**:
- 最小长度: 8 字符
- 必须包含: 大小写字母、数字、特殊字符
- 密码哈希: bcrypt (cost = 12)
- 密码过期: 90 天
- 账户锁定: 5 次连续失败登录后锁定 30 分钟

**验收标准**
- ✅ 用户凭证只发送到 OAuth Service，不经过 Admin Portal
- ✅ 凭证验证由 OAuth Service 完全掌控
- ✅ 登录延迟 < 200ms (包括页面加载)
- ✅ 支持账户锁定机制
- ✅ 支持密码重置流程
- ✅ 审计日志记录所有认证事件
- ✅ Admin Portal 无密码处理或验证代码

---

### FR-004: 角色和权限管理

**需求描述**
支持 RBAC (Role-Based Access Control) 模型,管理用户-角色-权限的三层映射。

**数据模型**

```
User (用户)
  ├─ has_many Roles (多个角色)
      ├─ Role (角色)
          ├─ has_many Permissions
              ├─ Permission (权限: resource:action)
                  ├─ users:list
                  ├─ users:create
                  ├─ users:update
                  ├─ users:delete
                  ├─ roles:manage
                  └─ ...
```

**权限命名规范**
格式: `<resource>:<action>`

常见权限:
- `users:list` - 列出用户
- `users:create` - 创建用户
- `users:read` - 读取用户详情
- `users:update` - 更新用户
- `users:delete` - 删除用户
- `roles:manage` - 管理角色
- `menu:system:user:view` - 查看用户管理菜单

**验收标准**
- ✅ 支持 100+ 角色
- ✅ 权限变更实时生效
- ✅ 权限检查缓存 5 分钟 (TTL)
- ✅ 权限缓存命中率 > 95%

---

### FR-005: OAuth 客户端管理

**需求描述**
管理第三方 OAuth 客户端,包括创建、配置、密钥管理。

**客户端类型**

| 类型 | 用途 | 示例 |
|------|------|------|
| **公开客户端** | 前端应用 | Admin Portal, 其他 SPA |
| **机密客户端** | 后端应用 | 微服务, API 网关 |

**客户端配置**

```
{
  "client_id": "admin-portal-client",
  "client_secret": "bcrypt_hashed_secret",
  "name": "Admin Portal",
  "description": "...",
  "owner_id": "user_uuid",
  "redirect_uris": [
    "http://localhost:6188/auth/callback",
    "https://admin.yourdomain.com/callback"
  ],
  "allowed_scopes": ["openid", "profile", "email"],
  "token_lifetime": 900,           // 15 分钟
  "refresh_token_lifetime": 2592000,  // 30 天
  "require_pkce": true,
  "require_consent": true,         // 是否需要用户同意授权
  "is_confidential": true,
  "is_active": true
}
```

**同意流程配置**

客户端可通过 `require_consent` 标志控制是否需要用户同意：
- `true`: 每次授权请求都显示同意页面
- `false`: 用户首次授权后自动批准（静默授权）

**默认值**: `true`（推荐）

**同意流程触发条件**:
- 用户已登录（有 session_token）
- OAuth Service 检查客户端配置的 `require_consent` 标志
- 如果 `require_consent=true`，重定向到 Admin Portal 的 `/oauth/consent` 页面

**验收标准**
- ✅ 支持 50+ 客户端
- ✅ 客户端密钥自动轮换
- ✅ redirect_uri 严格白名单检查

---

### FR-006: 审计日志

**需求描述**
记录所有重要操作的审计日志,包括用户认证、权限变更、资源操作等。

**审计日志记录**

```
{
  "id": "audit_uuid",
  "user_id": "user_uuid",
  "action_type": "USER_LOGIN|PERMISSION_GRANT|TOKEN_REVOKED",
  "resource_type": "user|role|permission|client|token",
  "resource_id": "resource_uuid",
  "changes": {
    "before": { ... },
    "after": { ... }
  },
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "status": "success|failure",
  "error_message": "...",
  "timestamp": "2025-11-20T10:30:00Z"
}
```

**验收标准**
- ✅ 所有认证事件记录
- ✅ 所有权限变更记录
- ✅ 日志保留 2 年
- ✅ 支持日志导出 (CSV/JSON)

---

### FR-007: Admin Portal - OAuth 客户端应用 + Web 前端

**需求描述**
Admin Portal 是本系统的 OAuth 2.1 客户端应用，同时也是主要的 Web 前端。它主要有两个职责：
1. **管理应用**: 提供用户、角色、权限、客户端等资源的管理界面
2. **前端代理**: 提供 OAuth 认证流程所需的登录和权限同意页面

**架构角色**

Admin Portal 的角色是一个标准的 OAuth 2.1 客户端，但由于技术选择，它同时提供了某些本应由 Authorization Server (OAuth Service) 提供的 UI 界面。

**主要职责**

| 职责 | 实现 | 说明 |
|------|------|------|
| **OAuth 2.1 客户端** | ✅ 标准实现 | 生成 PKCE、发起授权、交换 token |
| **Web 前端** | ✅ 完整实现 | 提供用户界面 |
| **凭证验证** | ❌ 不实现 | 完全由 OAuth Service 处理 |
| **会话管理** | ❌ 不实现 | 完全由 OAuth Service 处理 |
| **Token 签发** | ❌ 不实现 | 完全由 OAuth Service 处理 |

**功能模块**

### 1. 管理功能（需要 Admin 权限和有效 OAuth token）

| 功能 | 说明 | 权限 |
|------|------|------|
| **用户管理** | 创建、编辑、删除、禁用用户 | users:* |
| **角色管理** | 创建、编辑、删除角色，分配权限 | roles:* |
| **权限管理** | 查看权限列表，配置权限 | permissions:* |
| **客户端管理** | 创建、编辑、删除 OAuth 客户端 | clients:* |
| **审计日志** | 查看、搜索、导出审计日志 | audit:read |
| **Dashboard** | 系统概览、统计信息 | dashboard:view |

### 2. OAuth 认证流程中的前端页面（⚠️ 非标准实现）

| 页面 | 触发者 | 提供者 | 说明 |
|------|--------|--------|------|
| **/login** | OAuth Service | Admin Portal | 登录表单（仅 UI，不验证） |
| **/oauth/consent** | OAuth Service | Admin Portal | 权限同意对话框（仅 UI，不决策） |
| **/auth/callback** | OAuth 流程 | Admin Portal | 授权码回调处理 |

**非标准设计说明**:
- 标准 OAuth 2.1 中，登录和同意页面应由 Authorization Server（即 OAuth Service）提供
- 本系统中，这些 UI 由 Admin Portal 提供，但所有认证和授权逻辑仍由 OAuth Service 完全掌控
- 原因：Next.js 更适合构建现代 Web UI，详见 [00-ARCHITECTURE_DECISION.md](./00-ARCHITECTURE_DECISION.md)
- 安全保证：用户凭证直接发送给 OAuth Service，Admin Portal 不处理或验证凭证

**技术栈**
- 框架: Next.js 16 (App Router)
- UI 库: React 19 + Tailwind CSS 4 + shadcn/ui
- 状态管理: TanStack Query (Server State) + Zustand (Client State)
- 测试: Playwright (E2E) + Jest (单元测试)
- OAuth 实现: 自定义 PKCE 客户端（无外部依赖）
- HTTP 客户端: 原生 fetch + 自定义拦截器

**页面架构**

```
App
├── (auth)/login
│   └── 登录表单 (OAuth Service 驱动)
│       ├── username 输入
│       ├── password 输入
│       └── 提交到 OAuth Service
│
├── (dashboard)/
│   ├── dashboard
│   │   └── 系统概览
│   ├── users/
│   │   ├── list
│   │   ├── create
│   │   └── [id]/edit
│   ├── roles/
│   │   ├── list
│   │   ├── create
│   │   └── [id]/edit
│   ├── permissions/
│   │   └── list
│   ├── clients/
│   │   ├── list
│   │   ├── create
│   │   └── [id]/edit
│   └── audit/
│       └── logs
│
├── oauth/consent
│   └── 权限同意对话框 (OAuth Service 驱动)
│       ├── 客户端信息
│       ├── 权限范围列表
│       ├── 当前用户信息
│       └── 允许/拒绝按钮
│
└── unauthorized
    └── 权限不足页面
```

**验收标准**

### 性能
- ✅ API 响应时间 < 100ms (p95)
- ✅ 页面加载时间 < 2s (首屏)
- ✅ 交互响应 < 200ms

### 功能
- ✅ 支持完整的 RBAC 权限检查
- ✅ 支持 OAuth 2.1 标准流程（强制 PKCE）
- ✅ 支持登录、权限同意、token 交换
- ✅ 支持 token 自动刷新

### 质量
- ✅ 100% TypeScript 类型安全
- ✅ E2E 测试覆盖率 > 80%
- ✅ 单元测试覆盖率 > 70%
- ✅ Zero known security issues (定期扫描)

### 安全
- ✅ 用户凭证不在 Admin Portal 中处理
- ✅ HTTPS 强制（生产环境）
- ✅ CORS 白名单配置
- ✅ CSP (Content Security Policy) 配置
- ✅ 审计日志完整记录

---

### FR-008: 灾难恢复和自动故障转移

**需求描述**
系统应支持自动故障转移和灾难恢复,确保 99.9% 可用性 SLA 的达成。

**功能规格**

```
故障转移流程:
1. 监控系统健康状态（心跳检测）
2. 自动检测故障节点（30秒内）
3. 自动切换到健康节点（< 15分钟 RTO）
4. 数据一致性检查（< 5分钟 RPO）
5. 故障恢复和告警通知
```

**恢复机制**
- ✅ 多副本部署（3+ 实例）
- ✅ 自动故障转移（基于 K8s Readiness/Liveness Probe）
- ✅ 数据库主从复制
- ✅ 定期备份（每 6 小时）
- ✅ 备份完整性验证

**验收标准**
- ✅ RTO < 15 分钟
- ✅ RPO < 5 分钟
- ✅ 无故障运行时间 > 30 天
- ✅ 月故障时间 < 43.2 分钟

---

### FR-009: 系统角色和权限定义矩阵

**需求描述**
明确定义 3 个系统角色的权限矩阵,确保权限模型的一致性和可维护性。

**系统角色定义**

| 角色 | ID | 目的 | 权限范围 |
|------|-----|------|---------|
| **Super Admin** | super_admin | 系统管理员 | 所有操作权限 |
| **Admin** | admin | 业务管理员 | 用户管理、角色管理、审计日志查看 |
| **User** | user | 普通用户 | 查看自己的信息、修改个人资料 |

**权限矩阵**

```
操作对象: users    roles    permissions  clients   audit_logs

super_admin:
  list           ✅        ✅            ✅         ✅        ✅
  create         ✅        ✅            ❌         ✅        ❌
  read           ✅        ✅            ✅         ✅        ✅
  update         ✅        ✅            ❌         ✅        ❌
  delete         ✅        ✅            ❌         ✅        ❌

admin:
  list           ✅        ✅            ✅         ✅        ✅
  create         ✅        ❌            ❌         ❌        ❌
  read           ✅        ✅            ✅         ✅        ✅
  update         ✅        ❌            ❌         ❌        ❌
  delete         ✅        ❌            ❌         ❌        ❌

user:
  list           ❌        ❌            ❌         ❌        ❌
  read-self      ✅        ❌            ❌         ❌        ❌
  update-self    ✅        ❌            ❌         ❌        ❌
  delete-self    ❌        ❌            ❌         ❌        ❌
```

**验收标准**
- ✅ 权限矩阵在代码中硬编码（constants/roles.ts）
- ✅ 系统角色无法被普通管理员删除
- ✅ 权限冲突检查机制
- ✅ 权限变更审计日志

---

### FR-010: 密钥管理策略

**需求描述**
完整的密钥生命周期管理,包括生成、存储、轮换和撤销。

**密钥类型和管理**

| 密钥类型 | 用途 | 生成方式 | 存储位置 | 轮换周期 |
|---------|------|---------|---------|---------|
| **JWT 签名密钥** | OAuth Token 签名 | RSA-2048 | 密钥管理系统 | 90 天 |
| **OAuth 客户端密钥** | 客户端认证 | bcrypt hash | 数据库加密列 | 180 天 |
| **数据库加密密钥** | 敏感数据加密 | KMS 生成 | AWS KMS 或类似 | 365 天 |
| **Session 加密密钥** | Cookie 加密 | 系统生成 | 环境变量/密钥管理 | 30 天 |

**密钥管理流程**

```
新密钥生成 → 阶段更新 → 验证功能 → 活跃密钥切换 → 旧密钥归档 → 销毁
   ↓                                              ↓
 KMS/安全模块                                  6个月后销毁
```

**验收标准**
- ✅ 密钥生成使用密码学安全的随机源
- ✅ 密钥存储加密，不允许明文存储
- ✅ 密钥访问需要授权和审计
- ✅ 密钥轮换无需停机（支持新旧密钥并存期）
- ✅ 密钥轮换和撤销的审计日志完整

---

### FR-011: API 版本管理和向后兼容性

**需求描述**
确保 API 的向后兼容性和版本管理,支持平滑的升级和过渡。

**版本管理策略**

```
当前版本: v2
  ├─ /api/v2/oauth/... (当前版本，提供 12 个月支持)
  │
升级时:
  ├─ 发布 v3（新功能）
  ├─ v2 进入维护模式（只修复关键 bug，18 个月）
  └─ v2 弃用通知（提前 6 个月）

弃用时间线:
  T+0 个月: 发布 v3，公告 v2 弃用计划
  T+6 个月: v2 停止功能更新
  T+12 个月: v2 停止错误修复
  T+18 个月: v2 完全下线
```

**向后兼容性规则**

- ✅ 不删除已有的 API 端点，只添加新端点
- ✅ 不删除已有的字段，可添加可选字段
- ✅ 请求参数添加默认值以支持旧客户端
- ✅ 响应格式向后兼容（新字段在末尾，可选字段）
- ✅ 弃用 API 返回 `Deprecation` 和 `Sunset` HTTP 头

**验收标准**
- ✅ API 版本在 URL 路径中明确（/api/v2/）
- ✅ API 变更有 changelog 和迁移指南
- ✅ 弃用 API 提供 6+ 个月通知期
- ✅ 版本支持清单和生命周期表公开

---

### FR-012: 安全和合规补充需求

**需求描述**
补充安全和合规相关的具体需求。

**安全配置需求**

| 配置项 | 要求 | 验证 |
|--------|------|------|
| **TLS 版本** | 1.3+ 仅支持 | nmap 扫描 |
| **密码学套件** | 仅强密码套件（AES-GCM, ChaCha20） | testssl.sh |
| **HSTS** | max-age=31536000 (1 年) | HTTP 头检查 |
| **CSP** | 严格 CSP，无 unsafe 关键字 | CSP 验证工具 |
| **CORS** | 限制来源白名单，不允许通配符 | 跨域请求测试 |
| **安全头** | X-Content-Type-Options, X-Frame-Options, etc | 安全头检查工具 |

**数据加密需求**

- ✅ **传输层加密**: TLS 1.3+ 全站强制
- ✅ **存储层加密**: 敏感数据（密钥、密码、PII）加密存储
- ✅ **日志加密**: 审计日志加密存储和传输
- ✅ **备份加密**: 数据库备份加密

**合规需求**

| 标准 | 要求 | 目标 |
|------|------|------|
| **GDPR** | 数据导出、删除权利、隐私政策 | 2025 年 2 月前 |
| **SOX** | 审计日志、访问控制、变更管理 | 2025 年 3 月前 |
| **SOC 2 Type II** | 系统和组织控制 | 2025 年 12 月前 |

**验收标准**
- ✅ 渗透测试通过（OWASP Top 10 无发现）
- ✅ 依赖安全扫描通过（SNYK 评分 A）
- ✅ SAST 代码扫描通过（SonarQube A 级）
- ✅ 隐私政策和数据处理协议公开
- ✅ 合规自评表已填写

---

## 非功能需求

### NFR-001: 性能

**需求**

| 指标 | 目标值 |
|------|--------|
| API 响应延迟 (p95) | < 100ms |
| Token 生成时间 | < 50ms |
| 权限检查延迟 (缓存命中) | < 20ms |
| 系统吞吐量 | 10,000 TPS (tokens/sec) |
| 并发用户数 | 100,000+ |

**验收标准**
- ✅ 压力测试 (Locust) 验证
- ✅ APM 监控 (Prometheus)
- ✅ 日志记录 p50, p95, p99 延迟

---

### NFR-002: 可用性和可靠性

**需求**

| 指标 | 目标值 |
|------|--------|
| 系统可用性 | 99.9% (月 43.2 分钟宕机) |
| 恢复时间 (RTO) | < 15 分钟 |
| 恢复点目标 (RPO) | < 5 分钟 |
| 无故障运行时间 | > 30 天 |

**验收标准**
- ✅ 多副本部署 (3+ 实例)
- ✅ 自动故障转移
- ✅ 数据库主从复制
- ✅ 定期备份 (每 6 小时)

---

### NFR-003: 安全性

**需求**

| 特性 | 标准 |
|------|------|
| 传输加密 | TLS 1.3+ |
| 密钥交换 | ECDHE |
| 密码哈希 | bcrypt (cost 12) |
| JWT 签名 | RS256 (RSA-2048) |
| PKCE | 强制 S256 |
| CSRF 保护 | State 参数 + SameSite Cookie |
| XSS 保护 | HttpOnly + Secure Cookie |
| 速率限制 | 100 req/min per IP |

**验收标准**
- ✅ 渗透测试 (OWASP Top 10)
- ✅ 依赖安全审计 (SNYK)
- ✅ SAST 代码扫描
- ✅ SOC 2 Type II 认证 (目标 2025 年)

---

### NFR-004: 可扩展性

**需求**

- 水平扩展: 支持 3-10 个 OAuth Service 实例
- 数据库: 支持 100 万+ 用户记录
- 审计日志: 支持 10 亿+ 日志条目
- 令牌缓存: 支持 100 万+ 活跃令牌

**验收标准**
- ✅ 无状态服务设计 (可随意扩容)
- ✅ 数据库连接池化
- ✅ 多级缓存 (内存 + Redis)

---

### NFR-005: 可维护性

**需求**

- 代码覆盖率: > 80% (单元测试)
- 复杂度: McCabe < 10
- 文档完整性: 所有公开 API 都有文档
- 日志详细度: Debug、Info、Warn、Error 四级

**验收标准**
- ✅ SonarQube 评分 > A
- ✅ 文档与代码同步
- ✅ 技术债跟踪

---

## 约束条件

### 技术约束

| 约束 | 说明 |
|------|------|
| 后端语言 | Rust 1.70+ (性能、内存安全) |
| 前端框架 | Next.js 16 + React 19 |
| 数据库 | SQLite (开发) / PostgreSQL/Supabase (生产) |
| 缓存 | 内存缓存 (必须) / Redis (可选) |
| 代理 | Pingora (Rust 高性能代理) |

### 业务约束

| 约束 | 说明 |
|------|------|
| 部署方式 | Docker 容器 + Kubernetes 编排 |
| 成本 | 小型部署 < $100/月 (开发) |
| 上线时间 | 2025 年 1 月 (目标) |
| 支持的应用 | 50+ OAuth 客户端 |

---

## 依赖关系

### 外部依赖

```
┌─────────────────────────────────────────────┐
│   Third-party Applications (OAuth Clients)   │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │   OAuth 2.1 Service (Rust)   │
        ├──────────────────────────────┤
        │ - Token 签发和管理            │
        │ - 用户认证                    │
        │ - RBAC 权限检查              │
        └──────┬───────────┬────────────┘
               │           │
       ┌───────▼───┐  ┌────▼─────────┐
       │ SQLite DB │  │ Admin Portal  │
       │           │  │ (Next.js)     │
       └───────────┘  └────────────────┘
```

### 内部模块依赖

```
Admin Portal
  ├─ Auth Module
  │   └─ OAuth Service API Client
  │       └─ Token Management
  │           └─ Refresh Token Rotation
  ├─ User Management
  │   ├─ API Client
  │   └─ Permission Check (local RBAC)
  ├─ RBAC Module
  │   └─ Permission Cache
  └─ Audit Log Viewer
      └─ API Client
```

---

## 成功标准

### 定量指标

| 指标 | 目标 | 验证方法 |
|------|------|---------|
| 系统可用性 | 99.9% | 监控告警 |
| API p95 延迟 | < 100ms | APM 监控 |
| 登录成功率 | 99%+ | 日志分析 |
| 权限检查速度 | < 20ms (缓存) | 性能测试 |
| 代码覆盖率 | > 80% | Jest + Playwright |

### 定性指标

| 指标 | 说明 |
|------|------|
| 文档完整性 | 所有功能都有文档 |
| 开发体验 | 新开发者 1 周内上手 |
| 运维友好性 | 常见问题有 runbook |
| 用户反馈 | 用户满意度 > 4/5 |

---

---

## 目录更新

此文档现包含 **12 个功能需求** (FR-001 ~ FR-012)：
- FR-001 ~ FR-007: 原始功能需求
- **FR-008 ~ FR-012**: 新增补充需求（灾难恢复、系统角色、密钥管理、API版本管理、安全合规）

---

**文档版本**: 1.1 (更新于 2025-11-21)
**上次更新**: 2025-11-21
**下一次审查**: 2026-02-20
**维护者**: 架构团队

**更新说明**:
- 2025-11-21: 根据深度需求分析,补充了 5 个关键功能需求(FR-008~FR-012),涵盖灾难恢复、系统角色定义、密钥管理、API版本管理和安全合规
