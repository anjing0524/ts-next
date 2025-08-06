//! 工具模块 - 提供各种工具函数和类型

pub mod error;
// pub mod throttle; // 已删除节流模块
pub mod time;

pub use error::{WasmCalError, WasmError};
// pub use throttle::{EventThrottle, RenderThrottle, ThrottleConfig}; // 已删除节流模块
