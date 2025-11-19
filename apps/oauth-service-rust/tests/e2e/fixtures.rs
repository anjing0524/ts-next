//! Test fixtures and data
//!
//! Provides test data for users, clients, roles, and permissions.

/// Test permission fixture
pub struct TestPermission {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub description: Option<String>,
    pub resource: String,
    pub action: String,
    pub r#type: String,
    pub is_system_perm: bool,
    pub is_active: bool,
}

/// Test role fixture
pub struct TestRole {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_system_role: bool,
    pub is_active: bool,
}

/// Test user fixture
pub struct TestUser {
    pub id: String,
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub is_active: bool,
    pub role_ids: Vec<String>,
}

/// Test OAuth client fixture
pub struct TestOAuthClient {
    pub id: String,
    pub client_id: String,
    pub client_secret: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub redirect_uris: String,
    pub grant_types: String,
    pub response_types: String,
    pub allowed_scopes: String,
    pub client_type: String,
    pub token_endpoint_auth_method: String,
    pub require_pkce: bool,
    pub require_consent: bool,
    pub is_active: bool,
    pub access_token_ttl: i32,
    pub refresh_token_ttl: i32,
}

/// Role-permission mapping
pub struct TestRolePermission {
    pub role_id: String,
    pub permission_id: String,
}

/// Get test permissions
pub fn get_test_permissions() -> Vec<TestPermission> {
    vec![
        TestPermission {
            id: "perm-001".to_string(),
            name: "users:read".to_string(),
            display_name: "Read Users".to_string(),
            description: Some("Permission to read user data".to_string()),
            resource: "users".to_string(),
            action: "read".to_string(),
            r#type: "API".to_string(),
            is_system_perm: true,
            is_active: true,
        },
        TestPermission {
            id: "perm-002".to_string(),
            name: "users:write".to_string(),
            display_name: "Write Users".to_string(),
            description: Some("Permission to create/update users".to_string()),
            resource: "users".to_string(),
            action: "write".to_string(),
            r#type: "API".to_string(),
            is_system_perm: true,
            is_active: true,
        },
        TestPermission {
            id: "perm-003".to_string(),
            name: "clients:manage".to_string(),
            display_name: "Manage Clients".to_string(),
            description: Some("Permission to manage OAuth clients".to_string()),
            resource: "clients".to_string(),
            action: "manage".to_string(),
            r#type: "API".to_string(),
            is_system_perm: true,
            is_active: true,
        },
        TestPermission {
            id: "perm-004".to_string(),
            name: "api:execute".to_string(),
            display_name: "Execute API".to_string(),
            description: Some("Permission to execute API calls".to_string()),
            resource: "api".to_string(),
            action: "execute".to_string(),
            r#type: "API".to_string(),
            is_system_perm: false,
            is_active: true,
        },
    ]
}

/// Get test roles
pub fn get_test_roles() -> Vec<TestRole> {
    vec![
        TestRole {
            id: "role-001".to_string(),
            name: "viewer".to_string(),
            description: Some("Read-only access".to_string()),
            is_system_role: true,
            is_active: true,
        },
        TestRole {
            id: "role-002".to_string(),
            name: "editor".to_string(),
            description: Some("Read and write access".to_string()),
            is_system_role: true,
            is_active: true,
        },
        TestRole {
            id: "role-003".to_string(),
            name: "admin".to_string(),
            description: Some("Full administrative access".to_string()),
            is_system_role: true,
            is_active: true,
        },
        TestRole {
            id: "role-004".to_string(),
            name: "api-user".to_string(),
            description: Some("API access role".to_string()),
            is_system_role: false,
            is_active: true,
        },
    ]
}

/// Get role-permission mappings
pub fn get_test_role_permissions() -> Vec<TestRolePermission> {
    vec![
        // viewer role
        TestRolePermission {
            role_id: "role-001".to_string(),
            permission_id: "perm-001".to_string(),
        },
        // editor role
        TestRolePermission {
            role_id: "role-002".to_string(),
            permission_id: "perm-001".to_string(),
        },
        TestRolePermission {
            role_id: "role-002".to_string(),
            permission_id: "perm-002".to_string(),
        },
        // admin role
        TestRolePermission {
            role_id: "role-003".to_string(),
            permission_id: "perm-001".to_string(),
        },
        TestRolePermission {
            role_id: "role-003".to_string(),
            permission_id: "perm-002".to_string(),
        },
        TestRolePermission {
            role_id: "role-003".to_string(),
            permission_id: "perm-003".to_string(),
        },
        // api-user role
        TestRolePermission {
            role_id: "role-004".to_string(),
            permission_id: "perm-004".to_string(),
        },
    ]
}

/// Get test users
/// Password for all users: "testpass123"
pub fn get_test_users() -> Vec<TestUser> {
    // bcrypt hash of "testpass123"
    let password_hash = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU8HhrhRqLfS".to_string();

    vec![
        TestUser {
            id: "user-001".to_string(),
            username: "testuser".to_string(),
            email: "test@example.com".to_string(),
            password_hash: password_hash.clone(),
            is_active: true,
            role_ids: vec!["role-001".to_string()], // viewer
        },
        TestUser {
            id: "user-002".to_string(),
            username: "editoruser".to_string(),
            email: "editor@example.com".to_string(),
            password_hash: password_hash.clone(),
            is_active: true,
            role_ids: vec!["role-002".to_string()], // editor
        },
        TestUser {
            id: "user-003".to_string(),
            username: "adminuser".to_string(),
            email: "admin@example.com".to_string(),
            password_hash: password_hash.clone(),
            is_active: true,
            role_ids: vec!["role-003".to_string()], // admin
        },
        TestUser {
            id: "user-004".to_string(),
            username: "multirole".to_string(),
            email: "multi@example.com".to_string(),
            password_hash: password_hash.clone(),
            is_active: true,
            role_ids: vec!["role-002".to_string(), "role-004".to_string()], // editor + api-user
        },
        TestUser {
            id: "user-005".to_string(),
            username: "inactive".to_string(),
            email: "inactive@example.com".to_string(),
            password_hash,
            is_active: false,
            role_ids: vec!["role-001".to_string()],
        },
    ]
}

/// Get test OAuth clients
pub fn get_test_clients() -> Vec<TestOAuthClient> {
    vec![
        // Confidential client for authorization code flow
        TestOAuthClient {
            id: "client-001".to_string(),
            client_id: "test-confidential-client".to_string(),
            client_secret: Some("test-secret-12345".to_string()),
            name: "Test Confidential Client".to_string(),
            description: Some("For E2E testing authorization code flow".to_string()),
            redirect_uris: r#"["http://localhost:3000/callback"]"#.to_string(),
            grant_types: r#"["authorization_code","refresh_token"]"#.to_string(),
            response_types: r#"["code"]"#.to_string(),
            allowed_scopes: r#"["openid","profile","email"]"#.to_string(),
            client_type: "CONFIDENTIAL".to_string(),
            token_endpoint_auth_method: "client_secret_post".to_string(),
            require_pkce: true,
            require_consent: true,
            is_active: true,
            access_token_ttl: 3600,
            refresh_token_ttl: 86400,
        },
        // Public client (e.g., SPA)
        TestOAuthClient {
            id: "client-002".to_string(),
            client_id: "test-public-client".to_string(),
            client_secret: None,
            name: "Test Public Client".to_string(),
            description: Some("For testing public client flow".to_string()),
            redirect_uris: r#"["http://localhost:3000/callback"]"#.to_string(),
            grant_types: r#"["authorization_code","refresh_token"]"#.to_string(),
            response_types: r#"["code"]"#.to_string(),
            allowed_scopes: r#"["openid","profile"]"#.to_string(),
            client_type: "PUBLIC".to_string(),
            token_endpoint_auth_method: "none".to_string(),
            require_pkce: true,
            require_consent: false,
            is_active: true,
            access_token_ttl: 1800,
            refresh_token_ttl: 43200,
        },
        // Service client (client credentials)
        TestOAuthClient {
            id: "client-003".to_string(),
            client_id: "service-client".to_string(),
            client_secret: Some("service-secret-67890".to_string()),
            name: "Service Client".to_string(),
            description: Some("For testing client credentials flow".to_string()),
            redirect_uris: r#"[]"#.to_string(),
            grant_types: r#"["client_credentials"]"#.to_string(),
            response_types: r#"[]"#.to_string(),
            allowed_scopes: r#"["api:read","api:write"]"#.to_string(),
            client_type: "CONFIDENTIAL".to_string(),
            token_endpoint_auth_method: "client_secret_post".to_string(),
            require_pkce: false,
            require_consent: false,
            is_active: true,
            access_token_ttl: 3600,
            refresh_token_ttl: 0, // No refresh token for client credentials
        },
        // Client with short token TTL for expiration testing
        TestOAuthClient {
            id: "client-004".to_string(),
            client_id: "short-ttl-client".to_string(),
            client_secret: Some("short-ttl-secret".to_string()),
            name: "Short TTL Client".to_string(),
            description: Some("For testing token expiration".to_string()),
            redirect_uris: r#"["http://localhost:3000/callback"]"#.to_string(),
            grant_types: r#"["authorization_code","refresh_token"]"#.to_string(),
            response_types: r#"["code"]"#.to_string(),
            allowed_scopes: r#"["openid"]"#.to_string(),
            client_type: "CONFIDENTIAL".to_string(),
            token_endpoint_auth_method: "client_secret_post".to_string(),
            require_pkce: true,
            require_consent: false,
            is_active: true,
            access_token_ttl: 2, // 2 seconds
            refresh_token_ttl: 5, // 5 seconds
        },
    ]
}

/// Well-known test credentials
pub const TEST_USER_PASSWORD: &str = "testpass123";
pub const TEST_CLIENT_ID: &str = "test-confidential-client";
pub const TEST_CLIENT_SECRET: &str = "test-secret-12345";
pub const TEST_REDIRECT_URI: &str = "http://localhost:3000/callback";
