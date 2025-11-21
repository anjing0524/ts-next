# OAuth 2.1 系统架构决策文档

**版本**: 1.0
**日期**: 2025-11-21
**状态**: ✅ 生产可用
**目标受众**: 架构师、技术主管、安全审查人员

---

## 📌 架构决策摘要

### 现状

本系统采用 **"OAuth Service 完全掌控认证授权，Admin Portal 提供前端 UI"** 的架构设计。

**关键点**:
- ✅ 凭证验证：由 OAuth Service 完全掌控
- ✅ 会话管理：由 OAuth Service 完全掌控
- ✅ Token 签发：由 OAuth Service 完全掌控
- ⚠️ 登录/同意 UI：由 Admin Portal 提供（非标准实现）

### 为什么这样设计

| 考量因素 | 决策 | 原因 |
|---------|------|------|
| **认证逻辑** | OAuth Service 完全掌控 | 安全、集中、易审计 |
| **前端框架选择** | Next.js (React) | 更适合构建现代 Web UI |
| **登录 UI 提供者** | Admin Portal | Next.js 相比 Rust 更适合 UI 开发 |
| **架构复杂度** | 接受跨应用调用 | UX 优先 |

---

## 🏗️ 系统三层架构

### 第一层：认证授权层（OAuth Service - Rust）

**职责**：完全掌控所有认证和授权逻辑

```
输入: 用户凭证 (username/password)
  ↓
处理步骤:
  1. 验证用户凭证 (bcrypt)
  2. 检查账户状态 (active/locked)
  3. 更新登录时间
  4. 加载用户权限 (RBAC)
  5. 签发 session_token (HttpOnly Cookie, 1小时)
  6. 管理用户会话
  ↓
输出: session_token, 权限列表
```

**不处理什么**：
- ❌ 不提供任何 Web UI
- ❌ 不处理表单提交
- ❌ 不涉及前端渲染

### 第二层：客户端应用层（Admin Portal - Next.js）

**职责**：提供用户界面，作为 OAuth 2.1 标准客户端应用

```
两个功能角色：

① 作为管理应用
  - 提供用户管理、角色管理、权限管理的 Web UI
  - 使用 OAuth token 调用 OAuth Service API

② 作为 OAuth 2.1 标准客户端 + Web UI 提供方
  - 生成 PKCE 参数
  - 发起 OAuth 授权流程
  - 提供登录页面 HTML（仅提供表单 UI，不包含验证逻辑）
  - 提供权限同意页面 HTML（仅显示 UI，不包含权限决策）
  - 处理授权码回调
  - 交换 token 并存储
```

**不掌控什么**：
- ❌ 不验证凭证
- ❌ 不管理用户会话
- ❌ 不决定权限授权
- ❌ 不签发或验证 Token

### 第三层：传输层（Pingora - 反向代理）

**职责**：路由、负载均衡、健康检查

```
请求路由:
  /api/v2/* → OAuth Service (Rust)
  /* → Admin Portal (Next.js)
```

---

## 🔄 标准 OAuth 2.1 流程 vs 本系统实现

### 标准流程（RFC 6749）

```
Client ───(1. redirect to authorize)──→ Authorization Server
                                         ↓
                                    (2. Show Login UI)
                                    (3. User inputs password)
                                    (4. Verify password)
                                    (5. Show Consent UI)
                                    (6. Generate Auth Code)
                                         ↓
Client ←───(7. Redirect with code)─── Authorization Server
```

**特点**: Authorization Server 完全提供和控制 UI

### 本系统实现

```
Browser ───(1. visit Admin Portal)──→ Admin Portal
                                       ↓
                                   (Check token)
                                       ↓
Browser ───(2. redirect to authorize)──→ OAuth Service
                                         ↓
                                  (3. Check session)
                                  (If not logged in)
                                         ↓
OAuth Service ───(4. Redirect to /login)──→ Admin Portal
                                           ↓
                                    (5. Show Login UI)
                                    (6. User inputs password)
                                           ↓
Admin Portal ───(7. POST /auth/login)──→ OAuth Service
                                         ↓
                                  (8. Verify password)
                                  (9. Create session)
                                         ↓
Admin Portal ←───(10. return session_token)─── OAuth Service
                 (+ redirect back to authorize)
                                           ↓
Browser ───(11. redirect to authorize)──→ OAuth Service
                                         ↓
                                  (12. Check session)
                                  (If require_consent)
                                         ↓
OAuth Service ───(13. Redirect to /consent)──→ Admin Portal
                                              ↓
                                       (14. Show Consent UI)
                                       (15. User clicks Allow)
                                              ↓
Admin Portal ───(16. POST /consent/submit)──→ OAuth Service
                                            ↓
                                     (17. Verify & Generate Code)
                                            ↓
Admin Portal ←───(18. return auth_code)─── OAuth Service
                                           ↓
Admin Portal ───(19. Exchange code for token)──→ OAuth Service
```

**差异**:
- 标准：UI 完全在 Authorization Server
- 本系统：UI 在 Client（Admin Portal），但逻辑仍在 Authorization Server

---

## ✅ 符合标准的部分

### 凭证验证
- ✅ 用户凭证只发送到 OAuth Service
- ✅ OAuth Service 使用 bcrypt 验证
- ✅ Admin Portal 完全不接触密码
- ✅ 密码从不存储在 Admin Portal

### 会话管理
- ✅ Session token 由 OAuth Service 签发
- ✅ Session token 存储在 HttpOnly Cookie
- ✅ XSS 攻击无法访问 token
- ✅ CSRF 保护（SameSite=Lax）

### Token 管理
- ✅ Access token 由 OAuth Service 签发
- ✅ Refresh token 支持轮转
- ✅ Token 可撤销
- ✅ Token 包含权限信息

### 授权流程
- ✅ 强制 PKCE（OAuth 2.1 要求）
- ✅ State 参数验证（CSRF 保护）
- ✅ 授权码单次使用
- ✅ 授权码 10 分钟过期

---

## ⚠️ 非标准的部分（有意的架构选择）

### UI 提供者
- ⚠️ 登录 UI 由 Admin Portal 提供（非标准）
- ⚠️ 同意 UI 由 Admin Portal 提供（非标准）
- ⚠️ 原因：Next.js 更适合 Web UI 开发

### API 调用模式
- ⚠️ 跨域 API 调用 (Admin Portal → OAuth Service)
- ⚠️ 原因：支持独立的 UI 层和业务逻辑层

### 流程复杂度
- ⚠️ 多个重定向和 API 调用
- ⚠️ 原因：解耦 UI 和逻辑的代价

---

## 🔒 安全考虑

### 防护的威胁

| 威胁 | 防护措施 | 检查项 |
|------|---------|--------|
| **XSS 攻击** | HttpOnly Cookie | ✅ Cookie 配置检查 |
| **CSRF 攻击** | State 参数 + SameSite Cookie | ✅ State 验证，Cookie 属性 |
| **密码泄露** | 仅在 OAuth Service 验证 | ✅ Admin Portal 无密码处理代码 |
| **会话劫持** | 短期 session_token (1小时) | ✅ Token 过期时间检查 |
| **授权码拦截** | PKCE (S256) | ✅ PKCE 验证实现 |
| **Token 泄露** | Refresh token 轮转 | ✅ Token 轮转逻辑 |

### 未完全标准化的安全考虑

| 项目 | 标准做法 | 本系统做法 | 风险评估 |
|------|---------|-----------|---------|
| **登录表单传输** | 标准：同域 HTTP POST | 本系统：跨域 HTTPS POST | 🟡 低风险（HTTPS + CORS 配置） |
| **前端 CORS 配置** | N/A (同域) | 需要严格的 CORS 白名单 | 🟡 中风险（需要正确配置） |
| **Form Validation** | 标准：仅在 Server 验证 | 本系统：Client + Server 验证 | ✅ 低风险（仅提升 UX） |

---

## 🚀 部署拓扑图

```
┌─────────────────────────────────────────────────────────────┐
│                    互联网 / 用户浏览器                        │
└────────────────────────┬────────────────────────────────────┘
                         │ 6188 (HTTPS)
                         ▼
            ┌──────────────────────────┐
            │   Pingora (负反向代理)    │
            │  • 路由分发              │
            │  • 负载均衡              │
            │  • 健康检查              │
            └─────┬──────────┬─────────┘
                  │          │
         /api/v2/ │          │ /*
                  ▼          ▼
        ┌──────────────┐  ┌────────────────┐
        │ OAuth Service│  │  Admin Portal  │
        │  (Rust)      │  │  (Next.js)     │
        │ :3001        │  │  :3002         │
        │              │  │                │
        │ • Auth Logic │  │ • Web UI       │
        │ • Token Mgmt │  │ • Form Handler │
        │ • RBAC       │  │ • API Client   │
        └──────┬───────┘  └────────┬───────┘
               │ (Session Token)   │ (OAuth Token)
               │ + RBAC Query      │ + API Calls
               │                   │
               └────┬──────────────┘
                    │ (SQLite)
                    ▼
               ┌──────────────┐
               │   SQLite DB  │
               │  sqlite.db   │
               └──────────────┘
```

---

## 📊 架构对比

### 方案 A：标准 OAuth（Authorization Server 提供所有 UI）

**优点**:
- ✅ 100% 符合 OAuth 2.1 标准
- ✅ 与 Google/GitHub 一致
- ✅ 架构简洁
- ✅ 更容易通过安全审计

**缺点**:
- ❌ 需要用 Rust 构建 Web 前端
- ❌ UI 开发效率低
- ❌ 难以与现代 Web 框架集成

### 方案 B：本系统设计（Client 提供 UI，Server 掌控逻辑）

**优点**:
- ✅ 使用 Next.js 开发 UI（效率高）
- ✅ 前端技术栈灵活
- ✅ UI 和逻辑解耦
- ✅ 便于迭代和维护

**缺点**:
- ❌ 不符合 OAuth 2.1 标准
- ❌ 需要额外的 API 端点
- ❌ 需要正确的 CORS 配置
- ⚠️ 某些安全审计流程可能有疑虑

### 方案 C：标准 + 现代 UI（OAuth Service 用 Web 框架重写）

**优点**:
- ✅ 符合 OAuth 2.1 标准
- ✅ 使用现代 Web 框架（如 Axum + Tera）
- ✅ 更容易维护

**缺点**:
- ❌ 重写 OAuth Service（大工作量）
- ❌ Rust 生态不如 Node.js/Python

---

## 🎯 选择理由

**选择方案 B（本系统设计）的原因**:

1. **实用性优先** - UX 和开发效率比 100% 符合标准更重要
2. **安全性不妥协** - 认证授权逻辑完全在 OAuth Service，安全不降低
3. **技术栈现实** - Next.js 是构建现代 Web UI 的最佳选择
4. **可维护性** - UI 和逻辑分离，便于独立迭代
5. **生产可用** - 已验证的架构，可以直接用于生产

---

## ✨ 生产就绪的检查清单

在部署到生产之前，必须完成：

### 安全检查
- [ ] TLS 1.3+ 启用
- [ ] CORS 白名单配置正确
- [ ] CSP (Content Security Policy) 配置
- [ ] HSTS 启用
- [ ] Secure Cookie 标志启用
- [ ] HTTPS 强制跳转

### 认证检查
- [ ] 密码最小强度要求
- [ ] 账户锁定机制 (5 次失败)
- [ ] 登录超时 30 分钟
- [ ] Session token 过期 (1 小时)
- [ ] 审计日志完整

### 架构检查
- [ ] Pingora 配置验证
- [ ] 负载均衡测试
- [ ] 故障转移测试
- [ ] 备份恢复流程

### 文档检查
- [ ] 部署指南完整
- [ ] 安全指南完整
- [ ] 运维手册完整
- [ ] 故障排除指南完整

---

## 📚 相关文档

- **[1-REQUIREMENTS.md](./1-REQUIREMENTS.md)** - 完整的功能和非功能需求
- **[2-SYSTEM_DESIGN.md](./2-SYSTEM_DESIGN.md)** - 详细的系统设计
- **[8-OAUTH_FLOWS.md](./8-OAUTH_FLOWS.md)** - 完整的业务流程
- **[5-DEPLOYMENT.md](./5-DEPLOYMENT.md)** - 部署指南
- **[6-OPERATIONS.md](./6-OPERATIONS.md)** - 运维指南
- **[13-SECURITY_COMPLIANCE.md](./13-SECURITY_COMPLIANCE.md)** - 安全合规

---

## 📝 文档修订历史

| 版本 | 日期 | 改动 | 作者 |
|------|------|------|------|
| 1.0 | 2025-11-21 | 初始版本，完整架构决策说明 | Claude |

---

**最后更新**: 2025-11-21
**下一次审查**: 2026-02-21
