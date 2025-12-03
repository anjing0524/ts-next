use crate::napi::http_client::HttpClient;
use crate::napi::error::SDKResult;
use serde::{Deserialize, Serialize};
use serde_json::json;

/// 权限 Permission 结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Permission {
    pub id: String,
    pub name: String,
    pub description: String,
    pub resource: String,
    pub action: String,
}

/// 角色 Role 结构
#[derive(Debug, Serialize, Deserialize, Clone)]
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
    pub async fn assign_role_to_user(&self, user_id: String, role_id: String) -> SDKResult<UserRole> {
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
            .ok_or_else(|| crate::napi::error::SDKError::new("PARSE_ERROR", "Missing success field"))
    }
}
