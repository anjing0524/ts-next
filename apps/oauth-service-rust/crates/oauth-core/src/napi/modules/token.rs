use crate::napi::error::SDKResult;
use crate::napi::http_client::HttpClient;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
    pub id_token: String,
    pub expires_in: i32,
    pub token_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenIntrospectResponse {
    pub active: bool,
    pub scope: String,
    pub user_id: String,
    pub exp: i64,
}

pub struct TokenModule {
    http_client: HttpClient,
}

impl TokenModule {
    pub fn new(http_client: HttpClient) -> Self {
        Self { http_client }
    }

    pub async fn refresh(&self, refresh_token: String) -> SDKResult<TokenPair> {
        let body = json!({ "refresh_token": refresh_token });
        let response = self.http_client.post("/api/v2/token/refresh", body).await?;
        serde_json::from_value::<TokenPair>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn introspect(&self, token: String) -> SDKResult<TokenIntrospectResponse> {
        let body = json!({ "token": token });
        let response = self
            .http_client
            .post("/api/v2/token/introspect", body)
            .await?;
        serde_json::from_value::<TokenIntrospectResponse>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    pub async fn revoke(&self, token: String) -> SDKResult<bool> {
        let body = json!({ "token": token });
        let response = self.http_client.post("/api/v2/token/revoke", body).await?;
        response
            .get("success")
            .and_then(|v| v.as_bool())
            .ok_or_else(|| {
                crate::napi::error::SDKError::new("PARSE_ERROR", "Missing success field")
            })
    }
}
