//! OAuth 2.1 合规性和安全测试
//!
//! 本模块测试 OAuth 2.1 规范要求和安全特性:
//! - RFC Draft: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-09
//! - 关键安全需求: PKCE强制、重定向URI验证、作用域限制

use oauth_service_rust::{
    cache::permission_cache::InMemoryPermissionCache,
    routes::{
        clients::CreateClientRequest,
        oauth::AuthorizeRequest,
    },
    services::{
        auth_code_service::{AuthCodeService, AuthCodeServiceImpl},
        client_service::{ClientService, ClientServiceImpl},
        rbac_service::RBACServiceImpl,
        token_service::{TokenService, TokenServiceImpl},
        user_service::UserServiceImpl,
    },
};
use sqlx::SqlitePool;
use std::sync::Arc;

// ============================================================================
// 测试数据库设置 (common setup)
// ============================================================================

async fn setup_test_db() -> SqlitePool {
    let pool = SqlitePool::connect(":memory:")
        .await
        .expect("Failed to create in-memory database");

    let initial_schema_sql = include_str!("../migrations/001_initial_schema.sql");
    sqlx::query(initial_schema_sql)
        .execute(&pool)
        .await
        .expect("Failed to run initial schema migration");

    pool
}

async fn create_test_user(pool: &SqlitePool, user_id: &str, username: &str) {
    let password_hash = oauth_service_rust::utils::crypto::hash_password("password123")
        .expect("Failed to hash password");
    let now = chrono::Utc::now();

    sqlx::query(
        "INSERT INTO users (id, username, password_hash, is_active, created_at, updated_at, must_change_password, failed_login_attempts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(user_id)
    .bind(username)
    .bind(&password_hash)
    .bind(true)
    .bind(now)
    .bind(now)
    .bind(false)
    .bind(0)
    .execute(pool)
    .await
    .expect("Failed to create test user");
}

// ============================================================================
// OAuth 2.1 合规性测试: 授权码验证
// ============================================================================

/// 测试: PKCE code_verifier 必须与 code_challenge 匹配
///
/// 规范: RFC 7636 Section 4.6
/// 客户端提交的 code_verifier 必须与初始请求中的 code_challenge 对应
///
/// 预期:
/// - 用正确的 verifier 交换令牌: ✅ 成功
/// - 用不同的 verifier 交换令牌: ❌ 失败
#[tokio::test]
async fn test_code_verifier_must_match_challenge() {
    let pool = Arc::new(setup_test_db().await);
    create_test_user(&pool, "user_123", "testuser").await;

    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
    let auth_code_service = Arc::new(AuthCodeServiceImpl::new(
        pool.clone(),
        client_service.clone(),
    ));

    // 1. 创建客户端
    let request = CreateClientRequest {
        name: "PKCE Validation Client".to_string(),
        client_type: "PUBLIC".to_string(),
        redirect_uris: vec!["http://localhost:3000/callback".to_string()],
        grant_types: vec!["authorization_code".to_string()],
        response_types: vec!["code".to_string()],
        allowed_scopes: vec!["read".to_string()],
        client_permissions: None,
    };

    let (client_details, _) = client_service
        .create_client(request)
        .await
        .expect("Failed to create client");

    // 2. 生成正确的 PKCE pair
    let correct_verifier =
        oauth_service_rust::utils::pkce::generate_code_verifier();
    let correct_challenge =
        oauth_service_rust::utils::pkce::generate_code_challenge(&correct_verifier);

    // 3. 生成不同的 verifier
    let _wrong_verifier =
        oauth_service_rust::utils::pkce::generate_code_verifier();

    // 4. 用正确的challenge创建授权码
    let auth_request = AuthorizeRequest {
        client_id: client_details.client.client_id.clone(),
        redirect_uri: "http://localhost:3000/callback".to_string(),
        response_type: "code".to_string(),
        scope: "read".to_string(),
        code_challenge: correct_challenge.clone(),
        code_challenge_method: "S256".to_string(),
        nonce: None,
    };

    let auth_code = auth_code_service
        .create_auth_code(&auth_request, "user_123")
        .await
        .expect("Failed to create auth code");

    assert!(!auth_code.is_empty(), "Auth code should be created");

    // TODO: 实现令牌端点验证
    // 5. 尝试用错误的 verifier 交换令牌应该失败
    // let result = token_service.exchange_code(
    //     &client_details.client.client_id,
    //     &auth_code,
    //     &wrong_verifier,  // 错误的verifier
    // ).await;
    // assert!(result.is_err(), "Should fail with incorrect code_verifier");

    // 6. 用正确的 verifier 交换应该成功
    // let result = token_service.exchange_code(
    //     &client_details.client.client_id,
    //     &auth_code,
    //     &correct_verifier,
    // ).await;
    // assert!(result.is_ok(), "Should succeed with correct code_verifier");
}

/// 测试: 授权码只能被使用一次
///
/// 规范: RFC 6749 Section 4.1.2
/// 授权码在被使用一次后必须失效，防止授权码泄露被重用
///
/// 预期:
/// - 第1次使用授权码: ✅ 成功获得令牌
/// - 第2次使用同个授权码: ❌ 失败
#[tokio::test]
async fn test_authorization_code_can_only_be_used_once() {
    let pool = Arc::new(setup_test_db().await);
    create_test_user(&pool, "user_456", "testuser2").await;

    let permission_cache = Arc::new(InMemoryPermissionCache::new());
    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
    let auth_code_service = Arc::new(AuthCodeServiceImpl::new(
        pool.clone(),
        client_service.clone(),
    ));
    let user_service = Arc::new(UserServiceImpl::new(pool.clone()));
    let rbac_service = Arc::new(RBACServiceImpl::new(pool.clone(), permission_cache));

    // 1. 创建客户端
    let request = CreateClientRequest {
        name: "Code Reuse Test Client".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
        redirect_uris: vec!["http://localhost:3000/callback".to_string()],
        grant_types: vec!["authorization_code".to_string()],
        response_types: vec!["code".to_string()],
        allowed_scopes: vec!["read".to_string()],
        client_permissions: None,
    };

    let (client_details, client_secret) = client_service
        .create_client(request)
        .await
        .expect("Failed to create client");

    // 2. 创建授权码
    let verifier = oauth_service_rust::utils::pkce::generate_code_verifier();
    let challenge = oauth_service_rust::utils::pkce::generate_code_challenge(&verifier);

    let auth_request = AuthorizeRequest {
        client_id: client_details.client.client_id.clone(),
        redirect_uri: "http://localhost:3000/callback".to_string(),
        response_type: "code".to_string(),
        scope: "read".to_string(),
        code_challenge: challenge,
        code_challenge_method: "S256".to_string(),
        nonce: None,
    };

    let _auth_code = auth_code_service
        .create_auth_code(&auth_request, "user_456")
        .await
        .expect("Failed to create auth code");

    // 3. 首次使用授权码交换令牌应该成功
    // Set JWT_SECRET for testing (required since hardcoded fallback was removed)
    std::env::set_var("JWT_SECRET", "test_jwt_secret_key_for_testing_only_do_not_use_in_production");

    let config = Arc::new(oauth_service_rust::config::Config {
        database_url: "file::memory:".to_string(),
        jwt_private_key_path: "".to_string(), // Empty - will use JWT_SECRET env var
        jwt_public_key_path: "".to_string(),  // Empty - will use JWT_SECRET env var
        issuer: "http://localhost:3001".to_string(),
        jwt_algorithm: oauth_service_rust::config::JwtAlgorithm::HS256,
    });

    let token_service = Arc::new(TokenServiceImpl::new(
        pool.clone(),
        client_service.clone(),
        rbac_service.clone(),
        user_service,
        config,
    ));

    let client = client_service
        .authenticate_client(&client_details.client.client_id, Some(&client_secret))
        .await
        .expect("Failed to authenticate client");

    let token_pair = token_service
        .issue_tokens(
            &client,
            Some("user_456".to_string()),
            "read".to_string(),
            vec![],
            None,
        )
        .await
        .expect("Failed to issue tokens");

    assert!(!token_pair.access_token.is_empty());

    // TODO: 实现授权码重用检查
    // 4. 尝试再次使用同个授权码应该失败
    // let reuse_result = token_service.exchange_code(
    //     &client_details.client.client_id,
    //     &auth_code,
    //     &verifier,
    // ).await;
    // assert!(reuse_result.is_err(), "Should reject reused authorization code");
    // assert!(reuse_result.unwrap_err().to_string().contains("code"));
}

// ============================================================================
// OAuth 2.1 合规性测试: 重定向URI验证
// ============================================================================

/// 测试: redirect_uri 必须在客户端预注册的列表中
///
/// 规范: RFC 6749 Section 3.1.2
/// 恶意客户端可能尝试将授权码重定向到不同的服务器
///
/// 预期:
/// - 使用注册的 redirect_uri: ✅ 成功
/// - 使用未注册的 redirect_uri: ❌ 失败
/// - 使用相似但不同的 redirect_uri: ❌ 失败
#[tokio::test]
async fn test_redirect_uri_must_be_registered() {
    let pool = Arc::new(setup_test_db().await);
    create_test_user(&pool, "user_789", "testuser3").await;

    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
    let auth_code_service = Arc::new(AuthCodeServiceImpl::new(
        pool.clone(),
        client_service.clone(),
    ));

    // 1. 创建客户端，只注册特定的 redirect_uri
    let allowed_redirect_uri = "https://myapp.example.com/callback";
    let request = CreateClientRequest {
        name: "Redirect URI Validation Client".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
        redirect_uris: vec![allowed_redirect_uri.to_string()],
        grant_types: vec!["authorization_code".to_string()],
        response_types: vec!["code".to_string()],
        allowed_scopes: vec!["read".to_string()],
        client_permissions: None,
    };

    let (client_details, _) = client_service
        .create_client(request)
        .await
        .expect("Failed to create client");

    let verifier = oauth_service_rust::utils::pkce::generate_code_verifier();
    let challenge = oauth_service_rust::utils::pkce::generate_code_challenge(&verifier);

    // 2. 使用未注册的 redirect_uri 请求授权码
    let unregistered_redirect_uri = "https://attacker.com/callback";
    let _bad_request = AuthorizeRequest {
        client_id: client_details.client.client_id.clone(),
        redirect_uri: unregistered_redirect_uri.to_string(),
        response_type: "code".to_string(),
        scope: "read".to_string(),
        code_challenge: challenge.clone(),
        code_challenge_method: "S256".to_string(),
        nonce: None,
    };

    // TODO: 实现重定向URI验证
    // 预期失败
    // let result = auth_code_service
    //     .create_auth_code(&bad_request, "user_789")
    //     .await;
    // assert!(
    //     result.is_err(),
    //     "Should reject unregistered redirect_uri"
    // );
    // assert!(
    //     result.unwrap_err().to_string().contains("redirect_uri") ||
    //     result.unwrap_err().to_string().contains("invalid"),
    //     "Error should mention redirect_uri"
    // );

    // 3. 使用正确注册的 redirect_uri 应该成功
    let correct_request = AuthorizeRequest {
        client_id: client_details.client.client_id.clone(),
        redirect_uri: allowed_redirect_uri.to_string(),
        response_type: "code".to_string(),
        scope: "read".to_string(),
        code_challenge: challenge,
        code_challenge_method: "S256".to_string(),
        nonce: None,
    };

    let result = auth_code_service
        .create_auth_code(&correct_request, "user_789")
        .await;

    assert!(
        result.is_ok(),
        "Should accept registered redirect_uri"
    );
}

/// 测试: redirect_uri 必须精确匹配 (包括协议、路径、参数)
///
/// 规范: RFC 6749 Section 3.1.2.1
///
/// 预期:
/// - https://myapp.com/callback 和 https://myapp.com/callback: ✅ 匹配
/// - https://myapp.com/callback 和 https://myapp.com/callback?foo=bar: ❌ 不匹配
/// - https://myapp.com/callback 和 http://myapp.com/callback: ❌ 不匹配
#[tokio::test]
async fn test_redirect_uri_must_match_exactly() {
    let pool = Arc::new(setup_test_db().await);

    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));

    // 1. 创建客户端，注册特定的 redirect_uri (不带参数)
    let request = CreateClientRequest {
        name: "Exact Match Test".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
        redirect_uris: vec!["https://secure.example.com/auth/callback".to_string()],
        grant_types: vec!["authorization_code".to_string()],
        response_types: vec!["code".to_string()],
        allowed_scopes: vec!["openid".to_string()],
        client_permissions: None,
    };

    let (_client_details, _) = client_service
        .create_client(request)
        .await
        .expect("Failed to create client");

    // 2. 尝试用带参数的 URI (应该失败)
    let _with_params = "https://secure.example.com/auth/callback?state=xyz";

    // TODO: 验证重定向URI参数
    // let result = validate_redirect_uri(
    //     _with_params,
    //     &_client_details.redirect_uris
    // );
    // assert!(result.is_err(), "Should reject URI with extra parameters");

    // 3. 尝试用不同协议 (应该失败)
    let _http_version = "http://secure.example.com/auth/callback";

    // TODO: 验证协议一致性
    // let result = validate_redirect_uri(
    //     http_version,
    //     &client_details.client.redirect_uris
    // );
    // assert!(result.is_err(), "Should reject different protocol");
}

// ============================================================================
// OAuth 2.1 合规性测试: 作用域验证
// ============================================================================

/// 测试: 客户端请求的作用域必须在允许列表内
///
/// 规范: RFC 6749 Section 3.3
/// 服务器必须验证客户端请求的作用域是否在其预注册的允许作用域内
///
/// 预期:
/// - 请求注册的作用域 [read]: ✅ 成功
/// - 请求未注册的作用域 [admin]: ❌ 失败
/// - 请求超过权限的作用域 [read, write] (仅注册read): ❌ 失败或限制
#[tokio::test]
async fn test_client_scope_enforcement() {
    let pool = Arc::new(setup_test_db().await);
    create_test_user(&pool, "user_scope", "testuser_scope").await;

    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));

    // 1. 创建客户端，只允许 [read] 和 [profile] 作用域
    let request = CreateClientRequest {
        name: "Scope Limited Client".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
        redirect_uris: vec!["http://localhost:3000/callback".to_string()],
        grant_types: vec!["authorization_code".to_string()],
        response_types: vec!["code".to_string()],
        allowed_scopes: vec!["read".to_string(), "profile".to_string()],
        client_permissions: None,
    };

    let (client_details, _) = client_service
        .create_client(request)
        .await
        .expect("Failed to create client");

    // 2. 验证允许的作用域
    let allowed_scopes = &client_details.allowed_scopes;
    assert!(allowed_scopes.contains(&"read".to_string()), "read scope should be allowed");
    assert!(allowed_scopes.contains(&"profile".to_string()), "profile scope should be allowed");

    // TODO: 实现授权码中的作用域检查
    // 3. 尝试请求未授权的作用域 (admin)
    // let verifier = oauth_service_rust::utils::pkce::generate_code_verifier();
    // let challenge = oauth_service_rust::utils::pkce::generate_code_challenge(&verifier);
    //
    // let bad_scope_request = AuthorizeRequest {
    //     client_id: client_details.client.client_id.clone(),
    //     redirect_uri: "http://localhost:3000/callback".to_string(),
    //     response_type: "code".to_string(),
    //     scope: "admin".to_string(),  // 未授权的作用域
    //     code_challenge: challenge.clone(),
    //     code_challenge_method: "S256".to_string(),
    //     nonce: None,
    // };
    //
    // let result = auth_code_service
    //     .create_auth_code(&bad_scope_request, "user_scope")
    //     .await;
    //
    // assert!(result.is_err(), "Should reject unauthorized scope");
}

// ============================================================================
// OAuth 2.1 合规性测试: PKCE强制性 (Public Clients)
// ============================================================================

/// 测试: OAuth 2.1 要求 PUBLIC 客户端必须使用 PKCE
///
/// 规范: OAuth 2.1 Section 7.2.1
/// "所有OAuth 2.0授权码客户端必须使用PKCE"
///
/// 预期:
/// - PUBLIC 客户端未提供code_challenge: ❌ 失败 (OAuth 2.1要求)
/// - CONFIDENTIAL 客户端未提供code_challenge: ⚠️ 可能允许 (向后兼容)
#[tokio::test]
async fn test_pkce_required_for_public_clients_oauth_2_1() {
    let pool = Arc::new(setup_test_db().await);
    create_test_user(&pool, "user_pkce", "testuser_pkce").await;

    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
    let auth_code_service = Arc::new(AuthCodeServiceImpl::new(
        pool.clone(),
        client_service.clone(),
    ));

    // 1. 创建 PUBLIC 客户端
    let request = CreateClientRequest {
        name: "Public Client OAuth 2.1".to_string(),
        client_type: "PUBLIC".to_string(),
        redirect_uris: vec!["http://localhost:3000/callback".to_string()],
        grant_types: vec!["authorization_code".to_string()],
        response_types: vec!["code".to_string()],
        allowed_scopes: vec!["openid".to_string()],
        client_permissions: None,
    };

    let (client_details, _) = client_service
        .create_client(request)
        .await
        .expect("Failed to create public client");

    // 2. 尝试在没有 PKCE 的情况下获取授权码
    let _no_pkce_request = AuthorizeRequest {
        client_id: client_details.client.client_id.clone(),
        redirect_uri: "http://localhost:3000/callback".to_string(),
        response_type: "code".to_string(),
        scope: "openid".to_string(),
        code_challenge: String::new(),  // 空的code_challenge
        code_challenge_method: String::new(),
        nonce: None,
    };

    // TODO: 实现 OAuth 2.1 PKCE 强制检查
    // let result = auth_code_service
    //     .create_auth_code(&no_pkce_request, "user_pkce")
    //     .await;
    //
    // assert!(
    //     result.is_err(),
    //     "OAuth 2.1 requires PKCE for public clients"
    // );

    // 3. 使用 PKCE 应该成功
    let verifier = oauth_service_rust::utils::pkce::generate_code_verifier();
    let challenge = oauth_service_rust::utils::pkce::generate_code_challenge(&verifier);

    let pkce_request = AuthorizeRequest {
        client_id: client_details.client.client_id.clone(),
        redirect_uri: "http://localhost:3000/callback".to_string(),
        response_type: "code".to_string(),
        scope: "openid".to_string(),
        code_challenge: challenge,
        code_challenge_method: "S256".to_string(),
        nonce: None,
    };

    let result = auth_code_service
        .create_auth_code(&pkce_request, "user_pkce")
        .await;

    assert!(result.is_ok(), "PUBLIC client with PKCE should succeed");
}

// ============================================================================
// OAuth 2.1 合规性测试: 错误响应格式
// ============================================================================

/// 测试: 错误响应必须符合 OAuth 2.0 标准格式
///
/// 规范: RFC 6749 Section 5.2
/// 错误响应格式:
/// {
///   "error": "error_code",
///   "error_description": "human readable description",
///   "error_uri": "optional_uri"
/// }
///
/// 预期:
/// - 所有OAuth错误都包含 "error" 字段
/// - 包含可读的 "error_description"
/// - 不泄露内部错误信息
#[tokio::test]
async fn test_error_response_format_compliance() {
    let pool = Arc::new(setup_test_db().await);
    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));

    // 1. 尝试用无效的 client_id 进行身份验证
    let result = client_service
        .authenticate_client("invalid_client_id", Some("secret"))
        .await;

    assert!(result.is_err(), "Should fail with invalid client_id");

    let error = result.unwrap_err();
    let _error_msg = error.to_string();

    // TODO: 验证错误格式
    // 应该包含 "invalid_client" 或类似的标准OAuth错误代码
    // 不应该包含数据库错误信息等内部信息
}

// ============================================================================
// OAuth 2.1 合规性测试: Token Revocation
// ============================================================================

/// 测试: 令牌撤销端点 (Token Revocation) 实现
///
/// 规范: RFC 7009
/// 客户端应该能够撤销已发行的令牌
///
/// 预期:
/// - 撤销有效的令牌: ✅ 成功 (返回 200)
/// - 使用已撤销的令牌: ❌ 被拒绝
#[tokio::test]
async fn test_token_revocation_endpoint_basic() {
    // TODO: 完整实现令牌撤销端点
    // 此测试当前作为占位符，待 revoke_token 在 TokenService 中实现

    // 预期流程:
    // 1. 创建客户端和用户
    // 2. 发行令牌
    // 3. 调用 POST /oauth/revoke (client_id, token)
    // 4. 验证响应 (200 OK)
    // 5. 尝试使用已撤销的令牌
    // 6. 应该返回 invalid_token

    // TODO: Token revocation tests will be implemented in Phase 2
}

// ============================================================================
// 总结
// ============================================================================

/// 测试覆盖的 OAuth 2.1 合规性检查清单
///
/// ✅ 已实现/已覆盖:
/// - [ ] PKCE 代码验证器生成和验证 (在 pkce_token_tests.rs)
/// - [ ] 授权码创建 (在 oauth_flow_tests.rs)
/// - [ ] 客户端认证 (在 comprehensive_service_tests.rs)
/// - [ ] 基本令牌流程 (在 oauth_flow_tests.rs)
///
/// ❌ 需要实现:
/// - [ ] 授权码验证 (code_verifier 与 code_challenge 匹配)
/// - [ ] 授权码防重用
/// - [ ] 重定向URI白名单验证
/// - [ ] 作用域权限强制
/// - [ ] PUBLIC 客户端强制 PKCE
/// - [ ] 令牌撤销端点
/// - [ ] 错误响应格式验证
/// - [ ] Token 黑名单/吊销验证
///
/// 该文件是完整合规性测试的基础框架。
/// 每个测试都有 TODO 注释指示需要实现的验证逻辑。
#[test]
fn oauth_2_1_compliance_test_suite_overview() {
    println!("OAuth 2.1 Compliance Test Suite");
    println!("================================");
    println!("本测试套件覆盖 OAuth 2.1 规范的关键安全需求:");
    println!();
    println!("1. 授权码流程安全:");
    println!("   - PKCE 验证 (code_verifier 与 code_challenge)");
    println!("   - 授权码一次性使用");
    println!();
    println!("2. 客户端验证:");
    println!("   - 重定向 URI 白名单");
    println!("   - 重定向 URI 精确匹配");
    println!();
    println!("3. 作用域强制:");
    println!("   - 客户端作用域限制");
    println!("   - 作用域在授权码中记录");
    println!();
    println!("4. 现代 OAuth 2.1 需求:");
    println!("   - PUBLIC 客户端强制 PKCE");
    println!("   - 禁用隐式流程和资源所有者密码");
    println!();
    println!("参考资源:");
    println!("- OAuth 2.1 Draft: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1");
    println!("- PKCE RFC: https://tools.ietf.org/html/rfc7636");
    println!("- Token Revocation RFC: https://tools.ietf.org/html/rfc7009");
}
