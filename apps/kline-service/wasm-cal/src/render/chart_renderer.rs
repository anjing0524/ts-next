//! 图表渲染器 - 整合所有模块，提供统一的渲染接口

use super::cursor_style::CursorStyle;
use super::render_context::SharedRenderState;
use super::strategy::{RenderContext, RenderStrategyFactory};
use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::config::{ChartConfig, ChartTheme, ConfigManager};
use crate::data::DataManager;

use std::collections::HashMap;
// 移除性能监控导入，ChartRenderer 专注于渲染

use crate::layout::{self, ChartLayout, LayoutEngine, Rect};
use crate::utils::WasmCalError;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvas;

// 定义渲染图形引擎
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum RenderMode {
    Kmap,    // K线图和成交量图
    Heatmap, // 热图和成交量图
}

/// 图表渲染器 - 负责协调各种渲染策略
pub struct ChartRenderer {
    /// 统一的共享状态
    shared_state: SharedRenderState,
    /// 渲染模式
    mode: RenderMode,
    /// 画布尺寸
    canvas_size: (f64, f64),
}

impl ChartRenderer {
    /// 创建图表渲染器
    pub fn new() -> Result<Self, WasmCalError> {
        let data_manager = DataManager::new();
        let config_manager = ConfigManager::new();
        let strategy_factory = RenderStrategyFactory::new();
        let mouse_state = Rc::new(RefCell::new(crate::command::state::MouseState::default()));

        // 初始布局和Canvas管理器将在 set_canvases 中创建
        let initial_layout = ChartLayout::new(HashMap::new(), 0);

        let shared_state = SharedRenderState::new(
            // CanvasManager 将在 set_canvases 中初始化
            Rc::new(RefCell::new(CanvasManager::new_uninitialized())),
            Rc::new(RefCell::new(data_manager)),
            Rc::new(RefCell::new(initial_layout)),
            Rc::new(config_manager.theme),
            Some(Rc::new(config_manager.config)),
            Rc::new(RefCell::new(strategy_factory)),
            mouse_state.clone(),
        );

        Ok(Self {
            shared_state,
            mode: RenderMode::Kmap,
            canvas_size: (0.0, 0.0),
        })
    }

    /// 设置初始数据
    pub fn set_initial_data(&mut self, data: Vec<u8>) {
        {
            let mut dm = self.shared_state.data_manager.borrow_mut();
            dm.set_initial_data(data);
        } // 释放借用
        // 初始化完成后，更新布局和数据范围
        self.full_recalculate();
    }

    /// 设置Canvases并完成初始化
    pub fn set_canvases(
        &mut self,
        base_canvas: OffscreenCanvas,
        main_canvas: OffscreenCanvas,
        overlay_canvas: OffscreenCanvas,
    ) -> Result<(), WasmCalError> {
        self.canvas_size = (base_canvas.width() as f64, base_canvas.height() as f64);
        let canvas_manager = CanvasManager::new(&base_canvas, &main_canvas, &overlay_canvas)?;
        *self.shared_state.canvas_manager.borrow_mut() = canvas_manager;

        // 现在我们有了canvas尺寸，可以进行完整的重新计算
        self.full_recalculate();
        Ok(())
    }

    /// 重新计算布局和数据范围
    fn full_recalculate(&mut self) {
        if self.canvas_size.0 > 0.0 && self.canvas_size.1 > 0.0 {
            self.update_layout();
            let mut data_manager = self.shared_state.data_manager.borrow_mut();
            if data_manager.len() > 0 {
                data_manager.initialize_visible_range(&self.shared_state.layout.borrow());
                // 在initialize_visible_range之后再次更新布局，以确保candle_width正确
                drop(data_manager);
                self.update_layout();
                self.shared_state
                    .data_manager
                    .borrow_mut()
                    .calculate_data_ranges();
            }
        }
    }

    pub fn get_shared_state(&self) -> SharedRenderState {
        self.shared_state.clone()
    }

    /// 核心：更新布局的方法
    fn update_layout(&mut self) {
        let layout_template = layout::create_layout_template(self.mode);
        let canvas_bounds = Rect {
            x: 0.0,
            y: 0.0,
            width: self.canvas_size.0,
            height: self.canvas_size.1,
        };
        let computed_panes = LayoutEngine::calculate(&layout_template, canvas_bounds);
        let visible_count = self.shared_state.data_manager.borrow().get_visible().1;
        let mut layout = self.shared_state.layout.borrow_mut();
        *layout = ChartLayout::new(computed_panes, visible_count);
    }

    pub fn handle_layout_change(&mut self) {
        self.update_layout();
        self.shared_state
            .canvas_manager
            .borrow_mut()
            .set_all_dirty();
        let _ = self.render();
    }

    /// 处理画布大小改变
    pub fn handle_canvas_resize(&mut self, width: f64, height: f64) {
        // 在resize时强制清理整个Overlay层，防止DataZoom等组件出现重影
        // 这是因为resize时布局可能发生变化，旧的渲染内容可能残留在新布局范围之外
        {
            let canvas_manager = self.shared_state.canvas_manager.borrow();
            let overlay_ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
            overlay_ctx.clear_rect(0.0, 0.0, self.canvas_size.0, self.canvas_size.1);
        }

        self.canvas_size = (width, height);
        self.update_layout();
        self.shared_state
            .data_manager
            .borrow_mut()
            .initialize_visible_range(&self.shared_state.layout.borrow());
        self.handle_layout_change();
    }

    /// 设置渲染模式
    pub fn set_mode(&mut self, mode: RenderMode) {
        if self.mode != mode {
            self.mode = mode;
            self.handle_layout_change();
        }
    }

    /// 从JSON字符串加载配置
    pub fn load_config_from_json(&mut self, json: &str) -> Result<(), WasmCalError> {
        let mut config_manager = ConfigManager::new();
        config_manager.load_from_json(json)?;
        self.shared_state.theme = Rc::new(config_manager.theme);
        self.shared_state.config = Some(Rc::new(config_manager.config));
        self.shared_state
            .canvas_manager
            .borrow_mut()
            .set_all_dirty();
        Ok(())
    }

    /// 渲染图表
    ///
    /// 执行图表渲染操作。如果不需要处理错误，可以使用 `let _ = renderer.render();` 忽略返回值。
    /// 节流控制已移至CommandManager层面处理。
    pub fn render(&self) -> Result<(), WasmCalError> {
        // 如果canvas未设置，则不执行渲染
        if self.canvas_size.0 == 0.0 || self.canvas_size.1 == 0.0 {
            return Ok(());
        }

        let layers_to_render = {
            let canvas_manager = self.shared_state.canvas_manager.borrow();
            let mut layers = Vec::new();
            if canvas_manager.is_dirty(CanvasLayerType::Base) {
                layers.push(CanvasLayerType::Base);
            }
            if canvas_manager.is_dirty(CanvasLayerType::Main) {
                layers.push(CanvasLayerType::Main);
            }
            if canvas_manager.is_dirty(CanvasLayerType::Overlay) {
                layers.push(CanvasLayerType::Overlay);
            }
            layers
        };

        if layers_to_render.is_empty() {
            return Ok(());
        }

        // 执行渲染
        if layers_to_render.contains(&CanvasLayerType::Main) {
            self.shared_state
                .data_manager
                .borrow_mut()
                .calculate_data_ranges();
        }

        {
            let canvas_manager = self.shared_state.canvas_manager.borrow();
            for &layer_type in &layers_to_render {
                let ctx = canvas_manager.get_context(layer_type);
                // 清理逻辑现在由各个渲染器自己决定，特别是OverlayRenderer
                if layer_type != CanvasLayerType::Overlay {
                    ctx.clear_rect(0.0, 0.0, self.canvas_size.0, self.canvas_size.1);
                }
            }
        }

        // 使用 from_shared 方法，它会自动从共享状态中获取鼠标信息
        let render_context = RenderContext::from_shared(self.shared_state.clone());

        let strategy_factory = self.shared_state.strategy_factory.borrow();

        strategy_factory.render_layers(&render_context, self.mode, &layers_to_render)?;

        self.shared_state
            .canvas_manager
            .borrow_mut()
            .clear_all_dirty_flags();

        Ok(())
    }

    /// 更新配置（供 KlineProcess 使用）
    pub fn update_config(&mut self, config: &ChartConfig, theme: &ChartTheme) {
        self.shared_state.theme = std::rc::Rc::new(theme.clone());
        self.shared_state.config = Some(std::rc::Rc::new(config.clone()));
    }

    /// 获取光标样式
    pub fn get_cursor_style(&self, x: f64, y: f64) -> CursorStyle {
        let render_context = RenderContext::new(self.shared_state.clone(), None, self.mode);
        let strategy_factory = self.shared_state.strategy_factory.borrow();
        strategy_factory.get_cursor_style(x, y, &render_context, self.mode)
    }
}
