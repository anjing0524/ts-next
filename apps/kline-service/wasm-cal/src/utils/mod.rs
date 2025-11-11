//! 工具模块 - 提供各种工具函数和类型

pub mod error;

pub mod time;

pub mod tick_calculator;

pub use error::{WasmCalError, WasmError};
pub use tick_calculator::calculate_optimal_tick;
