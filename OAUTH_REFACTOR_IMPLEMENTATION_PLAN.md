# OAuth 2.1 架构优化详细计划

## 总体目标

将 Admin Portal 改造为**标准的第三方 OAuth 客户端**，完全遵循 OAuth 2.1 规范。

## 关键原则

1. **Admin Portal = 业务应用**
   - 不参与认证决策
   - 无直接登录入口
   - 只负责业务页面展示

2. **OAuth Service = 认证提供者**
   - 完全控制认证流程
   - 提供登录页面（通过 Admin Portal 代理）
   - 管理授权和 token

3. **Pingora = 统一网关**
   - 路由请求到对应服务
   - 维持同域 Cookie 共享

## 改动清单

### Part 1: Admin Portal Middleware 改造

**文件**: `apps/admin-portal/middleware.ts`

#### 改动 1: 去除 `/login` 的 hardcoded 逻辑

**当前（第 176-189 行）：**
```typescript
if (isProtectedRoute) {
    if (!accessToken || isTokenExpired(accessToken)) {
      // 错误：直接重定向到 /login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
}
```

**改为：**
```typescript
if (isProtectedRoute) {
    if (!accessToken || isTokenExpired(accessToken)) {
      // 正确：直接启动 OAuth 流程
      return await initiateOAuthFlow(request, pathname);
    }
}
```

**影响**:
- 受保护路由直接触发 OAuth 授权流程
- 不经过 Admin Portal 的 `/login`

#### 改动 2: 调整 `authRoutes` 的处理

**当前**：
```typescript
const authRoutes = ['/login', '/auth/callback'];
// 后续检查：已登录用户访问认证路由时重定向
```

**改为**：
```typescript
const authRoutes = ['/auth/callback'];  // 只保留 callback
```

**改动位置**（第 215-220 行）：
- 移除对 `/login` 的特殊处理
- 让 `/login` 流量完全由 OAuth Service 驱动

#### 改动 3: 优化 Token 存储

**当前**：
```typescript
const accessToken = request.cookies.get('access_token')?.value;  // 从 cookie 读取
```

**改为**：
```typescript
// 注意：Token 应该存储在 httpOnly cookie 中（由 OAuth Service 设置）
// 或者从 Authorization header 中提取
const authHeader = request.headers.get('authorization');
const token = authHeader?.startsWith('Bearer ')
  ? authHeader.substring(7)
  : request.cookies.get('access_token')?.value;
```

**说明**：
- 使 middleware 能支持多种 token 来源
- 增加灵活性

### Part 2: Admin Portal Routes 调整

**文件**: `apps/admin-portal/app/(auth)/login/page.tsx` 和相关路由

#### 改动 1: `/login` 页面的访问控制

**当前**：任何人都可以访问 `/login`

**改为**：
1. `/login` 必须有 `redirect` 参数
2. `redirect` 参数应该指向 OAuth Service 的 `/authorize` 端点
3. 如果没有 `redirect` 参数或格式不对，拒绝访问

**代码**（页面顶部添加）：
```typescript
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');

  useEffect(() => {
    // 安全检查：redirect 必须指向合法的 OAuth authorize 端点
    if (!redirect || !redirect.includes('/api/v2/oauth/authorize')) {
      // 拒绝：重定向到首页或错误页面
      router.push('/');
    }
  }, [redirect, router]);

  if (!redirect) {
    return <div>Invalid request</div>;
  }

  return (
    // ... 登录表单
  );
}
```

#### 改动 2: `/auth/callback` 的独立性

**当前**：存在于 Admin Portal，处理授权码回调

**改为**：保持不变，但清晰文档化其作为 OAuth 回调的角色

**说明**：
- `/auth/callback` 是 Admin Portal 作为 OAuth 客户端的必要部分
- 但应该文档化为"OAuth 回调端点"而非"Admin Portal 的认证路由"

### Part 3: OAuth Service 调整

**文件**: `apps/oauth-service-rust/src/routes/oauth.rs`

#### 改动 1: 授权端点的登录重定向

**当前**（第 204-230 行）：
```rust
let admin_portal_url = std::env::var("NEXT_PUBLIC_ADMIN_PORTAL_URL")
    .unwrap_or_else(|_| "http://localhost:3002".to_string());

let mut login_url = url::Url::parse(&format!("{}/login", admin_portal_url))
    .expect("Failed to parse login URL");
login_url.query_pairs_mut().append_pair("redirect", authorize_url.as_str());

return Ok(Redirect::to(login_url.as_str()).into_response());
```

**改为**（添加验证）：
```rust
// 验证 Admin Portal URL 的合法性
let admin_portal_url = validate_redirect_uri(&request.redirect_uri, &client_details.redirect_uris)
    .then(|| {
        std::env::var("NEXT_PUBLIC_ADMIN_PORTAL_URL")
            .unwrap_or_else(|_| "http://localhost:3002".to_string())
    })
    .ok_or_else(|| ServiceError::ValidationError("Invalid redirect_uri".to_string()))?;

// ... 继续重定向到 /login
```

**说明**：
- 确保只有授权的 Admin Portal 地址才能处理登录
- 防止 open redirect 漏洞

#### 改动 2: 会话 Token 的安全性

**当前**：存储在普通 Cookie 中

**改为**（第 144-150 行）：
```rust
// 改进：添加更多安全属性
let session_cookie = Cookie::build(("session_token", token_pair.access_token))
    .path("/")
    .domain("localhost")  // 开发环境
    .http_only(true)      // ✅ 防止 XSS
    .secure(std::env::var("NODE_ENV").unwrap_or_default() == "production")
    .same_site(SameSite::Lax)
    .max_age(time::Duration::hours(1))
    .expires(OffsetDateTime::now_utc() + time::Duration::hours(1));
```

**说明**：
- HttpOnly: 防止 JavaScript 访问
- Secure: 生产环境强制 HTTPS
- SameSite=Lax: CSRF 防护
- Max-Age 和 Expires: 明确过期时间

### Part 4: Pingora 路由优化

**文件**: `apps/pingora-proxy/config/default.yaml`

#### 当前（第 14-26 行）：
```yaml
routes:
  - path_prefix: '/api/v2/oauth/'
    backend: 'oauth-service'
  - path_prefix: '/api/v2/auth/'
    backend: 'oauth-service'
  # ... 其他
  - path_prefix: '/login'
    backend: 'admin-portal'
```

#### 分析

✅ 现有路由配置是正确的，保持不变

**原因**：
- `/login` 确实应该路由到 Admin Portal
- `/api/v2/oauth/authorize` 会重定向到 `/login`
- 所有请求最终都回到同一域名

#### 建议补充：添加文档注释

```yaml
routes:
  # OAuth 2.1 标准端点（来自 OAuth Service）
  - path_prefix: '/api/v2/oauth/'
    backend: 'oauth-service'
    # 包含：/authorize, /token, /userinfo 等

  # 认证辅助端点（来自 OAuth Service）
  - path_prefix: '/api/v2/auth/'
    backend: 'oauth-service'
    # 包含：/login（处理凭证）

  # Admin 管理端点（来自 OAuth Service）
  - path_prefix: '/api/v2/admin/'
    backend: 'oauth-service'
    # 包含：用户管理、角色管理等

  # 登录页面（由 Admin Portal 提供，为 OAuth 服务）
  - path_prefix: '/login'
    backend: 'admin-portal'
    # 注意：这只能通过 OAuth /authorize 重定向到达

  # OAuth 回调处理（由 Admin Portal 处理）
  - path_prefix: '/auth/'
    backend: 'admin-portal'
    # 包含：/callback (处理授权码)

  # 用户授权确认页面
  - path_prefix: '/oauth/consent'
    backend: 'admin-portal'
    # 可选，如果实现了 consent screen

  # 默认：Admin Portal 的业务页面
  - path_prefix: '/'
    backend: 'admin-portal'
    # 所有其他请求
```

### Part 5: Token 管理优化

**文件**: `apps/admin-portal/app/(auth)/callback/page.tsx`

#### 改动 1: Token 存储策略

**当前**（第 94-102 行）：
```typescript
TokenStorage.setTokens({
  accessToken: tokenResponse.access_token,
  refreshToken: tokenResponse.refresh_token,
  expiresIn: tokenResponse.expires_in
});
localStorage.setItem('token_expires_at', ...);
```

**改为**（更明确的策略）：
```typescript
// 策略：
// - Access Token: localStorage (短期，1小时)
// - Refresh Token: localStorage (长期，7天)
// - Session Cookie: httpOnly cookie (自动管理)

// 1. 存储 Access Token（用于 API 调用）
localStorage.setItem('access_token', tokenResponse.access_token);

// 2. 存储 Refresh Token（用于刷新）
if (tokenResponse.refresh_token) {
  localStorage.setItem('refresh_token', tokenResponse.refresh_token);
}

// 3. 计算并存储过期时间
const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
localStorage.setItem('token_expires_at', expiresAt.toString());

// 4. 清理临时参数
sessionStorage.removeItem('oauth_code_verifier');
sessionStorage.removeItem('oauth_state');
sessionStorage.removeItem('oauth_nonce');
sessionStorage.removeItem('oauth_redirect_path');
```

**说明**：
- 更清晰的注释
- 明确的存储策略
- 完整的清理逻辑

#### 改动 2: 自动 Token 刷新

**在 middleware 中添加**（新增）：
```typescript
// 在检查 token 有效性时，如果即将过期则自动刷新
async function ensureValidToken(request: NextRequest): Promise<string | null> {
  const accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;
  const expiresAt = parseInt(request.cookies.get('token_expires_at')?.value || '0');

  // Token 有效
  if (accessToken && expiresAt > Date.now()) {
    return accessToken;
  }

  // Token 即将过期（5分钟内）
  if (refreshToken && expiresAt - Date.now() < 5 * 60 * 1000) {
    try {
      const response = await fetch(
        `${process.env.OAUTH_SERVICE_URL}/api/v2/oauth/token`,
        {
          method: 'POST',
          body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: process.env.OAUTH_CLIENT_ID,
          }),
        }
      );

      if (response.ok) {
        const newTokens = await response.json();
        // 存储新 token
        // 返回新 token
        return newTokens.access_token;
      }
    } catch (err) {
      console.error('Token refresh failed:', err);
    }
  }

  return null;
}
```

## Part 6: 环境变量标准化

**需要的环境变量**（现有+新增）：

```bash
# OAuth Service
NEXT_PUBLIC_OAUTH_SERVICE_URL=http://localhost:6188
NEXT_PUBLIC_OAUTH_CLIENT_ID=admin-portal-client

# Admin Portal 重定向 URI
NEXT_PUBLIC_OAUTH_REDIRECT_URI=http://localhost:6188/auth/callback

# JWT 密钥
JWT_PRIVATE_KEY_PATH=./test-private.pem

# 服务间通信（内部使用）
OAUTH_SERVICE_URL=http://localhost:3001  # 内部 URL
ADMIN_PORTAL_URL=http://localhost:3002   # 内部 URL

# 环境
NODE_ENV=development
```

## 改动汇总表

| 文件 | 改动 | 类型 | 优先级 |
|------|------|------|--------|
| middleware.ts | 移除 `/login` hardcoded | 重要 | 🔴 高 |
| middleware.ts | 调整 authRoutes | 重要 | 🔴 高 |
| middleware.ts | 添加 token 刷新 | 增强 | 🟡 中 |
| login/page.tsx | 添加 redirect 验证 | 安全 | 🔴 高 |
| callback/page.tsx | 优化 token 存储 | 改进 | 🟡 中 |
| oauth.rs | 添加 redirect_uri 验证 | 安全 | 🔴 高 |
| oauth.rs | 增强 cookie 安全属性 | 安全 | 🔴 高 |
| default.yaml | 添加注释文档 | 文档 | 🟢 低 |

## 实施步骤

### Phase 1: 代码分析和规划（当前）
- [x] 深度分析当前架构
- [x] 识别问题点
- [x] 制定改动计划
- [ ] 获得反馈和确认

### Phase 2: Playwright 测试设计（下一步）
- [ ] 设计测试场景
- [ ] 编写 E2E 测试
- [ ] 建立基准测试

### Phase 3: 实施改动
- [ ] 修改 middleware
- [ ] 优化 login 页面
- [ ] 增强 callback 逻辑
- [ ] 改进 OAuth Service
- [ ] 更新配置

### Phase 4: 验证和优化
- [ ] 运行所有测试
- [ ] 性能测试
- [ ] 安全审计
- [ ] 文档更新

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Token 刷新失败 | 用户被迫重新登录 | 实现优雅降级 |
| Redirect 验证太严格 | 合法请求被拒 | 仔细测试各种格式 |
| Cookie 同域问题 | 跨服务 token 丢失 | 确保 Pingora 正确配置 |
| 向后兼容性 | 现有客户端失效 | 逐步迁移，保持 API 兼容 |

## 预期收益

✅ **架构清晰性**：完全遵循 OAuth 2.1 标准
✅ **安全性**：移除混合模式的安全隐患
✅ **可维护性**：逻辑更清晰，更易理解
✅ **可扩展性**：支持多个第三方客户端
✅ **规范性**：与 Google/GitHub 等大厂实现一致

## 下一步

1. 确认这个计划是否符合要求
2. 根据反馈调整细节
3. 开始 Phase 2：设计 Playwright 测试
