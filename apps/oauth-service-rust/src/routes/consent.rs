use crate::error::{AppError, ServiceError};
use crate::state::AppState;
use axum::{
    extract::{Json as JsonExtractor, Query, State},
    http::HeaderMap,
    response::Json,
};
use axum_extra::extract::cookie::CookieJar;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

// --- Request/Response Structs ---

#[derive(Deserialize, Debug)]
pub struct ConsentInfoRequest {
    pub client_id: String,
    pub redirect_uri: String,
    pub response_type: String,
    pub scope: String,
    pub state: Option<String>,
    pub code_challenge: Option<String>,
    pub code_challenge_method: Option<String>,
    pub nonce: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct ClientInfo {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo_uri: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct ScopeInfo {
    pub name: String,
    pub description: String,
}

#[derive(Serialize, Debug)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
}

#[derive(Serialize, Debug)]
pub struct ConsentInfoResponse {
    pub client: ClientInfo,
    pub requested_scopes: Vec<ScopeInfo>,
    pub user: UserInfo,
    pub client_id: String,
    pub redirect_uri: String,
    pub scope: String,
    pub response_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_challenge: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_challenge_method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nonce: Option<String>,
    pub consent_form_action_url: String,
}

#[derive(Deserialize, Debug)]
pub struct ConsentSubmitRequest {
    pub decision: String, // "allow" or "deny"
    pub client_id: String,
    pub redirect_uri: String,
    pub response_type: String,
    pub scope: String,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub code_challenge: Option<String>,
    #[serde(default)]
    pub code_challenge_method: Option<String>,
    #[serde(default)]
    pub nonce: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct ConsentSubmitResponse {
    pub redirect_uri: String,
}

// --- Endpoint Handlers ---

/// Handles `GET /api/v2/oauth/consent/info`
///
/// 获取同意页面所需的信息
///
/// 工作流程：
/// 1. 验证用户已登录（session_token）
/// 2. 检查用户是否有权限使用 OAuth 同意流程（防止权限提升）
/// 3. 验证客户端信息和重定向URI
/// 4. 获取请求的权限范围
/// 5. 返回同意信息
///
/// 安全考虑：
/// - ✅ 必须验证用户认证状态
/// - ✅ 必须检查用户权限（防止权限提升攻击）
/// - ✅ 必须验证client_id和redirect_uri
/// - ✅ 必须验证scope是否在允许范围内
pub async fn get_consent_info(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Query(request): Query<ConsentInfoRequest>,
    headers: HeaderMap,
) -> Result<Json<ConsentInfoResponse>, AppError> {
    // 1. 验证用户已认证
    let user_id = super::oauth::extract_user_id_from_request(&state, &jar, &headers).await?;

    // 获取用户信息
    let user = state
        .user_service
        .find_by_id(&user_id)
        .await?
        .ok_or_else(|| ServiceError::NotFound("User not found".to_string()))?;

    // 验证用户账户状态
    if !user.is_active {
        tracing::warn!("Inactive user {} attempted to access consent flow", user_id);
        return Err(ServiceError::Unauthorized("User account is inactive".to_string()).into());
    }

    // 2. 检查用户是否有权限使用 OAuth 同意流程
    // 防止权限提升攻击：确保用户被授权使用此功能
    let has_oauth_permission = state
        .rbac_service
        .has_permission(&user_id, "oauth:consent")
        .await
        .unwrap_or(false);

    if !has_oauth_permission {
        tracing::warn!("User {} lacks oauth:consent permission for consent flow", user_id);
        return Err(ServiceError::Forbidden(
            "User does not have permission to access OAuth consent flow".to_string()
        ).into());
    }

    // 3. 验证客户端信息
    let client_details = state
        .client_service
        .find_by_client_id(&request.client_id)
        .await?
        .ok_or_else(|| ServiceError::NotFound("Invalid client_id".to_string()))?;

    // 4. 验证重定向URI
    crate::utils::validation::validate_redirect_uri(&request.redirect_uri, &client_details.redirect_uris)?;

    // 5. 验证scope
    crate::utils::validation::validate_scope(&request.scope, &client_details.allowed_scopes)?;

    // 5. 构建权限范围信息
    let scopes: Vec<&str> = request.scope.split_whitespace().collect();
    let requested_scopes = scopes
        .iter()
        .map(|scope| ScopeInfo {
            name: scope.to_string(),
            description: format!("Access to {}", scope), // TODO: Get description from database
        })
        .collect();

    // 6. 获取Admin Portal URL
    let admin_portal_url = std::env::var("NEXT_PUBLIC_ADMIN_PORTAL_URL")
        .unwrap_or_else(|_| "http://localhost:3002".to_string());

    // 返回同意信息
    Ok(Json(ConsentInfoResponse {
        client: ClientInfo {
            id: client_details.client.id.clone(),
            name: client_details.client.name.clone(),
            logo_uri: client_details.client.logo_uri.clone(),
        },
        requested_scopes,
        user: UserInfo {
            id: user.id.clone(),
            username: user.username.clone(),
        },
        client_id: request.client_id,
        redirect_uri: request.redirect_uri,
        scope: request.scope,
        response_type: request.response_type,
        state: request.state,
        code_challenge: request.code_challenge,
        code_challenge_method: request.code_challenge_method,
        nonce: request.nonce,
        consent_form_action_url: format!("{}/api/v2/oauth/consent/submit", admin_portal_url),
    }))
}

/// Handles `POST /api/v2/oauth/consent/submit`
///
/// 处理用户的同意决定，生成授权码并返回重定向URI
///
/// 工作流程：
/// 1. 验证用户已登录（session_token）
/// 2. 检查用户是否有权限使用 OAuth 同意流程（防止权限提升）
/// 3. 验证客户端信息
/// 4. 验证重定向URI和scope
/// 5. 根据用户的决定（allow/deny）返回相应的重定向URI
/// 6. 如果允许，生成授权码并返回带code的重定向URI
/// 7. 如果拒绝，返回带error的重定向URI
///
/// 安全考虑：
/// - ✅ 必须验证用户认证状态
/// - ✅ 必须检查用户权限（防止权限提升攻击）
/// - ✅ 必须验证客户端和重定向URI
/// - ✅ 必须验证scope
/// - ✅ 如果拒绝，返回error=access_denied
/// - ✅ 如果允许，生成授权码（标准OAuth流程）
/// - ✅ 授权码生成失败时返回500错误（而不是返回无效重定向URI）
pub async fn submit_consent(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: HeaderMap,
    JsonExtractor(request): JsonExtractor<ConsentSubmitRequest>,
) -> Result<Json<ConsentSubmitResponse>, AppError> {
    // 1. 验证用户已认证
    let user_id = super::oauth::extract_user_id_from_request(&state, &jar, &headers).await?;

    // 获取用户信息，验证账户状态
    let user = state
        .user_service
        .find_by_id(&user_id)
        .await?
        .ok_or_else(|| ServiceError::NotFound("User not found".to_string()))?;

    if !user.is_active {
        tracing::warn!("Inactive user {} attempted to submit consent", user_id);
        return Err(ServiceError::Unauthorized("User account is inactive".to_string()).into());
    }

    // 2. 检查用户是否有权限使用 OAuth 同意流程
    // 防止权限提升攻击：确保用户被授权使用此功能
    let has_oauth_permission = state
        .rbac_service
        .has_permission(&user_id, "oauth:consent")
        .await
        .unwrap_or(false);

    if !has_oauth_permission {
        tracing::warn!("User {} lacks oauth:consent permission for consent submission", user_id);
        return Err(ServiceError::Forbidden(
            "User does not have permission to submit OAuth consent".to_string()
        ).into());
    }

    // 3. 验证客户端信息
    let client_details = state
        .client_service
        .find_by_client_id(&request.client_id)
        .await?
        .ok_or_else(|| ServiceError::NotFound("Invalid client_id".to_string()))?;

    // 4. 验证重定向URI和scope
    crate::utils::validation::validate_redirect_uri(&request.redirect_uri, &client_details.redirect_uris)?;

    // 5. 验证scope
    crate::utils::validation::validate_scope(&request.scope, &client_details.allowed_scopes)?;

    // 5. 处理同意决定
    let mut redirect_url = url::Url::parse(&request.redirect_uri)
        .map_err(|_| ServiceError::Internal("Failed to parse redirect_uri".to_string()))?;

    if request.decision.to_lowercase() == "deny" {
        // 用户拒绝 - 返回error
        redirect_url.query_pairs_mut().append_pair("error", "access_denied");
        if let Some(state_param) = &request.state {
            redirect_url.query_pairs_mut().append_pair("state", state_param);
        }
    } else if request.decision.to_lowercase() == "allow" {
        // 用户允许 - 生成授权码
        // 构建authorize request用于生成授权码
        let authorize_request = crate::routes::oauth::AuthorizeRequest {
            client_id: request.client_id.clone(),
            redirect_uri: request.redirect_uri.clone(),
            response_type: request.response_type.clone(),
            scope: request.scope.clone(),
            code_challenge: request.code_challenge.unwrap_or_default(),
            code_challenge_method: request.code_challenge_method.unwrap_or_else(|| "S256".to_string()),
            nonce: request.nonce.clone(),
        };

        // 生成授权码
        match state
            .auth_code_service
            .create_auth_code(&authorize_request, &user_id)
            .await
        {
            Ok(auth_code) => {
                // 返回带code的重定向URI
                redirect_url.query_pairs_mut().append_pair("code", &auth_code);
                if let Some(state_param) = &request.state {
                    redirect_url.query_pairs_mut().append_pair("state", state_param);
                }
                tracing::info!(
                    "Authorization code generated successfully for user: {}, client: {}",
                    user_id,
                    request.client_id
                );
            }
            Err(e) => {
                // 授权码生成失败 - 返回错误重定向而不是HTTP 500
                tracing::error!(
                    "Failed to generate authorization code for user: {}, client: {}, error: {}",
                    user_id,
                    request.client_id,
                    e
                );
                redirect_url.query_pairs_mut().append_pair("error", "server_error");
                redirect_url.query_pairs_mut()
                    .append_pair("error_description", "Failed to generate authorization code");
                if let Some(state_param) = &request.state {
                    redirect_url.query_pairs_mut().append_pair("state", state_param);
                }
            }
        }
    } else {
        return Err(ServiceError::ValidationError("Invalid decision value".to_string()).into());
    }

    tracing::info!(
        "Consent decision submitted for user: {}, client: {}, decision: {}",
        user_id,
        request.client_id,
        request.decision
    );

    Ok(Json(ConsentSubmitResponse {
        redirect_uri: redirect_url.to_string(),
    }))
}
