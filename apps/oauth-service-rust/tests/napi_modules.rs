#[cfg(test)]
mod tests {
    use oauth_service_rust::napi::modules::auth::LoginRequest;
    use oauth_service_rust::napi::modules::user::UserInfo;
    use oauth_service_rust::napi::modules::rbac::{Permission, Role, PaginatedResponse};
    use oauth_service_rust::napi::modules::client::{ClientInfo, CreateClientRequest};
    use oauth_service_rust::napi::modules::audit::{AuditLog, AuditLogFilter};

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

    #[test]
    fn test_permission_serialization() {
        let permission = Permission {
            id: "perm1".to_string(),
            name: "Read Users".to_string(),
            description: "Can read user data".to_string(),
            resource: "users".to_string(),
            action: "read".to_string(),
        };
        let json = serde_json::to_value(&permission).unwrap();
        assert_eq!(json["id"], "perm1");
        assert_eq!(json["action"], "read");
    }

    #[test]
    fn test_role_deserialization() {
        let json = serde_json::json!({
            "id": "role1",
            "name": "Admin",
            "description": "Administrator role",
            "permissions": [
                {
                    "id": "perm1",
                    "name": "Read Users",
                    "description": "Can read user data",
                    "resource": "users",
                    "action": "read"
                }
            ]
        });
        let role: Role = serde_json::from_value(json).unwrap();
        assert_eq!(role.id, "role1");
        assert_eq!(role.permissions.len(), 1);
    }

    #[test]
    fn test_paginated_response_deserialization() {
        let json = serde_json::json!({
            "items": [
                {
                    "id": "perm1",
                    "name": "Read Users",
                    "description": "Can read user data",
                    "resource": "users",
                    "action": "read"
                }
            ],
            "total": 10,
            "page": 1,
            "page_size": 10,
            "has_more": false
        });
        let response: PaginatedResponse<Permission> = serde_json::from_value(json).unwrap();
        assert_eq!(response.items.len(), 1);
        assert_eq!(response.total, 10);
        assert!(!response.has_more);
    }

    #[test]
    fn test_client_info_serialization() {
        let client = ClientInfo {
            client_id: "client123".to_string(),
            client_name: "Test Client".to_string(),
            client_secret: Some("secret".to_string()),
            redirect_uris: vec!["http://localhost:3000/callback".to_string()],
            grant_types: vec!["authorization_code".to_string()],
            created_at: "2025-01-01T00:00:00Z".to_string(),
            updated_at: "2025-01-02T00:00:00Z".to_string(),
        };
        let json = serde_json::to_value(&client).unwrap();
        assert_eq!(json["client_id"], "client123");
        assert_eq!(json["redirect_uris"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn test_create_client_request_serialization() {
        let req = CreateClientRequest {
            client_name: "New Client".to_string(),
            redirect_uris: vec!["http://localhost:3000/callback".to_string()],
            grant_types: vec!["authorization_code".to_string(), "refresh_token".to_string()],
        };
        let json = serde_json::to_value(&req).unwrap();
        assert_eq!(json["client_name"], "New Client");
        assert_eq!(json["grant_types"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_audit_log_deserialization() {
        let json = serde_json::json!({
            "id": "log1",
            "actor_id": "user123",
            "action": "login",
            "resource_type": "user",
            "resource_id": "user123",
            "status": "success",
            "details": {"ip": "127.0.0.1"},
            "created_at": "2025-01-01T00:00:00Z",
            "ip_address": "127.0.0.1",
            "user_agent": "Mozilla/5.0"
        });
        let log: AuditLog = serde_json::from_value(json).unwrap();
        assert_eq!(log.id, "log1");
        assert_eq!(log.action, "login");
        assert_eq!(log.status, "success");
    }

    #[test]
    fn test_audit_log_filter_default() {
        let filter = AuditLogFilter::default();
        assert!(filter.actor_id.is_none());
        assert!(filter.resource_type.is_none());
        assert!(filter.action.is_none());
        assert!(filter.status.is_none());
        assert!(filter.start_time.is_none());
        assert!(filter.end_time.is_none());
    }
}
