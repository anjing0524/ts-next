use crate::napi::config::SDKConfig;
use crate::napi::http_client::HttpClient;
use crate::napi::error::SDKResult;
use crate::napi::modules::*;

/// OAuth SDK 主类 (Main Class)
/// 整合所有功能模块，提供统一的 SDK 入口
pub struct OAuthSDK {
    http_client: HttpClient,
    pub auth: auth::AuthModule,
    pub token: token::TokenModule,
    pub user: user::UserModule,
    pub rbac: rbac::RbacModule,
    pub client: client::ClientModule,
    pub audit: audit::AuditModule,
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
            auth: auth::AuthModule::new(http_client.clone()),
            token: token::TokenModule::new(http_client.clone()),
            user: user::UserModule::new(http_client.clone()),
            rbac: rbac::RbacModule::new(http_client.clone()),
            client: client::ClientModule::new(http_client.clone()),
            audit: audit::AuditModule::new(http_client.clone()),
            http_client,
        })
    }
}
