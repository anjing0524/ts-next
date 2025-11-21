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

    #[error("Forbidden: {0}")]
    Forbidden(String),

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

    #[error("Cache error: {0}")]
    CacheError(String),
}

impl From<crate::cache::CacheError> for ServiceError {
    fn from(err: crate::cache::CacheError) -> Self {
        ServiceError::CacheError(err.to_string())
    }
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
                // SECURITY FIX: Don't expose database error details to clients
                ServiceError::Database(e) => {
                    // Log the actual error for debugging
                    tracing::error!("Database error: {}", e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "An internal error occurred. Please try again later.".to_string(),
                    )
                },
                ServiceError::ValidationError(msg) => (StatusCode::BAD_REQUEST, msg),
                ServiceError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg),
                ServiceError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg),
                ServiceError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
                ServiceError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
                ServiceError::Conflict(msg) => (StatusCode::CONFLICT, msg),
                ServiceError::JwtError(msg) => (StatusCode::UNAUTHORIZED, msg),
                // SECURITY FIX: Don't expose password hashing details
                ServiceError::PasswordError(e) => {
                    tracing::error!("Password hashing error: {}", e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Authentication system error. Please try again later.".to_string(),
                    )
                },
                ServiceError::InvalidScope(msg) => (StatusCode::BAD_REQUEST, msg),
                // SECURITY FIX: Don't expose cache implementation details
                ServiceError::CacheError(e) => {
                    tracing::error!("Cache error: {}", e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "An internal error occurred. Please try again later.".to_string(),
                    )
                },
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
            // SECURITY FIX: Don't expose database error details to clients
            AppError::Sqlx(e) => {
                tracing::error!("Database error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "An internal error occurred. Please try again later.".to_string(),
                )
            },
            // SECURITY FIX: Don't expose JWT implementation details
            AppError::Jwt(e) => {
                tracing::error!("JWT error: {}", e);
                (StatusCode::UNAUTHORIZED, "Invalid or expired token".to_string())
            },
            // SECURITY FIX: Don't expose IO error details
            AppError::Io(e) => {
                tracing::error!("IO error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "An internal error occurred. Please try again later.".to_string(),
                )
            },
            // SECURITY FIX: Don't expose internal error details
            AppError::Anyhow(e) => {
                tracing::error!("Internal error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "An internal error occurred. Please try again later.".to_string(),
                )
            },
        };

        let body = Json(json!({ "error": error_message }));
        (status, body).into_response()
    }
}
