//! E2E Test Framework
//!
//! Common utilities, fixtures, and helpers for end-to-end testing.

pub mod fixtures;
pub mod oauth_client;
pub mod pkce;
pub mod test_server;

pub use fixtures::*;
pub use oauth_client::*;
pub use pkce::*;
pub use test_server::*;

use sqlx::{Pool, Sqlite, SqlitePool};

/// Setup a test database with migrations and fixtures
pub async fn setup_test_database() -> Pool<Sqlite> {
    let pool = SqlitePool::connect(":memory:")
        .await
        .expect("Failed to create in-memory database");

    // Run migrations
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    // Load test fixtures
    load_test_fixtures(&pool).await;

    pool
}

/// Load test fixtures into the database
async fn load_test_fixtures(pool: &Pool<Sqlite>) {
    // Insert test permissions
    for permission in get_test_permissions() {
        sqlx::query(
            r#"
            INSERT INTO permissions (id, name, display_name, description, resource, action, type, is_system_perm, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(&permission.id)
        .bind(&permission.name)
        .bind(&permission.display_name)
        .bind(&permission.description)
        .bind(&permission.resource)
        .bind(&permission.action)
        .bind(&permission.r#type)
        .bind(permission.is_system_perm)
        .bind(permission.is_active)
        .execute(pool)
        .await
        .expect("Failed to insert test permission");
    }

    // Insert test roles
    for role in get_test_roles() {
        sqlx::query(
            r#"
            INSERT INTO roles (id, name, description, is_system_role, is_active)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(&role.id)
        .bind(&role.name)
        .bind(&role.description)
        .bind(role.is_system_role)
        .bind(role.is_active)
        .execute(pool)
        .await
        .expect("Failed to insert test role");
    }

    // Insert role-permission mappings
    for mapping in get_test_role_permissions() {
        sqlx::query(
            r#"
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (?, ?)
            "#,
        )
        .bind(&mapping.role_id)
        .bind(&mapping.permission_id)
        .execute(pool)
        .await
        .expect("Failed to insert role-permission mapping");
    }

    // Insert test users
    for user in get_test_users() {
        sqlx::query(
            r#"
            INSERT INTO users (id, username, email, password_hash, is_active)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(&user.id)
        .bind(&user.username)
        .bind(&user.email)
        .bind(&user.password_hash)
        .bind(user.is_active)
        .execute(pool)
        .await
        .expect("Failed to insert test user");

        // Assign roles to users
        for role_id in &user.role_ids {
            sqlx::query(
                r#"
                INSERT INTO user_roles (user_id, role_id)
                VALUES (?, ?)
                "#,
            )
            .bind(&user.id)
            .bind(role_id)
            .execute(pool)
            .await
            .expect("Failed to assign role to user");
        }
    }

    // Insert test OAuth clients
    for client in get_test_clients() {
        sqlx::query(
            r#"
            INSERT INTO oauth_clients (
                id, client_id, client_secret, name, description,
                redirect_uris, grant_types, response_types, allowed_scopes,
                client_type, token_endpoint_auth_method, require_pkce, require_consent,
                is_active, access_token_ttl, refresh_token_ttl
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&client.id)
        .bind(&client.client_id)
        .bind(&client.client_secret)
        .bind(&client.name)
        .bind(&client.description)
        .bind(&client.redirect_uris)
        .bind(&client.grant_types)
        .bind(&client.response_types)
        .bind(&client.allowed_scopes)
        .bind(&client.client_type)
        .bind(&client.token_endpoint_auth_method)
        .bind(client.require_pkce)
        .bind(client.require_consent)
        .bind(client.is_active)
        .bind(client.access_token_ttl)
        .bind(client.refresh_token_ttl)
        .execute(pool)
        .await
        .expect("Failed to insert test client");
    }
}

/// Cleanup test database
pub async fn cleanup_test_database(pool: &Pool<Sqlite>) {
    pool.close().await;
}
