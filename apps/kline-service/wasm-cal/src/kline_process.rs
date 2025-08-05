//! KlineProcess模块 - 持有K线数据和三层Canvas，提供统一的绘制函数
use crate::ChartRenderer;
use crate::config::{ChartConfig, ConfigManager};
use crate::kline_generated::kline::{KlineData, root_as_kline_data_with_opts};
use crate::utils::WasmCalError;

use js_sys;
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
    data: Vec<u8>, // 原始FlatBuffer数据，拥有所有权
    parsed_data: Option<KlineData<'static>>, // 解析后的数据，生命周期与data绑定
    // 配置管理
    config_manager: ConfigManager,
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
            "KlineProcess::new - Reading WASM memory: offset={ptr_offset}, length={data_length}"
        ));

        // 1. 从WASM内存中读取数据
        let data = Self::read_from_memory(memory_val, ptr_offset, data_length)?;
        // 2. 验证数据
        Self::verify_kline_data_slice(&data)?;
        // 3. 解析数据并设置到数据管理器
        time("KlineProcess::new - Parsing data");
        let parsed_data = Self::parse_kline_data_from_slice(&data)?;
        // WebAssembly内存安全保证：
        // 1. data: Vec<u8>拥有从WASM内存复制的完整数据所有权
        // 2. 在WebAssembly环境中，一旦JS通过内存传递数据给Rust，
        //    这块内存的生命周期由Rust的Vec<u8>控制
        // 3. KlineProcess实例存在期间，Vec<u8>不会被释放，因此
        //    KlineData的引用始终有效
        // 4. 这是零拷贝FlatBuffers解析的必要操作，避免数据复制
        let parsed_data: KlineData<'static> = unsafe { std::mem::transmute(parsed_data) };

        time_end("KlineProcess::new - Parsing data");
        log("KlineProcess initialized successfully.");
        Ok(KlineProcess {
            data,
            parsed_data: Some(parsed_data),
            config_manager: ConfigManager::new(),
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

        // 创建渲染器，并传入数据管理器引用
        let chart_renderer = ChartRenderer::new(
            &base_canvas,
            &main_canvas,
            &overlay_canvas,
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
                // 使用force_render确保初始渲染不被节流机制阻止
                chart_renderer.force_render();
            }
            None => {
                return Err(WasmCalError::render("未设置Canvas").into());
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
            .map_err(|_| WasmCalError::buffer("无法将提供的 JSValue 转换为 WebAssembly.Memory"))?;

        let buffer = memory.buffer();
        let memory_view = js_sys::Uint8Array::new_with_byte_offset_and_length(
            &buffer,
            ptr_offset as u32,
            data_length as u32,
        );

        let data = memory_view.to_vec();
        if data.len() != data_length {
            return Err(WasmCalError::buffer("Memory copy length mismatch").into());
        }

        Ok(data)
    }

    /// 验证FlatBuffer数据
    fn verify_kline_data_slice(bytes: &[u8]) -> Result<(), WasmCalError> {
        if bytes.len() < 8 {
            return Err(WasmCalError::validation("FlatBuffer数据长度不足"));
        }

        let identifier = String::from_utf8_lossy(&bytes[4..8]);
        if identifier != crate::kline_generated::kline::KLINE_DATA_IDENTIFIER {
            return Err(WasmCalError::validation(format!(
                "无效的FlatBuffer标识符, 期望: {}, 实际: {}",
                crate::kline_generated::kline::KLINE_DATA_IDENTIFIER,
                identifier
            )));
        }

        Ok(())
    }

    // Helper function to parse from a slice
    fn parse_kline_data_from_slice(data: &[u8]) -> Result<KlineData, WasmCalError> {
        Self::verify_kline_data_slice(data)?;
        let mut opts = flatbuffers::VerifierOptions::default();
        opts.max_tables = 1_000_000_000;
        root_as_kline_data_with_opts(&opts, data)
            .map_err(|e| WasmCalError::other(format!("Flatbuffer 解析失败: {e}")))
    }

    #[wasm_bindgen]
    pub fn handle_mouse_move(&mut self, x: f64, y: f64) {
        let chart_renderer = match &mut self.chart_renderer {
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
    pub fn handle_mouse_leave(&mut self) -> bool {
        let chart_renderer = match &mut self.chart_renderer {
            Some(renderer) => renderer,
            None => {
                return false;
            }
        };
        // 调用chart_renderer的鼠标离开处理函数，并返回是否需要重绘
        chart_renderer.handle_mouse_leave()
    }

    #[wasm_bindgen]
    pub fn handle_wheel(&mut self, delta: f64, x: f64, y: f64) {
        let chart_renderer = match &mut self.chart_renderer {
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
    pub fn handle_mouse_drag(&mut self, x: f64, y: f64) {
        let chart_renderer = match &mut self.chart_renderer {
            Some(renderer) => renderer,
            None => {
                return;
            }
        };
        // 调用chart_renderer的鼠标拖动处理函数
        chart_renderer.handle_mouse_drag(x, y);
    }

    /// 设置渲染模式（由React层调用）
    #[wasm_bindgen]
    pub fn set_render_mode(&mut self, mode: &str) -> Result<(), JsValue> {
        let chart_renderer = match &mut self.chart_renderer {
            Some(renderer) => renderer,
            None => return Err(JsValue::from_str("ChartRenderer not initialized")),
        };

        // 解析模式字符串并设置渲染模式
        let render_mode = match mode {
            "kmap" => crate::render::chart_renderer::RenderMode::Kmap,
            "heatmap" => crate::render::chart_renderer::RenderMode::Heatmap,
            _ => return Err(JsValue::from_str(&format!("Unknown render mode: {mode}"))),
        };

        chart_renderer.set_mode(render_mode);
        Ok(())
    }

    /// 处理鼠标点击事件（已废弃，模式切换由React层管理）
    #[wasm_bindgen]
    pub fn handle_click(&mut self, _x: f64, _y: f64) -> bool {
        // 模式切换逻辑已迁移到React层
        false
    }

    /// 设置配置JSON（动态切换主题/配色等）
    #[wasm_bindgen]
    pub fn set_config_json(&mut self, json: &str) -> Result<(), JsValue> {
        match &mut self.chart_renderer {
            Some(renderer) => renderer.load_config_from_json(json).map_err(JsValue::from),
            None => Err(JsValue::from_str("ChartRenderer not initialized")),
        }
    }

    /// 处理画布大小改变
    /// 当窗口大小改变时调用此方法，需要重新初始化可见范围
    #[wasm_bindgen]
    pub fn handle_canvas_resize(&mut self, width: f64, height: f64) {
        if let Some(renderer) = &mut self.chart_renderer {
            renderer.handle_canvas_resize(width, height);
        }
    }

    /// 使用 serde-wasm-bindgen 直接从 JsValue 更新配置
    /// 比 set_config_json 更高效，避免 JSON 字符串解析
    #[wasm_bindgen]
    pub fn update_config(&mut self, js_config: JsValue) -> Result<(), JsValue> {
        // 使用 serde-wasm-bindgen 直接从 JsValue 反序列化
        let config: ChartConfig = serde_wasm_bindgen::from_value(js_config)
            .map_err(|e| JsValue::from_str(&format!("配置解析失败: {}", e)))?;

        // 更新配置管理器
        self.config_manager.config = config;

        // 同步更新主题
        self.config_manager.update_theme();

        // 如果渲染器已初始化，更新渲染器的配置
        if let Some(renderer) = &mut self.chart_renderer {
            // 更新共享状态中的配置
            renderer.update_config(&self.config_manager.config, self.config_manager.get_theme());

            // 触发重新渲染
            renderer.force_render();
        }

        log(&format!(
            "配置已更新: symbol={}, theme={}",
            self.config_manager.config.symbol, self.config_manager.config.theme
        ));

        Ok(())
    }

    /// 使用 serde-wasm-bindgen 获取当前配置为 JsValue
    #[wasm_bindgen]
    pub fn get_config(&self) -> Result<JsValue, JsValue> {
        crate::serde_wasm_bindgen::to_value(&self.config_manager.config)
            .map_err(|e| JsValue::from_str(&format!("配置序列化失败: {}", e)))
    }

    /// 获取当前主题为 JsValue
    #[wasm_bindgen]
    pub fn get_theme(&self) -> Result<JsValue, JsValue> {
        crate::serde_wasm_bindgen::to_value(self.config_manager.get_theme())
            .map_err(|e| JsValue::from_str(&format!("主题序列化失败: {}", e)))
    }
}
