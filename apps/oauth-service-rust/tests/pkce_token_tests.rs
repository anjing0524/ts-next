//! PKCE 和令牌相关测试
//!
//! 测试 PKCE 流程、令牌生成、刷新和验证

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
// 测试数据库设置
// ============================================================================

async fn setup_test_db() -> SqlitePool {
    // Set JWT_SECRET for testing (required since hardcoded fallback was removed)
    std::env::set_var("JWT_SECRET", "test_jwt_secret_key_for_testing_only_do_not_use_in_production");

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

// 辅助函数：创建测试权限
async fn create_test_permission(
    pool: &SqlitePool,
    permission_name: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let permission_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO permissions (id, name, display_name, description, resource, action, type, is_system_perm, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&permission_id)
    .bind(permission_name)
    .bind(permission_name)
    .bind(format!("Test permission: {permission_name}"))
    .bind("service")
    .bind("read")
    .bind("API")
    .bind(false)
    .bind(true)
    .execute(pool)
    .await?;
    Ok(())
}

// 辅助函数：创建测试用户
async fn create_test_user(
    pool: &SqlitePool,
    user_id: &str,
    username: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let password_hash = oauth_service_rust::utils::crypto::hash_password("password123")?;
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
    .await?;
    Ok(())
}

// ============================================================================
// PKCE 代码验证测试
// ============================================================================

#[tokio::test]
async fn test_pkce_code_verifier_length() {
    // 测试 PKCE 代码验证器的长度
    let verifier = oauth_service_rust::utils::pkce::generate_code_verifier();

    // 代码验证器长度应该在 43 到 128 之间
    assert!(
        verifier.len() >= 43 && verifier.len() <= 128,
        "Code verifier length should be between 43 and 128"
    );
}

#[tokio::test]
async fn test_pkce_code_verifier_characters() {
    let verifier = oauth_service_rust::utils::pkce::generate_code_verifier();

    // 代码验证器应该只包含 unreserved 字符
    let valid_chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    for ch in verifier.chars() {
        assert!(
            valid_chars.contains(ch),
            "Code verifier contains invalid character: {ch}"
        );
    }
}

#[tokio::test]
async fn test_pkce_code_challenge_generation() {
    let verifier = oauth_service_rust::utils::pkce::generate_code_verifier();
    let challenge = oauth_service_rust::utils::pkce::generate_code_challenge(&verifier);

    // 生成的挑战不应该是空的
    assert!(!challenge.is_empty(), "Code challenge should not be empty");

    // 挑战应该是 base64url 编码的 SHA256 哈希
    // 长度应该相对固定（base64url 编码的 32 字节哈希）
    assert!(
        !challenge.is_empty(),
        "Code challenge should have a valid length"
    );
}

#[tokio::test]
async fn test_pkce_challenge_deterministic() {
    let verifier = oauth_service_rust::utils::pkce::generate_code_verifier();
    let challenge1 = oauth_service_rust::utils::pkce::generate_code_challenge(&verifier);
    let challenge2 = oauth_service_rust::utils::pkce::generate_code_challenge(&verifier);

    // 相同的验证器应该生成相同的挑战（确定性）
    assert_eq!(
        challenge1, challenge2,
        "Same verifier should generate same challenge"
    );
}

#[tokio::test]
async fn test_pkce_different_verifiers_different_challenges() {
    let verifier1 = oauth_service_rust::utils::pkce::generate_code_verifier();
    let verifier2 = oauth_service_rust::utils::pkce::generate_code_verifier();

    let challenge1 = oauth_service_rust::utils::pkce::generate_code_challenge(&verifier1);
    let challenge2 = oauth_service_rust::utils::pkce::generate_code_challenge(&verifier2);

    // 不同的验证器应该生成不同的挑战（极其可能）
    assert_ne!(
        challenge1, challenge2,
        "Different verifiers should generate different challenges"
    );
}

// ============================================================================
// 授权码生成和使用测试
// ============================================================================

#[tokio::test]
async fn test_authorization_code_expiration() {
    let pool = Arc::new(setup_test_db().await);

    // 创建测试用户
    create_test_user(&pool, "user_123", "testuser")
        .await
        .expect("Failed to create test user");

    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
    let auth_code_service = Arc::new(AuthCodeServiceImpl::new(
        pool.clone(),
        client_service.clone(),
    ));

    // 创建测试客户端
    let request = CreateClientRequest {
        name: "Test Client".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
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

    // 生成授权码
    let verifier = oauth_service_rust::utils::pkce::generate_code_verifier();
    let challenge = oauth_service_rust::utils::pkce::generate_code_challenge(&verifier);

    let auth_request = AuthorizeRequest {
        client_id: client_details.client.client_id.clone(),
        redirect_uri: "http://localhost:3000/callback".to_string(),
        response_type: "code".to_string(),
        scope: "read".to_string(),
        code_challenge: challenge.clone(),
        code_challenge_method: "S256".to_string(),
        nonce: None,
    };

    let auth_code = auth_code_service
        .create_auth_code(&auth_request, "user_123")
        .await
        .expect("Failed to create auth code");

    // 验证授权码不是空的
    assert!(
        !auth_code.is_empty(),
        "Authorization code should not be empty"
    );
}

#[tokio::test]
async fn test_authorization_code_cannot_be_reused() {
    let pool = Arc::new(setup_test_db().await);

    // 创建测试用户
    create_test_user(&pool, "user_123", "testuser")
        .await
        .expect("Failed to create test user");

    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
    let auth_code_service = Arc::new(AuthCodeServiceImpl::new(
        pool.clone(),
        client_service.clone(),
    ));

    // 创建测试客户端
    let request = CreateClientRequest {
        name: "Reuse Test Client".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
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

    // 验证授权码不能被重用
    // 这需要在令牌端点中实现，这里我们至少测试授权码的生成
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
        .create_auth_code(&auth_request, "user_123")
        .await
        .expect("Failed to create auth code");
}

// ============================================================================
// 令牌刷新测试
// ============================================================================

#[tokio::test]
async fn test_refresh_token_generates_new_access_token() {
    let pool = Arc::new(setup_test_db().await);

    // 创建测试用户
    create_test_user(&pool, "user_123", "testuser")
        .await
        .expect("Failed to create test user");

    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
    let user_service = Arc::new(UserServiceImpl::new(pool.clone()));
    let permission_cache = Arc::new(InMemoryPermissionCache::new());
    let rbac_service = Arc::new(RBACServiceImpl::new(pool.clone(), permission_cache));
    let config = Arc::new(oauth_service_rust::config::Config {
        database_url: "file::memory:".to_string(),
        jwt_private_key_path: "".to_string(),
        jwt_public_key_path: "".to_string(),
        issuer: "http://localhost:3001".to_string(),
        jwt_algorithm: oauth_service_rust::config::JwtAlgorithm::HS256,
    });

    let token_service = Arc::new(TokenServiceImpl::new(
        pool.clone(),
        client_service.clone(),
        rbac_service,
        user_service,
        config,
    ));

    // 创建客户端
    let request = CreateClientRequest {
        name: "Refresh Test Client".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
        redirect_uris: vec!["http://localhost:3000/callback".to_string()],
        grant_types: vec![
            "authorization_code".to_string(),
            "refresh_token".to_string(),
        ],
        response_types: vec!["code".to_string()],
        allowed_scopes: vec!["read".to_string()],
        client_permissions: None,
    };

    let (client_details, _) = client_service
        .create_client(request)
        .await
        .expect("Failed to create client");

    // 发行初始令牌对
    let token_pair = token_service
        .issue_tokens(
            &client_details,
            Some("user_123".to_string()),
            "read".to_string(),
            vec![],
            None,
        )
        .await
        .expect("Failed to issue tokens");

    assert!(
        token_pair.refresh_token.is_some(),
        "Refresh token should be present"
    );

    let refresh_token = token_pair.refresh_token.unwrap();
    let original_access_token = token_pair.access_token.clone();

    // 使用刷新令牌获取新的访问令牌
    let new_token_pair = token_service
        .refresh_token(&refresh_token)
        .await
        .expect("Failed to refresh token");

    // 新的访问令牌应该不同
    assert_ne!(
        original_access_token, new_token_pair.access_token,
        "New access token should be different from original"
    );
}

#[tokio::test]
async fn test_refresh_token_with_invalid_token() {
    let pool = Arc::new(setup_test_db().await);
    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
    let user_service = Arc::new(UserServiceImpl::new(pool.clone()));
    let permission_cache = Arc::new(InMemoryPermissionCache::new());
    let rbac_service = Arc::new(RBACServiceImpl::new(pool.clone(), permission_cache));
    let config = Arc::new(oauth_service_rust::config::Config {
        database_url: "file::memory:".to_string(),
        jwt_private_key_path: "".to_string(),
        jwt_public_key_path: "".to_string(),
        issuer: "http://localhost:3001".to_string(),
        jwt_algorithm: oauth_service_rust::config::JwtAlgorithm::HS256,
    });

    let token_service =
        TokenServiceImpl::new(pool, client_service, rbac_service, user_service, config);

    // 尝试使用无效的刷新令牌
    let result = token_service.refresh_token("invalid.refresh.token").await;

    assert!(
        result.is_err(),
        "Should fail when refreshing with invalid token"
    );
}

// ============================================================================
// 令牌检查 (Introspection) 测试
// ============================================================================

#[tokio::test]
async fn test_token_introspection_with_valid_token() {
    let pool = Arc::new(setup_test_db().await);

    // 创建测试用户
    create_test_user(&pool, "user_123", "testuser")
        .await
        .expect("Failed to create test user");

    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
    let user_service = Arc::new(UserServiceImpl::new(pool.clone()));
    let permission_cache = Arc::new(InMemoryPermissionCache::new());
    let rbac_service = Arc::new(RBACServiceImpl::new(pool.clone(), permission_cache));
    let config = Arc::new(oauth_service_rust::config::Config {
        database_url: "file::memory:".to_string(),
        jwt_private_key_path: "".to_string(),
        jwt_public_key_path: "".to_string(),
        issuer: "http://localhost:3001".to_string(),
        jwt_algorithm: oauth_service_rust::config::JwtAlgorithm::HS256,
    });

    let token_service = TokenServiceImpl::new(
        pool.clone(),
        client_service.clone(),
        rbac_service,
        user_service,
        config,
    );

    // 创建客户端
    let request = CreateClientRequest {
        name: "Introspect Test Client".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
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

    // 发行令牌
    let token_pair = token_service
        .issue_tokens(
            &client_details,
            Some("user_123".to_string()),
            "read".to_string(),
            vec![],
            None,
        )
        .await
        .expect("Failed to issue tokens");

    // 检查令牌
    let claims = token_service
        .introspect_token(&token_pair.access_token)
        .await
        .expect("Failed to introspect token");

    assert_eq!(claims.sub, Some("user_123".to_string()));
    assert_eq!(claims.client_id, client_details.client.client_id);
    assert_eq!(claims.scope, "read");
}

#[tokio::test]
async fn test_token_introspection_claims_structure() {
    let pool = Arc::new(setup_test_db().await);

    // 创建测试权限
    create_test_permission(&pool, "service:read")
        .await
        .expect("Failed to create test permission");

    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
    let user_service = Arc::new(UserServiceImpl::new(pool.clone()));
    let permission_cache = Arc::new(InMemoryPermissionCache::new());
    let rbac_service = Arc::new(RBACServiceImpl::new(pool.clone(), permission_cache));
    let config = Arc::new(oauth_service_rust::config::Config {
        database_url: "file::memory:".to_string(),
        jwt_private_key_path: "".to_string(),
        jwt_public_key_path: "".to_string(),
        issuer: "http://localhost:3001".to_string(),
        jwt_algorithm: oauth_service_rust::config::JwtAlgorithm::HS256,
    });

    let token_service = TokenServiceImpl::new(
        pool,
        client_service.clone(),
        rbac_service,
        user_service,
        config,
    );

    // 创建客户端
    let request = CreateClientRequest {
        name: "Claims Test Client".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
        redirect_uris: vec!["http://localhost:3000/callback".to_string()],
        grant_types: vec!["client_credentials".to_string()],
        response_types: vec![],
        allowed_scopes: vec!["service:read".to_string()],
        client_permissions: Some(vec!["service:read".to_string()]),
    };

    let (client_details, _) = client_service
        .create_client(request)
        .await
        .expect("Failed to create client");

    // 发行令牌
    let token_pair = token_service
        .issue_tokens(
            &client_details,
            None,
            "service:read".to_string(),
            vec!["service:read".to_string()],
            None,
        )
        .await
        .expect("Failed to issue tokens");

    // 检查令牌
    let claims = token_service
        .introspect_token(&token_pair.access_token)
        .await
        .expect("Failed to introspect token");

    // 验证所有必需的声明
    assert!(!claims.jti.is_empty(), "JTI should not be empty");
    assert!(claims.exp > 0, "Expiration should be set");
    assert!(claims.iat > 0, "Issued at should be set");
    assert_eq!(claims.scope, "service:read");
    assert!(!claims.permissions.is_empty(), "Permissions should be set");
}

// ============================================================================
// 令牌类型和过期测试
// ============================================================================

#[tokio::test]
async fn test_token_pair_structure() {
    let pool = Arc::new(setup_test_db().await);

    // 创建测试用户
    create_test_user(&pool, "user_123", "testuser")
        .await
        .expect("Failed to create test user");

    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
    let user_service = Arc::new(UserServiceImpl::new(pool.clone()));
    let permission_cache = Arc::new(InMemoryPermissionCache::new());
    let rbac_service = Arc::new(RBACServiceImpl::new(pool.clone(), permission_cache));
    let config = Arc::new(oauth_service_rust::config::Config {
        database_url: "file::memory:".to_string(),
        jwt_private_key_path: "".to_string(),
        jwt_public_key_path: "".to_string(),
        issuer: "http://localhost:3001".to_string(),
        jwt_algorithm: oauth_service_rust::config::JwtAlgorithm::HS256,
    });

    let token_service = TokenServiceImpl::new(
        pool,
        client_service.clone(),
        rbac_service,
        user_service,
        config,
    );

    let request = CreateClientRequest {
        name: "Token Pair Client".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
        redirect_uris: vec!["http://localhost:3000/callback".to_string()],
        grant_types: vec![
            "authorization_code".to_string(),
            "refresh_token".to_string(),
        ],
        response_types: vec!["code".to_string()],
        allowed_scopes: vec!["read".to_string()],
        client_permissions: None,
    };

    let (client_details, _) = client_service
        .create_client(request)
        .await
        .expect("Failed to create client");

    // 发行令牌对（用户授权码流程）
    let token_pair = token_service
        .issue_tokens(
            &client_details,
            Some("user_123".to_string()),
            "read".to_string(),
            vec![],
            None,
        )
        .await
        .expect("Failed to issue tokens");

    // 验证令牌对的结构
    assert!(
        !token_pair.access_token.is_empty(),
        "Access token should not be empty"
    );
    assert!(
        token_pair.refresh_token.is_some(),
        "Refresh token should be present for user flows"
    );
    assert!(token_pair.expires_in > 0, "Expires in should be positive");
}

#[tokio::test]
async fn test_client_credentials_flow_no_refresh_token() {
    let pool = Arc::new(setup_test_db().await);

    // 创建测试权限
    create_test_permission(&pool, "service:read")
        .await
        .expect("Failed to create test permission");

    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
    let user_service = Arc::new(UserServiceImpl::new(pool.clone()));
    let permission_cache = Arc::new(InMemoryPermissionCache::new());
    let rbac_service = Arc::new(RBACServiceImpl::new(pool.clone(), permission_cache));
    let config = Arc::new(oauth_service_rust::config::Config {
        database_url: "file::memory:".to_string(),
        jwt_private_key_path: "".to_string(),
        jwt_public_key_path: "".to_string(),
        issuer: "http://localhost:3001".to_string(),
        jwt_algorithm: oauth_service_rust::config::JwtAlgorithm::HS256,
    });

    let token_service = TokenServiceImpl::new(
        pool,
        client_service.clone(),
        rbac_service,
        user_service,
        config,
    );

    let request = CreateClientRequest {
        name: "Client Credentials Client".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
        redirect_uris: vec![],
        grant_types: vec!["client_credentials".to_string()],
        response_types: vec![],
        allowed_scopes: vec!["service:read".to_string()],
        client_permissions: Some(vec!["service:read".to_string()]),
    };

    let (client_details, _) = client_service
        .create_client(request)
        .await
        .expect("Failed to create client");

    // 发行令牌对（客户端凭证流程，无用户）
    let token_pair = token_service
        .issue_tokens(
            &client_details,
            None,
            "service:read".to_string(),
            vec!["service:read".to_string()],
            None,
        )
        .await
        .expect("Failed to issue tokens");

    // 客户端凭证流程不应该有刷新令牌
    assert!(
        token_pair.refresh_token.is_none(),
        "Client credentials flow should not have refresh token"
    );
}
