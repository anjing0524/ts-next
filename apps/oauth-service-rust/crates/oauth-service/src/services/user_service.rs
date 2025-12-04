use crate::error::ServiceError;
use crate::models::user::User;
use crate::utils::crypto;
use async_trait::async_trait;
use chrono::Utc;
use sqlx::SqlitePool;
use std::sync::Arc;
use uuid::Uuid;

#[async_trait]
pub trait UserService: Send + Sync {
    async fn find_by_username(&self, username: &str) -> Result<Option<User>, ServiceError>;
    async fn find_by_id(&self, id: &str) -> Result<Option<User>, ServiceError>;
    async fn create_user(
        &self,
        username: String,
        password: String,
        display_name: Option<String>,
    ) -> Result<User, ServiceError>;
    async fn authenticate(&self, username: &str, password: &str) -> Result<User, ServiceError>;
    async fn update_last_login(&self, user_id: &str) -> Result<(), ServiceError>;
    async fn list_users(
        &self,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<Vec<User>, ServiceError>;
    async fn update_user(
        &self,
        user_id: &str,
        display_name: Option<String>,
        is_active: Option<bool>,
    ) -> Result<User, ServiceError>;
    async fn delete_user(&self, user_id: &str) -> Result<(), ServiceError>;
}

pub struct UserServiceImpl {
    db: Arc<SqlitePool>,
}

impl UserServiceImpl {
    pub fn new(db: Arc<SqlitePool>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl UserService for UserServiceImpl {
    async fn find_by_username(&self, username: &str) -> Result<Option<User>, ServiceError> {
        let user = sqlx::query_as::<_, User>(
            "SELECT id, username, password_hash, is_active, created_at, updated_at, last_login_at, \
             display_name, first_name, last_name, avatar, organization, department, \
             must_change_password, failed_login_attempts, locked_until, created_by \
             FROM users WHERE username = ?"
        )
            .bind(username)
            .fetch_optional(&*self.db)
            .await?;
        Ok(user)
    }

    async fn find_by_id(&self, id: &str) -> Result<Option<User>, ServiceError> {
        let user = sqlx::query_as::<_, User>(
            "SELECT id, username, password_hash, is_active, created_at, updated_at, last_login_at, \
             display_name, first_name, last_name, avatar, organization, department, \
             must_change_password, failed_login_attempts, locked_until, created_by \
             FROM users WHERE id = ?"
        )
            .bind(id)
            .fetch_optional(&*self.db)
            .await?;
        Ok(user)
    }

    async fn create_user(
        &self,
        username: String,
        password: String,
        display_name: Option<String>,
    ) -> Result<User, ServiceError> {
        // 检查用户名是否已存在
        if self.find_by_username(&username).await?.is_some() {
            return Err(ServiceError::ValidationError(
                "Username already exists".to_string(),
            ));
        }

        // 哈希密码
        let password_hash = crypto::hash_password(&password)?;

        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        // 插入用户
        sqlx::query(
            r#"
            INSERT INTO users (
                id, username, password_hash, is_active,
                created_at, updated_at, display_name,
                must_change_password, failed_login_attempts
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&username)
        .bind(&password_hash)
        .bind(true)
        .bind(now)
        .bind(now)
        .bind(display_name)
        .bind(false)
        .bind(0)
        .execute(&*self.db)
        .await?;

        // 返回创建的用户
        self.find_by_id(&id)
            .await?
            .ok_or_else(|| ServiceError::Internal("Failed to retrieve created user".to_string()))
    }

    async fn authenticate(&self, username: &str, password: &str) -> Result<User, ServiceError> {
        let user = self.find_by_username(username).await?.ok_or_else(|| {
            ServiceError::Unauthorized("Invalid username or password".to_string())
        })?;

        if !user.is_active {
            return Err(ServiceError::Unauthorized(
                "User account is inactive".to_string(),
            ));
        }

        // 检查账户是否被锁定
        if let Some(locked_until) = user.locked_until {
            if locked_until > Utc::now() {
                return Err(ServiceError::Unauthorized(format!(
                    "Account is locked until {locked_until}"
                )));
            }
        }

        // 验证密码
        if !crypto::verify_password(password, &user.password_hash)? {
            // 增加失败登录次数
            let new_attempts = user.failed_login_attempts + 1;
            let locked_until = if new_attempts >= 5 {
                // 锁定账户 30 分钟
                Some(Utc::now() + chrono::Duration::minutes(30))
            } else {
                None
            };

            sqlx::query(
                "UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?",
            )
            .bind(new_attempts)
            .bind(locked_until)
            .bind(&user.id)
            .execute(&*self.db)
            .await?;

            return Err(ServiceError::Unauthorized(
                "Invalid username or password".to_string(),
            ));
        }

        // 认证成功，重置失败次数
        if user.failed_login_attempts > 0 {
            sqlx::query(
                "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
            )
            .bind(&user.id)
            .execute(&*self.db)
            .await?;
        }

        Ok(user)
    }

    async fn update_last_login(&self, user_id: &str) -> Result<(), ServiceError> {
        let now = Utc::now();
        sqlx::query("UPDATE users SET last_login_at = ? WHERE id = ?")
            .bind(now)
            .bind(user_id)
            .execute(&*self.db)
            .await?;
        Ok(())
    }

    async fn list_users(
        &self,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<Vec<User>, ServiceError> {
        let limit = limit.unwrap_or(50).min(100);
        let offset = offset.unwrap_or(0);

        let users = sqlx::query_as::<_, User>(
            "SELECT id, username, password_hash, is_active, created_at, updated_at, last_login_at, \
             display_name, first_name, last_name, avatar, organization, department, \
             must_change_password, failed_login_attempts, locked_until, created_by \
             FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&*self.db)
        .await?;

        Ok(users)
    }

    async fn update_user(
        &self,
        user_id: &str,
        display_name: Option<String>,
        is_active: Option<bool>,
    ) -> Result<User, ServiceError> {
        // 检查用户是否存在
        let existing_user = self
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("User '{user_id}' not found")))?;

        // 准备更新的字段
        let new_display_name = display_name.or(existing_user.display_name);
        let new_is_active = is_active.unwrap_or(existing_user.is_active);
        let now = Utc::now();

        // 执行更新
        sqlx::query(
            "UPDATE users SET display_name = ?, is_active = ?, updated_at = ? WHERE id = ?",
        )
        .bind(&new_display_name)
        .bind(new_is_active)
        .bind(now)
        .bind(user_id)
        .execute(&*self.db)
        .await?;

        // 重新查询更新后的用户
        let updated_user = self
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| ServiceError::Internal("Failed to retrieve updated user".to_string()))?;

        Ok(updated_user)
    }

    async fn delete_user(&self, user_id: &str) -> Result<(), ServiceError> {
        // 检查用户是否存在
        let _ = self
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("User '{user_id}' not found")))?;

        // 软删除：将用户标记为不活跃
        let now = Utc::now();
        sqlx::query("UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?")
            .bind(now)
            .bind(user_id)
            .execute(&*self.db)
            .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn setup_test_db() -> SqlitePool {
        let pool = SqlitePool::connect(":memory:")
            .await
            .expect("Failed to create in-memory database");

        // 创建测试表结构
        sqlx::query(
            r#"
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login_at DATETIME,
                display_name TEXT,
                first_name TEXT,
                last_name TEXT,
                avatar TEXT,
                organization TEXT,
                department TEXT,
                must_change_password BOOLEAN DEFAULT 1,
                failed_login_attempts INTEGER DEFAULT 0,
                locked_until DATETIME,
                created_by TEXT
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create test table");

        pool
    }

    #[tokio::test]
    async fn test_create_user() {
        let db = Arc::new(setup_test_db().await);
        let service = UserServiceImpl::new(db);

        let result = service
            .create_user(
                "testuser".to_string(),
                "password123".to_string(),
                Some("Test User".to_string()),
            )
            .await;

        assert!(result.is_ok());
        let user = result.unwrap();
        assert_eq!(user.username, "testuser");
        assert_eq!(user.display_name, Some("Test User".to_string()));
        assert!(user.is_active);
        assert_eq!(user.failed_login_attempts, 0);
        assert!(!user.must_change_password);
    }

    #[tokio::test]
    async fn test_create_duplicate_user() {
        let db = Arc::new(setup_test_db().await);
        let service = UserServiceImpl::new(db);

        // 创建第一个用户
        service
            .create_user("testuser".to_string(), "password123".to_string(), None)
            .await
            .unwrap();

        // 尝试创建重复用户
        let result = service
            .create_user("testuser".to_string(), "password456".to_string(), None)
            .await;

        assert!(result.is_err());
        match result.unwrap_err() {
            ServiceError::ValidationError(msg) => {
                assert!(msg.contains("already exists"));
            }
            _ => panic!("Expected ValidationError"),
        }
    }

    #[tokio::test]
    async fn test_find_by_username() {
        let db = Arc::new(setup_test_db().await);
        let service = UserServiceImpl::new(db);

        // 创建用户
        service
            .create_user("findme".to_string(), "password123".to_string(), None)
            .await
            .unwrap();

        // 查找存在的用户
        let found = service.find_by_username("findme").await.unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().username, "findme");

        // 查找不存在的用户
        let not_found = service.find_by_username("nonexistent").await.unwrap();
        assert!(not_found.is_none());
    }

    #[tokio::test]
    async fn test_find_by_id() {
        let db = Arc::new(setup_test_db().await);
        let service = UserServiceImpl::new(db);

        let user = service
            .create_user("testuser".to_string(), "password123".to_string(), None)
            .await
            .unwrap();

        // 通过 ID 查找
        let found = service.find_by_id(&user.id).await.unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().id, user.id);

        // 查找不存在的 ID
        let not_found = service.find_by_id("nonexistent-id").await.unwrap();
        assert!(not_found.is_none());
    }

    #[tokio::test]
    async fn test_authenticate_success() {
        let db = Arc::new(setup_test_db().await);
        let service = UserServiceImpl::new(db);

        let password = "correct_password";
        service
            .create_user("authuser".to_string(), password.to_string(), None)
            .await
            .unwrap();

        // 使用正确的密码认证
        let result = service.authenticate("authuser", password).await;
        assert!(result.is_ok());
        let user = result.unwrap();
        assert_eq!(user.username, "authuser");
        assert_eq!(user.failed_login_attempts, 0);
    }

    #[tokio::test]
    async fn test_authenticate_wrong_password() {
        let db = Arc::new(setup_test_db().await);
        let service = UserServiceImpl::new(db);

        service
            .create_user("authuser".to_string(), "correct_password".to_string(), None)
            .await
            .unwrap();

        // 使用错误的密码
        let result = service.authenticate("authuser", "wrong_password").await;
        assert!(result.is_err());
        match result.unwrap_err() {
            ServiceError::Unauthorized(msg) => {
                assert!(msg.contains("Invalid username or password"));
            }
            _ => panic!("Expected Unauthorized error"),
        }

        // 验证失败次数增加
        let user = service.find_by_username("authuser").await.unwrap().unwrap();
        assert_eq!(user.failed_login_attempts, 1);
    }

    #[tokio::test]
    async fn test_authenticate_nonexistent_user() {
        let db = Arc::new(setup_test_db().await);
        let service = UserServiceImpl::new(db);

        let result = service.authenticate("nonexistent", "password").await;
        assert!(result.is_err());
        match result.unwrap_err() {
            ServiceError::Unauthorized(_) => {}
            _ => panic!("Expected Unauthorized error"),
        }
    }

    #[tokio::test]
    async fn test_authenticate_inactive_user() {
        let db = Arc::new(setup_test_db().await);
        let service = UserServiceImpl::new(db.clone());

        let user = service
            .create_user("inactiveuser".to_string(), "password123".to_string(), None)
            .await
            .unwrap();

        // 将用户设置为非活跃
        sqlx::query("UPDATE users SET is_active = 0 WHERE id = ?")
            .bind(&user.id)
            .execute(&*db)
            .await
            .unwrap();

        // 尝试认证
        let result = service.authenticate("inactiveuser", "password123").await;
        assert!(result.is_err());
        match result.unwrap_err() {
            ServiceError::Unauthorized(msg) => {
                assert!(msg.contains("inactive"));
            }
            _ => panic!("Expected Unauthorized error"),
        }
    }

    #[tokio::test]
    async fn test_account_lockout() {
        let db = Arc::new(setup_test_db().await);
        let service = UserServiceImpl::new(db);

        service
            .create_user("locktest".to_string(), "correct_password".to_string(), None)
            .await
            .unwrap();

        // 进行 5 次失败的登录尝试
        for _ in 0..5 {
            let _ = service.authenticate("locktest", "wrong_password").await;
        }

        // 验证账户被锁定
        let user = service.find_by_username("locktest").await.unwrap().unwrap();
        assert!(user.locked_until.is_some());
        assert_eq!(user.failed_login_attempts, 5);

        // 即使使用正确密码也应该失败
        let result = service.authenticate("locktest", "correct_password").await;
        assert!(result.is_err());
        match result.unwrap_err() {
            ServiceError::Unauthorized(msg) => {
                assert!(msg.contains("locked"));
            }
            _ => panic!("Expected Unauthorized error"),
        }
    }

    #[tokio::test]
    async fn test_failed_login_reset_on_success() {
        let db = Arc::new(setup_test_db().await);
        let service = UserServiceImpl::new(db);

        let password = "correct_password";
        service
            .create_user("resettest".to_string(), password.to_string(), None)
            .await
            .unwrap();

        // 几次失败的尝试
        for _ in 0..3 {
            let _ = service.authenticate("resettest", "wrong_password").await;
        }

        // 验证失败次数
        let user = service
            .find_by_username("resettest")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(user.failed_login_attempts, 3);

        // 成功登录
        service.authenticate("resettest", password).await.unwrap();

        // 验证失败次数被重置
        let user = service
            .find_by_username("resettest")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(user.failed_login_attempts, 0);
        assert!(user.locked_until.is_none());
    }

    #[tokio::test]
    async fn test_update_last_login() {
        let db = Arc::new(setup_test_db().await);
        let service = UserServiceImpl::new(db);

        let user = service
            .create_user("logintest".to_string(), "password123".to_string(), None)
            .await
            .unwrap();

        // 初始时 last_login_at 应该为 None
        assert!(user.last_login_at.is_none());

        // 更新最后登录时间
        service.update_last_login(&user.id).await.unwrap();

        // 验证更新
        let updated_user = service.find_by_id(&user.id).await.unwrap().unwrap();
        assert!(updated_user.last_login_at.is_some());
    }
}
