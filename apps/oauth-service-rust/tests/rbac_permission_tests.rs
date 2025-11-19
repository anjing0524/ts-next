//! 权限管理集成测试
//!
//! 测试权限的创建、分配和检索功能。

use oauth_service_rust::{
    cache::permission_cache::InMemoryPermissionCache,
    error::ServiceError,
    models::permission::PermissionType,
    services::{
        permission_service::{PermissionService, PermissionServiceImpl},
        rbac_service::{RBACService, RBACServiceImpl},
        role_service::{RoleService, RoleServiceImpl},
    },
};
use sqlx::SqlitePool;
use std::sync::Arc;
// 设置 RBAC 相关服务的辅助函数
async fn setup_rbac_services() -> (
    Arc<dyn RoleService>,
    Arc<dyn RBACService>,
    Arc<dyn PermissionService>,
    Arc<SqlitePool>,
) {
    let pool = SqlitePool::connect(":memory:")
        .await
        .expect("Failed to create in-memory database");

    let initial_schema_sql = include_str!("../migrations/001_initial_schema.sql");
    sqlx::query(initial_schema_sql)
        .execute(&pool)
        .await
        .expect("Failed to run initial schema migration");

    let pool = Arc::new(pool);
    let permission_cache = Arc::new(InMemoryPermissionCache::new());
    let role_service = Arc::new(RoleServiceImpl::new(pool.clone(), permission_cache.clone())) as Arc<dyn RoleService>;
    let rbac_service = Arc::new(RBACServiceImpl::new(pool.clone(), permission_cache)) as Arc<dyn RBACService>;
    let permission_service =
        Arc::new(PermissionServiceImpl::new(pool.clone())) as Arc<dyn PermissionService>;

    (role_service, rbac_service, permission_service, pool)
}

#[tokio::test]
async fn test_create_permission() {
    let (_role_service, _rbac_service, permission_service, _pool) = setup_rbac_services().await;

    let permission = permission_service
        .create_permission(
            "user:read".to_string(),
            Some("允许读取用户信息".to_string()),
            PermissionType::API,
        )
        .await
        .expect("Failed to create permission");

    assert_eq!(permission.name, "user:read");
    assert_eq!(permission.description, Some("允许读取用户信息".to_string()));
}

#[tokio::test]
async fn test_assign_permission_to_role() {
    let (role_service, _rbac_service, permission_service, pool) = setup_rbac_services().await;

    // Create a role
    let role = role_service
        .create_role("admin".to_string(), Some("Administrator role".to_string()))
        .await
        .expect("Failed to create role");

    // Create a permission
    let permission = permission_service
        .create_permission(
            "user:write".to_string(),
            Some("允许写入用户信息".to_string()),
            PermissionType::API,
        )
        .await
        .expect("Failed to create permission");

    // Assign permission to role
    let result = role_service
        .assign_permissions_to_role(&role.id, vec![permission.id.clone()])
        .await;

    assert!(result.is_ok(), "Failed to assign permission to role");

    // Verify that the permission is assigned by checking the role_permissions table
    let role_id = &role.id;
    let permission_id = &permission.id;
    let assigned_permissions_count = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM role_permissions WHERE role_id = ? AND permission_id = ?",
        role_id,
        permission_id
    )
    .fetch_one(&*pool)
    .await
    .expect("Failed to query role_permissions");

    assert_eq!(
        assigned_permissions_count, 1,
        "Permission should be assigned to role"
    );
}

#[tokio::test]
async fn test_get_role_permissions() {
    let (role_service, _rbac_service, permission_service, _pool) = setup_rbac_services().await;

    // Create a role
    let role = role_service
        .create_role("editor".to_string(), Some("Editor role".to_string()))
        .await
        .expect("Failed to create role");

    // Create two permissions
    let perm1 = permission_service
        .create_permission(
            "article:create".to_string(),
            Some("允许创建文章".to_string()),
            PermissionType::API,
        )
        .await
        .expect("Failed to create perm1");
    let perm2 = permission_service
        .create_permission(
            "article:edit".to_string(),
            Some("允许编辑文章".to_string()),
            PermissionType::API,
        )
        .await
        .expect("Failed to create perm2");

    // Assign both permissions to the role
    role_service
        .assign_permissions_to_role(&role.id, vec![perm1.id.clone(), perm2.id.clone()])
        .await
        .expect("Failed to assign permissions to role");

    // Retrieve permissions for the role
    let retrieved_permissions = role_service
        .get_role_permissions(&role.id)
        .await
        .expect("Failed to get role permissions");

    assert_eq!(
        retrieved_permissions.len(),
        2,
        "Should retrieve 2 permissions"
    );
    assert!(
        retrieved_permissions.contains(&perm1.name),
        "Should contain perm1"
    );
    assert!(
        retrieved_permissions.contains(&perm2.name),
        "Should contain perm2"
    );
}

#[tokio::test]
async fn test_remove_permission_from_role() {
    let (role_service, _rbac_service, permission_service, pool) = setup_rbac_services().await;

    // Create a role
    let role = role_service
        .create_role("viewer".to_string(), Some("Viewer role".to_string()))
        .await
        .expect("Failed to create role");

    // Create a permission
    let permission = permission_service
        .create_permission(
            "dashboard:view".to_string(),
            Some("允许查看仪表盘".to_string()),
            PermissionType::MENU,
        )
        .await
        .expect("Failed to create permission");

    // Assign permission to role
    role_service
        .assign_permissions_to_role(&role.id, vec![permission.id.clone()])
        .await
        .expect("Failed to assign permission to role");

    // Verify assignment
    let role_id = &role.id;
    let permission_id = &permission.id;
    let assigned_permissions_count_before = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM role_permissions WHERE role_id = ? AND permission_id = ?",
        role_id,
        permission_id
    )
    .fetch_one(&*pool)
    .await
    .expect("Failed to query role_permissions");
    assert_eq!(
        assigned_permissions_count_before, 1,
        "Permission should be assigned before removal"
    );

    // Remove permission from role
    role_service
        .remove_permissions_from_role(&role.id, vec![permission.id.clone()])
        .await
        .expect("Failed to remove permission from role");

    // Verify removal
    let assigned_permissions_count_after = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM role_permissions WHERE role_id = ? AND permission_id = ?",
        role_id,
        permission_id
    )
    .fetch_one(&*pool)
    .await
    .expect("Failed to query role_permissions");
    assert_eq!(
        assigned_permissions_count_after, 0,
        "Permission should be removed after removal"
    );
}

async fn create_client(pool: &SqlitePool, client_id: &str) -> String {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    sqlx::query!(
        "INSERT INTO oauth_clients (id, client_id, name, client_type, token_endpoint_auth_method, require_pkce, require_consent, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        id,
        client_id,
        client_id, // name
        "PUBLIC", // client_type
        "none", // token_endpoint_auth_method
        false, // require_pkce
        false, // require_consent
        true, // is_active
        now,
        now
    )
    .execute(pool)
    .await
    .expect("Failed to create client");
    id
}

async fn assign_permission_to_client(pool: &SqlitePool, client_id: &str, permission_name: &str) {
    // Get the actual database id for the client
    let client_db_id: (String,) =
        sqlx::query_as("SELECT id FROM oauth_clients WHERE client_id = ?")
            .bind(client_id)
            .fetch_one(pool)
            .await
            .expect("Failed to find client by client_id");

    sqlx::query!(
        "INSERT INTO client_permissions (client_id, permission) VALUES (?, ?)",
        client_db_id.0,
        permission_name
    )
    .execute(pool)
    .await
    .expect("Failed to assign permission to client");
}

#[tokio::test]
async fn test_has_permission_for_user() {
    let (role_service, rbac_service, permission_service, pool) = setup_rbac_services().await;

    // Create a user
    let user_id = "test_user_with_permission";
    sqlx::query("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
        .bind(user_id)
        .bind("testuser")
        .bind("hash")
        .execute(&*pool)
        .await
        .expect("Failed to create test user");

    // Create a role
    let role = role_service
        .create_role("manager".to_string(), Some("Manager role".to_string()))
        .await
        .expect("Failed to create role");

    // Create a permission
    let permission = permission_service
        .create_permission(
            "report:view".to_string(),
            Some("允许查看报告".to_string()),
            PermissionType::DATA,
        )
        .await
        .expect("Failed to create permission");

    // Assign permission to role
    role_service
        .assign_permissions_to_role(&role.id, vec![permission.id.clone()])
        .await
        .expect("Failed to assign permission to role");

    // Assign role to user
    role_service
        .assign_role_to_user(user_id, &role.id)
        .await
        .expect("Failed to assign role to user");

    // Check if user has the permission
    let has_permission = rbac_service
        .has_permission(user_id, &permission.name)
        .await
        .expect("Failed to check permission");

    assert!(has_permission, "User should have 'report:view' permission");

    // Check for a permission the user does not have
    let has_other_permission = rbac_service
        .has_permission(user_id, "report:edit")
        .await
        .expect("Failed to check other permission");

    assert!(
        !has_other_permission,
        "User should not have 'report:edit' permission"
    );
}

#[tokio::test]
async fn test_has_permission_for_client() {
    let (_role_service, rbac_service, permission_service, pool) = setup_rbac_services().await;

    // Create a client
    let client_id = "test_client_with_permission";
    create_client(&pool, client_id).await;

    // Create a permission
    let permission = permission_service
        .create_permission(
            "client:read_data".to_string(),
            Some("允许客户端读取数据".to_string()),
            PermissionType::API,
        )
        .await
        .expect("Failed to create permission");

    // Assign permission to client
    assign_permission_to_client(&pool, client_id, &permission.name).await;

    // Check if client has the permission
    let has_permission = rbac_service
        .has_permission_for_client(client_id, &permission.name)
        .await
        .expect("Failed to check client permission");

    assert!(
        has_permission,
        "Client should have 'client:read_data' permission"
    );

    // Check for a permission the client does not have
    let has_other_permission = rbac_service
        .has_permission_for_client(client_id, "client:write_data")
        .await
        .expect("Failed to check other client permission");

    assert!(
        !has_other_permission,
        "Client should not have 'client:write_data' permission"
    );
}

#[tokio::test]
async fn test_create_duplicate_permission() {
    let (_role_service, _rbac_service, permission_service, _pool) = setup_rbac_services().await;

    // Create the first permission
    permission_service
        .create_permission(
            "duplicate:perm".to_string(),
            Some("First permission".to_string()),
            PermissionType::API,
        )
        .await
        .expect("Failed to create first permission");

    // Attempt to create a second permission with the same name
    let result = permission_service
        .create_permission(
            "duplicate:perm".to_string(),
            Some("Second permission".to_string()),
            PermissionType::API,
        )
        .await;

    assert!(
        result.is_err(),
        "Creating a duplicate permission should fail"
    );
    let err = result.unwrap_err();
    assert!(
        err.to_string().contains("Conflict"),
        "Error should indicate a conflict"
    );
}

#[tokio::test]
async fn test_create_duplicate_role() {
    let (role_service, _rbac_service, _permission_service, _pool) = setup_rbac_services().await;

    // Create the first role
    role_service
        .create_role("duplicate_role".to_string(), Some("First role".to_string()))
        .await
        .expect("Failed to create first role");

    // Attempt to create a second role with the same name
    let result = role_service
        .create_role(
            "duplicate_role".to_string(),
            Some("Second role".to_string()),
        )
        .await;

    assert!(result.is_err(), "Creating a duplicate role should fail");
    let err = result.unwrap_err();
    assert!(
        matches!(err, ServiceError::Conflict(_)),
        "Error should be ServiceError::Conflict"
    );
}

#[tokio::test]
async fn test_assign_non_existent_permission_to_role() {
    let (role_service, _rbac_service, _permission_service, _pool) = setup_rbac_services().await;

    // Create a role
    let role = role_service
        .create_role("test_role".to_string(), None)
        .await
        .expect("Failed to create role");

    // Attempt to assign a non-existent permission ID to the role
    let non_existent_permission_id = uuid::Uuid::new_v4().to_string();
    let result = role_service
        .assign_permissions_to_role(&role.id, vec![non_existent_permission_id.clone()])
        .await;

    assert!(
        result.is_err(),
        "Assigning a non-existent permission should fail"
    );
    let err = result.unwrap_err();
    assert!(
        matches!(err, ServiceError::NotFound(_)),
        "Error should be ServiceError::NotFound"
    );
    assert!(
        err.to_string().contains(&non_existent_permission_id),
        "Error message should contain the non-existent permission ID"
    );
}

#[tokio::test]
async fn test_assign_non_existent_role_to_user() {
    let (role_service, _rbac_service, _permission_service, pool) = setup_rbac_services().await;

    // Create a user
    let user_id = "user_for_non_existent_role";
    sqlx::query("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
        .bind(user_id)
        .bind("testuser")
        .bind("hash")
        .execute(&*pool)
        .await
        .expect("Failed to create test user");

    // Attempt to assign a non-existent role ID to the user
    let non_existent_role_id = uuid::Uuid::new_v4().to_string();
    let result = role_service
        .assign_role_to_user(user_id, &non_existent_role_id)
        .await;

    assert!(result.is_err(), "Assigning a non-existent role should fail");
    let err = result.unwrap_err();
    assert!(
        matches!(err, ServiceError::NotFound(_)),
        "Error should be ServiceError::NotFound"
    );
    assert!(
        err.to_string().contains(&non_existent_role_id),
        "Error message should contain the non-existent role ID"
    );
}

#[tokio::test]
async fn test_remove_non_existent_permission_from_role() {
    let (role_service, _rbac_service, _permission_service, _pool) = setup_rbac_services().await;

    // Create a role
    let role = role_service
        .create_role("test_role_for_removal".to_string(), None)
        .await
        .expect("Failed to create role");

    // Attempt to remove a non-existent permission ID from the role
    let non_existent_permission_id = uuid::Uuid::new_v4().to_string();
    let result = role_service
        .remove_permissions_from_role(&role.id, vec![non_existent_permission_id.clone()])
        .await;

    assert!(
        result.is_ok(),
        "Removing a non-existent permission should succeed (no-op)"
    );
}

#[tokio::test]
async fn test_remove_non_existent_role_from_user() {
    let (role_service, _rbac_service, _permission_service, pool) = setup_rbac_services().await;

    // Create a user
    let user_id = "user_for_role_removal";
    sqlx::query("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
        .bind(user_id)
        .bind("testuser_removal")
        .bind("hash")
        .execute(&*pool)
        .await
        .expect("Failed to create test user");

    // Attempt to remove a non-existent role ID from the user
    let non_existent_role_id = uuid::Uuid::new_v4().to_string();
    let result = role_service
        .remove_role_from_user(user_id, &non_existent_role_id)
        .await;

    assert!(result.is_err(), "Removing a non-existent role should fail");
    let err = result.unwrap_err();
    assert!(
        matches!(err, ServiceError::NotFound(_)),
        "Error should be ServiceError::NotFound"
    );
    assert!(
        err.to_string().contains("User does not have this role"),
        "Error message should indicate role not found"
    );
}
