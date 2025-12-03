use crate::napi::http_client::HttpClient;
use crate::napi::error::SDKResult;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LoginResponse {
    pub session_token: String,
    pub user_id: String,
    pub username: String,
    pub expires_in: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConsentRequest {
    pub client_id: String,
    pub scopes: Vec<String>,
    pub authorized: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConsentResponse {
    pub authorization_code: String,
    pub expires_in: i32,
}

pub struct AuthModule {
    http_client: HttpClient,
}

impl AuthModule {
    pub fn new(http_client: HttpClient) -> Self {
        Self { http_client }
    }

    pub async fn login(&self, credentials: LoginRequest) -> SDKResult<LoginResponse> {
        let body = serde_json::to_value(&credentials)?;
        let response = self.http_client.post("/api/v2/auth/login", body).await?;
        serde_json::from_value::<LoginResponse>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn logout(&self) -> SDKResult<bool> {
        let response = self.http_client.post("/api/v2/auth/logout", json!({})).await?;
        response
            .get("success")
            .and_then(|v| v.as_bool())
            .ok_or_else(|| crate::napi::error::SDKError::new("PARSE_ERROR", "Missing success field"))
    }

    pub async fn submit_consent(&self, consent: ConsentRequest) -> SDKResult<ConsentResponse> {
        let body = serde_json::to_value(&consent)?;
        let response = self.http_client.post("/api/v2/auth/consent", body).await?;
        serde_json::from_value::<ConsentResponse>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }
}
