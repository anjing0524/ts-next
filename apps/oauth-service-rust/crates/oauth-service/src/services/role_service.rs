#![allow(clippy::uninlined_format_args)]
use crate::{error::ServiceError, models::role::Role};
use crate::cache::permission_cache::PermissionCache;
use async_trait::async_trait;
use chrono::Utc;
use sqlx::SqlitePool;
use std::sync::Arc;
use uuid::Uuid;

#[async_trait]
pub trait RoleService: Send + Sync {
    /// 创建新角色
    async fn create_role(
        &self,
        name: String,
        description: Option<String>,
    ) -> Result<Role, ServiceError>;

    /// 根据ID查找角色
    async fn find_role_by_id(&self, role_id: &str) -> Result<Option<Role>, ServiceError>;

    /// 根据名称查找角色
    async fn find_role_by_name(&self, name: &str) -> Result<Option<Role>, ServiceError>;

    /// 列出所有角色
    async fn list_roles(
        &self,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<Vec<Role>, ServiceError>;

    /// 更新角色
    async fn update_role(
        &self,
        role_id: &str,
        name: Option<String>,
        description: Option<String>,
    ) -> Result<Role, ServiceError>;

    /// 删除角色
    async fn delete_role(&self, role_id: &str) -> Result<(), ServiceError>;

    /// 给角色分配权限
    async fn assign_permissions_to_role(
        &self,
        role_id: &str,
        permission_ids: Vec<String>,
    ) -> Result<(), ServiceError>;

    /// 从角色移除权限
    async fn remove_permissions_from_role(
        &self,
        role_id: &str,
        permission_ids: Vec<String>,
    ) -> Result<(), ServiceError>;

    /// 获取角色的所有权限
    async fn get_role_permissions(&self, role_id: &str) -> Result<Vec<String>, ServiceError>;

    /// 给用户分配角色
    async fn assign_role_to_user(&self, user_id: &str, role_id: &str) -> Result<(), ServiceError>;

    /// 从用户移除角色
    async fn remove_role_from_user(&self, user_id: &str, role_id: &str)
        -> Result<(), ServiceError>;

    /// 获取用户的所有角色
    async fn get_user_roles(&self, user_id: &str) -> Result<Vec<Role>, ServiceError>;
}

pub struct RoleServiceImpl {
    db: Arc<SqlitePool>,
    permission_cache: Arc<dyn PermissionCache>,
}

impl RoleServiceImpl {
    pub fn new(db: Arc<SqlitePool>, permission_cache: Arc<dyn PermissionCache>) -> Self {
        Self { db, permission_cache }
    }
}

#[async_trait]
impl RoleService for RoleServiceImpl {
    async fn create_role(
        &self,
        name: String,
        description: Option<String>,
    ) -> Result<Role, ServiceError> {
        // 检查角色名称是否已存在
        let existing = self.find_role_by_name(&name).await?;
        if existing.is_some() {
            return Err(ServiceError::Conflict(format!(
                "Role '{name}' already exists"
            )));
        }

        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        sqlx::query(
            r#"
            INSERT INTO roles (id, name, display_name, description, is_system_role, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&name)
        .bind(&name) // display_name 默认与 name 相同
        .bind(&description)
        .bind(false) // is_system_role
        .bind(true) // is_active
        .bind(&now)
        .bind(&now)
        .execute(&*self.db)
        .await?;

        // 返回创建的角色
        let role = self
            .find_role_by_id(&id)
            .await?
            .ok_or_else(|| ServiceError::Internal("Failed to retrieve created role".to_string()))?;

        Ok(role)
    }

    async fn find_role_by_id(&self, role_id: &str) -> Result<Option<Role>, ServiceError> {
        let role = sqlx::query_as::<_, Role>(
            "SELECT id, name, display_name, description, is_system_role, is_active, \
             created_at, updated_at FROM roles WHERE id = ?"
        )
            .bind(role_id)
            .fetch_optional(&*self.db)
            .await?;

        Ok(role)
    }

    async fn find_role_by_name(&self, name: &str) -> Result<Option<Role>, ServiceError> {
        let role = sqlx::query_as::<_, Role>(
            "SELECT id, name, display_name, description, is_system_role, is_active, \
             created_at, updated_at FROM roles WHERE name = ?"
        )
            .bind(name)
            .fetch_optional(&*self.db)
            .await?;

        Ok(role)
    }

    async fn list_roles(
        &self,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<Vec<Role>, ServiceError> {
        let limit = limit.unwrap_or(50).min(100); // 最大100条
        let offset = offset.unwrap_or(0);

        let roles = sqlx::query_as::<_, Role>(
            "SELECT id, name, display_name, description, is_system_role, is_active, \
             created_at, updated_at FROM roles ORDER BY created_at DESC LIMIT ? OFFSET ?",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&*self.db)
        .await?;

        Ok(roles)
    }

    async fn update_role(
        &self,
        role_id: &str,
        name: Option<String>,
        description: Option<String>,
    ) -> Result<Role, ServiceError> {
        // 检查角色是否存在
        let existing_role = self
            .find_role_by_id(role_id)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Role '{role_id}' not found")))?;

        // 如果提供了新名称，检查是否与其他角色冲突
        if let Some(new_name) = &name {
            if new_name != &existing_role.name {
                let existing_with_new_name = self.find_role_by_name(new_name).await?;
                if existing_with_new_name.is_some() {
                    return Err(ServiceError::Conflict(format!(
                        "Role '{new_name}' already exists"
                    )));
                }
            }
        }

        // 准备更新的字段
        let new_name = name.unwrap_or(existing_role.name);
        let new_description = description.or(existing_role.description);
        let now = Utc::now();

        // 执行更新
        sqlx::query(
            "UPDATE roles SET name = ?, display_name = ?, description = ?, updated_at = ? WHERE id = ?",
        )
        .bind(&new_name)
        .bind(&new_name) // display_name 与 name 相同
        .bind(&new_description)
        .bind(&now)
        .bind(role_id)
        .execute(&*self.db)
        .await?;

        // 重新查询更新后的角色
        let updated_role = self
            .find_role_by_id(role_id)
            .await?
            .ok_or_else(|| ServiceError::Internal("Failed to retrieve updated role".to_string()))?;

        Ok(updated_role)
    }

    async fn delete_role(&self, role_id: &str) -> Result<(), ServiceError> {
        // 检查角色是否存在
        let _ = self
            .find_role_by_id(role_id)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Role '{role_id}' not found")))?;

        // 获取该角色关联的所有用户 ID，以便清除他们的权限缓存
        let user_ids: Vec<String> = sqlx::query_scalar(
            "SELECT DISTINCT user_id FROM user_roles WHERE role_id = ?"
        )
        .bind(role_id)
        .fetch_all(&*self.db)
        .await?;

        // 物理删除角色
        // 注意：由于外键约束，关联的role_permissions和user_roles也会被删除
        sqlx::query("DELETE FROM roles WHERE id = ?")
            .bind(role_id)
            .execute(&*self.db)
            .await?;

        // 清除所有相关用户的权限缓存
        for user_id in user_ids {
            if let Err(e) = self.permission_cache.invalidate(&user_id).await {
                tracing::warn!(
                    "Failed to invalidate permission cache for user {} after deleting role {}: {}",
                    user_id,
                    role_id,
                    e
                );
                // 继续清除其他用户的缓存，即使一个失败了
            } else {
                tracing::debug!("Invalidated permission cache for user {} after deleting role {}", user_id, role_id);
            }
        }

        Ok(())
    }

    async fn assign_permissions_to_role(
        &self,
        role_id: &str,
        permission_ids: Vec<String>,
    ) -> Result<(), ServiceError> {
        // 检查角色是否存在
        let _ = self
            .find_role_by_id(role_id)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Role '{role_id}' not found")))?;

        // 使用事务保护多步骤操作
        let mut tx = self.db.begin().await?;

        for permission_id in permission_ids {
            // 检查权限是否存在
            let permission_exists = sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(SELECT 1 FROM permissions WHERE id = ?)",
            )
            .bind(&permission_id)
            .fetch_one(&mut *tx)
            .await?;

            if !permission_exists {
                tx.rollback().await?;
                return Err(ServiceError::NotFound(format!(
                    "Permission '{permission_id}' not found"
                )));
            }

            // 检查是否已存在关联
            let exists = sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ?)"
            )
            .bind(role_id)
            .bind(&permission_id)
            .fetch_one(&mut *tx)
            .await?;

            if !exists {
                let now = Utc::now();
                sqlx::query(
                    "INSERT INTO role_permissions (role_id, permission_id, assigned_at) VALUES (?, ?, ?)",
                )
                .bind(role_id)
                .bind(&permission_id)
                .bind(&now)
                .execute(&mut *tx)
                .await?;
            }
        }

        tx.commit().await?;
        Ok(())
    }

    async fn remove_permissions_from_role(
        &self,
        role_id: &str,
        permission_ids: Vec<String>,
    ) -> Result<(), ServiceError> {
        // 检查角色是否存在
        let _ = self
            .find_role_by_id(role_id)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Role '{role_id}' not found")))?;

        // 使用事务保护批量删除操作
        let mut tx = self.db.begin().await?;

        for permission_id in permission_ids {
            sqlx::query(
                "DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?",
            )
            .bind(role_id)
            .bind(&permission_id)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    async fn get_role_permissions(&self, role_id: &str) -> Result<Vec<String>, ServiceError> {
        let permissions = sqlx::query_scalar::<_, String>(
            "SELECT p.name FROM permissions p
             JOIN role_permissions rp ON p.id = rp.permission_id
             WHERE rp.role_id = ?",
        )
        .bind(role_id)
        .fetch_all(&*self.db)
        .await?;

        Ok(permissions)
    }

    async fn assign_role_to_user(&self, user_id: &str, role_id: &str) -> Result<(), ServiceError> {
        // 使用事务保护验证和插入操作
        let mut tx = self.db.begin().await?;

        // 检查角色是否存在
        let role_exists =
            sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM roles WHERE id = ?)")
                .bind(role_id)
                .fetch_one(&mut *tx)
                .await?;

        if !role_exists {
            tx.rollback().await?;
            return Err(ServiceError::NotFound(format!(
                "Role '{role_id}' not found"
            )));
        }

        // 检查用户是否存在
        let user_exists =
            sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users WHERE id = ?)")
                .bind(user_id)
                .fetch_one(&mut *tx)
                .await?;

        if !user_exists {
            tx.rollback().await?;
            return Err(ServiceError::NotFound(format!(
                "User '{user_id}' not found"
            )));
        }

        // 检查是否已存在关联
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ?)",
        )
        .bind(user_id)
        .bind(role_id)
        .fetch_one(&mut *tx)
        .await?;

        if exists {
            tx.rollback().await?;
            return Err(ServiceError::Conflict(
                "User already has this role".to_string(),
            ));
        }

        let now = Utc::now();
        sqlx::query(
            "INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, ?)",
        )
        .bind(user_id)
        .bind(role_id)
        .bind(&now)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        // CRITICAL FIX: Invalidate permission cache after role assignment
        // This ensures user gets updated permissions immediately
        self.permission_cache.invalidate(user_id).await?;

        Ok(())
    }

    async fn remove_role_from_user(
        &self,
        user_id: &str,
        role_id: &str,
    ) -> Result<(), ServiceError> {
        // 使用事务保护验证和删除操作
        let mut tx = self.db.begin().await?;

        // 检查关联是否存在
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ?)",
        )
        .bind(user_id)
        .bind(role_id)
        .fetch_one(&mut *tx)
        .await?;

        if !exists {
            tx.rollback().await?;
            return Err(ServiceError::NotFound(
                "User does not have this role".to_string(),
            ));
        }

        sqlx::query(
            "DELETE FROM user_roles WHERE user_id = ? AND role_id = ?",
        )
        .bind(user_id)
        .bind(role_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        // CRITICAL FIX: Invalidate permission cache after role removal
        // This ensures user loses permissions immediately
        self.permission_cache.invalidate(user_id).await?;

        Ok(())
    }

    async fn get_user_roles(&self, user_id: &str) -> Result<Vec<Role>, ServiceError> {
        let roles = sqlx::query_as::<_, Role>(
            "SELECT r.* FROM roles r
             JOIN user_roles ur ON r.id = ur.role_id
             WHERE ur.user_id = ?",
        )
        .bind(user_id)
        .fetch_all(&*self.db)
        .await?;

        Ok(roles)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::permission_cache::InMemoryPermissionCache;
    use sqlx::SqlitePool;

    async fn setup_test_db() -> SqlitePool {
        let pool = SqlitePool::connect(":memory:")
            .await
            .expect("Failed to create in-memory database");

        // 创建测试表结构
        sqlx::query(
            r#"
            CREATE TABLE roles (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                display_name TEXT NOT NULL,
                description TEXT,
                is_system_role BOOLEAN DEFAULT 0,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create roles table");

        sqlx::query(
            r#"
            CREATE TABLE permissions (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                display_name TEXT NOT NULL,
                description TEXT,
                resource TEXT NOT NULL,
                action TEXT NOT NULL,
                type TEXT NOT NULL,
                is_system_perm BOOLEAN DEFAULT 0,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create permissions table");

        sqlx::query(
            r#"
            CREATE TABLE role_permissions (
                role_id TEXT NOT NULL,
                permission_id TEXT NOT NULL,
                conditions TEXT,
                assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (role_id, permission_id),
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
                FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create role_permissions table");

        sqlx::query(
            r#"
            CREATE TABLE user_roles (
                user_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                context TEXT,
                expires_at DATETIME,
                assigned_by TEXT,
                assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, role_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create user_roles table");

        sqlx::query(
            r#"
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create users table");

        pool
    }

    #[tokio::test]
    async fn test_create_role() {
        let db = Arc::new(setup_test_db().await);
        let permission_cache = Arc::new(InMemoryPermissionCache::new());
        let service = RoleServiceImpl::new(db, permission_cache);

        let role = service
            .create_role("admin".to_string(), Some("Administrator role".to_string()))
            .await
            .unwrap();

        assert_eq!(role.name, "admin");
        assert_eq!(role.description, Some("Administrator role".to_string()));
    }

    #[tokio::test]
    async fn test_create_duplicate_role() {
        let db = Arc::new(setup_test_db().await);
        let permission_cache = Arc::new(InMemoryPermissionCache::new());
        let service = RoleServiceImpl::new(db, permission_cache);

        service
            .create_role("admin".to_string(), Some("Administrator role".to_string()))
            .await
            .unwrap();

        let result = service
            .create_role("admin".to_string(), Some("Another description".to_string()))
            .await;

        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), ServiceError::Conflict(_)));
    }

    #[tokio::test]
    async fn test_assign_permissions_to_role() {
        let db = Arc::new(setup_test_db().await);
        let permission_cache = Arc::new(InMemoryPermissionCache::new());
        let service = RoleServiceImpl::new(db.clone(), permission_cache);

        // 创建角色和权限
        let role = service
            .create_role("admin".to_string(), None)
            .await
            .unwrap();

        // 创建权限
        let perm1_id = Uuid::new_v4().to_string();
        let perm2_id = Uuid::new_v4().to_string();

        sqlx::query(
            "INSERT INTO permissions (id, name, display_name, resource, action, type) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&perm1_id)
        .bind("user:read")
        .bind("user:read") // display_name
        .bind("user")      // resource
        .bind("read")      // action
        .bind("API")       // Use string literal instead of enum
        .execute(&*db)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO permissions (id, name, display_name, resource, action, type) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&perm2_id)
        .bind("user:write")
        .bind("user:write") // display_name
        .bind("user")       // resource
        .bind("write")      // action
        .bind("API")        // Use string literal instead of enum
        .execute(&*db)
        .await
        .unwrap();

        // 分配权限
        service
            .assign_permissions_to_role(&role.id, vec![perm1_id, perm2_id])
            .await
            .unwrap();

        // 验证权限
        let permissions = service.get_role_permissions(&role.id).await.unwrap();
        assert_eq!(permissions.len(), 2);
        assert!(permissions.contains(&"user:read".to_string()));
        assert!(permissions.contains(&"user:write".to_string()));
    }

    #[tokio::test]
    async fn test_assign_role_to_user() {
        let db = Arc::new(setup_test_db().await);
        let permission_cache = Arc::new(InMemoryPermissionCache::new());
        let service = RoleServiceImpl::new(db.clone(), permission_cache);

        // 创建角色和用户
        let role = service
            .create_role("admin".to_string(), None)
            .await
            .unwrap();

        let user_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
        )
        .bind(&user_id)
        .bind("testuser")
        .bind("hash")
        .execute(&*db)
        .await
        .unwrap();

        // 分配角色
        service
            .assign_role_to_user(&user_id, &role.id)
            .await
            .unwrap();

        // 验证用户角色
        let user_roles = service.get_user_roles(&user_id).await.unwrap();
        assert_eq!(user_roles.len(), 1);
        assert_eq!(user_roles[0].name, "admin");
    }
}
