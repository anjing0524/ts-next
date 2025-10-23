// 权限管理 API
use crate::{
    error::{AppError, ServiceError},
    middleware::auth::AuthContext,
    models::permission::{Permission, PermissionType},
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Deserialize, Debug)]
pub struct ListPermissionsQuery {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

#[derive(Deserialize, Debug)]
pub struct CreatePermissionRequest {
    pub name: String,
    pub description: Option<String>,
    pub r#type: PermissionType,
}

#[derive(Deserialize, Debug)]
pub struct UpdatePermissionRequest {
    pub description: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct PermissionResponse {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub r#type: PermissionType,
    pub created_at: String,
}

impl From<Permission> for PermissionResponse {
    fn from(permission: Permission) -> Self {
        Self {
            id: permission.id,
            name: permission.name,
            description: permission.description,
            r#type: permission.r#type,
            created_at: permission.created_at.to_rfc3339(),
        }
    }
}

/// 列出所有权限
pub async fn list_permissions(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListPermissionsQuery>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<Json<Vec<PermissionResponse>>, AppError> {

    let permissions = state
        .permission_service
        .list_permissions(query.limit, query.offset)
        .await?;

    let response: Vec<PermissionResponse> = permissions
        .into_iter()
        .map(PermissionResponse::from)
        .collect();

    Ok(Json(response))
}

/// 创建新权限
pub async fn create_permission(
    State(state): State<Arc<AppState>>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
    Json(payload): Json<CreatePermissionRequest>,
) -> Result<Json<PermissionResponse>, AppError> {

    // 验证输入
    if payload.name.trim().is_empty() {
        return Err(
            ServiceError::ValidationError("Permission name is required".to_string()).into(),
        );
    }

    let permission = state
        .permission_service
        .create_permission(payload.name, payload.description, payload.r#type)
        .await?;

    Ok(Json(PermissionResponse::from(permission)))
}

/// 获取权限详情
pub async fn get_permission(
    State(state): State<Arc<AppState>>,
    Path(permission_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<Json<PermissionResponse>, AppError> {

    let permission = state
        .permission_service
        .find_permission_by_id(&permission_id)
        .await?
        .ok_or_else(|| ServiceError::NotFound("Permission not found".to_string()))?;

    Ok(Json(PermissionResponse::from(permission)))
}

/// 更新权限
pub async fn update_permission(
    State(state): State<Arc<AppState>>,
    Path(permission_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
    Json(payload): Json<UpdatePermissionRequest>,
) -> Result<Json<PermissionResponse>, AppError> {

    let updated_permission = state
        .permission_service
        .update_permission(&permission_id, payload.description)
        .await?;

    Ok(Json(PermissionResponse::from(updated_permission)))
}

/// 删除权限
pub async fn delete_permission(
    State(state): State<Arc<AppState>>,
    Path(permission_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<Json<serde_json::Value>, AppError> {

    state
        .permission_service
        .delete_permission(&permission_id)
        .await?;

    Ok(Json(serde_json::json!({
        "message": "Permission deleted successfully",
        "permission_id": permission_id
    })))
}
