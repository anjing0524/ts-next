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
    #[allow(dead_code)]
    data: Vec<u8>, // 原始FlatBuffer数据
    parsed_data: Option<KlineData<'static>>, // 解析后的数据
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
        // 3. 解析数据并设置到数据管理器
        time("KlineProcess::new - Parsing data");
        let parsed_data = Self::parse_kline_data_from_slice(&data)?;
        // 持久化解析后的数据生命周期
        let parsed_data: KlineData<'static> = unsafe { std::mem::transmute(parsed_data) };
        time_end("KlineProcess::new - Parsing data");
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

        // 创建渲染器，并传入数据管理器引用
        let chart_renderer = ChartRenderer::new(
            &base_canvas,
            &main_canvas,
            &overlay_canvas,
            layout,
            self.parsed_data,
        )?;

        self.chart_renderer = Some(chart_renderer);
        Ok(())
    }

    /// 绘制所有图表
    #[wasm_bindgen]
    pub fn draw_all(&self) -> Result<(), JsValue> {
        time("KlineProcess::draw_all");

        // 使用ChartRenderer绘制所有图表
        match &self.chart_renderer {
            Some(chart_renderer) => {
                chart_renderer.render();
            }
            None => {
                return Err(WasmError::Render("未设置Canvas".into()).into());
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
                WasmError::Buffer("无法将提供的 JSValue 转换为 WebAssembly.Memory".into())
            })?;

        let buffer = memory.buffer();
        let memory_view = js_sys::Uint8Array::new_with_byte_offset_and_length(
            &buffer,
            ptr_offset as u32,
            data_length as u32,
        );

        let data = memory_view.to_vec();
        if data.len() != data_length {
            return Err(WasmError::Buffer("Memory copy length mismatch".into()).into());
        }

        Ok(data)
    }

    /// 验证FlatBuffer数据
    fn verify_kline_data_slice(bytes: &[u8]) -> Result<(), WasmError> {
        if bytes.len() < 8 {
            return Err(WasmError::Validation("FlatBuffer数据长度不足".into()));
        }

        let identifier = String::from_utf8_lossy(&bytes[4..8]);
        if identifier != crate::kline_generated::kline::KLINE_DATA_IDENTIFIER {
            return Err(WasmError::Validation(format!(
                "无效的FlatBuffer标识符, 期望: {}, 实际: {}",
                crate::kline_generated::kline::KLINE_DATA_IDENTIFIER,
                identifier
            )));
        }

        Ok(())
    }

    // Helper function to parse from a slice
    fn parse_kline_data_from_slice(data: &[u8]) -> Result<KlineData, WasmError> {
        Self::verify_kline_data_slice(data)?;
        let opts = flatbuffers::VerifierOptions {
            max_tables: 1_000_000_000,
            ..Default::default()
        };
        root_as_kline_data_with_opts(&opts, data)
            .map_err(|e| WasmError::Parse(format!("Flatbuffer 解析失败: {}", e)))
    }

    #[wasm_bindgen]
    pub fn handle_mouse_move(&self, x: f64, y: f64) {
        let chart_renderer = match &self.chart_renderer {
            Some(renderer) => renderer,
            None => {
                return;
            }
        };
        chart_renderer.handle_mouse_move(x, y);
    }

    /// 获取当前鼠标位置的光标样式
    #[wasm_bindgen]
    pub fn get_cursor_style(&self, x: f64, y: f64) -> String {
        let chart_renderer = match &self.chart_renderer {
            Some(renderer) => renderer,
            None => return "default".to_string(),
        };
        // 获取鼠标样式并转换为String返回给JavaScript
        chart_renderer.get_cursor_style(x, y).to_string()
    }

    #[wasm_bindgen]
    pub fn handle_mouse_leave(&self) -> bool {
        let chart_renderer = match &self.chart_renderer {
            Some(renderer) => renderer,
            None => {
                return false;
            }
        };
        // 调用chart_renderer的鼠标离开处理函数，并返回是否需要重绘
        chart_renderer.handle_mouse_leave()
    }

    #[wasm_bindgen]
    pub fn handle_wheel(&self, delta: f64, x: f64, y: f64) {
        let chart_renderer = match &self.chart_renderer {
            Some(renderer) => renderer,
            None => return,
        };
        // 即使在拖动状态下也处理滚轮事件
        chart_renderer.handle_wheel(delta, x, y);
    }

    /// 处理鼠标按下事件
    #[wasm_bindgen]
    pub fn handle_mouse_down(&self, x: f64, y: f64) -> bool {
        let chart_renderer = match &self.chart_renderer {
            Some(renderer) => renderer,
            None => {
                return false;
            }
        };
        chart_renderer.handle_mouse_down(x, y)
    }

    /// 处理鼠标释放事件
    #[wasm_bindgen]
    pub fn handle_mouse_up(&self, x: f64, y: f64) -> bool {
        let chart_renderer = match &self.chart_renderer {
            Some(renderer) => renderer,
            None => {
                return false;
            }
        };
        chart_renderer.handle_mouse_up(x, y)
    }

    /// 处理鼠标拖动事件
    #[wasm_bindgen]
    pub fn handle_mouse_drag(&self, x: f64, y: f64) {
        let chart_renderer = match &self.chart_renderer {
            Some(renderer) => renderer,
            None => {
                return;
            }
        };
        // 调用chart_renderer的鼠标拖动处理函数
        chart_renderer.handle_mouse_drag(x, y);
    }

    /// 处理鼠标点击事件（用于切换K线图/线图模式）
    #[wasm_bindgen]
    pub fn handle_click(&mut self, x: f64, y: f64) -> bool {
        let chart_renderer = match &mut self.chart_renderer {
            Some(renderer) => renderer,
            None => {
                return false;
            }
        };
        // 调用chart_renderer的处理点击事件方法
        chart_renderer.handle_click(x, y)
    }
}
