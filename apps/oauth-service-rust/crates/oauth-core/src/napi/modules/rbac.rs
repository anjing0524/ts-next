use crate::napi::error::SDKResult;
use crate::napi::http_client::HttpClient;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use serde_json::json;

/// 权限 Permission 结构
#[derive(Debug, Serialize, Deserialize, Clone)]
#[napi(object)]
pub struct Permission {
    pub id: String,
    pub name: String,
    pub description: String,
    pub resource: String,
    pub action: String,
}

/// 角色 Role 结构
#[derive(Debug, Serialize, Deserialize, Clone)]
#[napi(object)]
pub struct Role {
    pub id: String,
    pub name: String,
    pub description: String,
    pub permissions: Vec<Permission>,
}

/// 用户角色关联 UserRole 结构
#[derive(Debug, Serialize, Deserialize)]
pub struct UserRole {
    pub user_id: String,
    pub role_id: String,
    pub assigned_at: String,
}

/// 分页响应 PaginatedResponse 泛型结构
#[derive(Debug, Serialize, Deserialize)]
pub struct PaginatedResponse<T> {
    pub items: Vec<T>,
    pub total: i32,
    pub page: i32,
    pub page_size: i32,
    pub has_more: bool,
}

/// RBAC 模块 RbacModule
pub struct RbacModule {
    http_client: HttpClient,
}

impl RbacModule {
    pub fn new(http_client: HttpClient) -> Self {
        Self { http_client }
    }

    /// 获取权限列表 get_permissions
    /// GET /api/v2/rbac/permissions
    pub async fn get_permissions(
        &self,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> SDKResult<PaginatedResponse<Permission>> {
        let p = page.unwrap_or(1);
        let ps = page_size.unwrap_or(10);
        let path = format!("/api/v2/rbac/permissions?page={}&page_size={}", p, ps);
        let response = self.http_client.get(&path).await?;
        serde_json::from_value::<PaginatedResponse<Permission>>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    /// 获取角色列表 get_roles
    /// GET /api/v2/rbac/roles
    pub async fn get_roles(
        &self,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> SDKResult<PaginatedResponse<Role>> {
        let p = page.unwrap_or(1);
        let ps = page_size.unwrap_or(10);
        let path = format!("/api/v2/rbac/roles?page={}&page_size={}", p, ps);
        let response = self.http_client.get(&path).await?;
        serde_json::from_value::<PaginatedResponse<Role>>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    /// 为用户分配角色 assign_role_to_user
    /// POST /api/v2/rbac/users/{user_id}/roles
    pub async fn assign_role_to_user(
        &self,
        user_id: String,
        role_id: String,
    ) -> SDKResult<UserRole> {
        let body = json!({ "role_id": role_id });
        let path = format!("/api/v2/rbac/users/{}/roles", user_id);
        let response = self.http_client.post(&path, body).await?;
        serde_json::from_value::<UserRole>(response)
            .map_err(|e| crate::napi::error::SDKError::new("PARSE_ERROR", e.to_string()))
    }

    /// 撤销用户角色 revoke_role_from_user
    /// DELETE /api/v2/rbac/users/{user_id}/roles/{role_id}
    pub async fn revoke_role_from_user(&self, user_id: String, role_id: String) -> SDKResult<bool> {
        let path = format!("/api/v2/rbac/users/{}/roles/{}", user_id, role_id);
        let response = self.http_client.delete(&path).await?;
        response
            .get("success")
            .and_then(|v| v.as_bool())
            .ok_or_else(|| {
                crate::napi::error::SDKError::new("PARSE_ERROR", "Missing success field")
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permission_serialization() {
        // 验证 Permission 序列化 - Verifies Permission serialization
        let permission = Permission {
            id: "perm123".to_string(),
            name: "read_users".to_string(),
            description: "Read user information".to_string(),
            resource: "users".to_string(),
            action: "read".to_string(),
        };

        let json = serde_json::to_value(&permission).unwrap();

        assert!(json.get("id").is_some());
        assert!(json.get("name").is_some());
        assert!(json.get("description").is_some());
        assert!(json.get("resource").is_some());
        assert!(json.get("action").is_some());
        assert_eq!(json["name"], "read_users");
        assert_eq!(json["action"], "read");
    }

    #[test]
    fn test_role_with_permissions_list() {
        // 验证 Role 包含 permissions 数组 - Verifies Role contains permissions array
        let role = Role {
            id: "role123".to_string(),
            name: "admin".to_string(),
            description: "Administrator role".to_string(),
            permissions: vec![Permission {
                id: "perm1".to_string(),
                name: "read_all".to_string(),
                description: "Read all".to_string(),
                resource: "*".to_string(),
                action: "read".to_string(),
            }],
        };

        let json = serde_json::to_value(&role).unwrap();

        assert!(json.get("permissions").is_some());
        assert!(json["permissions"].is_array());
        let perms = json["permissions"].as_array().unwrap();
        assert_eq!(perms.len(), 1);
        assert!(perms[0].get("id").is_some());
    }

    #[test]
    fn test_paginated_response_structure() {
        // 验证 PaginatedResponse 结构 - Verifies PaginatedResponse structure
        let paginated = PaginatedResponse {
            items: vec![Permission {
                id: "p1".to_string(),
                name: "test".to_string(),
                description: "desc".to_string(),
                resource: "res".to_string(),
                action: "act".to_string(),
            }],
            total: 100,
            page: 1,
            page_size: 10,
            has_more: true,
        };

        let json = serde_json::to_value(&paginated).unwrap();

        assert!(json.get("items").is_some());
        assert!(json.get("total").is_some());
        assert!(json.get("page").is_some());
        assert!(json.get("page_size").is_some());
        assert!(json.get("has_more").is_some());
        assert!(json["items"].is_array());
        assert_eq!(json["total"], 100);
        assert_eq!(json["page"], 1);
        assert_eq!(json["has_more"], true);
    }

    #[test]
    fn test_user_role_serialization() {
        // 验证 UserRole 序列化 - Verifies UserRole serialization
        let user_role = UserRole {
            user_id: "user123".to_string(),
            role_id: "role456".to_string(),
            assigned_at: "2025-01-01T00:00:00Z".to_string(),
        };

        let json = serde_json::to_value(&user_role).unwrap();

        assert!(json.get("user_id").is_some());
        assert!(json.get("role_id").is_some());
        assert!(json.get("assigned_at").is_some());
        assert_eq!(json["user_id"], "user123");
        assert_eq!(json["role_id"], "role456");
    }
}
