//! KlineProcess模块 - 持有K线数据和三层Canvas，提供统一的绘制函数
use crate::canvas::CanvasLayerType;
use crate::command::{CommandManager, CommandResult, Event};
use crate::config::{ChartConfig, ConfigManager};
use crate::kline_generated::kline::{KlineData, root_as_kline_data_with_opts};
use crate::performance::monitor::PerformanceMonitor;
use crate::render::ChartRenderer;
use crate::utils::WasmCalError;

use js_sys;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::OffscreenCanvas;

/// KlineProcess - 持有K线数据和渲染器，提供统一的绘制函数
#[wasm_bindgen]
pub struct KlineProcess {
    // 数据相关
    #[allow(dead_code)]
    data: Vec<u8>, // 原始FlatBuffer数据，拥有所有权
    // 配置管理
    config_manager: ConfigManager,
    // 渲染器
    chart_renderer: Option<ChartRenderer>,
    // 命令管理器
    command_manager: Option<CommandManager>,
    // 性能监控器
    performance_monitor: PerformanceMonitor,
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
        let data = Self::read_from_memory(memory_val, ptr_offset, data_length)?;
        Self::verify_kline_data_slice(&data)?;

        Ok(KlineProcess {
            data,
            config_manager: ConfigManager::new(),
            chart_renderer: None,
            command_manager: None,
            performance_monitor: PerformanceMonitor::new(),
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
        let width = base_canvas
            .width()
            .max(main_canvas.width())
            .max(overlay_canvas.width());
        let height = base_canvas
            .height()
            .max(main_canvas.height())
            .max(overlay_canvas.height());

        base_canvas.set_width(width);
        main_canvas.set_width(width);
        overlay_canvas.set_width(width);
        base_canvas.set_height(height);
        main_canvas.set_height(height);
        overlay_canvas.set_height(height);

        let parsed_data = Self::parse_kline_data_from_slice(&self.data)?;
        let static_data: KlineData<'static> = unsafe { std::mem::transmute(parsed_data) };

        let chart_renderer = ChartRenderer::new(
            &base_canvas,
            &main_canvas,
            &overlay_canvas,
            Some(static_data),
        )?;

        // 从渲染器获取共享状态并创建CommandManager
        let shared_state = chart_renderer.get_shared_state();
        self.command_manager = Some(CommandManager::new(shared_state));

        self.chart_renderer = Some(chart_renderer);
        Ok(())
    }

    /// 绘制所有图表
    #[wasm_bindgen]
    pub fn draw_all(&mut self) -> Result<(), JsValue> {
        if let Some(renderer) = &mut self.chart_renderer {
            // 使用性能监控器测量渲染操作
            self.performance_monitor
                .measure_render_performance("draw_all", || {
                    renderer.force_render();
                });
            Ok(())
        } else {
            Err(JsValue::from_str("Chart renderer not initialized"))
        }
    }

    fn handle_command_result(&mut self, result: CommandResult) {
        let renderer = match &mut self.chart_renderer {
            Some(r) => r,
            None => {
                return;
            }
        };

        match result {
            CommandResult::Redraw(_layer) => {
                // CommandManager 已经调用了 set_dirty，这里只需要触发渲染
                renderer.render();
            }
            CommandResult::RedrawAll => {
                renderer
                    .get_shared_state()
                    .canvas_manager
                    .borrow_mut()
                    .set_all_dirty();
                renderer.render();
            }
            CommandResult::LayoutChanged => {
                renderer.handle_layout_change();
            }
            CommandResult::CursorChanged(_style) => {
                // 光标样式变化时，检查是否有图层需要重绘
                let shared_state = renderer.get_shared_state();
                let has_dirty_layers = {
                    let canvas_manager = shared_state.canvas_manager.borrow();
                    canvas_manager.is_dirty(CanvasLayerType::Overlay)
                        || canvas_manager.is_dirty(CanvasLayerType::Main)
                        || canvas_manager.is_dirty(CanvasLayerType::Base)
                };
                if has_dirty_layers {
                    renderer.render();
                }
            }
            _ => {}
        }
    }

    #[wasm_bindgen]
    pub fn handle_mouse_move(&mut self, x: f64, y: f64) {
        // 记录交互事件功能已被删除
        // 如果需要交互统计，可以在这里添加简单的计数逻辑

        if let Some(cm) = &mut self.command_manager {
            let event = Event::MouseMove { x, y };
            let result = cm.execute(event);
            self.handle_command_result(result);
        }
    }

    #[wasm_bindgen]
    pub fn get_cursor_style(&self, x: f64, y: f64) -> String {
        // 首先检查CommandManager
        if let Some(cm) = &self.command_manager {
            // CommandManager已经实现了get_cursor_style方法
            if let Some(style) = cm.get_cursor_style_at(x, y) {
                return style.to_string();
            }
        }

        // 回退到ChartRenderer
        if let Some(renderer) = &self.chart_renderer {
            renderer.get_cursor_style(x, y).to_string()
        } else {
            "default".to_string()
        }
    }

    #[wasm_bindgen]
    pub fn handle_mouse_leave(&mut self) {
        if let Some(cm) = &mut self.command_manager {
            let event = Event::MouseLeave;
            let result = cm.execute(event);
            self.handle_command_result(result);
        }
    }

    #[wasm_bindgen]
    pub fn handle_wheel(&mut self, delta: f64, x: f64, y: f64) {
        if let Some(cm) = &mut self.command_manager {
            let event = Event::Wheel { delta, x, y };
            let result = cm.execute(event);
            self.handle_command_result(result);
        }
    }

    #[wasm_bindgen]
    pub fn handle_mouse_down(&mut self, x: f64, y: f64) -> bool {
        if let Some(cm) = &mut self.command_manager {
            let event = Event::MouseDown { x, y };
            let result = cm.execute(event);
            self.handle_command_result(result);
            true // 返回事件已处理
        } else {
            false // 没有命令管理器，事件未处理
        }
    }

    #[wasm_bindgen]
    pub fn handle_mouse_up(&mut self, x: f64, y: f64) -> bool {
        if let Some(cm) = &mut self.command_manager {
            let event = Event::MouseUp { x, y };
            let result = cm.execute(event);
            self.handle_command_result(result);
            true // 返回拖拽结束状态
        } else {
            false // 没有命令管理器，事件未处理
        }
    }

    #[wasm_bindgen]
    pub fn handle_mouse_drag(&mut self, x: f64, y: f64) {
        // MouseDrag is implicitly handled by MouseMove when is_dragging is true
        self.handle_mouse_move(x, y);
    }

    /// 从WASM内存中读取数据
    fn read_from_memory(
        memory_val: JsValue,
        ptr_offset: usize,
        data_length: usize,
    ) -> Result<Vec<u8>, JsValue> {
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
    pub fn set_render_mode(&mut self, mode: &str) -> Result<(), JsValue> {
        if let Some(renderer) = &mut self.chart_renderer {
            let render_mode = match mode {
                "kmap" => crate::render::chart_renderer::RenderMode::Kmap,
                "heatmap" => crate::render::chart_renderer::RenderMode::Heatmap,
                _ => return Err(JsValue::from_str(&format!("Unknown render mode: {mode}"))),
            };
            renderer.set_mode(render_mode);
        }
        Ok(())
    }

    #[wasm_bindgen]
    pub fn handle_canvas_resize(&mut self, width: f64, height: f64) {
        if let Some(renderer) = &mut self.chart_renderer {
            renderer.handle_canvas_resize(width, height);
        }
    }

    #[wasm_bindgen]
    pub fn update_config(&mut self, js_config: JsValue) -> Result<(), JsValue> {
        let config: ChartConfig = serde_wasm_bindgen::from_value(js_config)
            .map_err(|e| JsValue::from_str(&format!("配置解析失败: {}", e)))?;
        self.config_manager.config = config;
        self.config_manager.update_theme();
        if let Some(renderer) = &mut self.chart_renderer {
            renderer.update_config(&self.config_manager.config, self.config_manager.get_theme());
            renderer.force_render();
        }

        Ok(())
    }

    #[wasm_bindgen]
    pub fn get_config(&self) -> Result<JsValue, JsValue> {
        crate::serde_wasm_bindgen::to_value(&self.config_manager.config)
            .map_err(|e| JsValue::from_str(&format!("配置序列化失败: {}", e)))
    }

    #[wasm_bindgen]
    pub fn get_theme(&self) -> Result<JsValue, JsValue> {
        crate::serde_wasm_bindgen::to_value(self.config_manager.get_theme())
            .map_err(|e| JsValue::from_str(&format!("主题序列化失败: {}", e)))
    }
}
