// 用户管理 API
use crate::{
    error::{AppError, ServiceError},
    middleware::auth::AuthContext,
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Deserialize, Debug)]
pub struct ListUsersQuery {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

#[derive(Deserialize, Debug)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub display_name: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct UpdateUserRequest {
    pub display_name: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Serialize, Debug)]
pub struct UserResponse {
    pub id: String,
    pub username: String,
    pub display_name: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub last_login_at: Option<String>,
}

pub async fn list_users(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListUsersQuery>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<Json<Vec<UserResponse>>, AppError> {
    let users = state
        .user_service
        .list_users(query.limit, query.offset)
        .await?;

    let response: Vec<UserResponse> = users
        .into_iter()
        .map(|user| UserResponse {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            is_active: user.is_active,
            created_at: user.created_at.to_rfc3339(),
            last_login_at: user.last_login_at.map(|dt| dt.to_rfc3339()),
        })
        .collect();

    Ok(Json(response))
}

pub async fn create_user(
    State(state): State<Arc<AppState>>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
    Json(payload): Json<CreateUserRequest>,
) -> Result<Json<UserResponse>, AppError> {
    // 验证输入
    if payload.username.trim().is_empty() {
        return Err(ServiceError::ValidationError("Username is required".to_string()).into());
    }

    if payload.password.len() < 8 {
        return Err(ServiceError::ValidationError(
            "Password must be at least 8 characters".to_string(),
        )
        .into());
    }

    let user = state
        .user_service
        .create_user(payload.username, payload.password, payload.display_name)
        .await?;

    Ok(Json(UserResponse {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        is_active: user.is_active,
        created_at: user.created_at.to_rfc3339(),
        last_login_at: user.last_login_at.map(|dt| dt.to_rfc3339()),
    }))
}

pub async fn get_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<Json<UserResponse>, AppError> {
    let user = state
        .user_service
        .find_by_id(&user_id)
        .await?
        .ok_or_else(|| ServiceError::NotFound("User not found".to_string()))?;

    Ok(Json(UserResponse {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        is_active: user.is_active,
        created_at: user.created_at.to_rfc3339(),
        last_login_at: user.last_login_at.map(|dt| dt.to_rfc3339()),
    }))
}

pub async fn update_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
    Json(payload): Json<UpdateUserRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let updated_user = state
        .user_service
        .update_user(&user_id, payload.display_name, payload.is_active)
        .await?;

    Ok(Json(UserResponse {
        id: updated_user.id,
        username: updated_user.username,
        display_name: updated_user.display_name,
        is_active: updated_user.is_active,
        created_at: updated_user.created_at.to_rfc3339(),
        last_login_at: updated_user.last_login_at.map(|dt| dt.to_rfc3339()),
    }))
}

pub async fn delete_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
    axum::Extension(_auth): axum::Extension<AuthContext>,
) -> Result<Json<serde_json::Value>, AppError> {
    state.user_service.delete_user(&user_id).await?;

    Ok(Json(serde_json::json!({
        "message": "User deleted successfully",
        "user_id": user_id
    })))
}
