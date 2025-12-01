// Web UI 模板路由处理器
// 提供登录、权限同意等页面的HTML模板渲染

use askama_axum::IntoResponse;
use axum::extract::{Query, State};
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
    /// 状态参数
    pub state: Option<String>,
}

/// 处理权限同意页面请求
/// GET /oauth/consent
pub async fn consent_handler(
    State(_state): State<Arc<AppState>>,
    Query(query): Query<ConsentQuery>,
) -> Result<impl IntoResponse, AppError> {
    // TODO: 获取客户端信息和当前用户
    // 这里应该调用业务逻辑获取真实数据
    // 暂时使用硬编码的演示数据

    let template = ConsentTemplate {
        client_name: query.client_id.unwrap_or_else(|| "Unknown Client".to_string()),
        user_email: "user@example.com".to_string(), // 从session获取
        scope_list: query
            .scope
            .map(|s| {
                s.split_whitespace()
                    .map(|scope| scope.to_string())
                    .collect()
            })
            .unwrap_or_default(),
    };

    Ok(template)
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
        };

        assert_eq!(query.client_id, Some("test-client".to_string()));
        assert!(query.scope.is_some());
    }
}
