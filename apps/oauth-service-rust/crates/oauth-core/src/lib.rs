//! OAuth Core Library
//!
//! This library provides the core OAuth functionality including NAPI bindings for Node.js integration.

pub mod napi;

use napi::http_client::HttpClient;

// SDK 配置 (SDK Configuration)
#[derive(Debug, Clone)]
pub struct SDKConfig {
    pub base_url: String,
    pub timeout: Option<u64>,
    pub retry_count: Option<u32>,
    pub retry_delay: Option<u64>,
    pub debug: Option<bool>,
}

// SDK 错误类型 (SDK Error Types)
#[derive(Debug, Clone)]
pub enum SDKError {
    ConfigError(String),
    RequestError(String),
    ParseError(String),
    Unknown(String),
}

pub type SDKResult<T> = Result<T, SDKError>;

/// OAuth SDK 主类 (Main Class)
/// 整合所有功能模块，提供统一的 SDK 入口 (Integrates all functional modules, provides unified SDK entry point)
pub struct OAuthSDK {
    http_client: HttpClient,
    pub auth: napi::modules::AuthModule,
    pub token: napi::modules::TokenModule,
    pub user: napi::modules::UserModule,
    pub rbac: napi::modules::RbacModule,
    pub client: napi::modules::ClientModule,
    pub audit: napi::modules::AuditModule,
}

impl OAuthSDK {
    /// 创建新的 OAuth SDK 实例 (Create New Instance)
    ///
    /// # Arguments
    /// * `config` - SDK 配置 (SDK Configuration)
    ///
    /// # Returns
    /// * `SDKResult<Self>` - SDK 实例或错误 (SDK Instance or Error)
    pub fn new(config: SDKConfig) -> SDKResult<Self> {
        let http_client = HttpClient::new(config)?;

        Ok(Self {
            auth: napi::modules::AuthModule::new(http_client.clone()),
            token: napi::modules::TokenModule::new(http_client.clone()),
            user: napi::modules::UserModule::new(http_client.clone()),
            rbac: napi::modules::RbacModule::new(http_client.clone()),
            client: napi::modules::ClientModule::new(http_client.clone()),
            audit: napi::modules::AuditModule::new(http_client.clone()),
            http_client,
        })
    }
}

// Re-export types
pub use napi::modules;
