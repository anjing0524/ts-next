// Database initialization and seeding for OAuth Service
use sqlx::{sqlite::SqlitePool, migrate::MigrateDatabase, Sqlite};
use crate::error::ServiceError;
use std::path::Path;

/// Initialize database: run migrations and seed data
pub async fn initialize_database(database_url: &str) -> Result<SqlitePool, ServiceError> {
    // 1. Create database if it doesn't exist
    if !Sqlite::database_exists(database_url).await.unwrap_or(false) {
        tracing::info!("Creating database: {}", database_url);
        Sqlite::create_database(database_url)
            .await
            .map_err(|e| ServiceError::Internal(format!("Failed to create database: {}", e)))?;
    }

    // 2. Create connection pool
    let pool = SqlitePool::connect(database_url)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to connect to database: {}", e)))?;

    // 3. Run migrations and seed data (conditionally)
    let skip_db_init = std::env::var("SKIP_DB_INIT").unwrap_or_else(|_| "false".to_string());
    if &skip_db_init != "true" && &skip_db_init != "1" {
        tracing::info!("Running migrations and seeding data...");
        run_migrations(&pool, "migrations").await?;
        seed_initial_data(&pool).await?;
    } else {
        tracing::info!("SKIP_DB_INIT is set, skipping migrations and seeding.");
    }

    tracing::info!("Database initialization completed successfully");
    Ok(pool)
}

/// Run migrations from SQL files
async fn run_migrations(pool: &SqlitePool, migrations_dir: &str) -> Result<(), ServiceError> {
    tracing::info!("Running database migrations from: {}", migrations_dir);

    // Read migration files
    let migration_path = Path::new(migrations_dir);
    if !migration_path.exists() {
        tracing::warn!("Migrations directory not found: {}", migrations_dir);
        return Ok(());
    }

    // Get all migration files (*.sql) sorted by name
    let mut entries = std::fs::read_dir(migration_path)
        .map_err(|e| ServiceError::Internal(format!("Failed to read migrations directory: {}", e)))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "sql")
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();

    entries.sort_by_key(|e| e.path());

    // Execute each migration
    for entry in entries {
        let path = entry.path();
        if let Some(filename) = path.file_name() {
            let sql = std::fs::read_to_string(&path)
                .map_err(|e| ServiceError::Internal(format!(
                    "Failed to read migration file {:?}: {}",
                    filename, e
                )))?;

            tracing::info!("Executing migration: {:?}", filename);

            // Split by semicolons and execute each statement
            for statement in sql.split(';') {
                let trimmed = statement.trim();
                if !trimmed.is_empty() {
                    sqlx::raw_sql(trimmed)
                        .execute(pool)
                        .await
                        .map_err(|e| ServiceError::Internal(format!(
                            "Failed to execute migration statement in {:?}: {}",
                            filename, e
                        )))?;
                }
            }
        }
    }

    tracing::info!("All migrations completed");
    Ok(())
}

/// Seed initial data: create default users, roles, and clients
async fn seed_initial_data(pool: &SqlitePool) -> Result<(), ServiceError> {
    tracing::info!("Seeding initial data");

    // 1. Create default admin user
    seed_admin_user(pool).await?;

    // 2. Create default roles
    seed_default_roles(pool).await?;

    // 3. Create default permissions
    seed_default_permissions(pool).await?;

    // 4. Assign permissions to admin role
    seed_role_permissions(pool).await?;

    // 5. Create default OAuth clients
    seed_oauth_clients(pool).await?;

    // 6. Create default scopes
    seed_default_scopes(pool).await?;

    tracing::info!("Initial data seeding completed");
    Ok(())
}

/// Seed default admin user
async fn seed_admin_user(pool: &SqlitePool) -> Result<(), ServiceError> {
    // Check if admin user already exists
    let existing = sqlx::query_scalar::<_, String>(
        "SELECT id FROM users WHERE username = 'admin' LIMIT 1"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| ServiceError::Internal(format!("Failed to check admin user: {}", e)))?;

    if existing.is_some() {
        tracing::debug!("Admin user already exists");
        return Ok(());
    }

    // Create admin user (password: admin123)
    // This is a bcrypt hash of "admin123" with cost factor 10
    let password_hash = "$2b$10$PKrWTcyzYWIf2c38GCQ3b.QvuMjGGXcyAp.juw0Fz1EoZ80HQ.4.C";
    let user_id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO users (id, username, password_hash, display_name, is_active, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&user_id)
    .bind("admin")
    .bind(password_hash)
    .bind("Administrator")
    .bind(true)
    .bind(true)  // Must change password on first login
    .execute(pool)
    .await
    .map_err(|e| ServiceError::Internal(format!("Failed to create admin user: {}", e)))?;

    tracing::info!("Admin user created successfully");
    Ok(())
}

/// Seed default roles
async fn seed_default_roles(pool: &SqlitePool) -> Result<(), ServiceError> {
    let default_roles = vec![
        ("admin", "Administrator", "System administrator with full access"),
        ("user", "User", "Regular user with basic access"),
        ("viewer", "Viewer", "Read-only access"),
    ];

    for (name, display_name, description) in default_roles {
        // Check if role already exists
        let existing = sqlx::query_scalar::<_, String>(
            "SELECT id FROM roles WHERE name = ? LIMIT 1"
        )
        .bind(name)
        .fetch_optional(pool)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to check role: {}", e)))?;

        if existing.is_some() {
            tracing::debug!("Role '{}' already exists", name);
            continue;
        }

        let role_id = uuid::Uuid::new_v4().to_string();

        sqlx::query(
            "INSERT INTO roles (id, name, display_name, description, is_system_role, is_active)
             VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(&role_id)
        .bind(name)
        .bind(display_name)
        .bind(description)
        .bind(true)  // System role
        .bind(true)  // Active
        .execute(pool)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to create role '{}': {}", name, e)))?;

        tracing::info!("Role '{}' created successfully", name);
    }

    Ok(())
}

/// Seed default permissions
async fn seed_default_permissions(pool: &SqlitePool) -> Result<(), ServiceError> {
    let default_permissions = vec![
        // User management
        ("users:list", "List Users", "View user list", "users", "list", "API"),
        ("users:create", "Create User", "Create new user", "users", "create", "API"),
        ("users:read", "Read User", "View user details", "users", "read", "API"),
        ("users:update", "Update User", "Edit user information", "users", "update", "API"),
        ("users:delete", "Delete User", "Delete user", "users", "delete", "API"),

        // Role management
        ("roles:list", "List Roles", "View role list", "roles", "list", "API"),
        ("roles:create", "Create Role", "Create new role", "roles", "create", "API"),
        ("roles:update", "Update Role", "Edit role", "roles", "update", "API"),
        ("roles:delete", "Delete Role", "Delete role", "roles", "delete", "API"),

        // Permission management
        ("permissions:list", "List Permissions", "View permission list", "permissions", "list", "API"),
        ("permissions:create", "Create Permission", "Create new permission", "permissions", "create", "API"),
        ("permissions:update", "Update Permission", "Edit permission", "permissions", "update", "API"),
        ("permissions:delete", "Delete Permission", "Delete permission", "permissions", "delete", "API"),

        // OAuth client management
        ("clients:list", "List Clients", "View OAuth clients", "clients", "list", "API"),
        ("clients:create", "Create Client", "Create new OAuth client", "clients", "create", "API"),
        ("clients:update", "Update Client", "Edit OAuth client", "clients", "update", "API"),
        ("clients:delete", "Delete Client", "Delete OAuth client", "clients", "delete", "API"),

        // System management
        ("system:config", "System Configuration", "Manage system configuration", "system", "config", "API"),
        ("audit:list", "List Audit Logs", "View audit logs", "audit", "list", "API"),

        // Menu permissions
        ("menu:system:user:view", "View User Management Menu", "Show user management menu", "menu", "system:user", "MENU"),
        ("menu:system:role:view", "View Role Management Menu", "Show role management menu", "menu", "system:role", "MENU"),
        ("menu:system:permission:view", "View Permission Management Menu", "Show permission management menu", "menu", "system:permission", "MENU"),
        ("menu:system:client:view", "View Client Management Menu", "Show client management menu", "menu", "system:client", "MENU"),
        ("menu:system:audit:view", "View Audit Log Menu", "Show audit log menu", "menu", "system:audit", "MENU"),
        ("dashboard:view", "View Dashboard", "Access dashboard", "dashboard", "view", "MENU"),
    ];

    for (name, display_name, description, resource, action, perm_type) in default_permissions {
        // Check if permission already exists
        let existing = sqlx::query_scalar::<_, String>(
            "SELECT id FROM permissions WHERE name = ? LIMIT 1"
        )
        .bind(name)
        .fetch_optional(pool)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to check permission: {}", e)))?;

        if existing.is_some() {
            tracing::debug!("Permission '{}' already exists", name);
            continue;
        }

        let perm_id = uuid::Uuid::new_v4().to_string();

        sqlx::query(
            "INSERT INTO permissions (id, name, display_name, description, resource, action, type, is_system_perm, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&perm_id)
        .bind(name)
        .bind(display_name)
        .bind(description)
        .bind(resource)
        .bind(action)
        .bind(perm_type)
        .bind(true)  // System permission
        .bind(true)  // Active
        .execute(pool)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to create permission '{}': {}", name, e)))?;

        tracing::debug!("Permission '{}' created", name);
    }

    tracing::info!("Default permissions seeded successfully");
    Ok(())
}

/// Assign default permissions to admin role
async fn seed_role_permissions(pool: &SqlitePool) -> Result<(), ServiceError> {
    // Get admin role ID
    let admin_role_id = sqlx::query_scalar::<_, String>(
        "SELECT id FROM roles WHERE name = 'admin' LIMIT 1"
    )
    .fetch_one(pool)
    .await
    .map_err(|e| ServiceError::Internal(format!("Failed to get admin role: {}", e)))?;

    // Get all permission IDs
    let permissions = sqlx::query_scalar::<_, String>(
        "SELECT id FROM permissions WHERE is_system_perm = true"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| ServiceError::Internal(format!("Failed to get permissions: {}", e)))?;

    // Check if admin role already has permissions
    let existing_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM role_permissions WHERE role_id = ?"
    )
    .bind(&admin_role_id)
    .fetch_one(pool)
    .await
    .map_err(|e| ServiceError::Internal(format!("Failed to check role permissions: {}", e)))?;

    if existing_count > 0 {
        tracing::debug!("Admin role already has permissions assigned");
        return Ok(());
    }

    // Assign all permissions to admin role
    for perm_id in permissions {
        sqlx::query(
            "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)"
        )
        .bind(&admin_role_id)
        .bind(&perm_id)
        .execute(pool)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to assign permission to admin role: {}", e)))?;
    }

    // Assign admin role to admin user
    let admin_user_id = sqlx::query_scalar::<_, String>(
        "SELECT id FROM users WHERE username = 'admin' LIMIT 1"
    )
    .fetch_one(pool)
    .await
    .map_err(|e| ServiceError::Internal(format!("Failed to get admin user: {}", e)))?;

    let existing_assignment = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM user_roles WHERE user_id = ? AND role_id = ?"
    )
    .bind(&admin_user_id)
    .bind(&admin_role_id)
    .fetch_one(pool)
    .await
    .map_err(|e| ServiceError::Internal(format!("Failed to check user role assignment: {}", e)))?;

    if existing_assignment == 0 {
        sqlx::query(
            "INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
        )
        .bind(&admin_user_id)
        .bind(&admin_role_id)
        .execute(pool)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to assign admin role to admin user: {}", e)))?;
    }

    tracing::info!("Admin role permissions assigned successfully");
    Ok(())
}

/// Create default OAuth clients
async fn seed_oauth_clients(pool: &SqlitePool) -> Result<(), ServiceError> {
    let clients = vec![
        (
            "auth-center-admin-client",
            "Admin Portal",
            "OAuth 2.1 Client for Admin Portal",
            "http://localhost:6188/auth/callback",
            "CONFIDENTIAL",
        ),
        (
            "test-client",
            "Test Client",
            "OAuth 2.1 Test Client",
            "http://localhost:3002/auth/callback",
            "CONFIDENTIAL",
        ),
    ];

    for (client_id, name, description, redirect_uri, client_type) in clients {
        // Check if client already exists
        let existing = sqlx::query_scalar::<_, String>(
            "SELECT id FROM oauth_clients WHERE client_id = ? LIMIT 1"
        )
        .bind(client_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to check OAuth client: {}", e)))?;

        if existing.is_some() {
            tracing::debug!("OAuth client '{}' already exists", client_id);
            continue;
        }

        let client_internal_id = uuid::Uuid::new_v4().to_string();
        let client_secret = uuid::Uuid::new_v4().to_string();

        sqlx::query(
            "INSERT INTO oauth_clients (id, client_id, client_secret, name, description, client_type,
                                       require_pkce, require_consent, is_active, allow_localhost_redirect)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&client_internal_id)
        .bind(client_id)
        .bind(&client_secret)
        .bind(name)
        .bind(description)
        .bind(client_type)
        .bind(true)  // Require PKCE
        .bind(true)  // Require consent
        .bind(true)  // Active
        .bind(true)  // Allow localhost redirect
        .execute(pool)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to create OAuth client: {}", e)))?;

        // Add redirect URI
        sqlx::query(
            "INSERT INTO client_redirect_uris (client_id, uri) VALUES (?, ?)"
        )
        .bind(&client_internal_id)
        .bind(redirect_uri)
        .execute(pool)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to add redirect URI: {}", e)))?;

        // Add grant types
        for grant_type in &["authorization_code", "refresh_token"] {
            sqlx::query(
                "INSERT INTO client_grant_types (client_id, grant_type) VALUES (?, ?)"
            )
            .bind(&client_internal_id)
            .bind(grant_type)
            .execute(pool)
            .await
            .map_err(|e| ServiceError::Internal(format!("Failed to add grant type: {}", e)))?;
        }

        // Add response types
        for response_type in &["code"] {
            sqlx::query(
                "INSERT INTO client_response_types (client_id, response_type) VALUES (?, ?)"
            )
            .bind(&client_internal_id)
            .bind(response_type)
            .execute(pool)
            .await
            .map_err(|e| ServiceError::Internal(format!("Failed to add response type: {}", e)))?;
        }

        // Add allowed scopes
        for scope in &["openid", "profile", "email"] {
            sqlx::query(
                "INSERT INTO client_allowed_scopes (client_id, scope) VALUES (?, ?)"
            )
            .bind(&client_internal_id)
            .bind(scope)
            .execute(pool)
            .await
            .map_err(|e| ServiceError::Internal(format!("Failed to add allowed scope: {}", e)))?;
        }

        tracing::info!("OAuth client '{}' created with secret: {}", client_id, client_secret);
    }

    Ok(())
}

/// Seed default OAuth scopes
async fn seed_default_scopes(pool: &SqlitePool) -> Result<(), ServiceError> {
    let scopes = vec![
        ("openid", "OpenID Connect", true),
        ("profile", "User Profile", true),
        ("email", "User Email", true),
        ("offline_access", "Offline Access", false),
    ];

    for (name, description, is_oidc) in scopes {
        // Check if scope already exists
        let existing = sqlx::query_scalar::<_, String>(
            "SELECT id FROM scopes WHERE name = ? LIMIT 1"
        )
        .bind(name)
        .fetch_optional(pool)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to check scope: {}", e)))?;

        if existing.is_some() {
            tracing::debug!("Scope '{}' already exists", name);
            continue;
        }

        let scope_id = uuid::Uuid::new_v4().to_string();

        sqlx::query(
            "INSERT INTO scopes (id, name, description, is_oidc_scope, is_public, is_active)
             VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(&scope_id)
        .bind(name)
        .bind(description)
        .bind(is_oidc)
        .bind(true)  // Public
        .bind(true)  // Active
        .execute(pool)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to create scope '{}': {}", name, e)))?;

        tracing::debug!("Scope '{}' created", name);
    }

    tracing::info!("Default scopes seeded successfully");
    Ok(())
}
