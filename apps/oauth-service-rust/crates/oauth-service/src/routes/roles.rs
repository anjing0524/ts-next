// 角色管理 API
use crate::{
    error::{AppError, ServiceError},
    middleware::auth::AuthContext,
    models::role::Role,
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Deserialize, Debug)]
pub struct ListRolesQuery {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

#[derive(Deserialize, Debug)]
pub struct CreateRoleRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct UpdateRoleRequest {
    pub name: Option<String>,
    pub description: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct AssignPermissionsRequest {
    pub permission_ids: Vec<String>,
}

#[derive(Deserialize, Debug)]
pub struct AssignRoleRequest {
    pub role_id: String,
}

#[derive(Serialize, Debug)]
pub struct RoleResponse {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
}

impl From<Role> for RoleResponse {
    fn from(role: Role) -> Self {
        Self {
            id: role.id,
            name: role.name,
            description: role.description,
            created_at: role.created_at.to_rfc3339(),
        }
    }
}

/// 列出所有角色
pub async fn list_roles(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListRolesQuery>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<Json<Vec<RoleResponse>>, AppError> {

    let roles = state
        .role_service
        .list_roles(query.limit, query.offset)
        .await?;

    let response: Vec<RoleResponse> = roles.into_iter().map(RoleResponse::from).collect();

    Ok(Json(response))
}

/// 创建新角色
pub async fn create_role(
    State(state): State<Arc<AppState>>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
    Json(payload): Json<CreateRoleRequest>,
) -> Result<Json<RoleResponse>, AppError> {

    // 验证输入
    if payload.name.trim().is_empty() {
        return Err(ServiceError::ValidationError("Role name is required".to_string()).into());
    }

    let role = state
        .role_service
        .create_role(payload.name, payload.description)
        .await?;

    Ok(Json(RoleResponse::from(role)))
}

/// 获取角色详情
pub async fn get_role(
    State(state): State<Arc<AppState>>,
    Path(role_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<Json<RoleResponse>, AppError> {

    let role = state
        .role_service
        .find_role_by_id(&role_id)
        .await?
        .ok_or_else(|| ServiceError::NotFound("Role not found".to_string()))?;

    Ok(Json(RoleResponse::from(role)))
}

/// 更新角色
pub async fn update_role(
    State(state): State<Arc<AppState>>,
    Path(role_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
    Json(payload): Json<UpdateRoleRequest>,
) -> Result<Json<RoleResponse>, AppError> {

    let updated_role = state
        .role_service
        .update_role(&role_id, payload.name, payload.description)
        .await?;

    Ok(Json(RoleResponse::from(updated_role)))
}

/// 删除角色
pub async fn delete_role(
    State(state): State<Arc<AppState>>,
    Path(role_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<Json<serde_json::Value>, AppError> {

    state.role_service.delete_role(&role_id).await?;

    Ok(Json(serde_json::json!({
        "message": "Role deleted successfully",
        "role_id": role_id
    })))
}

/// 获取角色的所有权限
pub async fn get_role_permissions(
    State(state): State<Arc<AppState>>,
    Path(role_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<Json<serde_json::Value>, AppError> {

    let permissions = state.role_service.get_role_permissions(&role_id).await?;

    Ok(Json(serde_json::json!({
        "role_id": role_id,
        "permissions": permissions
    })))
}

/// 给角色分配权限
pub async fn assign_permissions_to_role(
    State(state): State<Arc<AppState>>,
    Path(role_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
    Json(payload): Json<AssignPermissionsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {

    state
        .role_service
        .assign_permissions_to_role(&role_id, payload.permission_ids)
        .await?;

    Ok(Json(serde_json::json!({
        "message": "Permissions assigned successfully",
        "role_id": role_id
    })))
}

/// 从角色移除权限
pub async fn remove_permissions_from_role(
    State(state): State<Arc<AppState>>,
    Path(role_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
    Json(payload): Json<AssignPermissionsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {

    state
        .role_service
        .remove_permissions_from_role(&role_id, payload.permission_ids)
        .await?;

    Ok(Json(serde_json::json!({
        "message": "Permissions removed successfully",
        "role_id": role_id
    })))
}

/// 获取用户的所有角色
pub async fn get_user_roles(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<Json<Vec<RoleResponse>>, AppError> {

    let roles = state.role_service.get_user_roles(&user_id).await?;

    let response: Vec<RoleResponse> = roles.into_iter().map(RoleResponse::from).collect();

    Ok(Json(response))
}

/// 给用户分配角色
pub async fn assign_role_to_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
    Json(payload): Json<AssignRoleRequest>,
) -> Result<Json<serde_json::Value>, AppError> {

    state
        .role_service
        .assign_role_to_user(&user_id, &payload.role_id)
        .await?;

    Ok(Json(serde_json::json!({
        "message": "Role assigned to user successfully",
        "user_id": user_id,
        "role_id": payload.role_id
    })))
}

/// 从用户移除角色
pub async fn remove_role_from_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
    Json(payload): Json<AssignRoleRequest>,
) -> Result<Json<serde_json::Value>, AppError> {

    state
        .role_service
        .remove_role_from_user(&user_id, &payload.role_id)
        .await?;

    Ok(Json(serde_json::json!({
        "message": "Role removed from user successfully",
        "user_id": user_id,
        "role_id": payload.role_id
    })))
}
