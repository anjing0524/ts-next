# API 版本管理和向后兼容性设计

**文档版本**: 1.0
**创建日期**: 2025-11-21
**适用版本**: v1.0 及以上
**所有者**: 架构团队、API 团队
**相关需求**: FR-011 (API 版本管理和向后兼容性)

---

## 目录

1. [概述](#概述)
2. [版本管理策略](#版本管理策略)
3. [向后兼容性规则](#向后兼容性规则)
4. [弃用流程](#弃用流程)
5. [版本路由实现](#版本路由实现)
6. [迁移指南](#迁移指南)
7. [监控和通知](#监控和通知)

---

## 概述

### 设计原则

```
1. 语义版本 - 遵循 SemVer (Major.Minor.Patch)
2. URL 路径版本控制 - /api/v1/, /api/v2/ 等
3. 平滑过渡 - 提供充足的弃用通知期（6+ 个月）
4. 客户端友好 - 明确的迁移路径和文档
5. 可监控 - 追踪版本使用和迁移进度
```

### 版本生命周期

```
v1 (已下线)
  ├─ 发布时间: 2024-01-01
  ├─ EOL 通知: 2024-07-01 (6 个月通知)
  └─ 完全下线: 2025-01-01

v2 (当前版本)
  ├─ 发布时间: 2024-07-01
  ├─ 支持期: 18 个月（发布 v3 后）
  ├─ 维护模式: 仅修复关键 bug
  └─ EOL 计划: 2026-01-01

v3 (计划版本)
  ├─ 发布时间: 2025-07-01 (计划)
  ├─ v2 进入维护模式: 2025-07-01
  ├─ v2 停止功能更新: 2025-07-01
  ├─ v2 停止 bug 修复: 2026-01-01
  └─ v2 完全下线: 2026-07-01
```

---

## 版本管理策略

### 当前版本

```
/api/v2 - 生产就绪
├─ /oauth/authorize
├─ /oauth/token
├─ /oauth/consent
├─ /oauth/revoke
├─ /users
├─ /roles
├─ /permissions
└─ /clients
```

### 版本升级规则

#### Major 版本升级 (v1 → v2)

**触发条件**:
- 删除或显著修改现有 API 端点
- 改变请求/响应格式（不兼容）
- 修改认证机制

**示例**:
```
v1: POST /api/v1/oauth/token
    请求: { client_id, client_secret, code }
    响应: { access_token, expires_in }

v2: POST /api/v2/oauth/token
    请求: { client_id, code_verifier, code }  # 移除 client_secret
    响应: { access_token, expires_in, token_type }
```

#### Minor 版本升级 (v2.0 → v2.1)

**触发条件**:
- 添加新的可选字段
- 添加新的 API 端点
- 向后兼容的功能增强

**示例**:
```
v2.0: GET /api/v2/users/{id}
      响应: { id, name, email, created_at }

v2.1: GET /api/v2/users/{id}
      响应: { id, name, email, created_at, last_login_at }
      # 新字段是可选的，旧客户端仍可工作
```

#### Patch 版本升级 (v2.0.1)

**触发条件**:
- 修复 bug
- 内部优化
- 安全补丁

**无需客户端迁移**

### 版本支持矩阵

| 版本 | 发布日期 | 发布状态 | 功能更新 | Bug 修复 | 下线日期 |
|------|---------|---------|--------|--------|---------|
| v1 | 2024-01-01 | ❌ 已下线 | ❌ | ❌ | 2025-01-01 |
| v2 | 2024-07-01 | ✅ 当前 | ✅ | ✅ | 2026-01-01 |
| v3 | 2025-07-01 | 🔵 计划 | 🔵 计划 | 🔵 计划 | 2027-01-01 |

---

## 向后兼容性规则

### API 设计兼容性规则

#### 1. 请求参数兼容性

```javascript
// ✅ 兼容: 添加可选参数
POST /api/v2/oauth/token
{
  client_id: "...",
  code: "...",
  code_verifier: "...",  // 新参数，可选
  scope: "..."           // 新参数，可选
}

// ❌ 不兼容: 移除必需参数
// 若要删除参数，必须发起新的主版本

// ✅ 兼容: 扩展参数取值范围
// grant_type: "authorization_code" | "refresh_token" | "client_credentials"
// 可添加: "code_credentials"

// ✅ 兼容: 添加新字段到对象
POST /api/v2/users
{
  name: "...",
  email: "...",
  department: "..."  // 新字段，可选
}
```

#### 2. 响应格式兼容性

```javascript
// ✅ 兼容: 添加新的可选字段
{
  access_token: "...",
  expires_in: 3600,
  token_type: "Bearer",
  scope: "openid profile",      // 新字段
  issued_at: 1234567890         // 新字段
}

// ❌ 不兼容: 移除已有字段
// 新增必需字段应该提供默认值，或在 v3 中作为必需字段

// ✅ 兼容: 响应对象字段重新排序（JSON 无序）
// 客户端不应依赖字段顺序

// ✅ 兼容: 响应数组元素添加字段
[
  {
    id: "123",
    name: "user1",
    active: true   // 新字段
  }
]

// ❌ 不兼容: 改变字段类型
{
  expires_in: "3600"  // 之前是 number, 现在是 string
}
```

#### 3. HTTP 状态码兼容性

```
// ✅ 兼容: 添加新的 4xx 错误
POST /api/v2/oauth/token
可能的 4xx 响应:
  - 400 Bad Request (现有)
  - 401 Unauthorized (现有)
  - 429 Too Many Requests (新增，但不应该破坏旧代码)

// ❌ 不兼容: 改变现有端点的成功状态码
POST /api/v2/users
  v1 响应: 201 Created
  v2 响应: 200 OK  // 不兼容！
```

#### 4. 错误响应格式

```javascript
// ✅ 标准 OAuth 错误响应
{
  error: "invalid_request",
  error_description: "Missing parameter: code",
  error_uri: "https://docs.example.com/errors#invalid_request"
}

// ✅ 兼容: 添加新的错误字段
{
  error: "invalid_request",
  error_description: "...",
  error_uri: "...",
  error_code: 40001,      // 新字段
  request_id: "req-123"   // 用于追踪
}

// ❌ 不兼容: 改变错误码名称
// "invalid_request" 必须始终保持不变
```

### 弃用 HTTP 头

```http
GET /api/v2/oauth/authorize HTTP/1.1
Host: api.example.com

HTTP/1.1 200 OK
Deprecation: true
Sunset: Wed, 21 Jul 2025 23:59:59 GMT
Deprecated-In-Version: v2.0
Removed-In-Version: v3.0
Link: </api/v3/oauth/authorize>; rel="successor-version"
```

**头部说明**:
- `Deprecation: true` - 该端点已弃用
- `Sunset` - 该端点将被移除的日期
- `Deprecated-In-Version` - 首次标记为弃用的版本
- `Removed-In-Version` - 计划移除的版本
- `Link` - 新版本的替代端点

---

## 弃用流程

### 时间线示例：弃用 v2, 推荐 v3

```
T+0 (2025-07-01): v3 发布
  ├─ 发布博客: v3 特性介绍
  ├─ 发送邮件: 通知所有应用开发者
  ├─ 更新文档: 推荐使用 v3
  ├─ 在 API 响应中添加弃用头: Deprecation: true
  └─ 开始计数: v2 弃用倒计时

T+3 (2025-10-01): v2 停止功能更新
  ├─ 新功能仅在 v3 中
  ├─ v2 进入纯维护模式
  ├─ 发送二次提醒邮件
  └─ 更新文档: 突出强调迁移急迫性

T+6 (2026-01-01): v2 停止 bug 修复
  ├─ 仅修复重大安全问题
  ├─ 发送最后通知邮件
  ├─ 提供迁移技术支持
  └─ 发布迁移工具和脚本

T+12 (2026-07-01): v2 完全下线
  ├─ 关闭所有 v2 端点
  ├─ v1 流量强制迁移到 v2 (如 v2 还存在)
  ├─ 记录最后的 API 调用
  └─ 归档 v2 的源代码和文档
```

### 弃用通知

#### 邮件通知 (T+0)

```
主题: [重要] OAuth API v3 发布，v2 弃用计划

亲爱的开发者，

我们很高兴地宣布 OAuth API v3 正式发布！

⏰ 时间线:
- 2025-07-01: v3 发布，v2 进入弃用期
- 2025-10-01: v2 停止功能更新
- 2026-01-01: v2 停止 bug 修复
- 2026-07-01: v2 完全下线

🚀 v3 的新特性:
- 更快的响应时间 (p95 < 50ms)
- 改进的错误处理
- 新的权限模型
- 更好的可观测性

📖 迁移指南: https://docs.example.com/api/v3/migration

💬 需要帮助? 联系: api-support@example.com
```

#### 仪表板通知 (T+3, T+6)

```
┌─────────────────────────────────────────┐
│ ⚠️  API v2 弃用警告                     │
│                                          │
│ 您的应用仍在使用 API v2，该版本将于   │
│ 2026-07-01 完全下线。                    │
│                                          │
│ ⏱️  距离下线还有 6 个月                 │
│                                          │
│ [查看迁移指南] [获取技术支持]           │
└─────────────────────────────────────────┘
```

---

## 版本路由实现

### Rust/Axum 路由配置

```rust
// src/routes/mod.rs

use axum::{
    routing::{get, post},
    Router,
};

pub fn api_routes() -> Router {
    Router::new()
        // v2 路由（当前版本）
        .nest("/api/v2", v2_routes())
        // v1 路由（向后兼容，重定向到 v2）
        .nest("/api/v1", v1_legacy_routes())
}

fn v2_routes() -> Router {
    Router::new()
        .nest("/oauth", oauth_v2_routes())
        .nest("/users", users_v2_routes())
        .nest("/roles", roles_v2_routes())
        .nest("/clients", clients_v2_routes())
        .nest("/audit-logs", audit_logs_v2_routes())
}

fn oauth_v2_routes() -> Router {
    Router::new()
        .post("/authorize", handlers::oauth::v2::authorize)
        .post("/token", handlers::oauth::v2::token)
        .post("/consent/verify", handlers::oauth::v2::verify_consent)
        .post("/consent/submit", handlers::oauth::v2::submit_consent)
        .post("/revoke", handlers::oauth::v2::revoke)
}

// v1 向后兼容处理
fn v1_legacy_routes() -> Router {
    Router::new()
        .nest("/oauth", oauth_v1_compat_routes())
}

fn oauth_v1_compat_routes() -> Router {
    Router::new()
        // v1 端点转发到 v2，添加兼容性转换
        .post("/authorize", handlers::oauth::v1_compat::authorize)
        .post("/token", handlers::oauth::v1_compat::token)
}

// v1 兼容性适配器
pub mod v1_compat {
    use axum::{Json, response::IntoResponse};

    pub async fn authorize(
        Json(v1_request): Json<V1AuthorizeRequest>,
    ) -> impl IntoResponse {
        // 将 v1 请求转换为 v2 请求
        let v2_request = V2AuthorizeRequest {
            client_id: v1_request.client_id,
            response_type: v1_request.response_type,
            scope: v1_request.scope,
            state: v1_request.state,
            code_challenge: v1_request.code_challenge.unwrap_or_default(),
            code_challenge_method: v1_request
                .code_challenge_method
                .unwrap_or_else(|| "S256".to_string()),
            // v1 不支持的新参数使用默认值
            nonce: None,
            max_age: None,
        };

        // 调用 v2 处理器
        handlers::oauth::v2::authorize(Json(v2_request)).await
    }

    pub async fn token(
        Json(v1_request): Json<V1TokenRequest>,
    ) -> impl IntoResponse {
        // v1 使用 client_secret，v2 使用 code_verifier (PKCE)
        let v2_request = V2TokenRequest {
            grant_type: v1_request.grant_type,
            client_id: v1_request.client_id,
            code: v1_request.code,
            code_verifier: v1_request.code_verifier,
            // v1 client_secret 需要额外处理 (PKCE 化)
            redirect_uri: v1_request.redirect_uri,
        };

        handlers::oauth::v2::token(Json(v2_request)).await
    }
}
```

### 版本检测中间件

```rust
// src/middleware/version_tracking.rs

use axum::{
    extract::Request,
    middleware::Next,
    response::Response,
};

pub async fn track_api_version(
    req: Request,
    next: Next,
) -> Response {
    let path = req.uri().path().to_string();

    // 提取版本信息
    let version = extract_version_from_path(&path);

    // 记录使用统计
    if let Some(version) = version {
        METRICS
            .api_version_calls
            .with_label_values(&[version])
            .inc();

        // 检查是否是弃用版本
        if is_deprecated_version(version) {
            // 添加弃用头
            // (在 response 中添加)
        }
    }

    let mut response = next.run(req).await;

    if let Some(version) = version {
        response.headers_mut().insert(
            "API-Version",
            version.parse().unwrap(),
        );

        if is_deprecated_version(version) {
            response.headers_mut().insert(
                "Deprecation",
                "true".parse().unwrap(),
            );
            response.headers_mut().insert(
                "Sunset",
                format!("{}", get_version_sunset_date(version))
                    .parse()
                    .unwrap(),
            );
        }
    }

    response
}

fn extract_version_from_path(path: &str) -> Option<&str> {
    // /api/v2/oauth/token → v2
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() > 2 && parts[1] == "api" {
        return Some(parts[2]);
    }
    None
}

fn is_deprecated_version(version: &str) -> bool {
    matches!(version, "v1" | "v2")  // v2 自 v3 发布后弃用
}

fn get_version_sunset_date(version: &str) -> String {
    match version {
        "v1" => "Wed, 01 Jan 2025 23:59:59 GMT".to_string(),
        "v2" => "Wed, 01 Jul 2026 23:59:59 GMT".to_string(),
        _ => "".to_string(),
    }
}
```

---

## 迁移指南

### 迁移检查清单

```markdown
## v1 → v2 迁移指南

### 1. 认证方式变更 (PKCE)

**v1 (OAuth 2.0)**
```bash
# Token 请求使用 client_secret
POST /api/v1/oauth/token
{
  "client_id": "app-id",
  "client_secret": "secret-key",
  "code": "auth-code"
}
```

**v2 (OAuth 2.1)**
```bash
# Token 请求使用 code_verifier (PKCE)
POST /api/v2/oauth/token
{
  "client_id": "app-id",
  "code": "auth-code",
  "code_verifier": "challenge-value"
}
```

### 2. 响应格式变更

**v1 响应**
```json
{
  "access_token": "token",
  "expires_in": 3600
}
```

**v2 响应**
```json
{
  "access_token": "token",
  "expires_in": 3600,
  "token_type": "Bearer",
  "scope": "openid profile"
}
```

### 3. 错误处理变更

**v1 错误**
```json
{
  "error": "invalid_request",
  "error_description": "Missing code parameter"
}
```

**v2 错误** (相同格式，但可能包含新字段)
```json
{
  "error": "invalid_request",
  "error_description": "Missing code parameter",
  "error_code": 40001,
  "request_id": "req-123"
}
```

### 迁移步骤

1. **准备阶段** (第 1 周)
   - [ ] 审查 v2 API 文档
   - [ ] 识别需要变更的代码
   - [ ] 在测试环境验证 v2 API

2. **开发阶段** (第 2-3 周)
   - [ ] 更新授权请求，添加 PKCE
   - [ ] 更新 Token 请求，使用 code_verifier
   - [ ] 处理新的响应字段
   - [ ] 更新错误处理

3. **测试阶段** (第 4 周)
   - [ ] 单元测试覆盖新流程
   - [ ] 集成测试验证端到端流程
   - [ ] 性能测试对比 v1 vs v2

4. **部署阶段**
   - [ ] 部署到测试环境
   - [ ] 部署到生产环境 (金丝雀发布)
   - [ ] 监控错误率和延迟

5. **验收阶段**
   - [ ] 确认旧 v1 代码已移除
   - [ ] 确认没有 v1 API 调用
```

### 自动化迁移工具

```bash
#!/bin/bash
# scripts/migrate-to-v2.sh

# 自动替换 API 版本
find . -name "*.ts" -o -name "*.js" | xargs sed -i \
  's|/api/v1/|/api/v2/|g'

# 生成兼容性报告
node scripts/check-v1-usage.js
```

---

## 监控和通知

### 版本使用统计

```rust
// src/metrics/version_metrics.rs

pub struct VersionMetrics {
    pub api_version_calls: Counter,
    pub v1_calls_7d: Gauge,
    pub v2_calls_7d: Gauge,
    pub migration_progress: Gauge,  // % 已迁移客户端
}

impl VersionMetrics {
    pub async fn collect(&self) -> Result<VersionStats, Error> {
        Ok(VersionStats {
            v1_calls_last_7_days: self.query_calls("v1", Duration::days(7)).await?,
            v2_calls_last_7_days: self.query_calls("v2", Duration::days(7)).await?,
            unique_v1_clients: self.query_unique_clients("v1").await?,
            unique_v2_clients: self.query_unique_clients("v2").await?,
            migration_status: self.calculate_migration_status().await?,
        })
    }
}
```

### Prometheus 告警

```yaml
groups:
  - name: api-versioning
    rules:
      - alert: HighV1Usage
        expr: v1_calls_7d > 10000
        for: 24h
        annotations:
          summary: "High v1 API usage detected"
          action: "Send migration reminder to clients"

      - alert: V1DeprecatedEndpointUsed
        expr: rate(v1_deprecated_endpoint_calls[5m]) > 0
        annotations:
          summary: "v1 deprecated endpoint still in use"
          action: "Contact client for immediate migration"

      - alert: V2DeploymentLag
        expr: v2_avg_response_time > v1_avg_response_time * 1.5
        for: 5m
        annotations:
          summary: "v2 performance degradation"
```

---

**文档状态**: ✅ 已发布
**下一版本**: 2026-02-20
**维护者**: API 团队
