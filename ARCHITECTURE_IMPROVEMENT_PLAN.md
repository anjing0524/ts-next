# 架构改进详细执行计划

**制定日期**: 2025-11-28
**计划周期**: 4 周（分 4 个 Phase）
**执行方式**: 多 Agent 并行执行 + 自动调用 Skills
**目标**: 将架构从 5.5/10 升级到 9.0/10

---

## 📊 整体计划概览

```
当前状态 (5.5/10)              目标状态 (9.0/10)
┌─────────────────┐            ┌─────────────────┐
│ Admin Portal    │            │ Admin Portal    │
│ • OAuth客户端   │            │ • OAuth客户端   │
│ • UI层          │   ───→     │ • UI层          │
│ • 验证逻辑 ❌   │            │ • 仅展示 UI     │
└─────────────────┘            └─────────────────┘
        ↓                               ↓
┌─────────────────┐            ┌─────────────────┐
│ OAuth Service   │            │ OAuth Service   │
│ • 认证核心      │   ───→     │ • 认证核心      │
│ • Token管理     │            │ • Token管理     │
│ • RBAC          │            │ • 登录 UI       │
│                 │            │ • 同意 UI       │
│                 │            │ • 所有验证      │
└─────────────────┘            └─────────────────┘
        ↓                               ↓
┌─────────────────┐            ┌─────────────────┐
│ Pingora         │            │ Pingora         │
│ • 基础路由      │   ───→     │ • 路由          │
│ • 反向代理      │            │ • 反向代理      │
│ • 无中间件      │            │ • 日志          │
│                 │            │ • 限流          │
│                 │            │ • 缓存          │
└─────────────────┘            └─────────────────┘
```

---

## 📅 Phase 1: 基础修复（第 1 周）

### 目标
- 修复 Cookie domain 显式配置
- 为后续改进打好基础
- **不改变功能，只修复脆弱点**

### Task 1.1: Cookie Domain 显式配置 (1-2 小时)

**负责**: Agent-1-Cookie-Fix

**步骤**:
1. 修改 `apps/oauth-service-rust/src/routes/oauth.rs` 第 185-191 行
2. 添加 COOKIE_DOMAIN 环境变量读取
3. 修改 SameSite 从 Lax 改为 Strict
4. 添加单元测试

**代码改动** (OAuth Service):
```rust
// 文件: src/routes/oauth.rs:185-195
let cookie_domain = std::env::var("COOKIE_DOMAIN")
    .unwrap_or_else(|_| {
        if is_production {
            warn!("COOKIE_DOMAIN not set, using default. This may fail in production!");
            ".example.com".to_string()
        } else {
            ".localhost".to_string()
        }
    });

let session_cookie = Cookie::build(("session_token", token_pair.access_token))
    .domain(cookie_domain)  // ← 显式设置
    .path("/")
    .http_only(true)
    .secure(is_production)
    .same_site(SameSite::Strict)  // ← Lax → Strict
    .max_age(time::Duration::hours(1));
```

**环境配置**:
```bash
# .env (本地开发)
COOKIE_DOMAIN=.localhost

# docker-compose.yml
services:
  oauth-service-rust:
    environment:
      - COOKIE_DOMAIN=.localhost
```

**验证**:
- [ ] 代码编译成功
- [ ] 登录流程正常
- [ ] Cookie 包含 Domain 属性
- [ ] 浏览器能正确识别 Cookie

---

### Task 1.2: 添加 Pingora 请求日志 (1.5-2 小时)

**负责**: Agent-2-Pingora-Logging

**步骤**:
1. 修改 Pingora 配置添加日志中间件
2. 记录所有 API 请求的方法、路径、耗时、状态码
3. 添加错误日志记录

**代码改动** (Pingora):
```yaml
# 文件: apps/pingora-proxy/config/default.yaml
services:
  - name: 'unified-gateway'
    bind_address: '0.0.0.0:6188'

    # 新增: 日志配置
    logging:
      level: info
      format: json

    # 新增: 中间件链
    middlewares:
      - type: request_logging
        log_level: info
      - type: error_handling
```

**代码改动** (Pingora Rust):
```rust
// 文件: src/proxy/middleware.rs (新建)
pub async fn logging_middleware(
    mut req: Request,
    next: Next,
) -> Response {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let start = Instant::now();

    let response = next.run(req).await;
    let duration = start.elapsed();

    info!(
        target: "pingora::api",
        method = %method,
        uri = %uri,
        status = %response.status(),
        duration_ms = %duration.as_millis(),
        "API request"
    );

    response
}
```

**验证**:
- [ ] Pingora 启动时加载日志配置
- [ ] 请求日志记录到文件或 stdout
- [ ] 日志包含方法、路径、状态码、耗时
- [ ] 日志格式易于解析

---

### Task 1.3: 删除 Admin Portal 前端验证 (30 分钟)

**负责**: Agent-3-Frontend-Cleanup

**步骤**:
1. 移除 `components/auth/username-password-form.tsx` 中的凭证验证
2. 只保留"必填字段"提示（用户体验）
3. 所有真正的验证都依赖后端

**代码改动** (Admin Portal):
```typescript
// 文件: apps/admin-portal/components/auth/username-password-form.tsx:57-62
// ❌ 删除这段
// if (!username || !password) {
//   setError('请输入用户名和密码');
//   return;
// }

// ✅ 改为只保留 HTML 验证 (required 属性)
// 验证逻辑完全在后端 (OAuth Service)
```

**验证**:
- [ ] 表单仍有前端 required 属性（用户体验）
- [ ] 没有凭证强度验证
- [ ] 没有密码格式验证
- [ ] 所有验证都由 OAuth Service 返回错误信息

---

## 📅 Phase 2: 改进 Pingora 反向代理（第 2 周）

### 目标
- 增强 Pingora 的代理能力
- 添加中间件保护
- 为恢复 Admin Portal 代理层做准备

### Task 2.1: Pingora 中间件增强 (2-3 小时)

**负责**: Agent-4-Pingora-Middleware

**步骤**:
1. 添加速率限制中间件
2. 添加请求签名验证（内部调用）
3. 添加响应缓存
4. 添加错误处理和重试

**代码改动** (Pingora):

```rust
// 文件: src/middleware/rate_limit.rs (新建)
pub struct RateLimitMiddleware {
    requests_per_second: u32,
}

impl RateLimitMiddleware {
    pub async fn handle(&self, req: &Request) -> Result<()> {
        // 实现速率限制
        // 基于 IP 或 client_id
    }
}

// 文件: src/middleware/error_handling.rs (新建)
pub async fn error_handling_middleware(
    req: Request,
    next: Next,
) -> Response {
    let response = next.run(req).await;

    if response.status().is_server_error() {
        // 记录错误
        // 返回友好的错误消息
    }

    response
}
```

**Pingora 配置**:
```yaml
# 文件: config/default.yaml
services:
  - name: 'unified-gateway'

    backends:
      admin-portal:
        upstreams: ['127.0.0.1:3002']
        # 新增
        connect_timeout_ms: 2000
        request_timeout_ms: 30000
        idle_timeout_ms: 60000
        max_pool_size: 100
        keepalive_requests: 1000

      oauth-service-rust:
        upstreams: ['127.0.0.1:3001']
        # 新增
        connect_timeout_ms: 2000
        request_timeout_ms: 30000
        idle_timeout_ms: 60000
        max_pool_size: 50
        keepalive_requests: 1000

    # 新增: 中间件配置
    middlewares:
      - type: rate_limit
        requests_per_second: 1000
      - type: logging
        level: info
      - type: error_handling

    # 新增: 缓存配置
    cache:
      enabled: true
      ttl: 300  # 5 分钟
      patterns:
        - path: '/api/v2/users'
          ttl: 60
        - path: '/api/v2/health'
          ttl: 5
```

**验证**:
- [ ] 速率限制生效
- [ ] 超过限制返回 429
- [ ] 错误日志记录
- [ ] 缓存工作正常

---

### Task 2.2: 恢复 Admin Portal HTTP 代理层 (2-3 小时)

**负责**: Agent-5-Proxy-Layer-Recovery

**步骤**:
1. 创建正确实现的代理路由
2. 完整缓冲请求/响应
3. 显式设置 Content-Length
4. 添加错误处理

**代码改动** (Admin Portal):

```typescript
// 文件: apps/admin-portal/app/api/v2/[...path]/route.ts (新建，之前删除的)
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');
  const oauthServiceUrl = process.env.OAUTH_SERVICE_URL || 'http://localhost:3001';

  try {
    // 读取完整的请求体
    const body = await request.json();

    // 转发请求到 OAuth Service
    const response = await fetch(
      `${oauthServiceUrl}/api/v2/${path}`,
      {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
          // 转发认证头
          ...(request.headers.get('authorization') && {
            'authorization': request.headers.get('authorization')!,
          }),
        },
        body: JSON.stringify(body),
      }
    );

    // 读取完整的响应体
    const responseBody = await response.json();
    const responseBodyJson = JSON.stringify(responseBody);

    // 显式返回带 Content-Length
    return new NextResponse(responseBodyJson, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(responseBodyJson).toString(),
      },
    });
  } catch (error) {
    console.error(`Proxy error for /api/v2/${path}:`, error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');
  const oauthServiceUrl = process.env.OAUTH_SERVICE_URL || 'http://localhost:3001';

  try {
    const response = await fetch(
      `${oauthServiceUrl}/api/v2/${path}`,
      {
        method: 'GET',
        headers: {
          ...(request.headers.get('authorization') && {
            'authorization': request.headers.get('authorization')!,
          }),
        },
      }
    );

    const responseBody = await response.json();
    const responseBodyJson = JSON.stringify(responseBody);

    return new NextResponse(responseBodyJson, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(responseBodyJson).toString(),
      },
    });
  } catch (error) {
    console.error(`Proxy error for /api/v2/${path}:`, error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
```

**环境变量**:
```bash
# .env.local
OAUTH_SERVICE_URL=http://localhost:3001

# docker-compose.yml
services:
  admin-portal:
    environment:
      - OAUTH_SERVICE_URL=http://oauth-service-rust:3001
```

**验证**:
- [ ] 代理层正常转发请求
- [ ] 没有流式响应错误
- [ ] Content-Length 正确设置
- [ ] 错误响应正确转发

---

## 📅 Phase 3: OAuth Service 增强（第 3 周）

### 目标
- 将登录/同意 UI 迁移到 OAuth Service
- 完全集中认证逻辑
- 符合 OAuth 2.1 标准

### Task 3.1: OAuth Service 添加登录 UI (2-3 小时)

**负责**: Agent-6-OAuth-UI-Login

**步骤**:
1. 添加 Rust HTML 模板引擎（askama）
2. 创建登录表单 HTML
3. 添加 GET `/login` 端点返回 HTML
4. 修改 `/api/v2/auth/login` 仅接受 POST，验证逻辑完全在后端

**代码改动** (OAuth Service):

```toml
# 文件: Cargo.toml
[dependencies]
askama = "0.12"
```

```rust
// 文件: src/templates/login.html (新建)
<!DOCTYPE html>
<html>
<head>
    <title>Login</title>
    <style>
        /* 简单的 CSS */
    </style>
</head>
<body>
    <form method="POST" action="/api/v2/auth/login">
        <input type="text" name="username" required>
        <input type="password" name="password" required>
        <input type="hidden" name="redirect" value="{{ redirect }}">
        <button type="submit">Login</button>
    </form>
</body>
</html>
```

```rust
// 文件: src/routes/oauth.rs
use askama::Template;

#[derive(Template)]
#[template(path = "login.html")]
struct LoginTemplate {
    redirect: String,
}

// GET /login - 返回 HTML 表单
pub async fn login_page(
    Query(params): Query<LoginPageParams>,
) -> Response {
    let redirect = params.redirect.unwrap_or_default();
    let template = LoginTemplate { redirect };
    Html(template.render().unwrap()).into_response()
}

// POST /api/v2/auth/login - 验证凭证并设置 Cookie
pub async fn login_handler(
    State(state): State<Arc<AppState>>,
    Form(payload): Form<LoginRequest>,
) -> Result<Response, OAuthError> {
    // 所有验证在这里
    let user = state.user_service.authenticate(&payload.username, &payload.password)
        .await?;

    // 设置 session_token Cookie
    // ...

    // 重定向回 authorize URL
    Ok(Redirect::to(&payload.redirect).into_response())
}
```

**Pingora 路由更新**:
```yaml
# config/default.yaml
routes:
  - path_prefix: '/login'
    backend: 'oauth-service-rust'  # 改为 OAuth Service，不是 Admin Portal
```

**验证**:
- [ ] GET /login 返回 HTML 表单
- [ ] POST /api/v2/auth/login 验证凭证
- [ ] Cookie 正确设置
- [ ] 重定向到原始 authorize URL

---

### Task 3.2: OAuth Service 添加同意 UI (1.5-2 小时)

**负责**: Agent-7-OAuth-UI-Consent

**步骤**:
1. 创建同意表单 HTML 模板
2. 添加 GET `/oauth/consent` 返回 HTML
3. 添加 POST `/api/v2/oauth/consent/submit` 处理同意

**代码改动** (OAuth Service):

```rust
// 文件: src/templates/consent.html (新建)
<!DOCTYPE html>
<html>
<head>
    <title>Authorization</title>
</head>
<body>
    <h1>Application Requesting Access</h1>
    <p>{{ client_name }} wants to access:</p>
    <ul>
        {% for scope in scopes %}
        <li>{{ scope }}</li>
        {% endfor %}
    </ul>

    <form method="POST" action="/api/v2/oauth/consent/submit">
        <input type="hidden" name="client_id" value="{{ client_id }}">
        <input type="hidden" name="code_challenge" value="{{ code_challenge }}">

        <button name="decision" value="allow" type="submit">Allow</button>
        <button name="decision" value="deny" type="submit">Deny</button>
    </form>
</body>
</html>
```

```rust
// 文件: src/routes/consent.rs (重写)
#[derive(Template)]
#[template(path = "consent.html")]
struct ConsentTemplate {
    client_name: String,
    scopes: Vec<String>,
    client_id: String,
    code_challenge: String,
}

// GET /oauth/consent - 返回同意表单
pub async fn consent_page(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ConsentParams>,
) -> Result<Html<String>, OAuthError> {
    // 获取客户端信息
    let client = state.client_service.get_client(&params.client_id).await?;

    let template = ConsentTemplate {
        client_name: client.name,
        scopes: params.scope.split(' ').map(|s| s.to_string()).collect(),
        client_id: params.client_id,
        code_challenge: params.code_challenge,
    };

    Ok(Html(template.render()?))
}

// POST /api/v2/oauth/consent/submit - 处理同意
pub async fn consent_submit(
    State(state): State<Arc<AppState>>,
    Form(payload): Form<ConsentRequest>,
) -> Result<Response, OAuthError> {
    let decision = payload.decision.as_str();

    if decision == "deny" {
        return Err(OAuthError::AccessDenied);
    }

    // 生成授权码
    let auth_code = state.token_service.generate_auth_code(
        &payload.client_id,
        &payload.code_challenge,
    ).await?;

    // 重定向到 redirect_uri
    Ok(Redirect::to(&format!(
        "{}?code={}&state={}",
        client.redirect_uri,
        auth_code,
        payload.state
    )).into_response())
}
```

**Pingora 路由更新**:
```yaml
routes:
  - path_prefix: '/oauth/consent'
    backend: 'oauth-service-rust'  # 改为 OAuth Service，不是 Admin Portal
```

**验证**:
- [ ] GET /oauth/consent 返回同意表单
- [ ] POST /api/v2/oauth/consent/submit 处理决定
- [ ] 重定向正确

---

## 📅 Phase 4: 清理和优化（第 4 周）

### 目标
- 从 Admin Portal 完全删除认证相关的 UI
- 修复 Pingora 路由规则
- 全面测试和验证

### Task 4.1: 删除 Admin Portal 认证 UI (1 小时)

**负责**: Agent-8-Admin-Portal-Cleanup

**步骤**:
1. 删除 `/login` 页面
2. 删除 `/oauth/consent` 页面
3. 删除相关的认证组件
4. 保留仅需要展示的 UI（登录状态、用户菜单等）

**代码删除**:
- ❌ 删除 `apps/admin-portal/app/(auth)/login/page.tsx`
- ❌ 删除 `apps/admin-portal/app/oauth/consent/page.tsx`
- ❌ 删除 `apps/admin-portal/components/auth/username-password-form.tsx`
- ✅ 保留 `apps/admin-portal/lib/auth-service.ts` (OAuth 客户端逻辑)
- ✅ 保留 `apps/admin-portal/lib/auth/token-storage.ts` (Token 管理)

**验证**:
- [ ] Admin Portal 无认证 UI 代码
- [ ] OAuth 客户端逻辑完整保留
- [ ] 应用正常启动

---

### Task 4.2: 修复 Pingora 路由规则 (1.5 小时)

**负责**: Agent-9-Pingora-Routes

**步骤**:
1. 更新路由规则，确保清晰的优先级
2. 添加明确的默认路由
3. 添加健康检查路由

**代码改动** (Pingora):

```yaml
# 文件: config/default.yaml (完整版)
services:
  - name: 'unified-gateway'
    bind_address: '0.0.0.0:6188'
    default_backend: 'admin-portal'

    backends:
      admin-portal:
        upstreams: ['127.0.0.1:3002']
        connect_timeout_ms: 2000
        request_timeout_ms: 30000
        idle_timeout_ms: 60000
        max_pool_size: 100
        keepalive_requests: 1000

      oauth-service-rust:
        upstreams: ['127.0.0.1:3001']
        connect_timeout_ms: 2000
        request_timeout_ms: 30000
        idle_timeout_ms: 60000
        max_pool_size: 50
        keepalive_requests: 1000

    routes:
      # 最高优先级: OAuth API 路由
      - path_prefix: '/api/v2/oauth/'
        backend: 'oauth-service-rust'

      # 认证相关
      - path_prefix: '/api/v2/auth/'
        backend: 'oauth-service-rust'

      # 其他 OAuth Service API
      - path_prefix: '/api/v2/'
        backend: 'oauth-service-rust'

      # 登录和同意页面（现在在 OAuth Service）
      - path_prefix: '/login'
        backend: 'oauth-service-rust'

      - path_prefix: '/oauth/consent'
        backend: 'oauth-service-rust'

      # 健康检查
      - path_prefix: '/health'
        backend: 'oauth-service-rust'

      # 其他都转到 Admin Portal（默认）
      - path_prefix: '/'
        backend: 'admin-portal'

    middlewares:
      - type: request_logging
        level: info
      - type: rate_limiting
        requests_per_second: 1000
      - type: error_handling

    cache:
      enabled: true
      patterns:
        - path_prefix: '/health'
          ttl: 5
        - path_prefix: '/api/v2/users'
          ttl: 60
```

**验证**:
- [ ] 所有路由规则清晰
- [ ] 没有歧义
- [ ] 优先级正确
- [ ] 默认路由生效

---

### Task 4.3: 端到端测试和验证 (2-3 小时)

**负责**: Agent-10-E2E-Testing

**步骤**:
1. 测试完整的登录流程
2. 测试权限验证
3. 测试 Cookie 行为
4. 测试错误处理
5. 性能基准测试

**测试场景**:

```bash
# 场景 1: 完整登录流程
1. 访问 localhost:6188
2. 被重定向到 /api/v2/oauth/authorize
3. 被重定向到 /login （在 OAuth Service 中）
4. 输入凭证并提交
5. 被重定向到 /oauth/consent
6. 允许权限
7. 返回到 Admin Portal
8. 应用正常工作

# 场景 2: Cookie 验证
1. 登录成功
2. 检查 Cookie: session_token
3. 验证 Domain=.localhost
4. 验证 HttpOnly=true
5. 验证 SameSite=Strict

# 场景 3: 错误处理
1. 输入错误密码
2. OAuth Service 返回 401
3. Admin Portal 显示错误消息

# 场景 4: 代理转发
1. Admin Portal 发送 GET /api/v2/users
2. Pingora 转发到 OAuth Service
3. OAuth Service 验证 token
4. 返回用户列表
```

**验证清单**:
- [ ] 所有登录流程测试通过
- [ ] Cookie 行为符合预期
- [ ] 错误处理正确
- [ ] 性能满足要求（<500ms）

---

## 🤖 Agent 分配表

| Agent | 任务 | 周期 | Skills 使用 |
|-------|------|------|-----------|
| Agent-1 | Cookie Domain 配置 | Week 1 | `/feature-dev`, `/commit` |
| Agent-2 | Pingora 日志 | Week 1 | `/feature-dev` |
| Agent-3 | 前端清理 | Week 1 | `/feature-dev` |
| Agent-4 | Pingora 中间件 | Week 2 | `/feature-dev`, `/code-review` |
| Agent-5 | 恢复代理层 | Week 2 | `/feature-dev`, `/code-review` |
| Agent-6 | OAuth 登录 UI | Week 3 | `/feature-dev` |
| Agent-7 | OAuth 同意 UI | Week 3 | `/feature-dev` |
| Agent-8 | Admin Portal 清理 | Week 4 | `/feature-dev` |
| Agent-9 | Pingora 路由 | Week 4 | `/feature-dev` |
| Agent-10 | E2E 测试 | Week 4 | `/ralph-wiggum:ralph-loop` |

---

## 📝 执行命令示例

```bash
# Phase 1: 基础修复
/feature-dev "Cookie Domain 显式配置"
# 自动调用 skills: code-review, commit-push-pr

# Phase 2: Pingora 增强
/feature-dev "增强 Pingora 反向代理中间件"
# 自动调用 skills: code-review, testing

# Phase 3: OAuth UI 迁移
/feature-dev "将登录 UI 迁移到 OAuth Service"
# 自动调用 skills: code-review, comment-analyzer

# Phase 4: 最终验证
/ralph-wiggum:ralph-loop "执行端到端测试并验证整个系统"
```

---

## ✅ 完成检查清单

**Phase 1**:
- [ ] Cookie domain 可显式配置
- [ ] 环境变量生效
- [ ] 没有删除 Admin Portal 认证逻辑（暂时）

**Phase 2**:
- [ ] Pingora 有日志输出
- [ ] 代理层正确处理请求/响应
- [ ] 没有流式响应错误

**Phase 3**:
- [ ] OAuth Service 有 /login 页面
- [ ] OAuth Service 有 /oauth/consent 页面
- [ ] 两个页面都可以正常工作

**Phase 4**:
- [ ] Admin Portal 删除了 /login 和 /oauth/consent
- [ ] Pingora 路由规则清晰
- [ ] 端到端测试全部通过
- [ ] 系统评分达到 9.0/10

---

**总预计时间**: 4 周
**总工作量**: 约 25-30 小时
**并行度**: 最多 3 个 Agent 同时工作
**风险**: 低（分阶段、有验收标准）

