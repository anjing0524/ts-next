//! Error types for OAuth SDK

pub use crate::SDKError;
pub type SDKResult<T> = Result<T, crate::SDKError>;

impl SDKError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        let message = message.into();
        match code {
            "CONFIG_ERROR" => SDKError::ConfigError(message),
            "REQUEST_ERROR" => SDKError::RequestError(message),
            "PARSE_ERROR" => SDKError::ParseError(message),
            _ => SDKError::Unknown(message),
        }
    }

    pub fn message(&self) -> String {
        match self {
            SDKError::ConfigError(msg) => msg.clone(),
            SDKError::RequestError(msg) => msg.clone(),
            SDKError::ParseError(msg) => msg.clone(),
            SDKError::Unknown(msg) => msg.clone(),
        }
    }
}

impl std::fmt::Display for SDKError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message())
    }
}

impl std::error::Error for SDKError {}

impl From<serde_json::error::Error> for SDKError {
    fn from(err: serde_json::error::Error) -> Self {
        SDKError::ParseError(err.to_string())
    }
}
