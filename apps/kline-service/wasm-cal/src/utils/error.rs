//! 错误处理模块

use thiserror::Error;
use wasm_bindgen::JsValue;

/// 统一的错误类型
#[derive(Error, Debug)]
pub enum WasmCalError {
    /// Canvas 相关错误
    #[error("Canvas error: {message}")]
    Canvas {
        message: String,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    /// 数据相关错误
    #[error("Data error: {message}")]
    Data {
        message: String,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    /// 渲染相关错误
    #[error("Render error: {message}")]
    Render {
        message: String,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    /// 配置相关错误
    #[error("Config error: {message}")]
    Config {
        message: String,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    /// 缓存相关错误
    #[error("Cache error: {message}")]
    Cache {
        message: String,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    /// 验证错误
    #[error("Validation error: {message}")]
    Validation {
        message: String,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    /// 解析错误
    #[error("Parse error: {message}")]
    Parse {
        message: String,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    /// 缓冲区错误
    #[error("Buffer error: {message}")]
    Buffer {
        message: String,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    /// 内存不足错误
    #[error("Out of memory")]
    OutOfMemory,

    /// JavaScript 错误
    #[error("JavaScript error: {0}")]
    JavaScript(String),

    /// 其他错误
    #[error("Other error: {message}")]
    Other {
        message: String,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },
}

/// 便捷构造函数
impl WasmCalError {
    pub fn canvas(message: impl Into<String>) -> Self {
        Self::Canvas {
            message: message.into(),
            source: None,
        }
    }

    pub fn canvas_with_source(
        message: impl Into<String>,
        source: Box<dyn std::error::Error + Send + Sync>,
    ) -> Self {
        Self::Canvas {
            message: message.into(),
            source: Some(source),
        }
    }

    pub fn data(message: impl Into<String>) -> Self {
        Self::Data {
            message: message.into(),
            source: None,
        }
    }

    pub fn data_with_source(
        message: impl Into<String>,
        source: Box<dyn std::error::Error + Send + Sync>,
    ) -> Self {
        Self::Data {
            message: message.into(),
            source: Some(source),
        }
    }

    pub fn render(message: impl Into<String>) -> Self {
        Self::Render {
            message: message.into(),
            source: None,
        }
    }

    pub fn render_with_source(
        message: impl Into<String>,
        source: Box<dyn std::error::Error + Send + Sync>,
    ) -> Self {
        Self::Render {
            message: message.into(),
            source: Some(source),
        }
    }

    pub fn config(message: impl Into<String>) -> Self {
        Self::Config {
            message: message.into(),
            source: None,
        }
    }

    pub fn config_with_source(
        message: impl Into<String>,
        source: Box<dyn std::error::Error + Send + Sync>,
    ) -> Self {
        Self::Config {
            message: message.into(),
            source: Some(source),
        }
    }

    pub fn cache(message: impl Into<String>) -> Self {
        Self::Cache {
            message: message.into(),
            source: None,
        }
    }

    pub fn cache_with_source(
        message: impl Into<String>,
        source: Box<dyn std::error::Error + Send + Sync>,
    ) -> Self {
        Self::Cache {
            message: message.into(),
            source: Some(source),
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation {
            message: message.into(),
            source: None,
        }
    }

    pub fn validation_with_source(
        message: impl Into<String>,
        source: Box<dyn std::error::Error + Send + Sync>,
    ) -> Self {
        Self::Validation {
            message: message.into(),
            source: Some(source),
        }
    }

    pub fn parse(message: impl Into<String>) -> Self {
        Self::Parse {
            message: message.into(),
            source: None,
        }
    }

    pub fn parse_with_source(
        message: impl Into<String>,
        source: Box<dyn std::error::Error + Send + Sync>,
    ) -> Self {
        Self::Parse {
            message: message.into(),
            source: Some(source),
        }
    }

    pub fn buffer(message: impl Into<String>) -> Self {
        Self::Buffer {
            message: message.into(),
            source: None,
        }
    }

    pub fn buffer_with_source(
        message: impl Into<String>,
        source: Box<dyn std::error::Error + Send + Sync>,
    ) -> Self {
        Self::Buffer {
            message: message.into(),
            source: Some(source),
        }
    }

    pub fn other(message: impl Into<String>) -> Self {
        Self::Other {
            message: message.into(),
            source: None,
        }
    }

    pub fn other_with_source(
        message: impl Into<String>,
        source: Box<dyn std::error::Error + Send + Sync>,
    ) -> Self {
        Self::Other {
            message: message.into(),
            source: Some(source),
        }
    }
}

/// 从 WasmCalError 转换为 JsValue
impl From<WasmCalError> for JsValue {
    fn from(error: WasmCalError) -> Self {
        JsValue::from_str(&error.to_string())
    }
}

/// 从 JsValue 转换为 WasmCalError
impl From<JsValue> for WasmCalError {
    fn from(js_value: JsValue) -> Self {
        let message = js_value
            .as_string()
            .unwrap_or_else(|| "Unknown JavaScript error".to_string());
        WasmCalError::JavaScript(message)
    }
}

/// 从 serde_json::Error 转换为 WasmCalError
impl From<serde_json::Error> for WasmCalError {
    fn from(err: serde_json::Error) -> Self {
        WasmCalError::parse(format!("JSON parsing error: {}", err))
    }
}

/// 兼容性别名，保持向后兼容
pub type WasmError = WasmCalError;
