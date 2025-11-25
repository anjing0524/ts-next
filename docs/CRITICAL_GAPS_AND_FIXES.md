# 关键缺陷和修复方案

**优先级**: P0 (生产前必须修复)
**发现日期**: 2025-11-24
**估计修复时间**: 8-10小时

---

## Critical Gap #1: 审计日志导出API缺失

### 问题描述
oauth-service 存储审计日志到数据库，但没有API端点供管理员查询和导出。

### 需求 (来自 FR-005)
```
GET /api/v2/admin/audit-logs
  - 分页: page, limit
  - 过滤: action_type, user_id, start_date, end_date, resource_type
  - 返回: 分页的审计日志列表

GET /api/v2/admin/audit-logs/export?format=csv|json
  - 支持CSV和JSON格式导出
  - 支持日期范围过滤
  - 用于合规性报告和审计
```

### 实现方案

**文件**: `/apps/oauth-service-rust/src/routes/audit_logs.rs` (新建)

```rust
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::sync::Arc;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditLogEntry {
    pub id: String,
    pub user_id: Option<String>,
    pub action_type: String,
    pub resource_type: String,
    pub resource_id: Option<String>,
    pub ip_address: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct AuditLogResponse {
    pub data: Vec<AuditLogEntry>,
    pub total: i64,
    pub page: u32,
    pub page_size: u32,
}

#[derive(Debug, Deserialize)]
pub struct AuditLogQuery {
    #[serde(default = "default_page")]
    pub page: u32,
    #[serde(default = "default_limit")]
    pub limit: u32,
    pub action_type: Option<String>,
    pub user_id: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub resource_type: Option<String>,
}

fn default_page() -> u32 { 1 }
fn default_limit() -> u32 { 50 }

pub async fn list_audit_logs(
    State(pool): State<Arc<SqlitePool>>,
    Query(params): Query<AuditLogQuery>,
) -> impl IntoResponse {
    // 分页参数
    let page = params.page.max(1);
    let limit = params.limit.min(500).max(1);
    let offset = (page - 1) * limit;

    // 构建动态SQL
    let mut query = String::from(
        "SELECT id, user_id, action_type, resource_type, resource_id, ip_address, status, error_message, created_at
         FROM audit_logs WHERE 1=1"
    );
    let mut args: Vec<String> = vec![];

    if let Some(action_type) = params.action_type {
        query.push_str(" AND action_type = ?");
        args.push(action_type);
    }
    if let Some(user_id) = params.user_id {
        query.push_str(" AND user_id = ?");
        args.push(user_id);
    }
    if let Some(resource_type) = params.resource_type {
        query.push_str(" AND resource_type = ?");
        args.push(resource_type);
    }
    if let Some(start_date) = params.start_date {
        query.push_str(" AND created_at >= ?");
        args.push(start_date);
    }
    if let Some(end_date) = params.end_date {
        query.push_str(" AND created_at < ?");
        args.push(end_date);
    }

    // 获取总数
    let total_query = format!("SELECT COUNT(*) as total FROM ({})", query);
    let total: i64 = 100; // 实际需要执行查询

    // 查询数据
    query.push_str(" ORDER BY created_at DESC LIMIT ? OFFSET ?");

    // 这里应该执行实际的数据库查询
    let logs = vec![]; // 实际返回来自数据库的日志

    let response = AuditLogResponse {
        data: logs,
        total,
        page,
        page_size: limit,
    };

    (StatusCode::OK, Json(response))
}

pub async fn export_audit_logs(
    State(pool): State<Arc<SqlitePool>>,
    Query(params): Query<ExportQuery>,
) -> impl IntoResponse {
    let format = params.format.unwrap_or_else(|| "json".to_string());

    // 查询审计日志
    let logs = vec![]; // 实际从数据库查询

    if format.to_lowercase() == "csv" {
        let csv_content = generate_csv(&logs);
        return (
            StatusCode::OK,
            [("Content-Type", "text/csv"), ("Content-Disposition", "attachment; filename=\"audit-logs.csv\"")],
            csv_content,
        ).into_response();
    } else {
        let json = Json(logs);
        return (
            StatusCode::OK,
            [("Content-Type", "application/json")],
            json,
        ).into_response();
    }
}

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    pub format: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

fn generate_csv(logs: &[AuditLogEntry]) -> String {
    let mut csv = String::from("ID,User ID,Action,Resource Type,Resource ID,IP,Status,Error,Timestamp\n");
    for log in logs {
        csv.push_str(&format!(
            "\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\"\n",
            log.id,
            log.user_id.as_deref().unwrap_or(""),
            log.action_type,
            log.resource_type,
            log.resource_id.as_deref().unwrap_or(""),
            log.ip_address.as_deref().unwrap_or(""),
            log.status,
            log.error_message.as_deref().unwrap_or(""),
            log.created_at
        ));
    }
    csv
}
```

**在app.rs中添加路由**:
```rust
.route(
    "/api/v2/admin/audit-logs",
    get(routes::audit_logs::list_audit_logs),
)
.route(
    "/api/v2/admin/audit-logs/export",
    get(routes::audit_logs::export_audit_logs),
)
```

**在routes/mod.rs中导出**:
```rust
pub mod audit_logs;
```

### 测试用例
```bash
# 列表查询
curl "http://localhost:3001/api/v2/admin/audit-logs?page=1&limit=50&action_type=LOGIN"

# CSV导出
curl "http://localhost:3001/api/v2/admin/audit-logs/export?format=csv&start_date=2025-11-01&end_date=2025-11-30"

# JSON导出
curl "http://localhost:3001/api/v2/admin/audit-logs/export?format=json"
```

---

## Critical Gap #2: 安全头部缺失

### 问题描述
oauth-service没有返回必需的安全HTTP头部，违反OWASP要求。

### 需求
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'; frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains (生产环境)
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

### 实现方案

**创建安全头部中间件**: `/apps/oauth-service-rust/src/middleware/security_headers.rs`

```rust
use axum::middleware::Next;
use axum::http::{Request, header::HeaderValue};
use tower::ServiceExt;

pub async fn security_headers_middleware<B>(
    mut request: Request<B>,
    next: Next,
) -> Result<impl IntoResponse, Box<dyn std::error::Error>> {
    let mut response = next.run(request).await;

    // 添加安全头部
    response.headers_mut().insert(
        "X-Content-Type-Options",
        HeaderValue::from_static("nosniff"),
    );
    response.headers_mut().insert(
        "X-Frame-Options",
        HeaderValue::from_static("DENY"),
    );
    response.headers_mut().insert(
        "X-XSS-Protection",
        HeaderValue::from_static("1; mode=block"),
    );
    response.headers_mut().insert(
        "Referrer-Policy",
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    response.headers_mut().insert(
        "Content-Security-Policy",
        HeaderValue::from_static("default-src 'self'; frame-ancestors 'none'"),
    );

    // 生产环境添加HSTS
    if std::env::var("ENVIRONMENT").unwrap_or_default() == "production" {
        response.headers_mut().insert(
            "Strict-Transport-Security",
            HeaderValue::from_static("max-age=31536000; includeSubDomains; preload"),
        );
    }

    Ok(response)
}
```

**在app.rs中应用**:
```rust
.layer(axum::middleware::from_fn(middleware::security_headers::security_headers_middleware))
```

---

## Important Gap #1: /auth/login 速率限制

### 问题描述
登陆端点没有速率限制，易受暴力破解攻击。

### 需求
```
- IP级别速率限制: 5次尝试/5分钟
- 账户级别速率限制: 5次失败 → 30分钟锁定 (已实现)
```

### 实现方案
使用existing rate_limit infrastructure添加到login端点

---

## Important Gap #2: pingora-proxy 权限检查

### 问题描述
pingora-proxy 转发请求到admin-portal/oauth-service但不检查权限。

### 设计问题
- 权限检查应该在哪里? oauth-service还是pingora-proxy?
- 当前: oauth-service在API级别检查权限
- 问题: pingora-proxy如果被直接访问(绕过代理)，权限检查失效

### 建议方案
1. **信任边界**: 假设只有代理可以访问后端服务
2. **验证**: pingora-proxy验证Authorization头并转发到后端

---

## Important Gap #3: Token轮换验证 (admin-portal)

### 当前实现
admin-portal 调用 oauth-service 获取新tokens，但未验证refresh_token是否已轮换

### 需求
每次refresh_token使用时，必须返回新的refresh_token

### 修复
```typescript
// lib/api/enhanced-api-client.ts 中的 performTokenRefresh

const data = await response.json();

if (data.refresh_token !== oldRefreshToken) {
    // ✅ Token已轮换，安全
    TokenStorage.setTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
    });
} else {
    // ❌ Token未轮换，可能是重放攻击
    throw new Error("Refresh token was not rotated");
}
```

---

## 修复优先级和时间表

### Phase 1: 立即 (0-6小时)
- [ ] 实现 `/api/v2/admin/audit-logs` 列表端点 (2h)
- [ ] 实现 `/api/v2/admin/audit-logs/export` 导出端点 (2h)
- [ ] 添加安全头部中间件 (1.5h)
- [ ] 测试所有端点 (1.5h)

### Phase 2: 24小时内
- [ ] 添加/auth/login速率限制 (1.5h)
- [ ] 添加权限变更审计日志 (2h)
- [ ] admin-portal token轮换验证 (1h)

### Phase 3: 1周内
- [ ] pingora-proxy权限检查架构评审 (4h)
- [ ] 密码策略验证 (1h)
- [ ] 性能基准测试 (4h)

---

## 验收标准

### 审计日志导出
- [ ] 可以列表查询审计日志 (with pagination)
- [ ] 可以按action_type过滤
- [ ] 可以按日期范围过滤
- [ ] 支持CSV导出
- [ ] 支持JSON导出
- [ ] 列表响应 < 100ms (p95)

### 安全头部
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY
- [ ] CSP正确设置
- [ ] HSTS在生产环境启用
- [ ] 通过安全扫描 (SNYK等)

### 速率限制
- [ ] /auth/login: 5次/5分钟 per IP
- [ ] 返回 429 状态码
- [ ] Retry-After头部

---

**下一步**: 开始实现Phase 1的修复
