# OAuth 2.1 标准流程快速参考

**创建日期**: 2025-11-21
**用途**: 快速查阅 OAuth 2.1 标准和本系统实现的关键差异

---

## TL;DR - 核心要点

### OAuth 2.1 标准规定

```
✅ Authorization Server 的职责:
   1. 提供登录页面
   2. 验证用户凭证
   3. 提供同意页面
   4. 签发授权码
   5. 签发 Token

❌ Client 不应该:
   1. 显示登录页面
   2. 收集用户凭证
   3. 验证用户密码
   4. 显示同意页面
```

### 本系统实现

```
✅ 符合标准的部分:
   - OAuth Service 验证所有凭证
   - OAuth Service 控制所有流程
   - OAuth Service 签发所有 Token
   - 强制 PKCE

⚠️ 不符合标准的部分:
   - Admin Portal 托管登录页面 UI
   - Admin Portal 托管同意页面 UI
   - 需要跨域 API 调用
```

---

## 标准授权码流程 (RFC 6749)

### 步骤概览

```
1. Client 重定向用户到 Authorization Server
   ↓
2. Authorization Server 显示登录页面 ✅
   (用户在 Authorization Server 的页面上输入凭证)
   ↓
3. Authorization Server 验证凭证 ✅
   ↓
4. Authorization Server 显示同意页面 ✅
   ↓
5. Authorization Server 生成授权码 ✅
   ↓
6. 重定向回 Client (带授权码)
   ↓
7. Client 交换授权码为 Token
```

**关键点**: 步骤 2-5 完全在 Authorization Server 内部，Client 不参与。

---

## 登录页面：谁提供？谁控制？

### 标准答案 (RFC 6749)

| 问题 | 答案 | 引用 |
|------|------|------|
| **登录页面由谁提供？** | Authorization Server | RFC 6749, Section 3.1 |
| **登录表单提交到哪里？** | Authorization Server | RFC 6749, Section 3.1 |
| **谁验证用户凭证？** | Authorization Server | RFC 6749, Section 3.1 |
| **谁管理用户会话？** | Authorization Server | - |
| **Client 是否参与？** | ❌ 不参与 | RFC 6749, Section 1.2 |

### 业界实践

| 提供商 | 登录页面域名 | Client 是否参与 |
|-------|-------------|----------------|
| **Google** | accounts.google.com | ❌ 否 |
| **GitHub** | github.com | ❌ 否 |
| **Microsoft** | login.microsoftonline.com | ❌ 否 |
| **Auth0** | tenant.auth0.com | ❌ 否 |
| **Okta** | tenant.okta.com | ❌ 否 |

**结论**: 100% 的主流 OAuth 提供商由 Authorization Server 提供登录页面。

---

## 同意页面：谁提供？谁控制?

### 标准答案 (RFC 6749)

| 问题 | 答案 | 引用 |
|------|------|------|
| **同意页面由谁提供？** | Authorization Server | RFC 6749, Section 3.1.2.4 |
| **权限列表由谁生成？** | Authorization Server | RFC 6749, Section 3.3 |
| **用户决定提交到哪里？** | Authorization Server | RFC 6749, Section 3.1 |
| **谁生成授权码？** | Authorization Server | RFC 6749, Section 4.1.2 |
| **Client 是否参与？** | ❌ 不参与 | RFC 6749, Section 1.2 |

### 业界实践

所有主流提供商（Google, GitHub, Auth0 等）都由 Authorization Server 提供同意页面。

---

## 本系统 vs 标准对比

### 登录流程对比

#### 标准流程

```
1. Client 重定向到 /authorize
   ↓
2. Authorization Server 检测未登录
   ↓
3. Authorization Server 显示登录页面 (自己的 HTML)
   ↓
4. 用户输入凭证，提交到 Authorization Server
   ↓
5. Authorization Server 验证凭证
```

#### 本系统流程

```
1. Client 重定向到 /authorize
   ↓
2. OAuth Service 检测未登录
   ↓
3. OAuth Service 重定向到 Admin Portal /login ⚠️
   ↓
4. Admin Portal 显示登录表单 ⚠️
   ↓
5. 用户输入凭证，Admin Portal 前端提交到 OAuth Service API ⚠️
   ↓
6. OAuth Service 验证凭证 ✅
```

**差异**:
- ⚠️ 步骤 3-5: Admin Portal 参与了 UI 显示（非标准）
- ✅ 步骤 6: 凭证验证仍由 OAuth Service 执行（符合标准）

---

### 同意流程对比

#### 标准流程

```
1. Authorization Server 检查需要同意
   ↓
2. Authorization Server 显示同意页面 (自己的 HTML)
   ↓
3. 用户选择"允许"或"拒绝"，提交到 Authorization Server
   ↓
4. Authorization Server 生成授权码
```

#### 本系统流程

```
1. OAuth Service 检查需要同意
   ↓
2. OAuth Service 重定向到 Admin Portal /oauth/consent ⚠️
   ↓
3. Admin Portal 调用 /consent/info 获取权限信息 ⚠️
   ↓
4. Admin Portal 显示同意对话框 ⚠️
   ↓
5. 用户选择"允许"，Admin Portal 前端提交到 /consent/submit ⚠️
   ↓
6. OAuth Service 生成授权码 ✅
```

**差异**:
- ⚠️ 步骤 2-5: Admin Portal 参与了 UI 显示（非标准）
- ✅ 步骤 6: 授权码生成仍由 OAuth Service 执行（符合标准）

---

## Authorization Server vs Client 职责边界

### 标准职责矩阵

| 职责 | Authorization Server | Client |
|------|---------------------|--------|
| **提供登录 UI** | ✅ 是 | ❌ 否 |
| **验证用户凭证** | ✅ 是 | ❌ 否 |
| **管理用户会话** | ✅ 是 | ❌ 否 |
| **提供同意 UI** | ✅ 是 | ❌ 否 |
| **生成授权码** | ✅ 是 | ❌ 否 |
| **签发 Token** | ✅ 是 | ❌ 否 |
| **生成 PKCE** | ❌ 否 | ✅ 是 |
| **发起授权请求** | ❌ 否 | ✅ 是 |
| **交换 Token** | ❌ 否 | ✅ 是 |
| **存储 Token** | ❌ 否 | ✅ 是 |
| **使用 Token** | ❌ 否 | ✅ 是 |

### 本系统实际职责

| 职责 | OAuth Service | Admin Portal |
|------|--------------|--------------|
| **提供登录 UI** | ❌ 否 | ⚠️ 是 (非标准) |
| **验证用户凭证** | ✅ 是 | ❌ 否 |
| **管理用户会话** | ✅ 是 | ❌ 否 |
| **提供同意 UI** | ❌ 否 | ⚠️ 是 (非标准) |
| **生成授权码** | ✅ 是 | ❌ 否 |
| **签发 Token** | ✅ 是 | ❌ 否 |
| **生成 PKCE** | ❌ 否 | ✅ 是 |
| **发起授权请求** | ❌ 否 | ✅ 是 |
| **交换 Token** | ❌ 否 | ✅ 是 |
| **存储 Token** | ❌ 否 | ✅ 是 |
| **使用 Token** | ❌ 否 | ✅ 是 |

---

## 为什么标准要求 Authorization Server 提供 UI？

### 安全原因

1. **凭证隔离** (Credential Isolation)
   - 用户凭证只发送到一个受信任的域
   - 避免凭证在多个系统间传递
   - 减少凭证泄露的攻击面

2. **单点信任** (Single Point of Trust)
   - 用户只需信任一个登录页面
   - 减少钓鱼攻击的可能性
   - 用户可识别熟悉的登录页面

3. **无跨域需求** (No Cross-Origin Requests)
   - 登录表单直接提交到同域
   - 不需要 CORS 配置
   - 避免 CORS 相关的安全风险

4. **会话管理一致性** (Consistent Session Management)
   - 登录状态由一个系统管理
   - 避免会话同步问题
   - 简化 SSO 实现

---

## 本系统架构的优劣势

### 优势

| 优势 | 说明 |
|------|------|
| **UI 灵活性** | Admin Portal 可独立更新登录和同意页面 |
| **前端技术栈解耦** | OAuth Service (Rust) 不需要前端代码 |
| **开发效率** | 前端团队可独立迭代 |
| **符合核心安全** | 凭证验证仍由 OAuth Service 执行 |

### 劣势

| 劣势 | 缓解措施 |
|------|---------|
| **不符合标准** | 文档说明架构选择 |
| **需要 CORS** | 严格配置 CORS 白名单 |
| **跨域安全风险** | 强制 HTTPS + CSRF token |
| **架构复杂** | 明确 API 契约 |
| **难以扩展到多 Client** | 提供共享 UI 组件库 |

---

## 何时可以使用"客户端提供 UI"模式？

> **定义**: "客户端提供 UI" 模式 = Client 应用提供登录和同意页面，而不是 Authorization Server 提供。
>
> **本系统**: 我们采用了这种非标准的模式。详细的设计决策和理由见 [00-ARCHITECTURE_DECISION.md](./00-ARCHITECTURE_DECISION.md)。

### 适用场景

✅ **可以考虑** 客户端提供 UI 的情况:

1. **企业内部系统**
   - 所有系统都在同一企业内
   - 用户只访问企业内部的应用
   - 可以控制所有 Client 的实现

2. **单一 Client**
   - 只有一个 Client 应用
   - Client 和 Authorization Server 由同一团队维护
   - 不打算支持第三方 Client

3. **极强的 UI 定制需求**
   - 需要为每个 Client 定制完全不同的登录页面
   - Authorization Server 无法提供足够的 UI 灵活性

### 不适用场景

❌ **不应该** 使用客户端提供 UI 模式的情况:

1. **公开的 OAuth 服务**
   - 需要支持第三方开发者
   - 需要符合业界标准
   - 需要通过安全审计

2. **多个独立 Client**
   - 有多个独立团队开发的 Client
   - Client 和 Authorization Server 不在同一组织
   - 需要确保一致的安全实践

3. **高安全要求**
   - 金融、医疗等高风险行业
   - 需要通过 SOC 2, ISO 27001 等认证
   - 需要最小化攻击面

---

## 改进建议

### 短期改进 (保持当前架构)

1. ✅ **强化安全**
   ```
   - 强制 HTTPS (生产环境)
   - 配置严格的 CORS 白名单
   - 使用 CSRF token 保护所有表单
   - 实施 CSP (Content Security Policy)
   ```

2. ✅ **完善文档**
   ```
   - 说明架构选择的原因
   - 列出所有安全措施
   - 提供迁移到标准模式的路径
   ```

3. ✅ **监控和审计**
   ```
   - 记录所有登录尝试
   - 监控异常的 API 调用
   - 定期安全审计
   ```

### 长期改进 (迁移到标准模式)

1. 🎯 **在 OAuth Service 中实现登录页面**
   ```rust
   // 使用 Rust 模板引擎
   GET  /login    → 返回登录页面 HTML (Tera/Handlebars)
   POST /login    → 处理登录表单提交
   GET  /consent  → 返回同意页面 HTML
   POST /consent  → 处理同意表单提交
   ```

2. 🎯 **移除 Admin Portal 的 UI 提供功能**
   ```
   - 删除 /login 页面（改在 OAuth Service 实现）
   - 删除 /oauth/consent 页面（改在 OAuth Service 实现）
   - 删除 /consent/info 和 /consent/submit API（改在 OAuth Service 实现）
   ```

3. 🎯 **简化架构**
   ```
   - 减少跨域 API 调用
   - 移除 CORS 配置
   - 统一在 OAuth Service 管理认证 UI
   ```

---

## 快速决策树

```
问：我应该在哪里放登录页面？
  ├─ 这是公开的 OAuth 服务吗？
  │   └─ 是 → Authorization Server (标准模式)
  │
  ├─ 需要支持多个第三方 Client 吗？
  │   └─ 是 → Authorization Server (标准模式)
  │
  ├─ 需要通过安全认证吗？
  │   └─ 是 → Authorization Server (标准模式)
  │
  ├─ 只有一个内部 Client，且需要极强的 UI 定制？
  │   └─ 是 → 可以考虑客户端提供 UI 模式（需完整文档说明和架构设计）
  │
  └─ 不确定？
      └─ → Authorization Server (标准模式，最安全)
```

---

## 参考资料

### 必读

1. **RFC 6749** - OAuth 2.0 Authorization Framework
   - Section 3.1: Authorization Endpoint
   - Section 4.1: Authorization Code Grant

2. **OAuth 2.1** - Simplified and Consolidated
   - https://oauth.net/2.1/

### 业界示例

1. **Google OAuth 2.0**
   - 登录页面: https://accounts.google.com
   - 文档: https://developers.google.com/identity/protocols/oauth2

2. **GitHub OAuth**
   - 登录页面: https://github.com/login
   - 文档: https://docs.github.com/en/developers/apps/building-oauth-apps

3. **Auth0**
   - Universal Login: https://auth0.com/docs/authenticate/login/auth0-universal-login

---

**创建日期**: 2025-11-21
**维护者**: 架构团队
**用途**: 快速查阅参考
