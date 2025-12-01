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
