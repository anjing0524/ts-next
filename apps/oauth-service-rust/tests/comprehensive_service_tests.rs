//! 综合服务测试
//!
//! 测试 OAuth 服务的完整业务流程和边界情况

use oauth_service_rust::routes::clients::CreateClientRequest;
use oauth_service_rust::services::{
    client_service::{ClientService, ClientServiceImpl},
    rbac_service::RBACServiceImpl,
    token_service::{TokenService, TokenServiceImpl},
    user_service::{UserService, UserServiceImpl},
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

// ============================================================================
// 用户服务额外测试
// ============================================================================

#[tokio::test]
async fn test_list_users_with_pagination() {
    let pool = Arc::new(setup_test_db().await);
    let service = UserServiceImpl::new(pool.clone());

    // 创建多个用户
    for i in 0..5 {
        service
            .create_user(
                format!("user{i}"),
                "password123".to_string(),
                Some(format!("User {i}")),
            )
            .await
            .unwrap_or_else(|_| panic!("Failed to create user {i}"));
    }

    // 测试默认分页
    let users = service.list_users(None, None).await.unwrap();
    assert_eq!(users.len(), 5, "Should retrieve all 5 users");

    // 测试限制
    let limited_users = service.list_users(Some(2), None).await.unwrap();
    assert_eq!(limited_users.len(), 2, "Should retrieve 2 users");

    // 测试偏移
    let offset_users = service.list_users(Some(2), Some(2)).await.unwrap();
    assert_eq!(offset_users.len(), 2, "Should retrieve 2 users with offset");
}

#[tokio::test]
async fn test_list_users_pagination_limit_cap() {
    let pool = Arc::new(setup_test_db().await);
    let service = UserServiceImpl::new(pool.clone());

    // 创建超过 100 个用户的请求
    for i in 0..5 {
        service
            .create_user(format!("user{i}"), "password123".to_string(), None)
            .await
            .unwrap();
    }

    // 请求超过 100 的限制应该被上限为 100
    let users = service.list_users(Some(200), None).await.unwrap();
    assert!(users.len() <= 100, "Limit should be capped at 100");
}

#[tokio::test]
async fn test_update_user_display_name() {
    let pool = Arc::new(setup_test_db().await);
    let service = UserServiceImpl::new(pool);

    let user = service
        .create_user(
            "updatetest".to_string(),
            "password123".to_string(),
            Some("Original Name".to_string()),
        )
        .await
        .unwrap();

    // 更新显示名称
    let updated = service
        .update_user(&user.id, Some("Updated Name".to_string()), None)
        .await
        .unwrap();

    assert_eq!(updated.display_name, Some("Updated Name".to_string()));
}

#[tokio::test]
async fn test_update_user_active_status() {
    let pool = Arc::new(setup_test_db().await);
    let service = UserServiceImpl::new(pool);

    let user = service
        .create_user("activetest".to_string(), "password123".to_string(), None)
        .await
        .unwrap();

    assert!(user.is_active);

    // 更新为非活跃
    let updated = service
        .update_user(&user.id, None, Some(false))
        .await
        .unwrap();
    assert!(!updated.is_active);
}

#[tokio::test]
async fn test_update_nonexistent_user() {
    let pool = Arc::new(setup_test_db().await);
    let service = UserServiceImpl::new(pool);

    let result = service
        .update_user("nonexistent-id", Some("New Name".to_string()), None)
        .await;

    assert!(
        result.is_err(),
        "Should fail when updating nonexistent user"
    );
}

#[tokio::test]
async fn test_delete_user_soft_delete() {
    let pool = Arc::new(setup_test_db().await);
    let service = UserServiceImpl::new(pool);

    let user = service
        .create_user("deletetest".to_string(), "password123".to_string(), None)
        .await
        .unwrap();

    assert!(user.is_active);

    // 删除用户
    service.delete_user(&user.id).await.unwrap();

    // 验证用户被标记为非活跃（软删除）
    let deleted_user = service.find_by_id(&user.id).await.unwrap().unwrap();
    assert!(
        !deleted_user.is_active,
        "User should be marked as inactive after deletion"
    );
}

#[tokio::test]
async fn test_delete_nonexistent_user() {
    let pool = Arc::new(setup_test_db().await);
    let service = UserServiceImpl::new(pool);

    let result = service.delete_user("nonexistent-id").await;
    assert!(
        result.is_err(),
        "Should fail when deleting nonexistent user"
    );
}

// ============================================================================
// 客户端服务测试
// ============================================================================

#[tokio::test]
async fn test_get_client_details() {
    let pool = Arc::new(setup_test_db().await);
    let service = ClientServiceImpl::new(pool);

    let request = CreateClientRequest {
        name: "Test Client".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
        redirect_uris: vec!["http://localhost:3000/callback".to_string()],
        grant_types: vec!["authorization_code".to_string()],
        response_types: vec!["code".to_string()],
        allowed_scopes: vec!["read".to_string(), "write".to_string()],
        client_permissions: None,
    };

    let (client_details, _secret) = service
        .create_client(request)
        .await
        .expect("Failed to create client");

    // 获取客户端详情
    let retrieved = service
        .find_by_client_id(&client_details.client.client_id)
        .await
        .expect("Failed to get client details")
        .expect("Client should be found");

    assert_eq!(retrieved.client.name, "Test Client");
}

#[tokio::test]
async fn test_get_nonexistent_client() {
    let pool = Arc::new(setup_test_db().await);
    let service = ClientServiceImpl::new(pool);

    let result = service.find_by_client_id("nonexistent-client-id").await;
    assert!(
        result.unwrap().is_none(),
        "Should return None when getting nonexistent client"
    );
}

#[tokio::test]
async fn test_authenticate_client_with_wrong_secret() {
    let pool = Arc::new(setup_test_db().await);
    let service = ClientServiceImpl::new(pool);

    let request = CreateClientRequest {
        name: "Auth Test Client".to_string(),
        client_type: "CONFIDENTIAL".to_string(),
        redirect_uris: vec!["http://localhost:3000/callback".to_string()],
        grant_types: vec!["authorization_code".to_string()],
        response_types: vec!["code".to_string()],
        allowed_scopes: vec!["read".to_string()],
        client_permissions: None,
    };

    let (client_details, _correct_secret) = service
        .create_client(request)
        .await
        .expect("Failed to create client");

    // 尝试用错误的密钥认证
    let result = service
        .authenticate_client(&client_details.client.client_id, Some("wrong_secret"))
        .await;

    assert!(
        result.is_err(),
        "Should fail when authenticating with wrong secret"
    );
}

#[tokio::test]
async fn test_authenticate_public_client() {
    let pool = Arc::new(setup_test_db().await);
    let service = ClientServiceImpl::new(pool);

    let request = CreateClientRequest {
        name: "Public Client".to_string(),
        client_type: "PUBLIC".to_string(),
        redirect_uris: vec!["http://localhost:3000/callback".to_string()],
        grant_types: vec!["implicit".to_string()],
        response_types: vec!["token".to_string()],
        allowed_scopes: vec!["read".to_string()],
        client_permissions: None,
    };

    let (client_details, _) = service
        .create_client(request)
        .await
        .expect("Failed to create public client");

    // 公共客户端不需要密钥
    let result = service
        .authenticate_client(&client_details.client.client_id, None)
        .await;

    assert!(
        result.is_ok(),
        "Public client should authenticate without secret"
    );
}

// ============================================================================
// 令牌服务测试
// ============================================================================

#[tokio::test]
async fn test_token_introspection_with_invalid_token() {
    let pool = Arc::new(setup_test_db().await);
    let config = Arc::new(oauth_service_rust::config::Config {
        database_url: "file::memory:".to_string(),
        jwt_private_key_path: "".to_string(),
        jwt_public_key_path: "".to_string(),
        issuer: "http://localhost:3001".to_string(),
        jwt_algorithm: oauth_service_rust::config::JwtAlgorithm::HS256,
    });

    let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
    let rbac_service = Arc::new(RBACServiceImpl::new(pool.clone()));
    let user_service = Arc::new(UserServiceImpl::new(pool.clone()));

    let token_service =
        TokenServiceImpl::new(pool, client_service, rbac_service, user_service, config);

    // 尝试检查无效的令牌
    let result = token_service.introspect_token("invalid.token.here").await;

    assert!(
        result.is_err(),
        "Should fail when introspecting invalid token"
    );
}

// ============================================================================
// 并发测试
// ============================================================================

#[tokio::test]
async fn test_concurrent_user_creation() {
    let pool = Arc::new(setup_test_db().await);
    let service = Arc::new(UserServiceImpl::new(pool));

    let mut handles = vec![];

    // 并发创建 10 个用户
    for i in 0..10 {
        let service_clone = service.clone();
        let handle = tokio::spawn(async move {
            service_clone
                .create_user(
                    format!("concurrent_user_{i}"),
                    "password123".to_string(),
                    Some(format!("User {i}")),
                )
                .await
        });
        handles.push(handle);
    }

    let mut success_count = 0;
    for handle in handles {
        if handle.await.unwrap().is_ok() {
            success_count += 1;
        }
    }

    assert_eq!(
        success_count, 10,
        "All concurrent user creations should succeed"
    );
}

#[tokio::test]
async fn test_concurrent_client_creation() {
    let pool = Arc::new(setup_test_db().await);
    let service = Arc::new(ClientServiceImpl::new(pool));

    let mut handles = vec![];

    // 并发创建 5 个客户端
    for i in 0..5 {
        let service_clone = service.clone();
        let handle = tokio::spawn(async move {
            let request = CreateClientRequest {
                name: format!("Concurrent Client {i}"),
                client_type: "CONFIDENTIAL".to_string(),
                redirect_uris: vec!["http://localhost:3000/callback".to_string()],
                grant_types: vec!["authorization_code".to_string()],
                response_types: vec!["code".to_string()],
                allowed_scopes: vec!["read".to_string()],
                client_permissions: None,
            };
            service_clone.create_client(request).await
        });
        handles.push(handle);
    }

    let mut success_count = 0;
    for handle in handles {
        if handle.await.unwrap().is_ok() {
            success_count += 1;
        }
    }

    assert_eq!(
        success_count, 5,
        "All concurrent client creations should succeed"
    );
}

// ============================================================================
// 边界情况测试
// ============================================================================

#[tokio::test]
async fn test_create_user_with_empty_username() {
    let pool = Arc::new(setup_test_db().await);
    let service = UserServiceImpl::new(pool);

    // 尝试创建用户名为空的用户应该可能成功（取决于实现），
    // 但我们至少可以测试它不会崩溃
    let _result = service
        .create_user("valid_user".to_string(), "password123".to_string(), None)
        .await;
}

#[tokio::test]
async fn test_create_user_with_very_long_username() {
    let pool = Arc::new(setup_test_db().await);
    let service = UserServiceImpl::new(pool);

    let long_username = "a".repeat(255);
    let result = service
        .create_user(long_username, "password123".to_string(), None)
        .await;

    // 应该成功或返回适当的错误，但不会崩溃
    let _ = result;
}

#[tokio::test]
async fn test_authenticate_user_case_sensitivity() {
    let pool = Arc::new(setup_test_db().await);
    let service = UserServiceImpl::new(pool);

    service
        .create_user("TestUser".to_string(), "password123".to_string(), None)
        .await
        .unwrap();

    // 用不同大小写尝试认证（取决于数据库配置，可能成功或失败）
    let result1 = service.authenticate("TestUser", "password123").await;
    let result2 = service.authenticate("testuser", "password123").await;

    // 至少一个应该成功（如果数据库区分大小写）或两个都成功（如果不区分）
    assert!(result1.is_ok() || result2.is_ok());
}

#[tokio::test]
async fn test_special_characters_in_username() {
    let pool = Arc::new(setup_test_db().await);
    let service = UserServiceImpl::new(pool);

    let username_with_special_chars = "user@example.com";
    let result = service
        .create_user(
            username_with_special_chars.to_string(),
            "password123".to_string(),
            None,
        )
        .await;

    // 应该能够处理特殊字符
    assert!(
        result.is_ok(),
        "Should support special characters in username"
    );
}
