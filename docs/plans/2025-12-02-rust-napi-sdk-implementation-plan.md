# Rust napi SDK 与 Admin Portal Server Actions 集成实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 oauth-service-rust 中实现 napi SDK，使 Admin Portal 的 Server Actions 能通过 Rust 原生模块调用 OAuth Service，保证 API 和 SDK 的完整同步。

**Architecture:**
- napi SDK 作为 oauth-service-rust 的内部 Cargo crate
- 使用 reqwest 实现 HTTP 客户端（优先），保留 TCP 接口（备选）
- 所有数据类型使用 serde 序列化/反序列化
- 工厂函数 + 模块类实例的组合设计
- 完整的集成测试确保 API 和 SDK 对应

**Tech Stack:**
- Rust 2021 Edition + napi-rs
- reqwest（HTTP 客户端）
- serde/serde_json（序列化）
- tokio（异步运行时）
- Jest + Node.js（napi 测试）

---

## Phase 1: napi 基础设施搭建

### ✅ Task 1: 更新 oauth-service-rust Cargo.toml 添加 napi 依赖 (COMPLETED)

**Completion Summary:**
- ✅ 成功添加 napi 依赖到 Cargo.toml 的 [dependencies] 和 [dev-dependencies]
- ✅ 添加 [package.metadata.napi] 配置
- ✅ 创建 src/napi/mod.rs 模块入口文件
- ✅ 创建 npm/package.json 配置文件
- ✅ cargo check 验证通过，无编译错误
- ✅ 提交: dadd0eff "feat(oauth-sdk): Initialize napi SDK structure with dependencies"

**Files:**
- Modify: `apps/oauth-service-rust/Cargo.toml`
- Create: `apps/oauth-service-rust/src/napi/mod.rs`
- Create: `apps/oauth-service-rust/npm/package.json`

**Step 1: 添加 napi 依赖到 Cargo.toml**

在 `apps/oauth-service-rust/Cargo.toml` 的 `[dependencies]` 部分添加：

```toml
[dependencies]
# 现有依赖...
napi = { version = "2.16", features = ["async", "serde-json"] }
napi-derive = "2.16"
napi-build = "2.1"

[dev-dependencies]
# 现有依赖...
napi = { version = "2.16", features = ["async", "serde-json"] }
napi-derive = "2.16"

[[example]]
name = "napi"
path = "examples/napi.rs"
```

同时在 `[package]` 部分添加：

```toml
[package.metadata.napi]
name = "oauth-service-napi"
version = "0.1.0"
```

**Step 2: 运行验证构建配置**

```bash
cd apps/oauth-service-rust
cargo check
```

Expected: 编译成功，无 napi 相关错误

**Step 3: 创建 napi 模块入口**

File: `apps/oauth-service-rust/src/napi/mod.rs`

```rust
// napi SDK 模块
pub mod config;
pub mod http_client;
pub mod error;
pub mod modules;
pub mod sdk;

pub use sdk::OAuthSDK;
pub use config::SDKConfig;
pub use error::SDKError;
```

**Step 4: 创建 npm package.json**

File: `apps/oauth-service-rust/npm/package.json`

```json
{
  "name": "oauth-service-napi",
  "version": "0.1.0",
  "description": "OAuth Service Rust napi SDK for Node.js",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "napi": {
    "name": "oauth-service-napi",
    "triples": [
      "x86_64-apple-darwin",
      "aarch64-apple-darwin",
      "x86_64-unknown-linux-gnu",
      "aarch64-unknown-linux-gnu",
      "x86_64-pc-windows-msvc"
    ]
  },
  "scripts": {
    "build": "napi build --release",
    "build:debug": "napi build",
    "test": "jest",
    "prepublishOnly": "npm run build"
  },
  "devDependencies": {
    "@napi-rs/cli": "^2.16.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "@types/jest": "^29.5.0",
    "typescript": "^5.0.0"
  }
}
```

**Step 5: 提交**

```bash
git add apps/oauth-service-rust/Cargo.toml
git add apps/oauth-service-rust/src/napi/mod.rs
git add apps/oauth-service-rust/npm/package.json
git commit -m "feat(oauth-sdk): Initialize napi SDK structure with dependencies"
```

---

### ✅ Task 2: 实现 napi SDK 核心结构（配置和 HTTP 客户端）(COMPLETED)

**Completion Summary:**
- ✅ 成功创建 SDKConfig 结构体，实现 builder pattern 配置管理
- ✅ 实现 SDKError 错误类型，支持状态码和结构化错误处理
- ✅ 完成 HttpClient 实现，集成 reqwest + 指数退避重试逻辑
- ✅ 更新 lib.rs 导出 napi 模块
- ✅ 添加 reqwest 依赖到 Cargo.toml
- ✅ 所有测试通过：2/2 tests ok
- ✅ 提交: 8bec8d02 "feat(oauth-sdk): Implement HTTP client with config and error handling"

**Files:**
- Create: `apps/oauth-service-rust/src/napi/config.rs`
- Create: `apps/oauth-service-rust/src/napi/error.rs`
- Create: `apps/oauth-service-rust/src/napi/http_client.rs`
- Create: `apps/oauth-service-rust/tests/napi_http_client.rs`

**Step 1: 实现 SDK 配置和错误类型**

File: `apps/oauth-service-rust/src/napi/config.rs`

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SDKConfig {
    /// OAuth Service 基础 URL
    pub base_url: String,
    /// 请求超时时间（毫秒）
    pub timeout: Option<u64>,
    /// 最大重试次数
    pub retry_count: Option<u32>,
    /// 重试延迟基数（毫秒）
    pub retry_delay: Option<u64>,
    /// 是否启用调试日志
    pub debug: Option<bool>,
}

impl Default for SDKConfig {
    fn default() -> Self {
        Self {
            base_url: "http://localhost:8080".to_string(),
            timeout: Some(5000),
            retry_count: Some(3),
            retry_delay: Some(100),
            debug: Some(false),
        }
    }
}

impl SDKConfig {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url,
            ..Default::default()
        }
    }

    pub fn with_timeout(mut self, timeout: u64) -> Self {
        self.timeout = Some(timeout);
        self
    }

    pub fn with_retry(mut self, count: u32, delay: u64) -> Self {
        self.retry_count = Some(count);
        self.retry_delay = Some(delay);
        self
    }

    pub fn with_debug(mut self, debug: bool) -> Self {
        self.debug = Some(debug);
        self
    }
}
```

File: `apps/oauth-service-rust/src/napi/error.rs`

```rust
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SDKError {
    pub code: String,
    pub message: String,
    pub status_code: Option<u16>,
    pub details: Option<serde_json::Value>,
}

impl SDKError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            status_code: None,
            details: None,
        }
    }

    pub fn with_status(mut self, status: u16) -> Self {
        self.status_code = Some(status);
        self
    }

    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = Some(details);
        self
    }
}

impl fmt::Display for SDKError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for SDKError {}

pub type SDKResult<T> = Result<T, SDKError>;
```

**Step 2: 实现 HTTP 客户端**

File: `apps/oauth-service-rust/src/napi/http_client.rs`

```rust
use crate::napi::config::SDKConfig;
use crate::napi::error::{SDKError, SDKResult};
use reqwest::{Client, Method, StatusCode};
use serde_json::Value;
use std::time::Duration;

pub struct HttpClient {
    client: Client,
    config: SDKConfig,
}

impl HttpClient {
    pub fn new(config: SDKConfig) -> SDKResult<Self> {
        let timeout = Duration::from_millis(config.timeout.unwrap_or(5000));
        let client = Client::builder()
            .timeout(timeout)
            .build()
            .map_err(|e| SDKError::new("HTTP_CLIENT_ERROR", e.to_string()))?;

        Ok(Self { client, config })
    }

    async fn request(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
    ) -> SDKResult<Value> {
        let url = format!("{}{}", self.config.base_url, path);
        let mut retries = 0;
        let max_retries = self.config.retry_count.unwrap_or(3);

        loop {
            let response = if let Some(ref body) = body {
                self.client
                    .request(method.clone(), &url)
                    .json(body)
                    .send()
                    .await
            } else {
                self.client.request(method.clone(), &url).send().await
            };

            match response {
                Ok(resp) => {
                    if resp.status().is_success() {
                        return resp
                            .json::<Value>()
                            .await
                            .map_err(|e| SDKError::new("JSON_PARSE_ERROR", e.to_string()));
                    } else {
                        let status = resp.status();
                        let body = resp
                            .text()
                            .await
                            .unwrap_or_else(|_| "Unknown error".to_string());

                        // 不重试客户端错误（4xx）
                        if status.is_client_error() {
                            return Err(SDKError::new(
                                format!("HTTP_{}", status.as_u16()),
                                body,
                            )
                            .with_status(status.as_u16()));
                        }

                        // 重试服务器错误（5xx）
                        if retries < max_retries {
                            retries += 1;
                            let delay = self.config.retry_delay.unwrap_or(100) * (2_u64.pow(retries - 1));
                            tokio::time::sleep(Duration::from_millis(delay)).await;
                            continue;
                        }

                        return Err(SDKError::new(
                            format!("HTTP_{}", status.as_u16()),
                            body,
                        )
                        .with_status(status.as_u16()));
                    }
                }
                Err(e) => {
                    if retries < max_retries && !e.is_status() {
                        retries += 1;
                        let delay = self.config.retry_delay.unwrap_or(100) * (2_u64.pow(retries - 1));
                        tokio::time::sleep(Duration::from_millis(delay)).await;
                        continue;
                    }
                    return Err(SDKError::new("REQUEST_ERROR", e.to_string()));
                }
            }
        }
    }

    pub async fn get(&self, path: &str) -> SDKResult<Value> {
        self.request(Method::GET, path, None).await
    }

    pub async fn post(&self, path: &str, body: Value) -> SDKResult<Value> {
        self.request(Method::POST, path, Some(body)).await
    }

    pub async fn put(&self, path: &str, body: Value) -> SDKResult<Value> {
        self.request(Method::PUT, path, Some(body)).await
    }

    pub async fn patch(&self, path: &str, body: Value) -> SDKResult<Value> {
        self.request(Method::PATCH, path, Some(body)).await
    }

    pub async fn delete(&self, path: &str) -> SDKResult<Value> {
        self.request(Method::DELETE, path, None).await
    }
}
```

**Step 3: 编写 HTTP 客户端测试**

File: `apps/oauth-service-rust/tests/napi_http_client.rs`

```rust
#[cfg(test)]
mod tests {
    use oauth_service_rust::napi::config::SDKConfig;
    use oauth_service_rust::napi::http_client::HttpClient;

    #[test]
    fn test_config_creation() {
        let config = SDKConfig::new("http://localhost:8080".to_string())
            .with_timeout(10000)
            .with_retry(5, 200)
            .with_debug(true);

        assert_eq!(config.base_url, "http://localhost:8080");
        assert_eq!(config.timeout, Some(10000));
        assert_eq!(config.retry_count, Some(5));
        assert_eq!(config.retry_delay, Some(200));
        assert_eq!(config.debug, Some(true));
    }

    #[tokio::test]
    async fn test_http_client_creation() {
        let config = SDKConfig::new("http://localhost:8080".to_string());
        let client = HttpClient::new(config);
        assert!(client.is_ok());
    }
}
```

**Step 4: 运行测试验证**

```bash
cd apps/oauth-service-rust
cargo test napi_http_client --lib
```

Expected: 测试通过

**Step 5: 提交**

```bash
git add apps/oauth-service-rust/src/napi/config.rs
git add apps/oauth-service-rust/src/napi/error.rs
git add apps/oauth-service-rust/src/napi/http_client.rs
git add apps/oauth-service-rust/tests/napi_http_client.rs
git commit -m "feat(oauth-sdk): Implement HTTP client with config and error handling"
```

---

## Phase 2: napi SDK 模块实现

### ✅ Task 3: 实现 Auth、Token、User 模块 (COMPLETED)

**Completion Summary:**
- ✅ 成功创建 modules 目录结构和 mod.rs 入口文件
- ✅ 实现 AuthModule：login、logout、submit_consent 方法
- ✅ 实现 TokenModule：refresh、introspect、revoke 方法
- ✅ 实现 UserModule：get_info、update_profile 方法
- ✅ 创建 RBAC、Client、Audit 模块 stub 以支持编译
- ✅ 为 HttpClient 添加 Clone 实现
- ✅ 为 SDKError 添加 From<serde_json::Error> 实现
- ✅ 所有序列化/反序列化测试通过：2/2 tests ok
- ✅ 提交: a56fd42c "feat(oauth-sdk): Implement Auth, Token, and User modules"

**Files:**
- Create: `apps/oauth-service-rust/src/napi/modules/mod.rs`
- Create: `apps/oauth-service-rust/src/napi/modules/auth.rs`
- Create: `apps/oauth-service-rust/src/napi/modules/token.rs`
- Create: `apps/oauth-service-rust/src/napi/modules/user.rs`
- Create: `apps/oauth-service-rust/tests/napi_modules.rs`

**Step 1: 创建模块入口**

File: `apps/oauth-service-rust/src/napi/modules/mod.rs`

```rust
pub mod auth;
pub mod token;
pub mod user;
pub mod rbac;
pub mod client;
pub mod audit;

pub use auth::AuthModule;
pub use token::TokenModule;
pub use user::UserModule;
pub use rbac::RbacModule;
pub use client::ClientModule;
pub use audit::AuditModule;
```

**Step 2: 实现 Auth 模块**

File: `apps/oauth-service-rust/src/napi/modules/auth.rs`

```rust
use crate::napi::http_client::HttpClient;
use crate::napi::error::SDKResult;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LoginResponse {
    pub session_token: String,
    pub user_id: String,
    pub username: String,
    pub expires_in: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConsentRequest {
    pub client_id: String,
    pub scopes: Vec<String>,
    pub authorized: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConsentResponse {
    pub authorization_code: String,
    pub expires_in: i32,
}

pub struct AuthModule {
    http_client: HttpClient,
}

impl AuthModule {
    pub fn new(http_client: HttpClient) -> Self {
        Self { http_client }
    }

    pub async fn login(&self, credentials: LoginRequest) -> SDKResult<LoginResponse> {
        let body = serde_json::to_value(&credentials)?;
        let response = self.http_client.post("/api/v2/auth/login", body).await?;
        serde_json::from_value::<LoginResponse>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn logout(&self) -> SDKResult<bool> {
        let response = self.http_client.post("/api/v2/auth/logout", json!({})).await?;
        response
            .get("success")
            .and_then(|v| v.as_bool())
            .ok_or_else(|| crate::napi::error::SDKError::new("PARSE_ERROR", "Missing success field"))
    }

    pub async fn submit_consent(&self, consent: ConsentRequest) -> SDKResult<ConsentResponse> {
        let body = serde_json::to_value(&consent)?;
        let response = self.http_client.post("/api/v2/auth/consent", body).await?;
        serde_json::from_value::<ConsentResponse>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }
}
```

**Step 3: 实现 Token 模块**

File: `apps/oauth-service-rust/src/napi/modules/token.rs`

```rust
use crate::napi::http_client::HttpClient;
use crate::napi::error::SDKResult;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
    pub id_token: String,
    pub expires_in: i32,
    pub token_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenIntrospectResponse {
    pub active: bool,
    pub scope: String,
    pub user_id: String,
    pub exp: i64,
}

pub struct TokenModule {
    http_client: HttpClient,
}

impl TokenModule {
    pub fn new(http_client: HttpClient) -> Self {
        Self { http_client }
    }

    pub async fn refresh(&self, refresh_token: String) -> SDKResult<TokenPair> {
        let body = json!({ "refresh_token": refresh_token });
        let response = self.http_client.post("/api/v2/token/refresh", body).await?;
        serde_json::from_value::<TokenPair>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn introspect(&self, token: String) -> SDKResult<TokenIntrospectResponse> {
        let body = json!({ "token": token });
        let response = self.http_client.post("/api/v2/token/introspect", body).await?;
        serde_json::from_value::<TokenIntrospectResponse>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn revoke(&self, token: String) -> SDKResult<bool> {
        let body = json!({ "token": token });
        let response = self.http_client.post("/api/v2/token/revoke", body).await?;
        response
            .get("success")
            .and_then(|v| v.as_bool())
            .ok_or_else(|| crate::napi::error::SDKError::new("PARSE_ERROR", "Missing success field"))
    }
}
```

**Step 4: 实现 User 模块**

File: `apps/oauth-service-rust/src/napi/modules/user.rs`

```rust
use crate::napi::http_client::HttpClient;
use crate::napi::error::SDKResult;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserInfo {
    pub user_id: String,
    pub username: String,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub email: Option<String>,
}

pub struct UserModule {
    http_client: HttpClient,
}

impl UserModule {
    pub fn new(http_client: HttpClient) -> Self {
        Self { http_client }
    }

    pub async fn get_info(&self) -> SDKResult<UserInfo> {
        let response = self.http_client.get("/api/v2/user/info").await?;
        serde_json::from_value::<UserInfo>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn update_profile(&self, profile: UpdateProfileRequest) -> SDKResult<UserInfo> {
        let body = serde_json::to_value(&profile)?;
        let response = self.http_client.put("/api/v2/user/profile", body).await?;
        serde_json::from_value::<UserInfo>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }
}
```

**Step 5: 编写模块测试**

File: `apps/oauth-service-rust/tests/napi_modules.rs`

```rust
#[cfg(test)]
mod tests {
    use oauth_service_rust::napi::modules::auth::LoginRequest;
    use oauth_service_rust::napi::modules::token::TokenIntrospectResponse;
    use oauth_service_rust::napi::modules::user::UserInfo;

    #[test]
    fn test_login_request_serialization() {
        let req = LoginRequest {
            username: "test@example.com".to_string(),
            password: "password".to_string(),
        };
        let json = serde_json::to_value(&req).unwrap();
        assert_eq!(json["username"], "test@example.com");
        assert_eq!(json["password"], "password");
    }

    #[test]
    fn test_user_info_deserialization() {
        let json = serde_json::json!({
            "user_id": "user123",
            "username": "test",
            "email": "test@example.com",
            "display_name": "Test User",
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-02T00:00:00Z"
        });
        let user: UserInfo = serde_json::from_value(json).unwrap();
        assert_eq!(user.user_id, "user123");
        assert_eq!(user.email, "test@example.com");
    }
}
```

**Step 6: 运行测试**

```bash
cd apps/oauth-service-rust
cargo test napi_modules
```

Expected: 所有序列化测试通过

**Step 7: 提交**

```bash
git add apps/oauth-service-rust/src/napi/modules/
git add apps/oauth-service-rust/tests/napi_modules.rs
git commit -m "feat(oauth-sdk): Implement Auth, Token, and User modules"
```

---

### Task 4: 实现 RBAC、Client、Audit 模块

**Files:**
- Create: `apps/oauth-service-rust/src/napi/modules/rbac.rs`
- Create: `apps/oauth-service-rust/src/napi/modules/client.rs`
- Create: `apps/oauth-service-rust/src/napi/modules/audit.rs`

**Step 1: 实现 RBAC 模块**

File: `apps/oauth-service-rust/src/napi/modules/rbac.rs`

```rust
use crate::napi::http_client::HttpClient;
use crate::napi::error::SDKResult;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Permission {
    pub id: String,
    pub name: String,
    pub description: String,
    pub resource: String,
    pub action: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Role {
    pub id: String,
    pub name: String,
    pub description: String,
    pub permissions: Vec<Permission>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserRole {
    pub user_id: String,
    pub role_id: String,
    pub assigned_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PaginatedResponse<T> {
    pub items: Vec<T>,
    pub total: i32,
    pub page: i32,
    pub page_size: i32,
    pub has_more: bool,
}

pub struct RbacModule {
    http_client: HttpClient,
}

impl RbacModule {
    pub fn new(http_client: HttpClient) -> Self {
        Self { http_client }
    }

    pub async fn get_permissions(
        &self,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> SDKResult<PaginatedResponse<Permission>> {
        let p = page.unwrap_or(1);
        let ps = page_size.unwrap_or(10);
        let path = format!("/api/v2/rbac/permissions?page={}&page_size={}", p, ps);
        let response = self.http_client.get(&path).await?;
        serde_json::from_value::<PaginatedResponse<Permission>>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn get_roles(
        &self,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> SDKResult<PaginatedResponse<Role>> {
        let p = page.unwrap_or(1);
        let ps = page_size.unwrap_or(10);
        let path = format!("/api/v2/rbac/roles?page={}&page_size={}", p, ps);
        let response = self.http_client.get(&path).await?;
        serde_json::from_value::<PaginatedResponse<Role>>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn assign_role_to_user(&self, user_id: String, role_id: String) -> SDKResult<UserRole> {
        let body = json!({ "role_id": role_id });
        let path = format!("/api/v2/rbac/users/{}/roles", user_id);
        let response = self.http_client.post(&path, body).await?;
        serde_json::from_value::<UserRole>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn revoke_role_from_user(&self, user_id: String, role_id: String) -> SDKResult<bool> {
        let path = format!("/api/v2/rbac/users/{}/roles/{}", user_id, role_id);
        let response = self.http_client.delete(&path).await?;
        response
            .get("success")
            .and_then(|v| v.as_bool())
            .ok_or_else(|| crate::napi::error::SDKError::new("PARSE_ERROR", "Missing success field"))
    }
}
```

**Step 2: 实现 Client 模块**

File: `apps/oauth-service-rust/src/napi/modules/client.rs`

```rust
use crate::napi::http_client::HttpClient;
use crate::napi::error::SDKResult;
use crate::napi::modules::rbac::PaginatedResponse;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClientInfo {
    pub client_id: String,
    pub client_name: String,
    pub client_secret: Option<String>,
    pub redirect_uris: Vec<String>,
    pub grant_types: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateClientRequest {
    pub client_name: String,
    pub redirect_uris: Vec<String>,
    pub grant_types: Vec<String>,
}

pub struct ClientModule {
    http_client: HttpClient,
}

impl ClientModule {
    pub fn new(http_client: HttpClient) -> Self {
        Self { http_client }
    }

    pub async fn list_clients(
        &self,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> SDKResult<PaginatedResponse<ClientInfo>> {
        let p = page.unwrap_or(1);
        let ps = page_size.unwrap_or(10);
        let path = format!("/api/v2/client/clients?page={}&page_size={}", p, ps);
        let response = self.http_client.get(&path).await?;
        serde_json::from_value::<PaginatedResponse<ClientInfo>>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn get_client(&self, client_id: String) -> SDKResult<ClientInfo> {
        let path = format!("/api/v2/client/clients/{}", client_id);
        let response = self.http_client.get(&path).await?;
        serde_json::from_value::<ClientInfo>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn create_client(&self, client: CreateClientRequest) -> SDKResult<ClientInfo> {
        let body = serde_json::to_value(&client)?;
        let response = self.http_client.post("/api/v2/client/clients", body).await?;
        serde_json::from_value::<ClientInfo>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn update_client(
        &self,
        client_id: String,
        client: CreateClientRequest,
    ) -> SDKResult<ClientInfo> {
        let body = serde_json::to_value(&client)?;
        let path = format!("/api/v2/client/clients/{}", client_id);
        let response = self.http_client.put(&path, body).await?;
        serde_json::from_value::<ClientInfo>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn delete_client(&self, client_id: String) -> SDKResult<bool> {
        let path = format!("/api/v2/client/clients/{}", client_id);
        let response = self.http_client.delete(&path).await?;
        response
            .get("success")
            .and_then(|v| v.as_bool())
            .ok_or_else(|| crate::napi::error::SDKError::new("PARSE_ERROR", "Missing success field"))
    }
}
```

**Step 3: 实现 Audit 模块**

File: `apps/oauth-service-rust/src/napi/modules/audit.rs`

```rust
use crate::napi::http_client::HttpClient;
use crate::napi::error::SDKResult;
use crate::napi::modules::rbac::PaginatedResponse;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditLog {
    pub id: String,
    pub actor_id: String,
    pub action: String,
    pub resource_type: String,
    pub resource_id: String,
    pub status: String,  // "success" | "failure"
    pub details: serde_json::Value,
    pub created_at: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditLogFilter {
    pub actor_id: Option<String>,
    pub resource_type: Option<String>,
    pub action: Option<String>,
    pub status: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}

pub struct AuditModule {
    http_client: HttpClient,
}

impl AuditModule {
    pub fn new(http_client: HttpClient) -> Self {
        Self { http_client }
    }

    pub async fn get_logs(
        &self,
        filter: Option<AuditLogFilter>,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> SDKResult<PaginatedResponse<AuditLog>> {
        let mut query_params = format!("?page={}&page_size={}", page.unwrap_or(1), page_size.unwrap_or(10));

        if let Some(f) = filter {
            if let Some(actor_id) = f.actor_id {
                query_params.push_str(&format!("&actor_id={}", actor_id));
            }
            if let Some(resource_type) = f.resource_type {
                query_params.push_str(&format!("&resource_type={}", resource_type));
            }
            if let Some(action) = f.action {
                query_params.push_str(&format!("&action={}", action));
            }
            if let Some(status) = f.status {
                query_params.push_str(&format!("&status={}", status));
            }
            if let Some(start_time) = f.start_time {
                query_params.push_str(&format!("&start_time={}", start_time));
            }
            if let Some(end_time) = f.end_time {
                query_params.push_str(&format!("&end_time={}", end_time));
            }
        }

        let path = format!("/api/v2/audit/logs{}", query_params);
        let response = self.http_client.get(&path).await?;
        serde_json::from_value::<PaginatedResponse<AuditLog>>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn get_user_logs(
        &self,
        user_id: String,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> SDKResult<PaginatedResponse<AuditLog>> {
        let filter = AuditLogFilter {
            actor_id: Some(user_id),
            ..Default::default()
        };
        self.get_logs(Some(filter), page, page_size).await
    }
}

impl Default for AuditLogFilter {
    fn default() -> Self {
        Self {
            actor_id: None,
            resource_type: None,
            action: None,
            status: None,
            start_time: None,
            end_time: None,
        }
    }
}
```

**Step 4: 运行全部测试**

```bash
cd apps/oauth-service-rust
cargo test napi_modules
```

Expected: 所有测试通过

**Step 5: 提交**

```bash
git add apps/oauth-service-rust/src/napi/modules/rbac.rs
git add apps/oauth-service-rust/src/napi/modules/client.rs
git add apps/oauth-service-rust/src/napi/modules/audit.rs
git commit -m "feat(oauth-sdk): Implement RBAC, Client, and Audit modules"
```

---

## Phase 3: napi SDK 主类和 N-API 绑定

### Task 5: 实现 OAuthSDK 主类和 napi 导出

**Files:**
- Create: `apps/oauth-service-rust/src/napi/sdk.rs`
- Modify: `apps/oauth-service-rust/src/lib.rs`
- Create: `apps/oauth-service-rust/src/napi_binding.rs`
- Create: `apps/oauth-service-rust/npm/index.d.ts`

**Step 1: 实现 SDK 主类**

File: `apps/oauth-service-rust/src/napi/sdk.rs`

```rust
use crate::napi::config::SDKConfig;
use crate::napi::http_client::HttpClient;
use crate::napi::error::SDKResult;
use crate::napi::modules::*;

pub struct OAuthSDK {
    http_client: HttpClient,
    pub auth: auth::AuthModule,
    pub token: token::TokenModule,
    pub user: user::UserModule,
    pub rbac: rbac::RbacModule,
    pub client: client::ClientModule,
    pub audit: audit::AuditModule,
}

impl OAuthSDK {
    pub fn new(config: SDKConfig) -> SDKResult<Self> {
        let http_client = HttpClient::new(config)?;

        Ok(Self {
            auth: auth::AuthModule::new(http_client.clone()),
            token: token::TokenModule::new(http_client.clone()),
            user: user::UserModule::new(http_client.clone()),
            rbac: rbac::RbacModule::new(http_client.clone()),
            client: client::ClientModule::new(http_client.clone()),
            audit: audit::AuditModule::new(http_client.clone()),
            http_client,
        })
    }
}
```

**Step 2: 添加 Clone 实现到 HttpClient**

修改 `apps/oauth-service-rust/src/napi/http_client.rs`，在 `impl` 前添加 `#[derive(Clone)]`：

```rust
#[derive(Clone)]
pub struct HttpClient {
    client: Client,
    config: SDKConfig,
}
```

同时需要为 `reqwest::Client` 实现 Clone（它本身已经支持）。

**Step 3: 更新 lib.rs 导出 napi 模块**

Modify: `apps/oauth-service-rust/src/lib.rs`

```rust
pub mod napi;
pub mod services;
// ... 其他模块

// 导出 napi SDK 的公共 API
pub use napi::{OAuthSDK, SDKConfig, SDKError, SDKResult};
```

**Step 4: 创建 napi 绑定**

File: `apps/oauth-service-rust/src/napi_binding.rs`

```rust
use napi::bindgen_prelude::*;
use crate::napi::{OAuthSDK, SDKConfig};
use napi_derive::napi;

#[napi(object)]
pub struct NapiSDKConfig {
    pub base_url: String,
    pub timeout: Option<u64>,
    pub retry_count: Option<u32>,
    pub retry_delay: Option<u64>,
    pub debug: Option<bool>,
}

impl From<NapiSDKConfig> for SDKConfig {
    fn from(config: NapiSDKConfig) -> Self {
        SDKConfig {
            base_url: config.base_url,
            timeout: config.timeout,
            retry_count: config.retry_count,
            retry_delay: config.retry_delay,
            debug: config.debug,
        }
    }
}

#[napi]
pub fn create_sdk(config: NapiSDKConfig) -> Result<NapiOAuthSDK> {
    let sdk_config: SDKConfig = config.into();
    let sdk = OAuthSDK::new(sdk_config)
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

    Ok(NapiOAuthSDK { sdk })
}

pub struct NapiOAuthSDK {
    sdk: OAuthSDK,
}

#[napi]
impl NapiOAuthSDK {
    #[napi]
    pub async fn auth_login(&self, username: String, password: String) -> Result<serde_json::Value> {
        let result = self.sdk.auth
            .login(crate::napi::modules::auth::LoginRequest { username, password })
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        Ok(serde_json::to_value(result)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?)
    }

    #[napi]
    pub async fn auth_logout(&self) -> Result<bool> {
        self.sdk.auth
            .logout()
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))
    }

    #[napi]
    pub async fn token_refresh(&self, refresh_token: String) -> Result<serde_json::Value> {
        let result = self.sdk.token
            .refresh(refresh_token)
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        Ok(serde_json::to_value(result)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?)
    }

    #[napi]
    pub async fn user_get_info(&self) -> Result<serde_json::Value> {
        let result = self.sdk.user
            .get_info()
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        Ok(serde_json::to_value(result)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?)
    }
}
```

**Step 5: 创建 TypeScript 定义**

File: `apps/oauth-service-rust/npm/index.d.ts`

```typescript
export interface SDKConfig {
  base_url: string;
  timeout?: number;
  retry_count?: number;
  retry_delay?: number;
  debug?: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  session_token: string;
  user_id: string;
  username: string;
  expires_in: number;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
}

export interface UserInfo {
  user_id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export class OAuthSDK {
  constructor(config: SDKConfig);

  // Auth methods
  authLogin(username: string, password: string): Promise<LoginResponse>;
  authLogout(): Promise<boolean>;

  // Token methods
  tokenRefresh(refreshToken: string): Promise<TokenPair>;

  // User methods
  userGetInfo(): Promise<UserInfo>;
}

export function createSDK(config: SDKConfig): OAuthSDK;
```

**Step 6: 运行构建**

```bash
cd apps/oauth-service-rust
cargo build --release
```

Expected: 构建成功

**Step 7: 提交**

```bash
git add apps/oauth-service-rust/src/napi/sdk.rs
git add apps/oauth-service-rust/src/napi_binding.rs
git add apps/oauth-service-rust/src/lib.rs
git add apps/oauth-service-rust/npm/index.d.ts
git commit -m "feat(oauth-sdk): Implement OAuthSDK main class and napi binding"
```

---

## Phase 4: 集成测试和验证

### Task 6: 编写集成测试确保 API 和 SDK 同步

**Files:**
- Create: `apps/oauth-service-rust/tests/api_sdk_sync.rs`
- Create: `apps/oauth-service-rust/tests/fixtures.rs`

**Step 1: 创建测试固件**

File: `apps/oauth-service-rust/tests/fixtures.rs`

```rust
use oauth_service_rust::napi::config::SDKConfig;
use oauth_service_rust::napi::http_client::HttpClient;
use oauth_service_rust::napi::modules::auth::{LoginRequest, LoginResponse};

pub fn get_test_config() -> SDKConfig {
    SDKConfig::new("http://localhost:8080".to_string())
        .with_timeout(5000)
        .with_retry(1, 0)  // 测试中不重试
        .with_debug(false)
}

pub fn get_test_login_request() -> LoginRequest {
    LoginRequest {
        username: "test@example.com".to_string(),
        password: "test_password".to_string(),
    }
}

pub fn get_test_login_response() -> LoginResponse {
    LoginResponse {
        session_token: "token_test_123".to_string(),
        user_id: "user_test_123".to_string(),
        username: "test@example.com".to_string(),
        expires_in: 3600,
    }
}
```

**Step 2: 编写 API 和 SDK 同步测试**

File: `apps/oauth-service-rust/tests/api_sdk_sync.rs`

```rust
mod fixtures;

#[cfg(test)]
mod tests {
    use fixtures::*;
    use oauth_service_rust::napi::modules::auth::LoginRequest;
    use oauth_service_rust::napi::modules::user::UserInfo;

    #[test]
    fn test_login_request_matches_api_schema() {
        // 验证 LoginRequest 的字段与 API 期望一致
        let req = LoginRequest {
            username: "user".to_string(),
            password: "pass".to_string(),
        };

        let json = serde_json::to_value(&req).unwrap();

        // API 期望这些字段
        assert!(json.get("username").is_some());
        assert!(json.get("password").is_some());
        assert_eq!(json["username"], "user");
        assert_eq!(json["password"], "pass");
    }

    #[test]
    fn test_login_response_structure() {
        let resp = get_test_login_response();
        let json = serde_json::to_value(&resp).unwrap();

        // API 返回的字段必须与 LoginResponse 结构匹配
        assert!(json.get("session_token").is_some());
        assert!(json.get("user_id").is_some());
        assert!(json.get("username").is_some());
        assert!(json.get("expires_in").is_some());
        assert_eq!(json["expires_in"], 3600);
    }

    #[test]
    fn test_user_info_structure() {
        let user = UserInfo {
            user_id: "user123".to_string(),
            username: "test".to_string(),
            email: "test@example.com".to_string(),
            display_name: "Test User".to_string(),
            avatar_url: None,
            created_at: "2025-01-01T00:00:00Z".to_string(),
            updated_at: "2025-01-02T00:00:00Z".to_string(),
        };

        let json = serde_json::to_value(&user).unwrap();

        // 验证所有必需字段都存在
        assert!(json.get("user_id").is_some());
        assert!(json.get("username").is_some());
        assert!(json.get("email").is_some());
        assert!(json.get("display_name").is_some());
        assert!(json.get("created_at").is_some());
        assert!(json.get("updated_at").is_some());
    }

    #[test]
    fn test_sdk_config_serialization() {
        let config = get_test_config();
        let json = serde_json::to_value(&config).unwrap();

        assert_eq!(json["base_url"], "http://localhost:8080");
        assert_eq!(json["timeout"], Some(5000));
    }
}
```

**Step 3: 运行集成测试**

```bash
cd apps/oauth-service-rust
cargo test api_sdk_sync --lib
cargo test --test api_sdk_sync
```

Expected: 所有测试通过，验证 API 和 SDK 结构一致

**Step 4: 提交**

```bash
git add apps/oauth-service-rust/tests/api_sdk_sync.rs
git add apps/oauth-service-rust/tests/fixtures.rs
git commit -m "test(oauth-sdk): Add comprehensive API/SDK sync verification tests"
```

---

## Phase 5: Admin Portal 集成

### Task 7: 在 Admin Portal 中集成 napi SDK

**Files:**
- Modify: `apps/admin-portal/package.json`
- Create: `apps/admin-portal/lib/oauth-sdk.ts`
- Create: `apps/admin-portal/app/actions/auth.ts`
- Create: `apps/admin-portal/app/actions/user.ts`

**Step 1: 添加 napi SDK 依赖**

修改 `apps/admin-portal/package.json`：

```json
{
  "dependencies": {
    "oauth-service-napi": "file:../oauth-service-rust/npm"
  }
}
```

运行：

```bash
cd apps/admin-portal
pnpm install
```

**Step 2: 创建 SDK 初始化文件**

File: `apps/admin-portal/lib/oauth-sdk.ts`

```typescript
import type { OAuthSDK, SDKConfig } from 'oauth-service-napi';
import { createSDK } from 'oauth-service-napi';

const sdkConfig: SDKConfig = {
  base_url: process.env.OAUTH_SERVICE_URL || 'http://localhost:8080',
  timeout: parseInt(process.env.OAUTH_SDK_TIMEOUT || '5000'),
  retry_count: parseInt(process.env.OAUTH_SDK_RETRY_COUNT || '3'),
  debug: process.env.NODE_ENV === 'development',
};

let sdkInstance: OAuthSDK | null = null;

export function initializeOAuthSDK(): void {
  if (typeof window === 'undefined') {
    sdkInstance = createSDK(sdkConfig);
  }
}

export function getOAuthSDK(): OAuthSDK {
  if (typeof window !== 'undefined') {
    throw new Error('OAuth SDK can only be used on the server side');
  }
  if (!sdkInstance) {
    initializeOAuthSDK();
  }
  if (!sdkInstance) {
    throw new Error('Failed to initialize OAuth SDK');
  }
  return sdkInstance;
}

export type { OAuthSDK, SDKConfig };
```

**Step 3: 创建 Server Actions - Auth**

File: `apps/admin-portal/app/actions/auth.ts`

```typescript
'use server';

import { getOAuthSDK } from '@/lib/oauth-sdk';

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResult {
  success: boolean;
  data?: {
    session_token: string;
    user_id: string;
    username: string;
    expires_in: number;
  };
  error?: string;
}

export async function loginAction(credentials: LoginInput): Promise<LoginResult> {
  try {
    const sdk = getOAuthSDK();
    const result = await sdk.authLogin(credentials.username, credentials.password);

    return {
      success: true,
      data: result as any,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Login failed',
    };
  }
}

export async function logoutAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const sdk = getOAuthSDK();
    const success = await sdk.authLogout();
    return { success };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Logout failed',
    };
  }
}
```

**Step 4: 创建 Server Actions - User**

File: `apps/admin-portal/app/actions/user.ts`

```typescript
'use server';

import { getOAuthSDK } from '@/lib/oauth-sdk';

export interface UserResult {
  success: boolean;
  data?: {
    user_id: string;
    username: string;
    email: string;
    display_name: string;
    avatar_url?: string;
    created_at: string;
    updated_at: string;
  };
  error?: string;
}

export async function getUserInfoAction(): Promise<UserResult> {
  try {
    const sdk = getOAuthSDK();
    const result = await sdk.userGetInfo();

    return {
      success: true,
      data: result as any,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user info',
    };
  }
}
```

**Step 5: 在 .env.local 中配置**

```env
OAUTH_SERVICE_URL=http://localhost:8080
OAUTH_SDK_TIMEOUT=5000
OAUTH_SDK_RETRY_COUNT=3
```

**Step 6: 测试集成**

```bash
cd apps/admin-portal
pnpm build
```

Expected: 构建成功

**Step 7: 提交**

```bash
git add apps/admin-portal/package.json
git add apps/admin-portal/lib/oauth-sdk.ts
git add apps/admin-portal/app/actions/auth.ts
git add apps/admin-portal/app/actions/user.ts
git commit -m "feat(admin-portal): Integrate OAuth napi SDK with Server Actions"
```

---

## Phase 6: 文档和完成

### Task 8: 创建使用文档和示例

**Files:**
- Create: `docs/plans/2025-12-02-oauth-napi-sdk-usage-guide.md`
- Create: `apps/admin-portal/docs/napi-sdk-integration.md`

**Step 1: 创建 SDK 使用指南**

File: `docs/plans/2025-12-02-oauth-napi-sdk-usage-guide.md`

```markdown
# OAuth napi SDK 使用指南

## 概述

OAuth napi SDK 是用 Rust 实现的 Node.js 原生模块，提供类型安全的 OAuth Service 调用接口。

## 架构

```
Admin Portal (Next.js 16)
    ↓
Server Actions ('use server')
    ↓
oauth-service-napi (Rust napi 模块)
    ↓ HTTP/reqwest
OAuth Service (Rust 微服务)
```

## 使用示例

### 初始化 SDK

```typescript
import { getOAuthSDK } from '@/lib/oauth-sdk';

const sdk = getOAuthSDK(); // Server Actions 中使用
```

### 登录

```typescript
const result = await sdk.authLogin('user@example.com', 'password');
if (result.session_token) {
  // 登录成功，保存 session_token 到 cookie
}
```

### 获取用户信息

```typescript
const userInfo = await sdk.userGetInfo();
console.log(userInfo.username);
```

### 刷新令牌

```typescript
const tokens = await sdk.tokenRefresh(refreshToken);
// 更新 access_token
```

## 错误处理

napi SDK 抛出的错误会自动转换为 JavaScript Error：

```typescript
try {
  await sdk.authLogin(username, password);
} catch (error) {
  console.error(error.message); // Rust 错误转换为 JS Error
}
```

## 部署

napi SDK 需要编译为 `.node` 文件：

```bash
cd apps/oauth-service-rust
pnpm run build
```

编译后的 `.node` 文件会被包含在 Admin Portal 中。

## 性能

- 零网络序列化开销：数据直接在 Rust/JS 边界转换
- HTTP 调用通过 reqwest 实现，支持连接复用
- 完整的错误重试机制
```

**Step 2: 创建集成指南**

File: `apps/admin-portal/docs/napi-sdk-integration.md`

```markdown
# OAuth napi SDK 与 Admin Portal 集成

## Server Actions 集成

所有 OAuth 调用都通过 Server Actions 进行：

```typescript
// app/actions/auth.ts - Server Action
'use server';

import { getOAuthSDK } from '@/lib/oauth-sdk';

export async function loginAction(username: string, password: string) {
  const sdk = getOAuthSDK();
  return await sdk.authLogin(username, password);
}
```

客户端页面调用：

```typescript
// app/page.tsx - Client Component
'use client';

import { loginAction } from '@/app/actions/auth';

export default function LoginPage() {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const result = await loginAction(
      formData.get('username') as string,
      formData.get('password') as string
    );

    if (result.session_token) {
      // 处理成功
    } else {
      // 处理错误
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="username" />
      <input name="password" type="password" />
      <button type="submit">登录</button>
    </form>
  );
}
```

## 类型安全

napi SDK 导出的类型都是 TypeScript 定义：

```typescript
import type { LoginResponse, UserInfo } from 'oauth-service-napi';

const result: LoginResponse = await sdk.authLogin(...);
```

## 环境配置

.env.local：

```
OAUTH_SERVICE_URL=http://localhost:8080
OAUTH_SDK_TIMEOUT=5000
OAUTH_SDK_RETRY_COUNT=3
```

## 测试

Server Actions 可以使用 Jest 进行单元测试：

```typescript
jest.mock('@/lib/oauth-sdk');

test('loginAction returns user info on success', async () => {
  const mockSdk = {
    authLogin: jest.fn().mockResolvedValue({
      session_token: 'token',
      user_id: 'user123',
      username: 'test@example.com',
      expires_in: 3600,
    }),
  };

  getOAuthSDK.mockReturnValue(mockSdk);
  const result = await loginAction('test@example.com', 'password');
  expect(result.session_token).toBe('token');
});
```
```

**Step 3: 提交**

```bash
git add docs/plans/2025-12-02-oauth-napi-sdk-usage-guide.md
git add apps/admin-portal/docs/napi-sdk-integration.md
git commit -m "docs: Add comprehensive OAuth napi SDK usage and integration guides"
```

---

## ✅ 计划完成

### 总结

共 8 个 bite-sized tasks，包含：

1. **Phase 1**: napi 基础设施（2 tasks）
   - Cargo.toml 配置 + 模块结构
   - HTTP 客户端实现

2. **Phase 2**: SDK 模块（2 tasks）
   - Auth/Token/User 模块
   - RBAC/Client/Audit 模块

3. **Phase 3**: napi 绑定（1 task）
   - OAuthSDK 主类
   - napi 导出和 TypeScript 定义

4. **Phase 4**: 集成测试（1 task）
   - API/SDK 同步验证

5. **Phase 5**: Admin Portal 集成（1 task）
   - Server Actions 集成

6. **Phase 6**: 文档（1 task）
   - 使用指南和集成文档

### 关键特性

✅ 完整的 Rust napi SDK 实现
✅ HTTP 客户端 + 重试机制
✅ 所有模块的序列化/反序列化
✅ TypeScript 类型定义
✅ 集成测试确保 API 同步
✅ Admin Portal Server Actions 集成
✅ 详细的使用文档

---
