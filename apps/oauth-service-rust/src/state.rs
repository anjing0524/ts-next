use crate::config::Config;
use crate::error::AppError;
use crate::services::{
    auth_code_service::{AuthCodeService, AuthCodeServiceImpl},
    client_service::{ClientService, ClientServiceImpl},
    permission_service::{PermissionService, PermissionServiceImpl},
    rbac_service::{RBACService, RBACServiceImpl},
    role_service::{RoleService, RoleServiceImpl},
    token_service::{TokenService, TokenServiceImpl},
    user_service::{UserService, UserServiceImpl},
};
use sqlx::sqlite::SqlitePoolOptions;
use std::sync::Arc;

/// The application state, containing all shared services and resources.
pub struct AppState {
    pub user_service: Arc<dyn UserService>,
    pub client_service: Arc<dyn ClientService>,
    pub token_service: Arc<dyn TokenService>,
    pub auth_code_service: Arc<dyn AuthCodeService>,
    pub rbac_service: Arc<dyn RBACService>,
    pub permission_service: Arc<dyn PermissionService>,
    pub role_service: Arc<dyn RoleService>,
}

impl AppState {
    /// Creates a new instance of the application state.
    pub async fn new(config: Config) -> Result<Self, AppError> {
        // Create a connection pool for the database
        let pool = SqlitePoolOptions::new()
            .max_connections(10)
            .connect(&config.database_url)
            .await?;
        let db_pool = Arc::new(pool);
        let config = Arc::new(config);

        // Initialize services
        let user_service = Arc::new(UserServiceImpl::new(db_pool.clone()));
        let client_service = Arc::new(ClientServiceImpl::new(db_pool.clone()));
        let rbac_service = Arc::new(RBACServiceImpl::new(db_pool.clone()));
        let permission_service = Arc::new(PermissionServiceImpl::new(db_pool.clone()));
        let role_service = Arc::new(RoleServiceImpl::new(db_pool.clone()));
        let token_service = Arc::new(TokenServiceImpl::new(
            db_pool.clone(),
            client_service.clone(),
            rbac_service.clone(),
            user_service.clone(),
            config.clone(),
        ));
        let auth_code_service = Arc::new(AuthCodeServiceImpl::new(
            db_pool.clone(),
            client_service.clone(),
        ));

        Ok(Self {
            user_service,
            client_service,
            token_service,
            auth_code_service,
            rbac_service,
            permission_service,
            role_service,
        })
    }

    /// Creates a new instance of the application state with a provided pool and config.
    pub async fn new_with_pool_and_config(
        pool: Arc<sqlx::SqlitePool>,
        config: Arc<Config>,
    ) -> Result<Self, AppError> {
        // Initialize services
        let user_service = Arc::new(UserServiceImpl::new(pool.clone()));
        let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
        let rbac_service = Arc::new(RBACServiceImpl::new(pool.clone()));
        let permission_service = Arc::new(PermissionServiceImpl::new(pool.clone()));
        let role_service = Arc::new(RoleServiceImpl::new(pool.clone()));
        let token_service = Arc::new(TokenServiceImpl::new(
            pool.clone(),
            client_service.clone(),
            rbac_service.clone(),
            user_service.clone(),
            config.clone(),
        ));
        let auth_code_service = Arc::new(AuthCodeServiceImpl::new(
            pool.clone(),
            client_service.clone(),
        ));

        Ok(Self {
            user_service,
            client_service,
            token_service,
            auth_code_service,
            rbac_service,
            permission_service,
            role_service,
        })
    }
}
