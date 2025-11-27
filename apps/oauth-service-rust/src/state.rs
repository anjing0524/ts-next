use crate::config::Config;
use crate::error::AppError;
use crate::middleware::rate_limit::RateLimiter;
use crate::middleware::login_rate_limit::LoginRateLimiter;
use crate::services::{
    audit_log_service::{AuditLogService, AuditLogServiceImpl},
    auth_code_service::{AuthCodeService, AuthCodeServiceImpl},
    client_service::{ClientService, ClientServiceImpl},
    permission_service::{PermissionService, PermissionServiceImpl},
    rbac_service::{RBACService, RBACServiceImpl},
    role_service::{RoleService, RoleServiceImpl},
    token_service::{TokenService, TokenServiceImpl},
    user_service::{UserService, UserServiceImpl},
};
use crate::cache::permission_cache::{PermissionCache, InMemoryPermissionCache};
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
    pub audit_log_service: Arc<dyn AuditLogService>,
    pub permission_cache: Arc<dyn PermissionCache>,
    pub rate_limiter: Arc<RateLimiter>,
    pub login_rate_limiter: Arc<LoginRateLimiter>,
    pub token_rate_limiter: Arc<RateLimiter>,
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

        // Initialize cache with 1000 user capacity
        let permission_cache = Arc::new(InMemoryPermissionCache::with_capacity(1000));

        // Initialize rate limiter (100 req/min per IP)
        let rate_limiter = Arc::new(RateLimiter::new(100, 60));

        // Initialize login rate limiter (5 attempts / 5 min per IP)
        let login_rate_limiter = Arc::new(LoginRateLimiter::new());

        // Initialize token rate limiter (20 req/min per IP)
        let token_rate_limiter = Arc::new(RateLimiter::new(20, 60));

        // Initialize services
        let user_service = Arc::new(UserServiceImpl::new(db_pool.clone()));
        let client_service = Arc::new(ClientServiceImpl::new(db_pool.clone()));
        let rbac_service = Arc::new(RBACServiceImpl::new(db_pool.clone(), permission_cache.clone()));
        let permission_service = Arc::new(PermissionServiceImpl::new(db_pool.clone()));
        let role_service = Arc::new(RoleServiceImpl::new(db_pool.clone(), permission_cache.clone()));
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
        let audit_log_service = Arc::new(AuditLogServiceImpl::new(db_pool.clone()));

        Ok(Self {
            user_service,
            client_service,
            token_service,
            auth_code_service,
            rbac_service,
            permission_service,
            role_service,
            audit_log_service,
            permission_cache,
            rate_limiter,
            login_rate_limiter,
            token_rate_limiter,
        })
    }

    /// Creates a new instance of the application state with a provided pool and config.
    pub async fn new_with_pool_and_config(
        pool: Arc<sqlx::SqlitePool>,
        config: Arc<Config>,
    ) -> Result<Self, AppError> {
        // Initialize cache with 1000 user capacity
        let permission_cache = Arc::new(InMemoryPermissionCache::with_capacity(1000));

        // Initialize rate limiter (100 req/min per IP)
        let rate_limiter = Arc::new(RateLimiter::new(100, 60));

        // Initialize login rate limiter (5 attempts / 5 min per IP)
        let login_rate_limiter = Arc::new(LoginRateLimiter::new());

        // Initialize token rate limiter (20 req/min per IP)
        let token_rate_limiter = Arc::new(RateLimiter::new(20, 60));

        // Initialize services
        let user_service = Arc::new(UserServiceImpl::new(pool.clone()));
        let client_service = Arc::new(ClientServiceImpl::new(pool.clone()));
        let rbac_service = Arc::new(RBACServiceImpl::new(pool.clone(), permission_cache.clone()));
        let permission_service = Arc::new(PermissionServiceImpl::new(pool.clone()));
        let role_service = Arc::new(RoleServiceImpl::new(pool.clone(), permission_cache.clone()));
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
        let audit_log_service = Arc::new(AuditLogServiceImpl::new(pool.clone()));

        Ok(Self {
            user_service,
            client_service,
            token_service,
            auth_code_service,
            rbac_service,
            permission_service,
            role_service,
            audit_log_service,
            permission_cache,
            rate_limiter,
            login_rate_limiter,
            token_rate_limiter,
        })
    }
}
