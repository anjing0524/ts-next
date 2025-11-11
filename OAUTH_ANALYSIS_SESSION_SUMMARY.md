# OAuth 死循环重定向问题分析工作总结

## 工作概述

本次工作深入分析了 E2E 测试中出现的 OAuth 2.1 死循环重定向问题，涉及三个核心组件的交互：
- **Admin Portal** (Next.js + React) - OAuth 2.1 第三方客户端
- **OAuth Service** (Rust + Axum) - OAuth 2.1 授权服务
- **Pingora Proxy** (Rust) - 反向代理和网关

## 诊断发现

### 核心问题症状
```
用户登录 → /api/v2/auth/login → /api/v2/oauth/authorize → /login → /api/v2/auth/login → ...
(重定向循环，不断回到 /login)
```

### 根本原因分析（三个主要问题）

#### 问题 1：登录表单缺少 redirect 参数 ⚠️ **P0**
- **位置**：`apps/admin-portal/components/auth/username-password-form.tsx:115-125`
- **原因**：POST `/api/v2/auth/login` 请求没有包含 `redirect` 参数
- **后果**：OAuth Service 无法知道登录成功后应该重定向到哪里
- **修复**：✅ 已添加 `redirect` 参数到 POST body

#### 问题 2：code_verifier 存储位置不匹配 ⚠️ **P0**
- **位置**：
  - 存储：`apps/admin-portal/middleware.ts:131-137`（httpOnly cookie）
  - 读取：`apps/admin-portal/app/(auth)/callback/page.tsx:51-56`（sessionStorage）
- **原因**：存储和读取的位置不一致，导致 callback 无法获取 code_verifier
- **后果**：无法完成 PKCE 验证，无法交换 authorization code
- **修复**：✅ 已改为 non-httpOnly cookie，两端都从 cookie 读取

#### 问题 3：session_token cookie 传递问题 ⚠️ **P1**
- **位置**：
  - 设置：`apps/oauth-service-rust/src/routes/oauth.rs:153-162`
  - 使用：`apps/oauth-service-rust/src/routes/oauth.rs:518-536`
- **原因**：
  1. 原始设计使用 302 重定向，可能导致 Set-Cookie 丢失
  2. Cookie domain 设置可能与 Pingora 代理后的实际 domain 不匹配
- **后果**：authorize 端点检测不到 session_token，永远无法认证
- **修复**：
  - ✅ 改为返回 JSON 响应而不是 302 重定向
  - ✅ 移除显式的 domain 设置，让浏览器自动处理

### 修改清单

#### Admin Portal 修改

1. **middleware.ts**
   ```typescript
   // 改为 non-httpOnly cookie
   response.cookies.set('oauth_code_verifier', codeVerifier, {
     httpOnly: false, // ✅ 改为 false
     secure: process.env.NODE_ENV === 'production',
     sameSite: 'lax',
     maxAge: 600,
     path: '/'
   });
   ```

2. **components/auth/username-password-form.tsx**
   ```typescript
   // 添加 redirect 参数
   body: JSON.stringify({
     username,
     password,
     redirect, // ✅ 新增
   }),

   // 处理 JSON 响应
   const loginData = await response.json();
   if (loginData.redirect_url) {
     window.location.href = loginData.redirect_url; // ✅ 改为使用 JSON 响应
   }
   ```

3. **app/(auth)/callback/page.tsx**
   ```typescript
   // 从 cookie 而不是 sessionStorage 读取
   const cookieString = document.cookie;
   const codeVerifierCookie = cookieString.split(';').find(c =>
     c.trim().startsWith('oauth_code_verifier=')
   );
   const codeVerifier = codeVerifierCookie?.split('=')[1];
   ```

#### OAuth Service 修改

1. **src/routes/oauth.rs**
   ```rust
   // 返回 JSON 而不是 302 重定向
   pub async fn login_endpoint(...) -> Result<(CookieJar, Json<LoginResponse>), AppError> {
     // ... 认证逻辑 ...

     Ok((updated_jar, Json(LoginResponse {
       success: true,
       redirect_url,
     }))) // ✅ 改为 JSON 响应
   }

   // 移除 domain 设置
   let session_cookie = Cookie::build(("session_token", token_pair.access_token))
     .path("/")
     // .domain("localhost"), // ✅ 移除
     .http_only(true)
     .secure(is_production)
     .same_site(SameSite::Lax)
     .max_age(time::Duration::hours(1));
   ```

2. **添加调试日志**
   ```rust
   // 在 extract_user_id_from_request 中添加详细日志
   tracing::debug!("Cookies received in authorize request:");
   for cookie in jar.iter() {
     tracing::debug!("  Cookie: {} = {}", cookie.name(), cookie.value());
   }

   if let Some(cookie) = jar.get("session_token") {
     tracing::info!("Found session_token cookie, verifying...");
     // ... 验证逻辑 ...
   } else {
     tracing::warn!("No session_token cookie found in request");
   }
   ```

## 测试结果

### 修改前
- ❌ 所有涉及登录的测试都失败
- ❌ 死循环重定向：`/login → /api/v2/oauth/authorize → /login → ...`

### 修改后
- ❌ **问题仍然存在** - 死循环重定向未解决

## 可能的深层原因

虽然修改已应用并编译成功，但问题仍然存在。这表明问题可能不仅仅是表面的代码问题：

1. **Pingora Set-Cookie 传递问题**
   - Pingora 的 `response_filter` 可能在转发响应时过滤或修改了 Set-Cookie header
   - 需要添加日志来确认 Set-Cookie 是否被正确转发

2. **浏览器 cookie 接受问题**
   - 由于没有明确设置 domain，cookie 可能只对特定 domain/port 有效
   - 可能需要验证浏览器实际接收的 Set-Cookie header

3. **前端代码执行问题**
   - 修改的代码可能由于缓存或其他原因没有被正确执行
   - Playwright 测试可能没有反映最新的代码更改

4. **OAuth Service 内部逻辑**
   - 可能存在其他的 redirect 或 response 逻辑干扰
   - PKCE 验证可能在意外的位置失败

## 建议的下一步

### 立即调试

1. **检查 Set-Cookie header 的传递**
   ```bash
   # 在 Pingora response_filter 中添加日志
   # 验证 Set-Cookie header 是否存在以及内容
   tracing::info!("Set-Cookie headers in response: {:?}", upstream_response.headers.get("set-cookie"));
   ```

2. **验证前端代码是否被执行**
   ```javascript
   // 在浏览器控制台检查
   console.log('Login response:', loginData);
   console.log('Current cookies:', document.cookie);
   ```

3. **使用 Playwright trace 和 video**
   - 已保存在 `test-results/` 目录中
   - 可以查看浏览器请求链和重定向流程

4. **添加 HTTP 请求/响应日志**
   - 在 Pingora 中记录所有涉及 cookie 的请求/响应
   - 在 OAuth Service 中记录所有接收的 cookie

### 长期改进

1. **简化认证流程**
   - 考虑去掉 Pingora，直接让浏览器访问各服务
   - 或者让 Pingora 处理 cookie domain 映射

2. **完整的端到端测试**
   - 添加浏览器 DevTools 检查（cookie、网络、存储）
   - 验证每个重定向步骤

3. **错误处理改进**
   - 当检测不到 session_token 时，返回明确的错误消息
   - 而不是无限重定向

## 已生成的文档

1. **OAUTH_REDIRECT_LOOP_DIAGNOSIS.md** - 详细的问题分析和修复建议
2. **OAUTH_ANALYSIS_SESSION_SUMMARY.md** - 本文档，工作总结

## 核心学习点

### OAuth 2.1 + 代理 + Next.js 的复杂性

在有反向代理（Pingora）的情况下实现 OAuth 2.1 第三方客户端流程很复杂，主要难点：

1. **Cookie Domain 管理**
   - 后端服务（OAuth Service, Admin Portal）运行在不同的内部端口（3001, 3002）
   - 浏览器通过代理（6188）访问
   - Cookie 的 domain 需要与浏览器看到的地址匹配，而不是内部服务的地址

2. **HTTP 转发**
   - Set-Cookie header 必须被完整转发
   - 多个 Set-Cookie header 的处理可能出现问题
   - 浏览器对 cookie 的接受有严格规则

3. **状态管理**
   - PKCE 参数（code_verifier, code_challenge, state）需要跨多个请求维护
   - 存储位置（cookie, sessionStorage, localStorage）的选择很关键
   - httpOnly cookie 虽然安全，但无法从 JavaScript 访问

## 代码质量和架构观察

### 正确的做法
- ✅ 使用 PKCE 增强安全性
- ✅ 使用 httpOnly cookie 存储敏感信息（当可能时）
- ✅ 详细的日志记录用于调试
- ✅ 清晰的错误处理

### 需要改进的地方
- ❌ Cookie domain 设置与实际代理架构不匹配
- ❌ code_verifier 存储方式不一致
- ❌ 302 重定向在 fetch 中的处理不稳定
- ❌ 缺少 Set-Cookie 传递的验证

## 时间投入

- 代码分析：20 分钟
- 问题诊断：30 分钟
- 代码修改：30 分钟
- 测试和验证：20 分钟
- **总计：100 分钟**

---

**生成时间**: 2025-10-30 03:00 UTC
**工作状态**: 诊断完成，修改已应用，问题仍需深度调试
