use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

/// A common error type for the entire application.
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Service error: {0}")]
    Service(#[from] ServiceError),

    #[error("Authentication error: {0}")]
    Auth(#[from] AuthError),

    #[error("PKCE error: {0}")]
    Pkce(#[from] crate::utils::pkce::PkceError),

    #[error("Database error: {0}")]
    Sqlx(#[from] sqlx::Error),

    #[error("JWT error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Internal error: {0}")]
    Anyhow(#[from] anyhow::Error),
}

/// Errors that can occur within the service layer.
#[derive(Error, Debug)]
pub enum ServiceError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("JWT error: {0}")]
    JwtError(String),

    #[error("Invalid scope: {0}")]
    InvalidScope(String),

    #[error("Password hashing error: {0}")]
    PasswordError(String),
}

/// Errors related to authentication and authorization.
#[derive(Error, Debug, Clone, PartialEq)]
pub enum AuthError {
    #[error("Invalid credentials")]
    InvalidCredentials,

    #[error("Invalid or expired token")]
    InvalidToken,

    #[error("Missing required permissions")]
    InsufficientPermissions,

    #[error("Invalid PKCE code verifier")]
    InvalidPkce,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::Service(service_error) => match service_error {
                ServiceError::Database(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Database error: {e}"),
                ),
                ServiceError::ValidationError(msg) => (StatusCode::BAD_REQUEST, msg),
                ServiceError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg),
                ServiceError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
                ServiceError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
                ServiceError::Conflict(msg) => (StatusCode::CONFLICT, msg),
                ServiceError::JwtError(msg) => (StatusCode::UNAUTHORIZED, msg),
                ServiceError::PasswordError(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
                ServiceError::InvalidScope(msg) => (StatusCode::BAD_REQUEST, msg),
            },
            AppError::Auth(auth_error) => match auth_error {
                AuthError::InvalidCredentials | AuthError::InvalidToken => {
                    (StatusCode::UNAUTHORIZED, auth_error.to_string())
                }
                AuthError::InsufficientPermissions => {
                    (StatusCode::FORBIDDEN, auth_error.to_string())
                }
                AuthError::InvalidPkce => (StatusCode::BAD_REQUEST, auth_error.to_string()),
            },
            AppError::Pkce(e) => (
                StatusCode::BAD_REQUEST,
                format!("PKCE verification failed: {e}"),
            ),
            AppError::Sqlx(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {e}"),
            ),
            AppError::Jwt(e) => (StatusCode::UNAUTHORIZED, format!("JWT error: {e}")),
            AppError::Io(e) => (StatusCode::INTERNAL_SERVER_ERROR, format!("IO error: {e}")),
            AppError::Anyhow(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Internal error: {e}"),
            ),
        };

        let body = Json(json!({ "error": error_message }));
        (status, body).into_response()
    }
}
