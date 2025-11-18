use axum::{
    http::Method,
    routing::{get, post},
    Router,
};
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{config::Config, middleware, routes, state::AppState};

pub async fn create_app(pool: Arc<sqlx::SqlitePool>, config: Arc<Config>) -> Router {
    let app_state = Arc::new(
        AppState::new_with_pool_and_config(pool, config.clone())
            .await
            .expect("Failed to create AppState"),
    );

    // 定义API路由
    // 将层应用与路由定义分开，以提高可读性
    let api_router = Router::new()
        // 健康检查端点 (公开)
        .route("/health", get(|| async { "OK" }))
        // OAuth 核心端点
        .route("/api/v2/oauth/token", post(routes::oauth::token_endpoint))
        .route(
            "/api/v2/oauth/authorize",
            get(routes::oauth::authorize_endpoint),
        )
        .route(
            "/api/v2/oauth/userinfo",
            get(routes::oauth::userinfo_endpoint),
        )
        .route(
            "/api/v2/oauth/introspect",
            post(routes::oauth::introspect_endpoint),
        )
        .route("/api/v2/oauth/revoke", post(routes::oauth::revoke_endpoint))
        // 认证端点 (公开)
        .route("/api/v2/auth/login", post(routes::oauth::login_endpoint))
        .route("/api/v2/auth/authenticate", post(routes::oauth::authenticate_endpoint))
        // 客户端管理端点
        .route(
            "/api/v2/admin/clients",
            get(routes::clients::list_clients).post(routes::clients::create_client),
        )
        .route(
            "/api/v2/admin/clients/:client_id",
            get(routes::clients::get_client)
                .put(routes::clients::update_client)
                .delete(routes::clients::delete_client),
        )
        // 用户管理端点
        .route(
            "/api/v2/admin/users",
            get(routes::users::list_users).post(routes::users::create_user),
        )
        .route(
            "/api/v2/admin/users/:user_id",
            get(routes::users::get_user)
                .put(routes::users::update_user)
                .delete(routes::users::delete_user),
        )
        // 权限管理端点
        .route(
            "/api/v2/admin/permissions",
            get(routes::permissions::list_permissions).post(routes::permissions::create_permission),
        )
        .route(
            "/api/v2/admin/permissions/:permission_id",
            get(routes::permissions::get_permission)
                .put(routes::permissions::update_permission)
                .delete(routes::permissions::delete_permission),
        )
        // 角色管理端点
        .route(
            "/api/v2/admin/roles",
            get(routes::roles::list_roles).post(routes::roles::create_role),
        )
        .route(
            "/api/v2/admin/roles/:role_id",
            get(routes::roles::get_role)
                .put(routes::roles::update_role)
                .delete(routes::roles::delete_role),
        )
        .route(
            "/api/v2/admin/roles/:role_id/permissions",
            get(routes::roles::get_role_permissions)
                .post(routes::roles::assign_permissions_to_role)
                .delete(routes::roles::remove_permissions_from_role),
        )
        .route(
            "/api/v2/admin/users/:user_id/roles",
            get(routes::roles::get_user_roles)
                .post(routes::roles::assign_role_to_user)
                .delete(routes::roles::remove_role_from_user),
        );

    // 构建应用，应用所有中间件层
    // 采用简化的架构：直接在 Router 上应用层，避免 ServiceBuilder 的复杂类型
    // 注意: 中间件按反向顺序执行，最后添加的layer最先处理请求
    // 因此应按相反顺序添加，以便按所需顺序执行
    

    api_router
        .with_state(app_state.clone())
        // 6. 审计中间件 - 最后执行，最先处理所有请求
        .layer(axum::middleware::from_fn(
            middleware::audit::audit_middleware,
        ))
        // 5. 追踪和日志 - 在审计之后执行
        .layer(TraceLayer::new_for_http())
        // 4. CORS - 处理跨域请求 (SECURITY FIX: Restricted origins)
        .layer(
            CorsLayer::new()
                // Allow specific origins from config (for production)
                // For development, can add localhost
                .allow_origin([
                    "http://localhost:3002".parse().unwrap(),  // Admin Portal
                    "http://localhost:6188".parse().unwrap(),  // Pingora Proxy
                    // Add production domains here
                ])
                .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
                .allow_headers([
                    axum::http::header::AUTHORIZATION,
                    axum::http::header::CONTENT_TYPE,
                    axum::http::header::ACCEPT,
                ])
                .allow_credentials(true)  // Important for cookies and Authorization headers
        )
        // 3. 权限检查中间件 - 在认证之后执行（代码中在前）
        .layer(axum::middleware::from_fn(
            middleware::permission::permission_middleware,
        ))
        // 2. 认证中间件 - 在限流之后执行（代码中在前）
        .layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::auth::auth_middleware,
        ))
        // 1. 限流中间件 - 最先执行（代码中在后），早期检查防止资源浪费
        // SECURITY FIX: Use shared state for effective rate limiting
        .layer(axum::middleware::from_fn_with_state(
            app_state.clone(),
            middleware::rate_limit::rate_limit_middleware,
        ))
}
