use crate::napi::error::SDKResult;
use crate::napi::http_client::HttpClient;
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
        let response = self
            .http_client
            .post("/api/v2/auth/logout", json!({}))
            .await?;
        response
            .get("success")
            .and_then(|v| v.as_bool())
            .ok_or_else(|| {
                crate::napi::error::SDKError::new("PARSE_ERROR", "Missing success field")
            })
    }

    pub async fn submit_consent(&self, consent: ConsentRequest) -> SDKResult<ConsentResponse> {
        let body = serde_json::to_value(&consent)?;
        let response = self.http_client.post("/api/v2/auth/consent", body).await?;
        serde_json::from_value::<ConsentResponse>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_login_request_serialization() {
        // 验证 LoginRequest 正确序列化 - Verifies LoginRequest serializes correctly
        let req = LoginRequest {
            username: "test@example.com".to_string(),
            password: "secure_password".to_string(),
        };

        let json = serde_json::to_value(&req).unwrap();

        assert!(
            json.get("username").is_some(),
            "LoginRequest must have username field"
        );
        assert!(
            json.get("password").is_some(),
            "LoginRequest must have password field"
        );
        assert_eq!(json["username"], "test@example.com");
        assert_eq!(json["password"], "secure_password");
    }

    #[test]
    fn test_login_response_deserialization() {
        // 验证 LoginResponse 正确反序列化 - Verifies LoginResponse deserializes correctly
        let api_response = r#"{
            "session_token": "token_abc123",
            "user_id": "user_xyz789",
            "username": "testuser",
            "expires_in": 7200
        }"#;

        let resp: LoginResponse = serde_json::from_str(api_response).unwrap();

        assert_eq!(resp.session_token, "token_abc123");
        assert_eq!(resp.user_id, "user_xyz789");
        assert_eq!(resp.username, "testuser");
        assert_eq!(resp.expires_in, 7200);
    }

    #[test]
    fn test_consent_request_structure() {
        // 验证 ConsentRequest 结构 - Verifies ConsentRequest structure
        let req = ConsentRequest {
            client_id: "client123".to_string(),
            scopes: vec!["read".to_string(), "write".to_string()],
            authorized: true,
        };

        let json = serde_json::to_value(&req).unwrap();

        assert!(json.get("client_id").is_some());
        assert!(json.get("scopes").is_some());
        assert!(json.get("authorized").is_some());
        assert!(json["scopes"].is_array());
        assert_eq!(json["scopes"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_consent_response_deserialization() {
        // 验证 ConsentResponse 反序列化 - Verifies ConsentResponse deserialization
        let api_response = r#"{
            "authorization_code": "code_abc123",
            "expires_in": 600
        }"#;

        let resp: ConsentResponse = serde_json::from_str(api_response).unwrap();

        assert_eq!(resp.authorization_code, "code_abc123");
        assert_eq!(resp.expires_in, 600);
    }
}
