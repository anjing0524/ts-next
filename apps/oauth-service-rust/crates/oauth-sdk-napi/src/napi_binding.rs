use napi::bindgen_prelude::*;
use napi_derive::napi;
use oauth_core::{OAuthSDK, SDKConfig};
use oauth_core::napi::modules::{client::ClientInfoPublic, rbac::PaginatedResponse, user::UserInfo};

/// N-API SDK 配置 (N-API SDK Configuration)
#[napi(object)]
pub struct NapiSDKConfig {
    pub base_url: String,
    pub timeout: Option<i64>,
    pub retry_count: Option<i32>,
    pub retry_delay: Option<i64>,
    pub debug: Option<bool>,
}

impl From<NapiSDKConfig> for SDKConfig {
    fn from(config: NapiSDKConfig) -> Self {
        SDKConfig {
            base_url: config.base_url,
            timeout: config.timeout.map(|v| v as u64),
            retry_count: config.retry_count.map(|v| v as u32),
            retry_delay: config.retry_delay.map(|v| v as u64),
            debug: config.debug,
        }
    }
}

/// 创建 OAuth SDK 实例 (Create OAuth SDK Instance)
///
/// # Arguments
/// * `config` - SDK 配置 (SDK Configuration)
///
/// # Returns
/// * `Result<NapiOAuthSDK>` - SDK 实例或错误 (SDK Instance or Error)
#[napi]
pub fn create_sdk(config: NapiSDKConfig) -> Result<NapiOAuthSDK> {
    let sdk_config: SDKConfig = config.into();
    let sdk = OAuthSDK::new(sdk_config)
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

    Ok(NapiOAuthSDK { sdk })
}

/// N-API OAuth SDK 封装类 (N-API OAuth SDK Wrapper)
#[napi]
pub struct NapiOAuthSDK {
    sdk: OAuthSDK,
}

#[napi]
impl NapiOAuthSDK {
    /// 用户登录 (User Login)
    ///
    /// # Arguments
    /// * `username` - 用户名 (Username)
    /// * `password` - 密码 (Password)
    ///
    /// # Returns
    /// * `Result<serde_json::Value>` - 登录响应数据 (Login Response Data)
    #[napi]
    pub async fn auth_login(
        &self,
        username: String,
        password: String,
    ) -> Result<serde_json::Value> {
        let result = self
            .sdk
            .auth
            .login(oauth_core::napi::modules::auth::LoginRequest { username, password })
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        Ok(serde_json::to_value(result)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?)
    }

    /// 用户登出 (User Logout)
    ///
    /// # Returns
    /// * `Result<bool>` - 登出是否成功 (Logout Success)
    #[napi]
    pub async fn auth_logout(&self) -> Result<bool> {
        self.sdk
            .auth
            .logout()
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))
    }

    /// 刷新访问令牌 (Refresh Access Token)
    ///
    /// # Arguments
    /// * `refresh_token` - 刷新令牌 (Refresh Token)
    ///
    /// # Returns
    /// * `Result<serde_json::Value>` - 新的令牌对数据 (New Token Pair Data)
    #[napi]
    pub async fn token_refresh(&self, refresh_token: String) -> Result<serde_json::Value> {
        let result = self
            .sdk
            .token
            .refresh(refresh_token)
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        Ok(serde_json::to_value(result)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?)
    }

    /// 获取用户信息 (Get User Info)
    ///
    /// # Returns
    /// * `Result<UserInfo>` - 用户信息数据 (User Info Data)
    #[napi]
    pub async fn user_get_info(&self) -> Result<UserInfo> {
        let result = self
            .sdk
            .user
            .get_info()
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        Ok(result)
    }

    /// 验证令牌 (Introspect Token)
    ///
    /// # Arguments
    /// * `token` - 要验证的令牌 (Token to Introspect)
    ///
    /// # Returns
    /// * `Result<serde_json::Value>` - 令牌信息 (Token Info)
    #[napi]
    pub async fn token_introspect(&self, token: String) -> Result<serde_json::Value> {
        let result = self
            .sdk
            .token
            .introspect(token)
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        Ok(serde_json::to_value(result)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?)
    }

    /// 撤销令牌 (Revoke Token)
    ///
    /// # Arguments
    /// * `token` - 要撤销的令牌 (Token to Revoke)
    ///
    /// # Returns
    /// * `Result<bool>` - 撤销是否成功 (Revocation Success)
    #[napi]
    pub async fn token_revoke(&self, token: String) -> Result<bool> {
        self.sdk
            .token
            .revoke(token)
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))
    }

    /// 更新用户信息 (Update User Profile)
    ///
    /// # Arguments
    /// * `data` - 用户数据 (User Profile Data)
    ///
    /// # Returns
    /// * `Result<UserInfo>` - 更新后的用户信息 (Updated User Info)
    #[napi]
    pub async fn user_update_profile(&self, data: serde_json::Value) -> Result<UserInfo> {
        let profile: oauth_core::napi::modules::user::UpdateProfileRequest =
            serde_json::from_value(data)
                .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        let result = self
            .sdk
            .user
            .update_profile(profile)
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        Ok(result)
    }

    /// 获取权限列表 (Get Permissions List)
    ///
    /// # Arguments
    /// * `page` - 页码 (Page Number)
    /// * `page_size` - 每页大小 (Page Size)
    ///
    /// # Returns
    /// * `Result<serde_json::Value>` - 权限列表数据 (Permissions List Data)
    #[napi]
    pub async fn rbac_get_permissions(
        &self,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> Result<serde_json::Value> {
        let result = self
            .sdk
            .rbac
            .get_permissions(page, page_size)
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        Ok(serde_json::to_value(result)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?)
    }

    /// 获取角色列表 (Get Roles List)
    ///
    /// # Arguments
    /// * `page` - 页码 (Page Number)
    /// * `page_size` - 每页大小 (Page Size)
    ///
    /// # Returns
    /// * `Result<serde_json::Value>` - 角色列表数据 (Roles List Data)
    #[napi]
    pub async fn rbac_get_roles(
        &self,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> Result<serde_json::Value> {
        let result = self
            .sdk
            .rbac
            .get_roles(page, page_size)
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        Ok(serde_json::to_value(result)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?)
    }

    /// 为用户分配角色 (Assign Role to User)
    ///
    /// # Arguments
    /// * `user_id` - 用户ID (User ID)
    /// * `role_id` - 角色ID (Role ID)
    ///
    /// # Returns
    /// * `Result<serde_json::Value>` - 分配结果数据 (Assignment Result Data)
    #[napi]
    pub async fn rbac_assign_role(
        &self,
        user_id: String,
        role_id: String,
    ) -> Result<serde_json::Value> {
        let result = self
            .sdk
            .rbac
            .assign_role_to_user(user_id, role_id)
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        Ok(serde_json::to_value(result)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?)
    }

    /// 撤销用户角色 (Revoke Role from User)
    ///
    /// # Arguments
    /// * `user_id` - 用户ID (User ID)
    /// * `role_id` - 角色ID (Role ID)
    ///
    /// # Returns
    /// * `Result<bool>` - 撤销是否成功 (Revocation Success)
    #[napi]
    pub async fn rbac_revoke_role(&self, user_id: String, role_id: String) -> Result<bool> {
        self.sdk
            .rbac
            .revoke_role_from_user(user_id, role_id)
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))
    }

    /// 获取客户端列表 (Get Client List)
    ///
    /// # Arguments
    /// * `page` - 页码 (Page Number)
    /// * `page_size` - 每页大小 (Page Size)
    ///
    /// # Returns
    /// * `Result<serde_json::Value>` - 客户端列表数据 (Client List Data)
    #[napi]
    pub async fn client_list(
        &self,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> Result<serde_json::Value> {
        let result = self
            .sdk
            .client
            .list_clients(page, page_size)
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        // Convert ClientInfo to ClientInfoPublic (remove client_secret)
        let public_clients = result
            .items
            .into_iter()
            .map(|client| ClientInfoPublic {
                client_id: client.client_id,
                client_name: client.client_name,
                redirect_uris: client.redirect_uris,
                grant_types: client.grant_types,
                created_at: client.created_at,
                updated_at: client.updated_at,
            })
            .collect();

        let paginated = PaginatedResponse {
            items: public_clients,
            total: result.total,
            page: result.page,
            page_size: result.page_size,
            has_more: result.has_more,
        };

        Ok(serde_json::to_value(paginated)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?)
    }

    /// 获取客户端详情 (Get Client Details)
    ///
    /// # Arguments
    /// * `client_id` - 客户端ID (Client ID)
    ///
    /// # Returns
    /// * `Result<ClientInfoPublic>` - 客户端详情数据 (Client Details Data)
    #[napi]
    pub async fn client_get(&self, client_id: String) -> Result<ClientInfoPublic> {
        let result = self
            .sdk
            .client
            .get_client(client_id)
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        // Convert ClientInfo to ClientInfoPublic (remove client_secret)
        Ok(ClientInfoPublic {
            client_id: result.client_id,
            client_name: result.client_name,
            redirect_uris: result.redirect_uris,
            grant_types: result.grant_types,
            created_at: result.created_at,
            updated_at: result.updated_at,
        })
    }

    /// 获取审计日志 (Get Audit Logs)
    ///
    /// # Arguments
    /// * `page` - 页码 (Page Number)
    /// * `page_size` - 每页大小 (Page Size)
    ///
    /// # Returns
    /// * `Result<serde_json::Value>` - 审计日志数据 (Audit Logs Data)
    #[napi]
    pub async fn audit_get_logs(
        &self,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> Result<serde_json::Value> {
        let result = self
            .sdk
            .audit
            .get_logs(None, page, page_size)
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        Ok(serde_json::to_value(result)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?)
    }

    /// 获取用户审计日志 (Get User Audit Logs)
    ///
    /// # Arguments
    /// * `user_id` - 用户ID (User ID)
    /// * `page` - 页码 (Page Number)
    /// * `page_size` - 每页大小 (Page Size)
    ///
    /// # Returns
    /// * `Result<serde_json::Value>` - 审计日志数据 (Audit Logs Data)
    #[napi]
    pub async fn audit_get_user_logs(
        &self,
        user_id: String,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> Result<serde_json::Value> {
        let result = self
            .sdk
            .audit
            .get_user_logs(user_id, page, page_size)
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        Ok(serde_json::to_value(result)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?)
    }
}
