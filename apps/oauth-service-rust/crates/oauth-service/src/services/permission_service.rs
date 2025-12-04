use crate::error::ServiceError;
use crate::models::permission::{Permission, PermissionType};
use async_trait::async_trait;
use sqlx::{query_as, SqlitePool};
use std::sync::Arc;

#[async_trait]
pub trait PermissionService: Send + Sync {
    async fn create_permission(
        &self,
        name: String,
        description: Option<String>,
        r#type: PermissionType,
    ) -> Result<Permission, ServiceError>;
    async fn list_permissions(
        &self,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<Vec<Permission>, ServiceError>;
    async fn find_permission_by_id(&self, id: &str) -> Result<Option<Permission>, ServiceError>;
    async fn update_permission(&self, id: &str, description: Option<String>) -> Result<Permission, ServiceError>;
    async fn delete_permission(&self, id: &str) -> Result<(), ServiceError>;
}

pub struct PermissionServiceImpl {
    pool: Arc<SqlitePool>,
}

impl PermissionServiceImpl {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl PermissionService for PermissionServiceImpl {
    async fn create_permission(
        &self,
        name: String,
        description: Option<String>,
        r#type: PermissionType,
    ) -> Result<Permission, ServiceError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now();

        // Derive resource and action from name, e.g., "user:read" -> resource "user", action "read"
        let parts: Vec<&str> = name.split(':').collect();
        let (resource, action) = if parts.len() == 2 {
            (parts[0].to_string(), parts[1].to_string())
        } else {
            (name.clone(), "*".to_string()) // Default if not in resource:action format
        };

        let display_name = name.clone(); // For now, display_name is same as name
        let is_system_perm = false;
        let is_active = true;

        query_as::<_, Permission>(
            r#"
            INSERT INTO permissions (id, name, display_name, description, resource, action, type, is_system_perm, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            "#,
        )
        .bind(&id)
        .bind(&name)
        .bind(&display_name)
        .bind(&description)
        .bind(&resource)
        .bind(&action)
        .bind(r#type)
        .bind(is_system_perm)
        .bind(is_active)
        .bind(now)
        .bind(now)
        .fetch_one(&*self.pool)
        .await
        .map_err(|e| {
            if let sqlx::Error::Database(db_err) = &e {
                if let Some(code) = db_err.code() {
                    if code == "19" || code == "2067" { // SQLite unique constraint code is 19, MySQL is 2067
                        return ServiceError::Conflict(format!("Permission '{name}' already exists"));
                    }
                }
            }
            ServiceError::Internal(format!("Failed to create permission: {e}"))
        })
    }

    async fn list_permissions(
        &self,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<Vec<Permission>, ServiceError> {
        let permissions = query_as::<_, Permission>(
            r#"
            SELECT id, name, display_name, description, resource, action, type, is_system_perm, is_active, created_at, updated_at
            FROM permissions
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(limit.unwrap_or(100))
        .bind(offset.unwrap_or(0))
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to list permissions: {e}")))?;

        Ok(permissions)
    }

    async fn find_permission_by_id(&self, id: &str) -> Result<Option<Permission>, ServiceError> {
        let permission = query_as::<_, Permission>(
            r#"
            SELECT id, name, display_name, description, resource, action, type, is_system_perm, is_active, created_at, updated_at
            FROM permissions
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_optional(&*self.pool)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to find permission by ID: {e}")))?;

        Ok(permission)
    }

    async fn update_permission(&self, id: &str, description: Option<String>) -> Result<Permission, ServiceError> {
        let now = chrono::Utc::now();

        let updated_permission = query_as::<_, Permission>(
            r#"
            UPDATE permissions
            SET description = ?, updated_at = ?
            WHERE id = ?
            RETURNING *
            "#,
        )
        .bind(description)
        .bind(now)
        .bind(id)
        .fetch_one(&*self.pool)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to update permission: {e}")))?;

        Ok(updated_permission)
    }

    async fn delete_permission(&self, id: &str) -> Result<(), ServiceError> {
        sqlx::query(
            r#"
            DELETE FROM permissions
            WHERE id = ?
            "#,
        )
        .bind(id)
        .execute(&*self.pool)
        .await
        .map_err(|e| ServiceError::Internal(format!("Failed to delete permission: {e}")))?;

        Ok(())
    }
}
