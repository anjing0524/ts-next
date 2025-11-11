use jsonwebtoken::{DecodingKey, EncodingKey};
use oauth_service_rust::routes::clients::CreateClientRequest;
use oauth_service_rust::services::auth_code_service::AuthCodeService;
use oauth_service_rust::services::client_service::ClientService;
use oauth_service_rust::services::rbac_service::RBACService;
use oauth_service_rust::services::token_service::TokenService;
use sqlx::SqlitePool;
use std::sync::Arc;

// 测试辅助结构
struct TestServices {
    pool: Arc<SqlitePool>,
    client_service: Arc<dyn ClientService>,
    _user_service: Arc<dyn oauth_service_rust::services::user_service::UserService>,
    auth_code_service: Arc<dyn AuthCodeService>,
    rbac_service: Arc<dyn RBACService>,
    token_service: Arc<dyn TokenService>,
}

// 生成测试用 JWT 密钥对
fn generate_test_keys() -> (Arc<EncodingKey>, Arc<DecodingKey>) {
    let secret = b"test_secret_key_for_jwt_signing_at_least_32_bytes_long_1234567890";
    let encoding_key = Arc::new(EncodingKey::from_secret(secret));
    let decoding_key = Arc::new(DecodingKey::from_secret(secret));
    (encoding_key, decoding_key)
}

// 测试辅助函数
async fn setup_test_db() -> SqlitePool {
    let pool = SqlitePool::connect(":memory:")
        .await
        .expect("Failed to create in-memory database");

    // 应用迁移
    let initial_schema_sql = include_str!("../migrations/001_initial_schema.sql");
    sqlx::query(initial_schema_sql)
        .execute(&pool)
        .await
        .expect("Failed to run initial schema migration");

    pool
}

async fn setup_test_services() -> TestServices {
    // Set JWT_SECRET for testing (required since hardcoded fallback was removed)
    std::env::set_var("JWT_SECRET", "test_jwt_secret_key_for_testing_only_do_not_use_in_production");

    let pool = Arc::new(setup_test_db().await);
    let (encoding_key, decoding_key) = generate_test_keys();

    use oauth_service_rust::services::auth_code_service::AuthCodeServiceImpl;
    use oauth_service_rust::services::client_service::ClientServiceImpl;
    use oauth_service_rust::services::rbac_service::RBACServiceImpl;
    use oauth_service_rust::services::token_service::TokenServiceImpl;
    use oauth_service_rust::services::user_service::UserServiceImpl;

    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
    let user_service = Arc::new(UserServiceImpl::new(pool.clone()));
    let auth_code_service = Arc::new(AuthCodeServiceImpl::new(
        pool.clone(),
        client_service.clone(),
    ));
    let rbac_service = Arc::new(RBACServiceImpl::new(pool.clone()));

    let _keys = (encoding_key, decoding_key); // Unused keys; TokenServiceImpl generates its own

    let token_service = Arc::new(TokenServiceImpl::new(
        pool.clone(),
        client_service.clone()
            as Arc<dyn oauth_service_rust::services::client_service::ClientService>,
        rbac_service.clone() as Arc<dyn oauth_service_rust::services::rbac_service::RBACService>,
        user_service.clone() as Arc<dyn oauth_service_rust::services::user_service::UserService>,
        Arc::new(oauth_service_rust::config::Config {
            database_url: "file::memory:".to_string(),
            jwt_private_key_path: "".to_string(), // Empty - will use JWT_SECRET env var
            jwt_public_key_path: "".to_string(),  // Empty - will use JWT_SECRET env var
            issuer: "http://localhost:3001".to_string(),
            jwt_algorithm: oauth_service_rust::config::JwtAlgorithm::HS256,
        }),
    ));

    TestServices {
        pool,
        client_service: client_service as Arc<dyn ClientService>,
        _user_service: user_service
            as Arc<dyn oauth_service_rust::services::user_service::UserService>,
        auth_code_service: auth_code_service as Arc<dyn AuthCodeService>,
        rbac_service: rbac_service as Arc<dyn RBACService>,
        token_service: token_service as Arc<dyn TokenService>,
    }
}

#[tokio::test]
async fn test_oauth_authorization_code_flow_with_pkce() {
    let services = setup_test_services().await;

    let request = CreateClientRequest {
        name: "Test Client".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
        redirect_uris: vec!["http://localhost:3000/callback".to_string()],
        grant_types: vec![
            "authorization_code".to_string(),
            "refresh_token".to_string(),
        ],
        response_types: vec!["code".to_string()],
        allowed_scopes: vec!["read".to_string(), "write".to_string()],
        client_permissions: None,
    };

    let (client_details, client_secret) = services
        .client_service
        .create_client(request)
        .await
        .expect("Failed to create test client");

    let user_id = "user_123";
    let password = "password123";
    let password_hash = oauth_service_rust::utils::crypto::hash_password(password)
        .expect("Failed to hash password");

    sqlx::query(
        r#"
        INSERT INTO users
        (id, username, password_hash, is_active, must_change_password, failed_login_attempts)
        VALUES (?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(user_id)
    .bind("testuser")
    .bind(&password_hash)
    .bind(true)
    .bind(false)
    .bind(0)
    .execute(&*services.pool)
    .await
    .expect("Failed to create test user");

    let code_verifier = oauth_service_rust::utils::pkce::generate_code_verifier();
    let code_challenge = oauth_service_rust::utils::pkce::generate_code_challenge(&code_verifier);

    let authorize_request = oauth_service_rust::routes::oauth::AuthorizeRequest {
        client_id: client_details.client.client_id.clone(),
        redirect_uri: "http://localhost:3000/callback".to_string(),
        response_type: "code".to_string(),
        scope: "read write".to_string(),
        code_challenge: code_challenge.clone(),
        code_challenge_method: "S256".to_string(),
        nonce: Some("test_nonce".to_string()),
    };

    let _auth_code = services
        .auth_code_service
        .create_auth_code(&authorize_request, user_id)
        .await
        .expect("Failed to create authorization code");

    let client = services
        .client_service
        .authenticate_client(&client_details.client.client_id, Some(&client_secret))
        .await
        .expect("Failed to authenticate client");

    let permissions = services
        .rbac_service
        .get_user_permissions(user_id)
        .await
        .expect("Failed to get user permissions");

    let token_pair = services
        .token_service
        .issue_tokens(
            &client,
            Some(user_id.to_string()),
            "read write".to_string(),
            permissions,
            None,
        )
        .await
        .expect("Failed to issue tokens");

    let claims = services
        .token_service
        .introspect_token(&token_pair.access_token)
        .await
        .expect("Failed to introspect token");

    assert_eq!(claims.sub, Some(user_id.to_string()));
    assert_eq!(claims.client_id, client_details.client.client_id);
    assert_eq!(claims.scope, "read write");
}

#[tokio::test]
async fn test_client_credentials_flow() {
    let services = setup_test_services().await;

    let request = CreateClientRequest {
        name: "Service Client".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
        redirect_uris: vec![],
        grant_types: vec!["client_credentials".to_string()],
        response_types: vec![],
        allowed_scopes: vec!["service:read".to_string(), "service:write".to_string()],
        client_permissions: None, // No permissions assigned for test database
    };

    let (client_details, client_secret) = services
        .client_service
        .create_client(request)
        .await
        .expect("Failed to create service client");

    let client = services
        .client_service
        .authenticate_client(&client_details.client.client_id, Some(&client_secret))
        .await
        .expect("Failed to authenticate client");

    let token_pair = services
        .token_service
        .issue_tokens(
            &client,
            None,
            "service:read service:write".to_string(),
            vec![], // No permissions in test database
            None,
        )
        .await
        .expect("Failed to issue tokens");

    let claims = services
        .token_service
        .introspect_token(&token_pair.access_token)
        .await
        .expect("Failed to introspect token");

    assert_eq!(claims.sub, None);
    assert_eq!(claims.client_id, client_details.client.client_id);
    assert_eq!(claims.scope, "service:read service:write");
    assert_eq!(claims.permissions, vec![] as Vec<String>); // No permissions expected
}

#[tokio::test]
async fn test_refresh_token_flow() {
    let services = setup_test_services().await;

    let request = CreateClientRequest {
        name: "Refresh Client".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
        redirect_uris: vec!["http://localhost:3000/callback".to_string()],
        grant_types: vec![
            "authorization_code".to_string(),
            "refresh_token".to_string(),
        ],
        response_types: vec!["code".to_string()],
        allowed_scopes: vec!["read".to_string(), "write".to_string()],
        client_permissions: None,
    };

    let (client_details, client_secret) = services
        .client_service
        .create_client(request)
        .await
        .expect("Failed to create refresh client");

    let user_id = "user_456";
    let password_hash = oauth_service_rust::utils::crypto::hash_password("password123")
        .expect("Failed to hash password");

    sqlx::query(
        r#"
        INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)
        "#,
    )
    .bind(user_id)
    .bind("refreshuser")
    .bind(&password_hash)
    .execute(&*services.pool)
    .await
    .expect("Failed to create test user");

    let client = services
        .client_service
        .authenticate_client(&client_details.client.client_id, Some(&client_secret))
        .await
        .expect("Failed to authenticate client");

    let initial_token_pair = services
        .token_service
        .issue_tokens(
            &client,
            Some(user_id.to_string()),
            "read write".to_string(),
            vec![],
            None,
        )
        .await
        .expect("Failed to issue initial tokens");

    let refresh_token = initial_token_pair
        .refresh_token
        .expect("Refresh token should be present");

    let new_token_pair = services
        .token_service
        .refresh_token(&refresh_token)
        .await
        .expect("Failed to refresh token");

    let claims = services
        .token_service
        .introspect_token(&new_token_pair.access_token)
        .await
        .expect("Failed to introspect new token");

    assert_eq!(claims.sub, Some(user_id.to_string()));
    assert_eq!(claims.client_id, client_details.client.client_id);
}
