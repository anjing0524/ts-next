#[cfg(test)]
mod tests {
    use oauth_service_rust::napi::modules::auth::LoginRequest;
    use oauth_service_rust::napi::modules::user::UserInfo;

    #[test]
    fn test_login_request_serialization() {
        let req = LoginRequest {
            username: "test@example.com".to_string(),
            password: "password".to_string(),
        };
        let json = serde_json::to_value(&req).unwrap();
        assert_eq!(json["username"], "test@example.com");
        assert_eq!(json["password"], "password");
    }

    #[test]
    fn test_user_info_deserialization() {
        let json = serde_json::json!({
            "user_id": "user123",
            "username": "test",
            "email": "test@example.com",
            "display_name": "Test User",
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-02T00:00:00Z"
        });
        let user: UserInfo = serde_json::from_value(json).unwrap();
        assert_eq!(user.user_id, "user123");
        assert_eq!(user.email, "test@example.com");
    }
}
