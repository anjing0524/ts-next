use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SDKError {
    pub code: String,
    pub message: String,
    pub status_code: Option<u16>,
    pub details: Option<serde_json::Value>,
}

impl SDKError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            status_code: None,
            details: None,
        }
    }

    pub fn with_status(mut self, status: u16) -> Self {
        self.status_code = Some(status);
        self
    }

    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = Some(details);
        self
    }
}

impl fmt::Display for SDKError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for SDKError {}

impl From<serde_json::Error> for SDKError {
    fn from(err: serde_json::Error) -> Self {
        SDKError::new("SERDE_ERROR", err.to_string())
    }
}

pub type SDKResult<T> = Result<T, SDKError>;
