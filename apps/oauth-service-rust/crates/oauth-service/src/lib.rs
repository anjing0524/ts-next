// 库模块声明
pub mod app;
pub mod cache;
pub mod config;
pub mod db;
pub mod error;
pub mod middleware;
pub mod napi;
pub mod napi_binding;
pub mod routes;
pub mod services;
pub mod state;
pub mod templates;
pub mod utils;

// Re-export models from oauth-models crate
pub use oauth_models as models;
pub use oauth_models::{
    AuthCode, ClientType, OAuthClient, OAuthClientDetails, Permission, PermissionType,
    RefreshToken, Role, User,
};

// 重新导出常用类型
pub use app::create_app;
pub use config::Config;
pub use db::initialize_database;
pub use error::{AppError, ServiceError};
pub use state::AppState;

// 导出 napi SDK 的公共 API
pub use napi::{OAuthSDK, SDKConfig, SDKError, SDKResult};
