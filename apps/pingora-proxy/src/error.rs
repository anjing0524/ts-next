//! `pingora-proxy` 的统一错误处理模块

use thiserror::Error;

/// 项目统一的错误枚举
#[derive(Error, Debug)]
pub enum ProxyError {
    #[error("Configuration error: {0}")]
    Config(#[from] ::config::ConfigError),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Prometheus error: {0}")]
    Prometheus(#[from] ::prometheus::Error),
    #[error("JWT validation error: {0}")]
    Jwt(#[from] crate::security::jwt::JwtError),
    #[error("Pingora error: {0}")]
    Pingora(#[from] pingora::Error),
    #[error("Internal error: {0}")]
    Internal(String),
}

impl ProxyError {
    /// 创建一个新的内部错误
    pub fn internal(msg: impl Into<String>) -> Self {
        ProxyError::Internal(msg.into())
    }
}

/// 项目统一的 Result 类型
pub type ProxyResult<T> = Result<T, ProxyError>;

