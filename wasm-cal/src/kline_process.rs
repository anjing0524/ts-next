//! KlineProcess模块 - 持有K线数据和三层Canvas，提供统一的绘制函数
use crate::ChartRenderer;
use crate::kline_generated::kline::{KlineData, root_as_kline_data_with_opts};
use crate::layout::ChartLayout;
use crate::utils::WasmError;

use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::OffscreenCanvas;

// --- Logging Helpers (moved from lib.rs) ---
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(message: &str);
    #[wasm_bindgen(js_namespace = console, js_name = time)]
    fn time(label: &str);
    #[wasm_bindgen(js_namespace = console, js_name = timeEnd)]
    fn time_end(label: &str);
}

/// KlineProcess - 持有K线数据和渲染器，提供统一的绘制函数
#[wasm_bindgen]
pub struct KlineProcess {
    // 数据相关
    data: Vec<u8>,                           // 原始FlatBuffer数据
    parsed_data: Option<KlineData<'static>>, // 解析后的数据，用于缓存 (移除了Rc)
    // 渲染器
    chart_renderer: Option<ChartRenderer>,
}

#[wasm_bindgen]
impl KlineProcess {
    /// 创建新的KlineProcess实例
    #[wasm_bindgen(constructor)]
    pub fn new(
        memory_val: JsValue,
        ptr_offset: usize,
        data_length: usize,
    ) -> Result<KlineProcess, JsValue> {
        log(&format!(
            "KlineProcess::new - Reading WASM memory: offset={}, length={}",
            ptr_offset, data_length
        ));

        // 1. 从WASM内存中读取数据
        let data = Self::read_from_memory(memory_val, ptr_offset, data_length)?;

        // 2. 验证数据
        Self::verify_kline_data_slice(&data)?;

        // 5. 解析数据并计算范围（初始）
        time("KlineProcess::new - Parsing and calculating ranges");
        let parsed_data = Self::parse_kline_data_from_slice(&data)?;
        // 初始化到常量里面
        // let (min_low, max_high, max_volume) = Self::calculate_data_ranges(&parsed_data)?;
        // 移除Rc，直接使用transmute
        let parsed_data = unsafe { std::mem::transmute(parsed_data) };
        time_end("KlineProcess::new - Parsing and calculating ranges");

        log("KlineProcess initialized successfully.");

        Ok(KlineProcess {
            data,
            parsed_data: Some(parsed_data),
            chart_renderer: None,
        })
    }

    /// 设置三层Canvas
    #[wasm_bindgen]
    pub fn set_canvases(
        &mut self,
        base_canvas: OffscreenCanvas,
        main_canvas: OffscreenCanvas,
        overlay_canvas: OffscreenCanvas,
    ) -> Result<(), JsValue> {
        // 获取最大尺寸，确保三层canvas一致
        let width = base_canvas
            .width()
            .max(main_canvas.width())
            .max(overlay_canvas.width());
        let height = base_canvas
            .height()
            .max(main_canvas.height())
            .max(overlay_canvas.height());

        // 强制三层canvas尺寸一致
        base_canvas.set_width(width);
        main_canvas.set_width(width);
        overlay_canvas.set_width(width);
        base_canvas.set_height(height);
        main_canvas.set_height(height);
        overlay_canvas.set_height(height);

        // 创建布局
        let layout = ChartLayout::new(width as f64, height as f64);
        // 创建渲染器
        let chart_renderer =
            ChartRenderer::new(&base_canvas, &main_canvas, &overlay_canvas, layout)?;
        self.chart_renderer = Some(chart_renderer);
        Ok(())
    }

    /// 绘制所有图表
    #[wasm_bindgen]
    pub fn draw_all(&self) -> Result<(), JsValue> {
        time("KlineProcess::draw_all");

        // 获取K线数据项 - 直接使用引用
        let items = if let Some(parsed_data) = &self.parsed_data {
            parsed_data
                .items()
                .ok_or_else(|| WasmError::ParseError("无K线数据项".into()))?
        } else {
            // 只有在没有缓存数据时才解析
            let parsed_data = self.parse_kline_data()?;
            parsed_data
                .items()
                .ok_or_else(|| WasmError::ParseError("无K线数据项".into()))?
        };

        // 使用ChartRenderer绘制所有图表
        match &self.chart_renderer {
            Some(chart_renderer) => {
                chart_renderer.render(items);
            }
            None => {
                return Err(WasmError::RenderError("未设置Canvas".into()).into());
            }
        }
        time_end("KlineProcess::draw_all");
        Ok(())
    }

    /// 从WASM内存中读取数据
    fn read_from_memory(
        memory_val: JsValue,
        ptr_offset: usize,
        data_length: usize,
    ) -> Result<Vec<u8>, JsValue> {
        // Cast JsValue to WebAssembly::Memory
        let memory = memory_val
            .dyn_into::<js_sys::WebAssembly::Memory>()
            .map_err(|_| {
                WasmError::BufferError("无法将提供的 JSValue 转换为 WebAssembly.Memory".into())
            })?;

        let buffer = memory.buffer();
        let memory_view = js_sys::Uint8Array::new_with_byte_offset_and_length(
            &buffer,
            ptr_offset as u32,
            data_length as u32,
        );

        let data = memory_view.to_vec();
        if data.len() != data_length {
            return Err(WasmError::BufferError("Memory copy length mismatch".into()).into());
        }

        Ok(data)
    }

    /// 验证FlatBuffer数据
    fn verify_kline_data_slice(bytes: &[u8]) -> Result<(), WasmError> {
        if bytes.len() < 8 {
            return Err(WasmError::ValidationError("FlatBuffer数据长度不足".into()));
        }

        let identifier = String::from_utf8_lossy(&bytes[4..8]);
        if identifier != crate::kline_generated::kline::KLINE_DATA_IDENTIFIER {
            return Err(WasmError::ValidationError(format!(
                "无效的FlatBuffer标识符, 期望: {}, 实际: {}",
                crate::kline_generated::kline::KLINE_DATA_IDENTIFIER,
                identifier
            )));
        }

        Ok(())
    }

    /// 解析K线数据 - 返回引用或克隆
    fn parse_kline_data(&self) -> Result<KlineData, WasmError> {
        // 如果已有解析好的数据，直接克隆
        if let Some(parsed_data) = &self.parsed_data {
            // 直接克隆数据，不需要Rc
            return Ok(parsed_data.clone());
        }
        // 只有在没有缓存时才进行解析
        let bytes = &self.data;
        Self::verify_kline_data_slice(bytes)?;
        let mut opts = flatbuffers::VerifierOptions::default();
        opts.max_tables = 1_000_000_000;
        root_as_kline_data_with_opts(&opts, bytes)
            .map_err(|e| WasmError::ParseError(format!("Flatbuffer 解析失败: {}", e)))
    }

    // Helper function to parse from a slice, avoiding borrow issues
    fn parse_kline_data_from_slice(data: &[u8]) -> Result<KlineData, WasmError> {
        Self::verify_kline_data_slice(data)?;
        let mut opts = flatbuffers::VerifierOptions::default();
        opts.max_tables = 1_000_000_000;
        root_as_kline_data_with_opts(&opts, data)
            .map_err(|e| WasmError::ParseError(format!("Flatbuffer 解析失败: {}", e)))
    }

    #[wasm_bindgen]
    pub fn handle_mouse_move(&self, x: f64, y: f64) {
        if let Some(chart_renderer) = &self.chart_renderer {
            log(&format!(
                "KlineProcess::handle_mouse_move - x={}, y={}",
                x, y
            ));

            // 获取K线数据项
            if let Some(parsed_data) = &self.parsed_data {
                if let Some(items) = parsed_data.items() {
                    // 调用渲染器的鼠标移动处理方法
                    chart_renderer.handle_mouse_move(x, y, items);
                    // 重新绘制覆盖层
                    chart_renderer.render_overlay(items);
                }
            }
        }
    }

    #[wasm_bindgen]
    pub fn handle_mouse_leave(&self) {
        if let Some(chart_renderer) = &self.chart_renderer {
            log("KlineProcess::handle_mouse_leave");

            // 调用渲染器的鼠标离开处理方法
            chart_renderer.handle_mouse_leave();
            chart_renderer.clear_overlay();
        }
    }

    #[wasm_bindgen]
    pub fn handle_wheel(&self, delta: f64, x: f64, y: f64) {
        log(&format!(
            "KlineProcess::handle_wheel - delta={}, x={}, y={}",
            delta, x, y
        ));
    }
}
