use wasm_bindgen::prelude::*;

// 导入模块
mod canvas;
mod config;
mod data;
mod kline_generated;
mod kline_process;
mod layout;
mod render;
mod utils;

// 重新导出主要类型
pub use config::{ChartConfig, ChartTheme, ConfigManager, LocaleConfig};
pub use kline_process::KlineProcess;
pub use layout::ChartLayout;
pub use render::ChartRenderer;

// 设置panic钩子
#[wasm_bindgen(start)]
pub fn start() -> Result<(), JsValue> {
    console_error_panic_hook::set_once();
    Ok(())
}
