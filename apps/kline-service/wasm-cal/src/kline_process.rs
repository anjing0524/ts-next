//! KlineProcess模块 - 持有K线数据和三层Canvas，提供统一的绘制函数
use crate::canvas::CanvasLayerType;
use crate::command::{CommandManager, CommandResult, Event};
use crate::config::{ChartConfig, ConfigManager};
use crate::data::KlineItemOwned;
use crate::kline_generated::kline::{root_as_kline_data, root_as_kline_data_with_opts};
use crate::performance::monitor::PerformanceMonitor;
use crate::render::ChartRenderer;
use crate::utils::WasmCalError;
use wasm_bindgen::prelude::*;
use web_sys::OffscreenCanvas;

/// KlineProcess - 持有K线数据和渲染器，提供统一的绘制函数
#[wasm_bindgen]
pub struct KlineProcess {
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
    ///
    /// # 参数
    /// * `initial_data` - 包含历史K线数据的 `Uint8Array`
    #[wasm_bindgen(constructor)]
    pub fn new(initial_data: Vec<u8>) -> Result<KlineProcess, JsValue> {
        // 验证数据
        Self::verify_kline_data_slice(&initial_data)?;

        // 创建 ChartRenderer，并将数据所有权移交
        let mut chart_renderer = ChartRenderer::new()?;
        chart_renderer.set_initial_data(initial_data);

        // 从渲染器获取共享状态并创建CommandManager
        let shared_state = chart_renderer.get_shared_state();
        let command_manager = CommandManager::new(shared_state);

        Ok(KlineProcess {
            config_manager: ConfigManager::new(),
            chart_renderer: Some(chart_renderer),
            command_manager: Some(command_manager),
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
        if let Some(renderer) = &mut self.chart_renderer {
            renderer.set_canvases(base_canvas, main_canvas, overlay_canvas)?;
            let _ = renderer.render();
        }
        Ok(())
    }

    /// 绘制所有图表
    #[wasm_bindgen]
    pub fn draw_all(&mut self) -> Result<(), JsValue> {
        if let Some(renderer) = &mut self.chart_renderer {
            // 使用性能监控器测量渲染操作
            self.performance_monitor
                .measure_render_performance("draw_all", || {
                    let _ = renderer.render();
                });
            Ok(())
        } else {
            Err(JsValue::from_str("Chart renderer not initialized"))
        }
    }

    /// 追加K线数据（用于实时数据流）
    #[wasm_bindgen]
    pub fn append_data(&mut self, data: Vec<u8>) -> Result<(), JsValue> {
        Self::verify_kline_data_slice(&data)?;
        let kline_data = root_as_kline_data(&data)
            .map_err(|e| WasmCalError::other(format!("Flatbuffer a解析失败: {e}")))?;

        if let Some(renderer) = &mut self.chart_renderer {
            let items_to_append: Vec<KlineItemOwned> =
                kline_data.items().map_or_else(Vec::new, |items| {
                    items
                        .iter()
                        .map(|item_ref| KlineItemOwned::from(&item_ref))
                        .collect()
                });

            if !items_to_append.is_empty() {
                let shared_state = renderer.get_shared_state();
                let mut data_manager = shared_state.data_manager.borrow_mut();
                let mut items_added = 0;
                for item in items_to_append {
                    if data_manager.append_item(item) {
                        items_added += 1;
                    }
                }

                if items_added > 0 {
                    drop(data_manager); // 释放借用
                    renderer.handle_layout_change(); // 触发完整的重绘
                }
            }
            Ok(())
        } else {
            Err(JsValue::from_str("Chart renderer not initialized"))
        }
    }

    /// 获取最后处理的数据的序列号（当前实现为获取tick值）
    #[wasm_bindgen]
    pub fn get_last_sequence(&self) -> f64 {
        if let Some(renderer) = &self.chart_renderer {
            let shared_state = renderer.get_shared_state();
            let data_manager = shared_state.data_manager.borrow();
            data_manager.get_tick()
        } else {
            -1.0
        }
    }

    /// 合并K线数据（用于数据补齐）
    ///
    /// 此方法接收一个FlatBuffers二进制数组，解析后与现有数据合并。
    /// 主要用于处理网络断连后，补充丢失的数据包。
    ///
    /// # 参数
    /// * `data` - 包含一条或多条K线数据的 `Uint8Array`
    #[wasm_bindgen]
    pub fn merge_data(&mut self, data: Vec<u8>) -> Result<(), JsValue> {
        Self::verify_kline_data_slice(&data)?;
        let kline_data = root_as_kline_data(&data)
            .map_err(|e| WasmCalError::other(format!("Flatbuffer a解析失败: {e}")))?;

        if let Some(renderer) = &mut self.chart_renderer {
            let items_to_merge: Vec<KlineItemOwned> =
                kline_data.items().map_or_else(Vec::new, |items| {
                    items
                        .iter()
                        .map(|item_ref| KlineItemOwned::from(&item_ref))
                        .collect()
                });

            if !items_to_merge.is_empty() {
                let shared_state = renderer.get_shared_state();
                let mut data_manager = shared_state.data_manager.borrow_mut();
                let merged_count = data_manager.merge_items(items_to_merge);

                if merged_count > 0 {
                    // 数据已合并且排序，需要完全重新计算布局和数据范围
                    drop(data_manager); // 释放借用
                    renderer.handle_layout_change(); // 触发完整的重绘
                }
            }
            Ok(())
        } else {
            Err(JsValue::from_str("Chart renderer not initialized"))
        }
    }

    // --- 事件处理和辅助函数 ---

    fn handle_command_result(&mut self, result: CommandResult) {
        let renderer = match &mut self.chart_renderer {
            Some(r) => r,
            None => return,
        };

        match result {
            CommandResult::Redraw(_) => {
                let _ = renderer.render();
            }
            CommandResult::RedrawAll => {
                renderer
                    .get_shared_state()
                    .canvas_manager
                    .borrow_mut()
                    .set_all_dirty();
                let _ = renderer.render();
            }
            CommandResult::LayoutChanged => {
                renderer.handle_layout_change();
            }
            CommandResult::CursorChanged(_) => {
                let shared_state = renderer.get_shared_state();
                let has_dirty_layers = {
                    let canvas_manager = shared_state.canvas_manager.borrow();
                    canvas_manager.is_dirty(CanvasLayerType::Overlay)
                        || canvas_manager.is_dirty(CanvasLayerType::Main)
                        || canvas_manager.is_dirty(CanvasLayerType::Base)
                };
                if has_dirty_layers {
                    let _ = renderer.render();
                }
            }
            _ => {}
        }
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
        let mut opts = flatbuffers::VerifierOptions::default();
        opts.max_tables = 1_000_000_000; // 增加限制以支持大数据
        root_as_kline_data_with_opts(&opts, bytes)
            .map_err(|e| WasmCalError::other(format!("Flatbuffer 验证失败: {e}")))?;
        Ok(())
    }

    // --- 其他WASM绑定函数保持不变 ---
    #[wasm_bindgen]
    pub fn handle_mouse_move(&mut self, x: f64, y: f64) {
        if let Some(cm) = &mut self.command_manager {
            let event = Event::MouseMove { x, y };
            let result = cm.execute(event);
            self.handle_command_result(result);
        }
    }

    #[wasm_bindgen]
    pub fn get_cursor_style(&self, x: f64, y: f64) -> String {
        if let Some(cm) = &self.command_manager {
            return cm.get_cursor_style_at(x, y).to_string();
        }
        "default".to_string()
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
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn handle_mouse_up(&mut self, x: f64, y: f64) -> bool {
        if let Some(cm) = &mut self.command_manager {
            let event = Event::MouseUp { x, y };
            let result = cm.execute(event);
            self.handle_command_result(result);
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn handle_mouse_drag(&mut self, x: f64, y: f64) {
        self.handle_mouse_move(x, y);
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
            let _ = renderer.render();
        }
        Ok(())
    }

    #[wasm_bindgen]
    pub fn get_config(&self) -> Result<JsValue, JsValue> {
        crate::serde_wasm_bindgen::to_value(&self.config_manager.config)
            .map_err(|e| JsValue::from_str(&format!("主题序列化失败: {}", e)))
    }

    #[wasm_bindgen]
    pub fn get_theme(&self) -> Result<JsValue, JsValue> {
        crate::serde_wasm_bindgen::to_value(self.config_manager.get_theme())
            .map_err(|e| JsValue::from_str(&format!("主题序列化失败: {}", e)))
    }
}
