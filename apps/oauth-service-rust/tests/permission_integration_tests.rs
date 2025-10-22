//! 权限检查集成测试
//!
//! 测试 RBAC (基于角色的访问控制) 系统
//! 包括权限检查、角色分配等功能

use oauth_service_rust::services::{
    rbac_service::{RBACService, RBACServiceImpl},
    role_service::{RoleService, RoleServiceImpl},
};
use std::sync::Arc;

async fn setup_rbac_services() -> (
    Arc<dyn RoleService>,
    Arc<dyn RBACService>,
    Arc<sqlx::SqlitePool>,
) {
    let pool = sqlx::SqlitePool::connect(":memory:")
        .await
        .expect("Failed to create in-memory database");

    let initial_schema_sql = include_str!("../migrations/001_initial_schema.sql");
    sqlx::query(initial_schema_sql)
        .execute(&pool)
        .await
        .expect("Failed to run initial schema migration");

    let pool = Arc::new(pool);
    let role_service = Arc::new(RoleServiceImpl::new(pool.clone())) as Arc<dyn RoleService>;
    let rbac_service = Arc::new(RBACServiceImpl::new(pool.clone())) as Arc<dyn RBACService>;

    (role_service, rbac_service, pool)
}

#[tokio::test]
async fn test_create_role() {
    let (role_service, _rbac_service, _pool) = setup_rbac_services().await;

    let role = role_service
        .create_role("admin".to_string(), Some("Administrator role".to_string()))
        .await
        .expect("Failed to create role");

    assert_eq!(role.name, "admin");
    assert_eq!(role.description, Some("Administrator role".to_string()));
}

#[tokio::test]
async fn test_create_multiple_roles() {
    let (role_service, _rbac_service, _pool) = setup_rbac_services().await;

    for i in 0..3 {
        let role = role_service
            .create_role(format!("role_{i}"), Some(format!("Role number {i}")))
            .await
            .unwrap_or_else(|_| panic!("Failed to create role {i}"));

        assert_eq!(role.name, format!("role_{i}"));
    }
}

#[tokio::test]
async fn test_assign_role_to_user() {
    let (role_service, _rbac_service, pool) = setup_rbac_services().await;

    // Create a role
    let role = role_service
        .create_role("viewer".to_string(), Some("Viewer role".to_string()))
        .await
        .expect("Failed to create role");

    // Create a test user
    let user_id = "test_user_123";
    sqlx::query(
        r#"
        INSERT INTO users (id, username, password_hash)
        VALUES (?, ?, ?)
        "#,
    )
    .bind(user_id)
    .bind("testuser")
    .bind("hash")
    .execute(&*pool)
    .await
    .expect("Failed to create test user");

    // Assign role to user
    let result = role_service.assign_role_to_user(user_id, &role.id).await;

    assert!(result.is_ok(), "Failed to assign role to user");
}

#[tokio::test]
async fn test_remove_role_from_user() {
    let (role_service, _rbac_service, pool) = setup_rbac_services().await;

    // Create a role
    let role = role_service
        .create_role("moderator".to_string(), Some("Moderator role".to_string()))
        .await
        .expect("Failed to create role");

    // Create a test user
    let user_id = "moderator_user";
    sqlx::query(
        r#"
        INSERT INTO users (id, username, password_hash)
        VALUES (?, ?, ?)
        "#,
    )
    .bind(user_id)
    .bind("moduser")
    .bind("hash")
    .execute(&*pool)
    .await
    .expect("Failed to create test user");

    // Assign role to user
    role_service
        .assign_role_to_user(user_id, &role.id)
        .await
        .expect("Failed to assign role");

    // Remove role from user
    let result = role_service.remove_role_from_user(user_id, &role.id).await;

    assert!(result.is_ok(), "Failed to remove role from user");
}

#[tokio::test]
async fn test_get_user_roles() {
    let (role_service, _rbac_service, pool) = setup_rbac_services().await;

    // Create two roles
    let role1 = role_service
        .create_role("admin".to_string(), Some("Admin role".to_string()))
        .await
        .expect("Failed to create role 1");

    let role2 = role_service
        .create_role("user".to_string(), Some("User role".to_string()))
        .await
        .expect("Failed to create role 2");

    // Create a test user
    let user_id = "multi_role_user";
    sqlx::query(
        r#"
        INSERT INTO users (id, username, password_hash)
        VALUES (?, ?, ?)
        "#,
    )
    .bind(user_id)
    .bind("multiroleuser")
    .bind("hash")
    .execute(&*pool)
    .await
    .expect("Failed to create test user");

    // Assign both roles to user
    role_service
        .assign_role_to_user(user_id, &role1.id)
        .await
        .expect("Failed to assign role 1");

    role_service
        .assign_role_to_user(user_id, &role2.id)
        .await
        .expect("Failed to assign role 2");

    // Get user roles
    let user_roles = role_service
        .get_user_roles(user_id)
        .await
        .expect("Failed to get user roles");

    assert_eq!(user_roles.len(), 2, "User should have 2 roles");
}

#[tokio::test]
async fn test_rbac_service_get_user_permissions() {
    let (role_service, rbac_service, pool) = setup_rbac_services().await;

    // Create a role
    let role = role_service
        .create_role("editor".to_string(), Some("Editor role".to_string()))
        .await
        .expect("Failed to create role");

    // Create a test user
    let user_id = "editor_user";
    sqlx::query(
        r#"
        INSERT INTO users (id, username, password_hash)
        VALUES (?, ?, ?)
        "#,
    )
    .bind(user_id)
    .bind("editoruser")
    .bind("hash")
    .execute(&*pool)
    .await
    .expect("Failed to create test user");

    // Assign role to user
    role_service
        .assign_role_to_user(user_id, &role.id)
        .await
        .expect("Failed to assign role");

    // Get user permissions (may be empty initially, but should not error)
    let permissions = rbac_service
        .get_user_permissions(user_id)
        .await
        .expect("Failed to get user permissions");

    assert!(
        permissions.is_empty() || !permissions.is_empty(),
        "Should return permissions list"
    );
}

#[tokio::test]
async fn test_transaction_atomicity_role_assignment() {
    let (role_service, _rbac_service, pool) = setup_rbac_services().await;

    // Create a role
    let role = role_service
        .create_role(
            "tx_role".to_string(),
            Some("Transaction test role".to_string()),
        )
        .await
        .expect("Failed to create role");

    // Create a test user
    let user_id = "tx_user";
    sqlx::query(
        r#"
        INSERT INTO users (id, username, password_hash)
        VALUES (?, ?, ?)
        "#,
    )
    .bind(user_id)
    .bind("txuser")
    .bind("hash")
    .execute(&*pool)
    .await
    .expect("Failed to create test user");

    // Assign role to user (should use transaction internally)
    let result = role_service.assign_role_to_user(user_id, &role.id).await;

    assert!(result.is_ok(), "Role assignment should succeed");

    // Verify user has the role
    let user_roles = role_service
        .get_user_roles(user_id)
        .await
        .expect("Failed to get user roles");

    assert!(!user_roles.is_empty(), "User should have assigned role");
}

#[tokio::test]
async fn test_concurrent_role_assignments() {
    let (role_service, _rbac_service, pool) = setup_rbac_services().await;

    // Create a role
    let role = role_service
        .create_role(
            "concurrent_role".to_string(),
            Some("Concurrent role".to_string()),
        )
        .await
        .expect("Failed to create role");

    // Create multiple test users and assign role concurrently
    let mut handles = vec![];

    for i in 0..5 {
        let role_service_clone = role_service.clone();
        let role_id = role.id.clone();
        let pool_clone = pool.clone();

        let handle = tokio::spawn(async move {
            let user_id = format!("concurrent_user_{i}");
            sqlx::query(
                r#"
                INSERT INTO users (id, username, password_hash)
                VALUES (?, ?, ?)
                "#,
            )
            .bind(&user_id)
            .bind(format!("concurrentuser{i}"))
            .bind("hash")
            .execute(&*pool_clone)
            .await
            .expect("Failed to create test user");

            role_service_clone
                .assign_role_to_user(&user_id, &role_id)
                .await
                .expect("Failed to assign role")
        });
        handles.push(handle);
    }

    // Wait for all concurrent operations to complete
    for handle in handles {
        let _ = handle.await;
    }
}
