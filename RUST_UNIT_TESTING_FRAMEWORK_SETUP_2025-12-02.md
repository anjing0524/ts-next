# Rust OAuth Service 单元测试框架设置计划
# Rust OAuth Service Unit Testing Framework Setup Plan

**日期**: 2025-12-02
**状态**: 📋 规划阶段 (Planning)
**优先级**: P0 - 关键基础设施 (Critical Infrastructure)
**估算工作量**: 2-3天 (2-3 Days)

---

## 📊 执行摘要 (Executive Summary)

### 当前状态评估 (Current State Assessment)

**好消息** ✅:
- 项目已有基本测试依赖配置 (tokio-test, serial_test, reqwest)
- 部分核心工具模块已包含单元测试 (pkce.rs: 2个测试, crypto.rs: 4个测试, validation.rs: 27个测试)
- token_service.rs 已包含4个集成测试
- 现有 107 个单元测试通过

**问题** ⚠️:
- 单元测试覆盖率极低 (~15-20%)
- 关键业务逻辑缺少单元测试 (JWT生成, 授权码服务, RBAC服务等)
- 测试分布不均: 工具函数有测试, 核心服务层几乎没有
- 缺少统一的测试辅助工具库
- 缺少mock/stub框架用于隔离依赖

### 测试覆盖现状 (Current Test Coverage)

| 模块 Module | 单元测试 Unit Tests | 覆盖率 Coverage | 状态 Status |
|------------|-------------------|---------------|------------|
| `utils/pkce.rs` | ✅ 2个测试 (generation, verification) | ~60% | 🟢 良好 |
| `utils/crypto.rs` | ✅ 4个测试 (hashing, verification) | ~70% | 🟢 良好 |
| `utils/validation.rs` | ✅ 27个测试 (全面的验证逻辑) | ~95% | 🟢 优秀 |
| `utils/jwt.rs` | ❌ 0个单元测试 | 0% | 🔴 严重 |
| `services/token_service.rs` | ⚠️ 4个集成测试 (需数据库) | ~30% | 🟡 不足 |
| `services/auth_code_service.rs` | ❌ 0个单元测试 | 0% | 🔴 严重 |
| `services/user_service.rs` | ❌ 0个单元测试 | 0% | 🔴 严重 |
| `services/rbac_service.rs` | ✅ 8个集成测试 | ~40% | 🟡 不足 |
| `services/client_service.rs` | ✅ 3个集成测试 | ~25% | 🟡 不足 |
| `routes/*` | ❌ 主要依赖E2E测试 | <10% | 🔴 严重 |
| `middleware/*` | ✅ 部分单元测试 | ~35% | 🟡 不足 |

---

## 🎯 关键优先路径 (Critical Testing Priorities)

### P0 - 必须测试的关键路径 (Must Test - Critical Paths)

#### 1. JWT Token 生成与验证 (JWT Generation & Validation)
**文件**: `src/utils/jwt.rs`
**为什么重要**: 整个OAuth流程的安全基石 (Security foundation)

**需要测试的功能**:
- ✅ `generate_token_with_algorithm()` - HS256算法
- ✅ `generate_token_with_algorithm()` - RS256算法
- ✅ `verify_token_with_algorithm()` - 有效token验证
- ✅ `verify_token_with_algorithm()` - 过期token拒绝
- ✅ `verify_token_with_algorithm()` - 错误签名拒绝
- ✅ `generate_id_token_with_algorithm()` - ID Token生成
- ✅ Claims结构正确性 (sub, client_id, scope, permissions, exp, iat, jti)
- ✅ 错误处理 (invalid key, malformed token)

**预计工作量**: 4小时 (编写8-10个测试用例)

#### 2. PKCE 验证逻辑 (PKCE Verification Logic)
**文件**: `src/utils/pkce.rs`
**当前状态**: ✅ 已有2个基础测试

**需要补充的测试**:
- ✅ 边界条件: verifier长度 (43-128字符)
- ✅ 字符集验证: 只允许 [A-Z a-z 0-9 - . _ ~]
- ✅ 错误的challenge格式处理
- ✅ 空字符串处理
- ⚠️ RFC 7636示例向量验证 (已有但可以增加更多)

**预计工作量**: 2小时 (补充5-6个边缘测试用例)

#### 3. 密码哈希与验证 (Password Hashing & Verification)
**文件**: `src/utils/crypto.rs`
**当前状态**: ✅ 已有4个基础测试

**需要补充的测试**:
- ✅ Argon2 与 bcrypt 互操作性
- ✅ 哈希格式检测 (自动识别bcrypt/$2a$, $2b$, $2y$ vs Argon2/$argon2)
- ✅ 未知哈希格式错误处理
- ✅ 空密码处理
- ⚠️ 生成随机字符串的随机性测试

**预计工作量**: 2小时 (补充4-5个测试用例)

#### 4. 授权码生成与消费 (Authorization Code Lifecycle)
**文件**: `src/services/auth_code_service.rs`
**当前状态**: ❌ 0个单元测试

**需要测试的功能**:
- ❌ `create_auth_code()` - 成功创建
- ❌ `create_auth_code()` - PKCE challenge存储
- ❌ `consume_auth_code()` - 一次性使用验证
- ❌ `consume_auth_code()` - 过期code拒绝 (10分钟TTL)
- ❌ `consume_auth_code()` - 已使用code拒绝
- ❌ `consume_auth_code()` - PKCE验证失败处理
- ❌ Nonce存储与验证
- ❌ 错误处理 (数据库失败, 无效client_id等)

**预计工作量**: 6小时 (编写10-12个测试用例 + mock setup)

#### 5. 用户认证流程 (User Authentication Flow)
**文件**: `src/services/user_service.rs`
**当前状态**: ❌ 0个单元测试

**需要测试的功能**:
- ❌ `authenticate()` - 成功认证
- ❌ `authenticate()` - 错误密码拒绝
- ❌ `authenticate()` - 不存在的用户
- ❌ `authenticate()` - 已禁用用户拒绝 (is_active=false)
- ❌ `authenticate()` - 账户锁定检查 (failed_login_attempts >= 5)
- ❌ `update_last_login()` - 时间戳更新
- ❌ 失败登录计数递增
- ❌ 锁定时间窗口验证 (locked_until)

**预计工作量**: 5小时 (编写9-11个测试用例)

#### 6. Token服务核心逻辑 (Token Service Core Logic)
**文件**: `src/services/token_service.rs`
**当前状态**: ⚠️ 4个集成测试 (依赖真实数据库)

**需要补充的单元测试**:
- ✅ `issue_tokens()` - 用户授权流程 (已有集成测试)
- ✅ `issue_tokens()` - 客户端凭证流程 (已有集成测试)
- ❌ `refresh_token()` - 事务原子性验证 (需要mock)
- ❌ `revoke_token()` - 黑名单添加逻辑
- ❌ `is_token_revoked()` - 黑名单查询
- ❌ Token过期时间计算 (access_token_ttl, refresh_token_ttl)
- ❌ OpenID scope触发ID Token生成
- ❌ 错误处理 (数据库失败, 配置错误等)

**预计工作量**: 6小时 (编写8-10个单元测试 + 隔离依赖)

---

## 🏗️ 测试框架设计 (Testing Framework Design)

### 1. 测试组织结构 (Test Organization)

**采用Rust最佳实践**: 单元测试与代码同文件 (collocated tests)

```rust
// src/utils/jwt.rs
pub fn generate_token(...) -> Result<String, ServiceError> {
    // Implementation
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_token_hs256() {
        // Test code
    }

    #[tokio::test]  // For async tests
    async fn test_generate_token_async() {
        // Async test code
    }
}
```

**优势**:
- ✅ 测试代码靠近被测代码, 易于维护
- ✅ 私有函数也可以测试 (通过 `use super::*`)
- ✅ 编译时自动剔除测试代码 (`#[cfg(test)]`)
- ✅ 符合Rust社区标准

### 2. 测试辅助工具模块 (Test Utilities Module)

**创建**: `src/test_helpers.rs`

```rust
// src/test_helpers.rs
#![cfg(test)]

use crate::config::Config;
use crate::models::user::User;
use chrono::Utc;
use jsonwebtoken::{EncodingKey, DecodingKey};
use sqlx::SqlitePool;
use uuid::Uuid;

/// Mock配置生成器 (Mock Config Generator)
pub fn create_test_config() -> Config {
    std::env::set_var("JWT_SECRET", "test_secret_key_32_bytes_long!");
    Config {
        database_url: "sqlite::memory:".to_string(),
        jwt_private_key_path: "".to_string(),
        jwt_public_key_path: "".to_string(),
        issuer: "http://localhost:3001".to_string(),
        jwt_algorithm: crate::config::JwtAlgorithm::HS256,
    }
}

/// 内存数据库初始化 (In-Memory Database Setup)
pub async fn setup_test_db() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:")
        .await
        .expect("Failed to create in-memory database");

    // 运行迁移 (Run migrations)
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    pool
}

/// Mock用户创建 (Mock User Creation)
pub async fn create_mock_user(pool: &SqlitePool, username: &str) -> User {
    let user_id = Uuid::new_v4().to_string();
    let password_hash = crate::utils::crypto::hash_password("password123")
        .expect("Failed to hash password");
    let now = Utc::now();

    sqlx::query(
        "INSERT INTO users (id, username, password_hash, is_active, created_at, updated_at, must_change_password, failed_login_attempts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&user_id)
    .bind(username)
    .bind(&password_hash)
    .bind(true)
    .bind(now)
    .bind(now)
    .bind(false)
    .bind(0)
    .execute(pool)
    .await
    .expect("Failed to create mock user");

    User {
        id: user_id,
        username: username.to_string(),
        password_hash,
        is_active: true,
        created_at: now,
        updated_at: now,
        last_login_at: None,
        display_name: None,
        first_name: None,
        last_name: None,
        avatar: None,
        organization: None,
        department: None,
        must_change_password: false,
        failed_login_attempts: 0,
        locked_until: None,
        created_by: None,
    }
}

/// JWT密钥对生成 (JWT Key Pair Generation)
pub fn generate_test_jwt_keys() -> (EncodingKey, DecodingKey) {
    let secret = b"test_jwt_secret_key_for_testing_only_32_bytes";
    (
        EncodingKey::from_secret(secret),
        DecodingKey::from_secret(secret),
    )
}

/// 时间旅行辅助 (Time Travel Helper for Testing Expiration)
pub fn timestamp_now() -> usize {
    chrono::Utc::now().timestamp() as usize
}

pub fn timestamp_future(seconds: i64) -> usize {
    (chrono::Utc::now() + chrono::Duration::seconds(seconds)).timestamp() as usize
}

pub fn timestamp_past(seconds: i64) -> usize {
    (chrono::Utc::now() - chrono::Duration::seconds(seconds)).timestamp() as usize
}
```

**在 `src/lib.rs` 中声明**:
```rust
// src/lib.rs
#[cfg(test)]
pub mod test_helpers;
```

### 3. Mock框架选择 (Mocking Strategy)

**推荐使用 `mockall` crate**:

```toml
[dev-dependencies]
mockall = "0.12"
```

**示例: Mock ClientService**
```rust
#[cfg(test)]
use mockall::{automock, predicate::*};

#[automock]
#[async_trait]
pub trait ClientService: Send + Sync {
    async fn find_by_client_id(&self, client_id: &str) -> Result<Option<OAuthClientDetails>, ServiceError>;
}

// In tests:
#[tokio::test]
async fn test_token_service_with_mock_client() {
    let mut mock_client_service = MockClientService::new();
    mock_client_service
        .expect_find_by_client_id()
        .with(eq("test_client"))
        .times(1)
        .returning(|_| Ok(Some(/* mock client details */)));

    let token_service = TokenServiceImpl::new(
        db,
        Arc::new(mock_client_service),
        // ... other dependencies
    );

    // Test logic
}
```

### 4. 测试命名约定 (Test Naming Convention)

**格式**: `test_<function_name>_<scenario>_<expected_result>`

**示例**:
```rust
#[test]
fn test_generate_token_valid_claims_returns_jwt_string() { }

#[test]
fn test_verify_token_expired_token_returns_error() { }

#[tokio::test]
async fn test_authenticate_valid_credentials_returns_user() { }

#[tokio::test]
async fn test_authenticate_invalid_password_returns_unauthorized() { }
```

### 5. 异步测试模式 (Async Test Patterns)

**使用 `tokio::test`** (已在 Cargo.toml 中配置):

```rust
#[tokio::test]
async fn test_async_database_operation() {
    let pool = setup_test_db().await;

    let result = sqlx::query("SELECT * FROM users")
        .fetch_all(&pool)
        .await;

    assert!(result.is_ok());
}
```

### 6. 断言策略 (Assertion Strategy)

**推荐使用 `assert_matches!` 宏** (需要添加依赖):

```toml
[dev-dependencies]
assert_matches = "1.5"
```

**示例**:
```rust
use assert_matches::assert_matches;

#[test]
fn test_error_handling() {
    let result = some_function_that_fails();

    assert_matches!(result, Err(ServiceError::ValidationError(msg)) if msg.contains("expected"));
}
```

---

## 📦 依赖配置 (Dependencies Configuration)

### Cargo.toml 修改建议

**当前配置** (已有):
```toml
[dev-dependencies]
reqwest = { version = "0.11", features = ["json", "cookies"] }
serial_test = "3.0"
tokio-test = "0.4"
```

**推荐添加**:
```toml
[dev-dependencies]
# 已有
reqwest = { version = "0.11", features = ["json", "cookies"] }
serial_test = "3.0"
tokio-test = "0.4"

# 新增 - Mock框架
mockall = "0.12"

# 新增 - 更好的断言
assert_matches = "1.5"

# 新增 - 测试覆盖率 (可选, 用于CI)
# cargo-tarpaulin 通过 cargo install 安装, 不需要在这里添加
```

---

## 🚀 实施路线图 (Implementation Roadmap)

### Phase 1: 测试基础设施 (1天, Day 1)

**任务 Task 1.1**: 创建测试辅助工具模块
- [ ] 创建 `src/test_helpers.rs`
- [ ] 实现 `create_test_config()`
- [ ] 实现 `setup_test_db()`
- [ ] 实现 `create_mock_user()`
- [ ] 实现 `generate_test_jwt_keys()`
- [ ] 实现时间辅助函数 (timestamp helpers)
- [ ] 在 `src/lib.rs` 中声明模块

**任务 Task 1.2**: 配置依赖
- [ ] 更新 `Cargo.toml` 添加 `mockall`
- [ ] 更新 `Cargo.toml` 添加 `assert_matches`
- [ ] 运行 `cargo build --tests` 验证

**任务 Task 1.3**: 编写测试模板文档
- [ ] 创建测试代码示例文档
- [ ] 创建 Mock 使用示例
- [ ] 添加到项目README

### Phase 2: P0关键路径测试 (1-1.5天, Day 2-3)

**任务 Task 2.1**: JWT工具测试 (4小时)
- [ ] `test_generate_token_hs256_valid_claims`
- [ ] `test_generate_token_rs256_valid_claims`
- [ ] `test_verify_token_valid_token_returns_claims`
- [ ] `test_verify_token_expired_token_returns_error`
- [ ] `test_verify_token_invalid_signature_returns_error`
- [ ] `test_generate_id_token_includes_user_info`
- [ ] `test_verify_token_malformed_token_returns_error`
- [ ] `test_token_claims_all_required_fields_present`

**任务 Task 2.2**: 授权码服务测试 (6小时)
- [ ] `test_create_auth_code_stores_pkce_challenge`
- [ ] `test_create_auth_code_generates_unique_codes`
- [ ] `test_consume_auth_code_marks_as_used`
- [ ] `test_consume_auth_code_expired_code_rejected`
- [ ] `test_consume_auth_code_already_used_rejected`
- [ ] `test_consume_auth_code_pkce_verification_success`
- [ ] `test_consume_auth_code_pkce_verification_failure`
- [ ] `test_consume_auth_code_nonce_preserved`

**任务 Task 2.3**: 用户认证服务测试 (5小时)
- [ ] `test_authenticate_valid_credentials_success`
- [ ] `test_authenticate_invalid_password_failure`
- [ ] `test_authenticate_nonexistent_user_failure`
- [ ] `test_authenticate_inactive_user_rejected`
- [ ] `test_authenticate_locked_account_rejected`
- [ ] `test_authenticate_increments_failed_attempts`
- [ ] `test_authenticate_locks_after_max_attempts`
- [ ] `test_update_last_login_timestamp`

**任务 Task 2.4**: Token服务单元测试 (6小时)
- [ ] Mock `ClientService`, `RBACService`, `UserService`
- [ ] `test_refresh_token_revokes_old_token_atomically`
- [ ] `test_revoke_token_adds_to_blacklist`
- [ ] `test_is_token_revoked_checks_blacklist`
- [ ] `test_issue_tokens_openid_scope_generates_id_token`
- [ ] `test_issue_tokens_calculates_correct_expiration`
- [ ] `test_issue_tokens_handles_database_error`

### Phase 3: 补充边缘测试与文档 (0.5天, Day 3)

**任务 Task 3.1**: PKCE边缘测试
- [ ] `test_pkce_verifier_minimum_length_43`
- [ ] `test_pkce_verifier_maximum_length_128`
- [ ] `test_pkce_verifier_invalid_characters_rejected`
- [ ] `test_pkce_challenge_empty_verifier_handled`

**任务 Task 3.2**: 密码哈希边缘测试
- [ ] `test_verify_password_bcrypt_hash_compatibility`
- [ ] `test_verify_password_argon2_hash_compatibility`
- [ ] `test_verify_password_unknown_hash_format_error`
- [ ] `test_hash_password_empty_password_handled`

**任务 Task 3.3**: 文档与开发者指南
- [ ] 创建 `TESTING_GUIDE.md`
- [ ] 编写如何运行测试
- [ ] 编写如何添加新测试
- [ ] 添加测试覆盖率报告说明
- [ ] 更新 `README.md` 添加测试章节

---

## 🏃 如何运行测试 (How to Run Tests)

### 1. 运行所有单元测试
```bash
cd apps/oauth-service-rust
cargo test --lib
```

### 2. 运行特定模块的测试
```bash
# 只测试JWT模块
cargo test --lib jwt

# 只测试PKCE模块
cargo test --lib pkce

# 只测试用户服务
cargo test --lib user_service
```

### 3. 运行单个测试
```bash
cargo test --lib test_generate_token_hs256
```

### 4. 显示测试输出 (包括println!)
```bash
cargo test --lib -- --nocapture
```

### 5. 生成测试覆盖率报告 (需要先安装 cargo-tarpaulin)
```bash
# 安装 (只需一次)
cargo install cargo-tarpaulin

# 生成覆盖率报告
cargo tarpaulin --lib --out Html --output-dir coverage

# 查看报告
open coverage/index.html
```

### 6. 并行测试与串行测试
```rust
// 默认: 并行运行
#[test]
fn test_parallel() { }

// 串行运行 (用于数据库测试)
use serial_test::serial;

#[test]
#[serial]
fn test_serial_db_access() { }
```

---

## 📝 示例: JWT模块完整测试实现

```rust
// src/utils/jwt.rs

// ... existing code ...

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Config, JwtAlgorithm};
    use crate::models::user::User;
    use chrono::{Duration, Utc};
    use jsonwebtoken::{DecodingKey, EncodingKey};
    use uuid::Uuid;

    fn setup_test_keys() -> (EncodingKey, DecodingKey) {
        let secret = b"test_jwt_secret_key_for_testing_only_32_bytes";
        (
            EncodingKey::from_secret(secret),
            DecodingKey::from_secret(secret),
        )
    }

    fn create_test_claims() -> TokenClaims {
        let now = Utc::now();
        TokenClaims {
            sub: Some("user_123".to_string()),
            client_id: "client_abc".to_string(),
            scope: "read write".to_string(),
            permissions: vec!["read:data".to_string(), "write:data".to_string()],
            exp: (now + Duration::seconds(3600)).timestamp() as usize,
            iat: now.timestamp() as usize,
            jti: Uuid::new_v4().to_string(),
        }
    }

    #[test]
    fn test_generate_token_hs256_valid_claims() {
        let (encoding_key, _) = setup_test_keys();
        let claims = create_test_claims();

        let result = generate_token_with_algorithm(
            &claims,
            &encoding_key,
            JwtAlgorithm::HS256,
        );

        assert!(result.is_ok(), "Should generate token successfully");
        let token = result.unwrap();
        assert!(!token.is_empty(), "Token should not be empty");
        assert_eq!(token.split('.').count(), 3, "JWT should have 3 parts");
    }

    #[test]
    fn test_verify_token_valid_token_returns_claims() {
        let (encoding_key, decoding_key) = setup_test_keys();
        let original_claims = create_test_claims();

        let token = generate_token_with_algorithm(
            &original_claims,
            &encoding_key,
            JwtAlgorithm::HS256,
        )
        .expect("Failed to generate token");

        let result = verify_token_with_algorithm(
            &token,
            &decoding_key,
            JwtAlgorithm::HS256,
        );

        assert!(result.is_ok(), "Should verify token successfully");
        let verified_claims = result.unwrap();

        assert_eq!(verified_claims.sub, original_claims.sub);
        assert_eq!(verified_claims.client_id, original_claims.client_id);
        assert_eq!(verified_claims.scope, original_claims.scope);
        assert_eq!(verified_claims.permissions, original_claims.permissions);
    }

    #[test]
    fn test_verify_token_expired_token_returns_error() {
        let (encoding_key, decoding_key) = setup_test_keys();
        let now = Utc::now();

        // Create expired token (expired 1 hour ago)
        let expired_claims = TokenClaims {
            sub: Some("user_123".to_string()),
            client_id: "client_abc".to_string(),
            scope: "read".to_string(),
            permissions: vec![],
            exp: (now - Duration::seconds(3600)).timestamp() as usize,
            iat: (now - Duration::seconds(7200)).timestamp() as usize,
            jti: Uuid::new_v4().to_string(),
        };

        let token = generate_token_with_algorithm(
            &expired_claims,
            &encoding_key,
            JwtAlgorithm::HS256,
        )
        .expect("Failed to generate token");

        let result = verify_token_with_algorithm(
            &token,
            &decoding_key,
            JwtAlgorithm::HS256,
        );

        assert!(result.is_err(), "Should reject expired token");
        assert!(
            matches!(result.unwrap_err(), ServiceError::JwtError(_)),
            "Should return JwtError"
        );
    }

    #[test]
    fn test_verify_token_invalid_signature_returns_error() {
        let (encoding_key, _) = setup_test_keys();
        let claims = create_test_claims();

        let token = generate_token_with_algorithm(
            &claims,
            &encoding_key,
            JwtAlgorithm::HS256,
        )
        .expect("Failed to generate token");

        // Use different key for verification
        let wrong_key = DecodingKey::from_secret(b"wrong_secret_key");

        let result = verify_token_with_algorithm(
            &token,
            &wrong_key,
            JwtAlgorithm::HS256,
        );

        assert!(result.is_err(), "Should reject token with invalid signature");
    }

    #[test]
    fn test_generate_id_token_includes_user_info() {
        let (encoding_key, _) = setup_test_keys();

        let user = User {
            id: "user_123".to_string(),
            username: "testuser".to_string(),
            password_hash: "hash".to_string(),
            is_active: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            last_login_at: None,
            display_name: Some("Test User".to_string()),
            first_name: Some("Test".to_string()),
            last_name: Some("User".to_string()),
            avatar: Some("https://example.com/avatar.jpg".to_string()),
            organization: None,
            department: None,
            must_change_password: false,
            failed_login_attempts: 0,
            locked_until: None,
            created_by: None,
        };

        let result = generate_id_token_with_algorithm(
            &user,
            "client_abc",
            "openid profile",
            "http://localhost:3001",
            Some("nonce_xyz"),
            &encoding_key,
            3600,
            JwtAlgorithm::HS256,
        );

        assert!(result.is_ok(), "Should generate ID token successfully");
        let token = result.unwrap();
        assert!(!token.is_empty(), "ID token should not be empty");
    }

    #[test]
    fn test_verify_token_malformed_token_returns_error() {
        let (_, decoding_key) = setup_test_keys();

        let malformed_tokens = vec![
            "not.a.jwt",
            "only.two.parts",
            "four.parts.are.invalid",
            "",
            "invalid_base64!@#$%^&*()",
        ];

        for token in malformed_tokens {
            let result = verify_token_with_algorithm(
                token,
                &decoding_key,
                JwtAlgorithm::HS256,
            );

            assert!(
                result.is_err(),
                "Should reject malformed token: {}",
                token
            );
        }
    }

    #[test]
    fn test_token_claims_all_required_fields_present() {
        let claims = create_test_claims();

        // Verify all required fields are present
        assert!(claims.sub.is_some(), "sub field should be present");
        assert!(!claims.client_id.is_empty(), "client_id should not be empty");
        assert!(!claims.scope.is_empty(), "scope should not be empty");
        assert!(!claims.jti.is_empty(), "jti should not be empty");
        assert!(claims.exp > 0, "exp should be positive");
        assert!(claims.iat > 0, "iat should be positive");
        assert!(claims.exp > claims.iat, "exp should be after iat");
    }
}
```

---

## ✅ 验收标准 (Acceptance Criteria)

### Phase 1完成标准:
- [ ] `src/test_helpers.rs` 已创建并包含所有辅助函数
- [ ] `Cargo.toml` 已更新依赖配置
- [ ] `cargo test --lib` 可成功运行
- [ ] 测试模板文档已创建

### Phase 2完成标准:
- [ ] JWT模块单元测试覆盖率 >= 80%
- [ ] 授权码服务单元测试覆盖率 >= 70%
- [ ] 用户认证服务单元测试覆盖率 >= 75%
- [ ] Token服务单元测试覆盖率 >= 60%
- [ ] 所有新增测试通过 (`cargo test --lib`)

### Phase 3完成标准:
- [ ] PKCE和密码哈希边缘测试完成
- [ ] `TESTING_GUIDE.md` 文档已创建
- [ ] README更新包含测试说明
- [ ] 测试覆盖率报告可生成

### 最终目标:
- [ ] 单元测试总数 >= 150个 (当前107个)
- [ ] 核心服务层测试覆盖率 >= 70%
- [ ] 所有P0关键路径有完整测试
- [ ] CI/CD集成测试自动运行

---

## 📊 工作量估算 (Effort Estimation)

| Phase | 任务 Tasks | 预计时间 Estimated Time |
|-------|---------|----------------------|
| Phase 1 | 测试基础设施 Test Infrastructure | 8小时 (1天) |
| Phase 2 | P0关键路径测试 Critical Path Tests | 12-15小时 (1.5天) |
| Phase 3 | 补充测试与文档 Additional Tests & Docs | 4小时 (0.5天) |
| **总计 Total** | | **24-27小时 (2-3天)** |

---

## 🚨 常见陷阱与注意事项 (Common Pitfalls & Best Practices)

### ⚠️ 避免的陷阱:

1. **不要在单元测试中依赖真实数据库**
   - ❌ 错误: 直接连接到开发数据库
   - ✅ 正确: 使用 `sqlite::memory:` 或 Mock

2. **不要测试三方库的功能**
   - ❌ 错误: 测试 `sqlx` 是否正确查询数据库
   - ✅ 正确: 测试你的业务逻辑是否正确调用 `sqlx`

3. **不要忽略错误路径测试**
   - ❌ 错误: 只测试成功场景
   - ✅ 正确: 每个成功测试应有对应的失败测试

4. **不要让测试相互依赖**
   - ❌ 错误: test_b 依赖 test_a 的副作用
   - ✅ 正确: 每个测试独立运行 (使用 `#[serial]` 标记共享资源)

### ✅ 最佳实践:

1. **遵循AAA模式**: Arrange (准备) → Act (执行) → Assert (断言)
2. **一个测试只验证一件事**: 测试应该简单明了
3. **测试名称应描述性强**: 阅读测试名就知道测试什么
4. **使用 `#[ignore]` 标记慢速测试**: 日常开发时跳过, CI时运行
5. **定期运行测试覆盖率分析**: `cargo tarpaulin`

---

## 📚 参考资源 (References)

- [Rust Testing Guide](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [tokio Testing Documentation](https://tokio.rs/tokio/topics/testing)
- [mockall Documentation](https://docs.rs/mockall/latest/mockall/)
- [cargo-tarpaulin](https://github.com/xd009642/tarpaulin)
- [RFC 7636 - PKCE](https://tools.ietf.org/html/rfc7636)
- [RFC 6749 - OAuth 2.0](https://tools.ietf.org/html/rfc6749)

---

## 🔄 后续步骤 (Next Steps)

1. **审查此文档**: 与团队确认测试策略
2. **开始Phase 1**: 创建测试基础设施
3. **并行开发**: 多人可同时编写不同模块的测试
4. **持续集成**: 将测试集成到CI/CD流程
5. **定期监控**: 每周检查测试覆盖率变化

---

**文档状态**: ✅ 准备就绪 (Ready for Implementation)
**下一次审查**: 完成Phase 1后
**责任人**: 后端开发团队 (Backend Team)
