use crate::napi::http_client::HttpClient;
use crate::napi::error::SDKResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserInfo {
    pub user_id: String,
    pub username: String,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub email: Option<String>,
}

pub struct UserModule {
    http_client: HttpClient,
}

impl UserModule {
    pub fn new(http_client: HttpClient) -> Self {
        Self { http_client }
    }

    pub async fn get_info(&self) -> SDKResult<UserInfo> {
        let response = self.http_client.get("/api/v2/user/info").await?;
        serde_json::from_value::<UserInfo>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn update_profile(&self, profile: UpdateProfileRequest) -> SDKResult<UserInfo> {
        let body = serde_json::to_value(&profile)?;
        let response = self.http_client.put("/api/v2/user/profile", body).await?;
        serde_json::from_value::<UserInfo>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }
}
