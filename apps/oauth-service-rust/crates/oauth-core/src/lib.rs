//! OAuth Core Library
//!
//! This library provides the core OAuth functionality including NAPI bindings for Node.js integration.

pub mod napi;

// SDK type definitions
#[derive(Debug, Clone)]
pub struct SDKConfig {
    pub base_url: String,
    pub timeout: Option<u64>,
    pub retry_count: Option<u32>,
    pub retry_delay: Option<u64>,
    pub debug: Option<bool>,
}

#[derive(Debug, Clone)]
pub enum SDKError {
    ConfigError(String),
    RequestError(String),
    ParseError(String),
    Unknown(String),
}

pub type SDKResult<T> = Result<T, SDKError>;

#[derive(Debug)]
pub struct OAuthSDK {
    config: SDKConfig,
}

impl OAuthSDK {
    pub fn new(config: SDKConfig) -> SDKResult<Self> {
        Ok(OAuthSDK { config })
    }
}

// Re-export types
pub use napi::modules;
