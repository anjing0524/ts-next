//! 错误处理模块

use thiserror::Error;
use wasm_bindgen::JsValue;

/// WebAssembly错误类型
#[derive(Error, Debug)]
pub enum WasmError {
    /// Canvas相关错误
    #[error("Canvas错误: {0}")]
    Canvas(String),

    /// 数据处理错误
    #[error("数据处理错误: {0}")]
    Data(String),

    /// 渲染错误
    #[error("渲染错误: {0}")]
    Render(String),

    #[error("缓冲区错误: {0}")]
    Buffer(String),

    #[error("数据验证错误: {0}")]
    Validation(String),

    #[error("解析错误: {0}")]
    Parse(String),

    #[error("缓存数据错误: {0}")]
    Cache(String),

    /// 其他错误
    #[error("其他错误: {0}")]
    Other(String),
}

// 添加从 WasmError 到 JsValue 的自动转换实现
impl From<WasmError> for JsValue {
    fn from(error: WasmError) -> Self {
        JsValue::from_str(&error.to_string())
    }
}
