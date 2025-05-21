//! 基础Canvas功能

use crate::utils::WasmError;
use wasm_bindgen::JsCast;
use web_sys::{OffscreenCanvas, OffscreenCanvasRenderingContext2d};

/// 获取Canvas上下文
pub fn get_canvas_context(
    canvas: &OffscreenCanvas,
) -> Result<OffscreenCanvasRenderingContext2d, WasmError> {
    canvas
        .get_context("2d")
        .map_err(|js_err| {
            WasmError::Canvas(format!("无法获取 OffscreenCanvas 2D 上下文: {:?}", js_err))
        })?
        .ok_or_else(|| WasmError::Canvas("获取到的 OffscreenCanvas 2D 上下文为空".into()))?
        .dyn_into::<OffscreenCanvasRenderingContext2d>()
        .map_err(|js_val| {
            WasmError::Canvas(format!(
                "无法将上下文转换为 CanvasRenderingContext2d, 实际类型: {}",
                js_val.js_typeof().as_string().unwrap_or("未知".into())
            ))
        })
}
