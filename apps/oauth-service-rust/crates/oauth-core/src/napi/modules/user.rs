use crate::napi::error::SDKResult;
use crate::napi::http_client::HttpClient;
use napi_derive::napi;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[napi(object)]
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

#[derive(Debug)]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_info_structure() {
        // 验证 UserInfo 结构 - Verifies UserInfo structure
        let user = UserInfo {
            user_id: "user123".to_string(),
            username: "testuser".to_string(),
            email: "test@example.com".to_string(),
            display_name: "Test User".to_string(),
            avatar_url: Some("https://example.com/avatar.png".to_string()),
            created_at: "2025-01-01T00:00:00Z".to_string(),
            updated_at: "2025-01-02T00:00:00Z".to_string(),
        };

        let json = serde_json::to_value(&user).unwrap();

        // 验证所有必需字段 - Verify all required fields
        assert!(json.get("user_id").is_some());
        assert!(json.get("username").is_some());
        assert!(json.get("email").is_some());
        assert!(json.get("display_name").is_some());
        assert!(json.get("created_at").is_some());
        assert!(json.get("updated_at").is_some());
        assert!(json.get("avatar_url").is_some());
    }

    #[test]
    fn test_user_info_deserialization() {
        // 验证 UserInfo 反序列化 - Verifies UserInfo deserialization
        let api_response = r#"{
            "user_id": "user123",
            "username": "test",
            "email": "test@example.com",
            "display_name": "Test User",
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-02T00:00:00Z"
        }"#;

        let user: UserInfo = serde_json::from_str(api_response).unwrap();

        assert_eq!(user.user_id, "user123");
        assert_eq!(user.email, "test@example.com");
        assert!(user.avatar_url.is_none());
    }

    #[test]
    fn test_update_profile_request_with_optional_fields() {
        // 验证 UpdateProfileRequest 可选字段 - Verifies UpdateProfileRequest optional fields
        let req = UpdateProfileRequest {
            display_name: Some("New Name".to_string()),
            avatar_url: None,
            email: Some("new@example.com".to_string()),
        };

        let json = serde_json::to_value(&req).unwrap();

        // 有值的可选字段应该出现 - Optional fields with values should appear
        assert!(json.get("display_name").is_some());
        assert_eq!(json["display_name"], "New Name");
        assert!(json.get("email").is_some());

        // None 值的字段也应该序列化为 null - None fields should serialize as null
        assert!(json["avatar_url"].is_null());
    }
}
