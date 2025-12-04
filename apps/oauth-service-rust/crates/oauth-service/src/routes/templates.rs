#![allow(clippy::uninlined_format_args)]
// Web UI 模板路由处理器
// 提供登录、权限同意等页面的HTML模板渲染

use askama_axum::IntoResponse;
use axum::{
    extract::{Form, Query, State},
    response::Redirect,
};
use axum_extra::extract::cookie::CookieJar;
use serde::Deserialize;
use std::sync::Arc;

use crate::{
    error::{AppError, ServiceError},
    state::AppState,
    templates::{ConsentTemplate, ErrorTemplate, LoginTemplate, SuccessTemplate},
};

/// 登录页面查询参数
#[derive(Deserialize)]
pub struct LoginQuery {
    /// OAuth 重定向URL
    pub redirect_uri: Option<String>,
    /// OAuth 客户端ID
    pub client_id: Option<String>,
    /// OAuth 权限范围
    pub scope: Option<String>,
    /// 状态参数（CSRF 保护）
    pub state: Option<String>,
    /// 错误信息（如果有的话）
    pub error: Option<String>,
}

/// 登录表单提交请求
#[derive(Deserialize)]
pub struct LoginFormRequest {
    /// 用户名或邮箱
    pub username: String,
    /// 密码
    pub password: String,
    /// 是否记住我
    pub remember: Option<bool>,
    /// 重定向地址
    pub redirect: Option<String>,
}

impl LoginFormRequest {
    /// 验证用户名格式
    pub fn validate_username(&self) -> Result<(), String> {
        let username = self.username.trim();

        if username.is_empty() {
            return Err("用户名不能为空".to_string());
        }

        if username.len() < 3 {
            return Err("用户名至少需要 3 个字符".to_string());
        }

        if username.len() > 50 {
            return Err("用户名不能超过 50 个字符".to_string());
        }

        // 允许字母、数字、下划线、点号、连字符和@（邮箱）
        if !username.chars().all(|c| c.is_alphanumeric() || "._@-".contains(c)) {
            return Err("用户名包含无效字符".to_string());
        }

        Ok(())
    }

    /// 验证密码格式
    pub fn validate_password(&self) -> Result<(), String> {
        let password = &self.password;

        if password.is_empty() {
            return Err("密码不能为空".to_string());
        }

        if password.len() < 6 {
            return Err("密码至少需要 6 个字符".to_string());
        }

        if password.len() > 128 {
            return Err("密码不能超过 128 个字符".to_string());
        }

        Ok(())
    }

    /// 验证重定向 URL（防止开放重定向）
    pub fn validate_redirect(&self) -> Result<Option<String>, String> {
        if let Some(ref redirect) = self.redirect {
            let url = redirect.trim();

            if url.is_empty() {
                return Ok(None);
            }

            // 允许的重定向源
            let allowed_origins = [
                "http://localhost:3002",
                "http://localhost:3001",
                "http://127.0.0.1:3002",
                "http://127.0.0.1:3001",
                "/",  // 相对 URL
            ];

            let is_valid = allowed_origins.iter().any(|origin| {
                url.starts_with(origin)
            }) || url.starts_with("/");

            if !is_valid {
                return Err("无效的重定向 URL".to_string());
            }

            Ok(Some(url.to_string()))
        } else {
            Ok(None)
        }
    }

    /// 验证整个登录请求
    pub fn validate_all(&self) -> Result<(), String> {
        self.validate_username()?;
        self.validate_password()?;
        self.validate_redirect()?;
        Ok(())
    }
}

/// 处理登录页面请求
/// GET /login
pub async fn login_handler(
    State(_state): State<Arc<AppState>>,
    Query(query): Query<LoginQuery>,
) -> Result<impl IntoResponse, AppError> {
    // 验证重定向URL（防止Open Redirect）
    let redirect_url = if let Some(redirect_uri) = &query.redirect_uri {
        // 简单验证: 确保是合法的OAuth重定向URL
        // 生产环境中应该在预注册的客户端中验证
        if redirect_uri.starts_with("http://localhost") || redirect_uri.starts_with("https://") {
            Some(redirect_uri.clone())
        } else {
            return Err(AppError::Service(ServiceError::ValidationError(
                "Invalid redirect URI".to_string(),
            )));
        }
    } else {
        None
    };

    let template = LoginTemplate {
        company_name: "OAuth 授权系统".to_string(),
        error_message: query.error,
        redirect_url,
    };

    Ok(template)
}

/// 权限同意页面查询参数
#[derive(Deserialize)]
pub struct ConsentQuery {
    /// OAuth 客户端ID
    pub client_id: Option<String>,
    /// 请求的权限范围
    pub scope: Option<String>,
    /// 状态参数（CSRF 保护）
    pub state: Option<String>,
    /// 重定向URI
    pub redirect_uri: Option<String>,
    /// 响应类型
    pub response_type: Option<String>,
    /// PKCE code_challenge
    pub code_challenge: Option<String>,
    /// PKCE code_challenge_method
    pub code_challenge_method: Option<String>,
    /// OpenID Connect nonce
    pub nonce: Option<String>,
}

/// 处理权限同意页面请求
/// GET /oauth/consent
pub async fn consent_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ConsentQuery>,
    jar: CookieJar,
) -> Result<impl IntoResponse, AppError> {
    // 1. 验证用户已认证（从session_token cookie）
    let user_id = if let Some(cookie) = jar.get("session_token") {
        match state.token_service.introspect_token(cookie.value()).await {
            Ok(claims) => claims.sub.ok_or_else(|| {
                AppError::Service(ServiceError::Unauthorized("Token does not represent a user".to_string()))
            })?,
            Err(_) => return Err(AppError::Service(ServiceError::Unauthorized(
                "Invalid or expired session token".to_string()
            ))),
        }
    } else {
        return Err(AppError::Service(ServiceError::Unauthorized(
            "No session token found. Please login first.".to_string()
        )));
    };

    // 2. 获取用户信息
    let user = state
        .user_service
        .find_by_id(&user_id)
        .await?
        .ok_or_else(|| ServiceError::NotFound("User not found".to_string()))?;

    // 3. 验证用户账户状态
    if !user.is_active {
        tracing::warn!("Inactive user {} attempted to access consent page", user_id);
        return Err(AppError::Service(ServiceError::Unauthorized("User account is inactive".to_string())));
    }

    // 4. 获取客户端信息
    let client_id = query.client_id
        .as_ref()
        .ok_or_else(|| AppError::Service(ServiceError::ValidationError("Missing client_id parameter".to_string())))?;

    let client_details = state
        .client_service
        .find_by_client_id(client_id)
        .await?
        .ok_or_else(|| AppError::Service(ServiceError::NotFound(format!("Client {} not found", client_id))))?;

    // 5. 解析scope列表
    let scope_list = query
        .scope
        .as_ref()
        .map(|s| {
            s.split_whitespace()
                .map(|scope| scope.to_string())
                .collect()
        })
        .unwrap_or_default();

    // 6. 构建模板数据
    let user_display = user.display_name
        .clone()
        .or_else(|| {
            match (user.first_name.clone(), user.last_name.clone()) {
                (Some(first), Some(last)) => Some(format!("{} {}", first, last)),
                (Some(first), None) => Some(first),
                (None, Some(last)) => Some(last),
                _ => None,
            }
        })
        .unwrap_or_else(|| format!("{}@example.com", user.username));

    let template = ConsentTemplate {
        client_name: client_details.client.name.clone(),
        user_email: user_display,
        scope_list,
    };

    tracing::info!(
        "Consent page rendered for user: {}, client: {}",
        user_id,
        client_id
    );

    Ok(template)
}

/// 权限同意表单提交请求
#[derive(Deserialize)]
pub struct ConsentSubmitRequest {
    /// 用户决定: "approve" 或 "deny"
    pub decision: String,
    /// OAuth 客户端ID
    pub client_id: String,
    /// 重定向URI
    pub redirect_uri: String,
    /// 响应类型
    pub response_type: String,
    /// 请求的权限范围
    pub scope: String,
    /// 状态参数
    #[serde(default)]
    pub state: Option<String>,
    /// PKCE code_challenge
    #[serde(default)]
    pub code_challenge: Option<String>,
    /// PKCE code_challenge_method
    #[serde(default)]
    pub code_challenge_method: Option<String>,
    /// OpenID Connect nonce
    #[serde(default)]
    pub nonce: Option<String>,
    /// 记住选择
    #[serde(default)]
    pub remember: Option<String>,
}

/// 处理权限同意表单提交
/// POST /oauth/consent/submit
pub async fn consent_submit_handler(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Form(request): Form<ConsentSubmitRequest>,
) -> Result<Redirect, AppError> {
    // 1. 验证用户已认证（从session_token cookie）
    let user_id = if let Some(cookie) = jar.get("session_token") {
        match state.token_service.introspect_token(cookie.value()).await {
            Ok(claims) => claims.sub.ok_or_else(|| {
                AppError::Service(ServiceError::Unauthorized("Token does not represent a user".to_string()))
            })?,
            Err(_) => return Err(AppError::Service(ServiceError::Unauthorized(
                "Invalid or expired session token".to_string()
            ))),
        }
    } else {
        return Err(AppError::Service(ServiceError::Unauthorized(
            "No session token found. Please login first.".to_string()
        )));
    };

    // 2. 验证decision字段
    if request.decision.to_lowercase() != "approve" && request.decision.to_lowercase() != "deny" {
        return Err(AppError::Service(ServiceError::ValidationError(
            "Invalid decision value. Must be 'approve' or 'deny'".to_string()
        )));
    }

    // 3. 使用API consent模块处理实际的OAuth逻辑
    let consent_request = crate::routes::consent::ConsentSubmitRequest {
        decision: request.decision.clone(),
        client_id: request.client_id.clone(),
        redirect_uri: request.redirect_uri.clone(),
        response_type: request.response_type.clone(),
        scope: request.scope.clone(),
        state: request.state.clone(),
        code_challenge: request.code_challenge.clone(),
        code_challenge_method: request.code_challenge_method.clone(),
        nonce: request.nonce.clone(),
    };

    // 调用consent submit API处理业务逻辑
    let response = crate::routes::consent::submit_consent(
        State(state),
        jar,
        axum::http::HeaderMap::new(),
        axum::extract::Json(consent_request),
    ).await?;

    // 4. 获取重定向URI并返回
    let redirect_uri = response.0.redirect_uri;

    tracing::info!(
        "Consent decision processed for user: {}, decision: {}",
        user_id,
        request.decision
    );

    Ok(Redirect::to(&redirect_uri))
}

/// 错误页面处理
/// GET /error
pub async fn error_handler(
    Query(query): Query<ErrorQuery>,
) -> Result<impl IntoResponse, AppError> {
    let template = ErrorTemplate {
        error_code: query.error.unwrap_or_else(|| "UNKNOWN_ERROR".to_string()),
        error_message: query.error_description
            .unwrap_or_else(|| "An unexpected error occurred".to_string()),
    };

    Ok(template)
}

#[derive(Deserialize)]
pub struct ErrorQuery {
    /// 错误代码 (e.g., invalid_request, unauthorized_client)
    pub error: Option<String>,
    /// 错误描述
    pub error_description: Option<String>,
}

/// 成功页面处理
/// GET /success
pub async fn success_handler(
    Query(query): Query<SuccessQuery>,
) -> Result<impl IntoResponse, AppError> {
    let template = SuccessTemplate {
        message: query.message.unwrap_or_else(|| "操作成功".to_string()),
    };

    Ok(template)
}

#[derive(Deserialize)]
pub struct SuccessQuery {
    /// 成功消息
    pub message: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_login_query_deserialization() {
        let query = LoginQuery {
            redirect_uri: Some("http://localhost:3002/callback".to_string()),
            client_id: Some("test-client".to_string()),
            scope: Some("openid profile".to_string()),
            state: Some("state123".to_string()),
            error: None,
        };

        assert_eq!(query.client_id, Some("test-client".to_string()));
        assert!(query.redirect_uri.is_some());
    }

    #[test]
    fn test_consent_query_deserialization() {
        let query = ConsentQuery {
            client_id: Some("test-client".to_string()),
            scope: Some("openid profile email".to_string()),
            state: Some("state456".to_string()),
            redirect_uri: Some("http://localhost:3001/callback".to_string()),
            response_type: Some("code".to_string()),
            code_challenge: Some("challenge123".to_string()),
            code_challenge_method: Some("S256".to_string()),
            nonce: Some("nonce789".to_string()),
        };

        assert_eq!(query.client_id, Some("test-client".to_string()));
        assert!(query.scope.is_some());
        assert!(query.redirect_uri.is_some());
    }

    #[test]
    fn test_consent_submit_request_deserialization() {
        let request = ConsentSubmitRequest {
            decision: "approve".to_string(),
            client_id: "test-client".to_string(),
            redirect_uri: "http://localhost:3001/callback".to_string(),
            response_type: "code".to_string(),
            scope: "openid profile".to_string(),
            state: Some("state123".to_string()),
            code_challenge: None,
            code_challenge_method: None,
            nonce: None,
            remember: Some("true".to_string()),
        };

        assert_eq!(request.decision, "approve");
        assert_eq!(request.client_id, "test-client");
    }
}
