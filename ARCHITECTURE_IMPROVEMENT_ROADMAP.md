# 架构改进路线图 - 2025-11-29

## 核心原则

```
Admin Portal (UI 层)
    ├─ 前端 UX 验证（username/password required）
    ├─ 登录表单、同意表单
    └─ 错误提示、用户交互

OAuth Service (认证层)
    ├─ 完整的安全验证（bcrypt、权限检查）
    ├─ 登录/同意 API 端点
    └─ Token 生成、Cookie 设置

Pingora (网关层)
    ├─ 反向代理（路由转发）
    ├─ 基础日志（请求/响应）
    └─ 保持简洁，不增加复杂功能
```

---

## Phase 1 完成 ✅

### 1.1 Cookie Domain 显式配置 ✅
- **文件**: `apps/oauth-service-rust/src/routes/oauth.rs`
- **改动**: 从浏览器推断改为显式环境变量配置
- **状态**: 完成，编译通过
- **风险缓解**: P0 优先级 - 生产环境 Cookie 跨域失效

### 1.2 Pingora 请求日志 ✅
- **文件**: `apps/pingora-proxy/src/proxy/mod.rs`
- **改动**: 添加 RequestLogContext，记录完整的请求/响应信息
- **状态**: 完成，编译通过
- **收益**: 可观测性、性能监控、问题诊断

### 1.3 前后端验证配合 ✅
- **文件**: `apps/admin-portal/components/auth/username-password-form.tsx`
- **改动**: 保留前端 UX 验证（必填检查），后端完整验证（bcrypt、权限）
- **状态**: 完成，编译通过
- **模式**: 前端提供即时反馈，后端保证安全

---

## Phase 2 - 完善前端 UI（预计 3-4 小时）

### 2.1 整理登录页面 UI
**目标**: 确保登录表单完整、清晰、可用

**文件**:
- `apps/admin-portal/app/(auth)/login/page.tsx`
- `apps/admin-portal/components/auth/username-password-form.tsx`

**检查清单**:
- [ ] 登录表单显示清晰
- [ ] 错误提示准确（来自后端）
- [ ] 加载状态正确显示
- [ ] Cookie 正确设置并保存

### 2.2 创建同意页面 UI
**目标**: 实现 OAuth 2.1 标准的同意屏幕

**文件**:
- 新建: `apps/admin-portal/app/(auth)/oauth/consent/page.tsx`
- 新建: `apps/admin-portal/components/auth/consent-form.tsx`

**内容**:
```typescript
// consent-form.tsx
// - 显示应用名称、请求的权限
// - 提供"允许"和"拒绝"按钮
// - 调用 POST /api/v2/oauth/consent/submit 后端 API
```

**检查清单**:
- [ ] 同意页面显示客户端信息（应用名、权限）
- [ ] "允许"按钮调用后端同意 API
- [ ] "拒绝"按钮处理拒绝流程
- [ ] 样式与登录页面一致

---

## Phase 3 - 完善后端 API（预计 4-5 小时）

### 3.1 POST /api/v2/auth/login 端点
**文件**: `apps/oauth-service-rust/src/routes/oauth.rs:130-260`

**现状检查**:
- [x] 接收 username、password、redirect
- [x] 验证凭证（bcrypt）
- [x] 发放 Token
- [x] 设置 Cookie（已配置 COOKIE_DOMAIN）
- [x] 返回 redirect_url

**需要补充**:
- [ ] 明确的错误响应格式
- [ ] 速率限制（已实现）
- [ ] 日志记录

### 3.2 GET /oauth/consent 端点
**目标**: 渲染同意页面（由 Admin Portal 提供）

**预期行为**:
- 接收 OAuth 参数（client_id, redirect_uri, scope 等）
- 302 重定向到 Admin Portal `/oauth/consent?client_id=...&scope=...`
- 或直接返回同意页面 HTML（如果在 OAuth Service）

### 3.3 POST /api/v2/oauth/consent/submit 端点
**目标**: 处理用户的同意/拒绝决定

**预期行为**:
```
POST /api/v2/oauth/consent/submit
{
  "client_id": "admin-portal-client",
  "redirect_uri": "http://localhost:3002/auth/callback",
  "scope": "openid profile email",
  "approved": true  // or false
}

Response:
{
  "redirect_url": "http://localhost:6188/auth/callback?code=xxx&state=..."
}
```

**检查清单**:
- [ ] 生成 authorization code
- [ ] 保存 code（用于后续 token endpoint）
- [ ] 返回正确的 redirect_url

---

## Phase 4 - 路由与集成（预计 2-3 小时）

### 4.1 Pingora 路由配置
**文件**: `apps/pingora-proxy/config/default.yaml`

**路由规则** (优先级递减):
```yaml
routes:
  - path_prefix: '/api/v2/'
    backend: 'oauth-service-rust'
  - path_prefix: '/login'
    backend: 'admin-portal'
  - path_prefix: '/oauth/consent'
    backend: 'admin-portal'
  - path_prefix: '/'
    backend: 'admin-portal'  # 默认
```

**验证清单**:
- [ ] `/api/v2/auth/login` → OAuth Service
- [ ] `/api/v2/oauth/consent/submit` → OAuth Service
- [ ] `/login` → Admin Portal
- [ ] `/oauth/consent` → Admin Portal
- [ ] `/api/v2/users`, `/api/v2/health` 等 → OAuth Service

### 4.2 Admin Portal OAuth 客户端配置
**文件**: `apps/admin-portal/lib/oauth-client.ts` (或类似)

**检查清单**:
- [ ] OAuth 配置正确（client_id, redirect_uri, scope）
- [ ] Authorization flow 实现（PKCE）
- [ ] Token 交换逻辑
- [ ] 错误处理

---

## Phase 5 - 端到端测试（预计 2-3 小时）

### 5.1 完整登录流程测试
```bash
1. 访问 http://localhost:6188/login
2. 输入用户名和密码
3. 点击登录
   ✓ 前端验证（required check）
   ✓ 后端验证（bcrypt）
   ✓ 设置 Cookie（Domain=.localhost）
4. 重定向到 /oauth/consent
5. 查看权限并点击"允许"
6. 获得 authorization code
7. 重定向到 Admin Portal callback
8. 交换 code 为 token
```

### 5.2 错误场景测试
- [ ] 空用户名 → 前端提示
- [ ] 错误密码 → 后端返回 401，前端显示
- [ ] 无效 redirect_uri → 后端拒绝
- [ ] 拒绝权限 → 返回错误页面

### 5.3 Cookie 验证
```bash
curl -v http://localhost:6188/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123","redirect":""}'

# 检查响应头:
# Set-Cookie: session_token=xxx; Domain=.localhost; Path=/; HttpOnly; Secure; SameSite=Strict
```

---

## 总结

| 阶段 | 内容 | 优先级 | 时间 | 状态 |
|------|------|--------|------|------|
| Phase 1 | Cookie + 日志 + 验证调整 | P0/P1 | 1天 | ✅ 完成 |
| Phase 2 | Admin Portal UI 完善 | P1 | 3-4小时 | ⏳ 待执行 |
| Phase 3 | OAuth Service API 完善 | P1 | 4-5小时 | ⏳ 待执行 |
| Phase 4 | Pingora 路由 + 集成 | P1 | 2-3小时 | ⏳ 待执行 |
| Phase 5 | 端到端测试 | P1 | 2-3小时 | ⏳ 待执行 |

**总工作量**: 12-18 小时（1.5-2 周）
**预期目标**: 架构评分 9.0/10，达到生产就绪

---

## 关键原则再次强调

1. **Admin Portal = UI 层**
   - 前端验证（UX）
   - 渲染登录、同意页面
   - 处理用户交互

2. **OAuth Service = 认证层**
   - 完整验证（安全）
   - Token 管理
   - 权限检查

3. **Pingora = 网关层**
   - 反向代理
   - 基础日志
   - 不做业务逻辑

---

**更新时间**: 2025-11-29
**下一步**: Phase 2 - Admin Portal UI 完善
