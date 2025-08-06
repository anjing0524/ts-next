use wasm_bindgen::prelude::*;

// 导入模块
pub mod canvas;
pub mod command;
pub mod config;
pub mod data;
pub mod kline_generated;
pub mod kline_process;
pub mod layout;
pub mod render;
pub mod utils;

// 重新导出主要类型
pub use config::{ChartConfig, ChartTheme, ConfigManager, LocaleConfig};
pub use kline_process::KlineProcess;
pub use layout::ChartLayout;
pub use render::ChartRenderer;

// 导出 serde-wasm-bindgen 以便其他模块使用
pub use serde_wasm_bindgen;

// 设置panic钩子
#[wasm_bindgen(start)]
pub fn start() -> Result<(), JsValue> {
    console_error_panic_hook::set_once();
    Ok(())
}
