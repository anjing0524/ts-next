# OAuth Consent API 验证报告

**验证时间**: 2025-11-20
**验证范围**: /oauth/consent API 实现确认

---

## 🔍 检查发现

### 问题 1: adminApi 导出缺失

**代码位置**: `/apps/admin-portal/app/oauth/consent/page.tsx` (第 14 行)

```typescript
import { apiRequest, adminApi } from '@/lib/api';
```

**检查结果**:
- ❌ `adminApi` 在 `/apps/admin-portal/lib/api/index.ts` 中**未导出**
- ✅ `apiRequest` 是通过 `api-client-consolidated.ts` 导出的
- ❌ consent 页面第 153 行调用 `adminApi.submitConsent(...)` 会导致**编译错误**

---

### 问题 2: /oauth/consent API 实现位置不明确

**使用位置**:
1. consent 页面第 69 行: `apiRequest<{ data: ConsentApiData }>('/oauth/consent?...')`
2. consent 页面第 153 行: `adminApi.submitConsent(action, consentParams)`

**检查结果**:
- ❌ OAuth Service 中**没有** `/api/v2/oauth/consent` 端点
- ❌ Admin Portal 中**没有** `/api/oauth/consent` 端点或路由
- ❌ API 调用的目标不明确（应该路由到哪里）

---

## 📊 架构分析

根据 Pingora 代理配置，请求应该按如下方式路由：

```
Admin Portal 请求
    ↓
Pingora 代理 (localhost:6188)
    ↓
规则匹配：
  - 如果路径是 /api/v2/* → 转发到 OAuth Service (localhost:3001)
  - 否则 → 转发到 Admin Portal (localhost:3002)
```

因此：
- `/oauth/consent` 应该在 Admin Portal 中实现（不以 /api/v2 开头）
- **但代码中没有找到实现**

---

## 🛠️ 修复建议

### 选项 A: 在 OAuth Service 中实现 (推荐)

**优点**:
- OAuth Service 掌控授权逻辑
- 安全性更高（凭证验证由 OAuth Service 完成）
- 符合"去中心化"原则

**实现位置**: `/apps/oauth-service-rust/src/routes/oauth.rs` 或新建 `consent.rs`

```rust
pub async fn get_consent_info(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Query(params): Query<ConsentParams>,
) -> Result<Json<ConsentInfoResponse>, AppError> {
    // 1. 验证用户是否已认证（检查 session_token）
    let user_id = extract_user_id_from_request(&state, &jar, &headers).await?;

    // 2. 验证客户端信息
    let client = state.client_service.find_by_client_id(&params.client_id).await?;

    // 3. 获取用户权限信息
    let permissions = state.rbac_service.get_user_permissions(&user_id).await?;

    // 4. 构建同意信息响应
    Ok(Json(ConsentInfoResponse {
        client,
        requested_scopes,
        user: /* user info */,
        // ...
    }))
}

pub async fn submit_consent(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(request): Json<ConsentRequest>,
) -> Result<Json<ConsentResponse>, AppError> {
    // 1. 验证用户
    let user_id = extract_user_id_from_request(&state, &jar, &headers).await?;

    // 2. 处理同意决定
    if request.decision == "deny" {
        // 返回拒绝响应
        return Ok(Json(ConsentResponse {
            redirect_uri: format!(
                "{}?error=access_denied",
                request.redirect_uri
            ),
        }));
    }

    // 3. 生成授权码（标准 OAuth 流程）
    let auth_code = state.auth_code_service.create_auth_code(...).await?;

    // 4. 返回重定向 URI
    Ok(Json(ConsentResponse {
        redirect_uri: format!(
            "{}?code={}&state={}",
            request.redirect_uri, auth_code, request.state
        ),
    }))
}
```

**路由注册**: 在 `app.rs` 中添加：
```rust
.route("/api/v2/oauth/consent/info", get(routes::oauth::get_consent_info))
.route("/api/v2/oauth/consent/submit", post(routes::oauth::submit_consent))
```

### 选项 B: 在 Admin Portal 中实现

**优点**:
- Admin Portal 可以自定义同意界面

**缺点**:
- Admin Portal 需要查询 OAuth Service 获取客户端信息
- 权限逻辑变得复杂
- 不符合去中心化原则

---

## ✅ 修复步骤

### Step 1: 修复 Admin Portal 的导出

在 `/apps/admin-portal/lib/api/index.ts` 中添加：

```typescript
// 导出 adminApi 工具函数集合
export const adminApi = {
  async submitConsent(action: 'allow' | 'deny', params: URLSearchParams) {
    const response = await fetch(`/api/v2/oauth/consent/submit`, {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(params)),
      // ...
    });
    return response.json();
  },
};

// 导出通用 apiRequest 函数（已存在，确认导出）
export const apiRequest = APIClientImpl.request;
```

### Step 2: 实现 OAuth Service 的 consent 端点 (推荐)

在 OAuth Service 中实现 `/api/v2/oauth/consent/info` 和 `/api/v2/oauth/consent/submit`

### Step 3: 更新 consent 页面的导入（如果使用选项 A）

```typescript
// 修改为直接调用 API，而不是通过 adminApi
apiRequest('/api/v2/oauth/consent/info?...')
apiRequest('/api/v2/oauth/consent/submit', { method: 'POST', ... })
```

### Step 4: 添加文档注释

在 `/docs/8-OAUTH_FLOWS.md` 中添加：

```markdown
## 同意页面流程 (Consent Page Flow)

### 流程图
```
用户点击"允许" → Admin Portal /oauth/consent 页面
    ↓
调用 OAuth Service /api/v2/oauth/consent/submit
    ↓
OAuth Service 验证用户和权限
    ↓
OAuth Service 生成授权码或返回拒绝响应
    ↓
Admin Portal 重定向到授权码回调
```

### 关键点
- ✅ 同意决定由用户在 Admin Portal 确认界面做出
- ✅ 权限验证由 OAuth Service 完成
- ✅ 授权码由 OAuth Service 签发
```

---

## 📋 修复清单

- [ ] 在 OAuth Service 实现 `/api/v2/oauth/consent/info` 端点
- [ ] 在 OAuth Service 实现 `/api/v2/oauth/consent/submit` 端点
- [ ] 在 OAuth Service 的 `app.rs` 中注册 consent 路由
- [ ] 更新 Admin Portal `/lib/api/index.ts` 导出 `adminApi`
- [ ] 验证 consent 页面能够正确调用 API
- [ ] 在 `/docs/8-OAUTH_FLOWS.md` 中添加同意页面的详细流程
- [ ] 测试完整的授权确认流程
- [ ] 测试拒绝授权的流程

---

## 🔒 安全考虑

当实现 `/oauth/consent/submit` 端点时，需要注意：

1. **用户认证**:
   - ✅ 验证 session_token cookie
   - ✅ 确保用户已登录

2. **授权码验证**:
   - ✅ 验证 client_id 和 redirect_uri 匹配
   - ✅ 验证 state 参数
   - ✅ 验证 code_challenge 和 PKCE

3. **权限检查**:
   - ✅ 检查用户是否有请求的 scope
   - ✅ 如果用户拒绝，返回 error=access_denied

4. **速率限制**:
   - ✅ 限制同意请求频率
   - ✅ 防止暴力攻击

---

**验证状态**: ⚠️ 需要实现 - 当前 API 未实现，建议按选项 A 在 OAuth Service 中实现
