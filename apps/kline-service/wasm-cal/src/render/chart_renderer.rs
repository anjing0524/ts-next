//! 图表渲染器 - 整合所有模块，提供统一的渲染接口

use super::cursor_style::CursorStyle;
use super::render_context::SharedRenderState;
use super::strategy::{RenderContext, RenderStrategyFactory};
use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::config::{ChartConfig, ChartTheme, ConfigManager};
use crate::data::DataManager;
use crate::kline_generated::kline::KlineData;
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
    // 移除性能监控器字段，保持渲染器职责单一
}

impl ChartRenderer {
    /// 创建图表渲染器
    pub fn new(
        base_canvas: &OffscreenCanvas,
        main_canvas: &OffscreenCanvas,
        overlay_canvas: &OffscreenCanvas,
        parsed_data: Option<KlineData<'static>>,
    ) -> Result<Self, WasmCalError> {
        let canvas_size = (base_canvas.width() as f64, base_canvas.height() as f64);
        let canvas_manager = CanvasManager::new(base_canvas, main_canvas, overlay_canvas)?;
        let data_manager = DataManager::new();
        let config_manager = ConfigManager::new();
        let strategy_factory = RenderStrategyFactory::new();

        let initial_layout = {
            let template = layout::create_layout_template(RenderMode::Kmap);
            let bounds = Rect {
                x: 0.0,
                y: 0.0,
                width: canvas_size.0,
                height: canvas_size.1,
            };
            let panes = LayoutEngine::calculate(&template, bounds);
            ChartLayout::new(panes, 0)
        };

        // 创建鼠标状态
        let mouse_state = Rc::new(RefCell::new(crate::command::state::MouseState::default()));

        let shared_state = SharedRenderState::new(
            Rc::new(RefCell::new(canvas_manager)),
            Rc::new(RefCell::new(data_manager)),
            Rc::new(RefCell::new(initial_layout)),
            Rc::new(config_manager.theme),
            Some(Rc::new(config_manager.config)),
            Rc::new(RefCell::new(strategy_factory)),
            mouse_state.clone(),
        );

        let mut renderer = Self {
            shared_state: shared_state.clone(),
            mode: RenderMode::Kmap,
            canvas_size,
        };

        if let Some(_data) = parsed_data {
            let items = _data.items().expect("Data must contain items");
            let tick = _data.tick();
            let mut dm = renderer.shared_state.data_manager.borrow_mut();
            dm.set_items(items, tick);
        }

        let items_len = renderer
            .shared_state
            .data_manager
            .borrow()
            .get_items()
            .map_or(0, |items| items.len());

        if items_len > 0 && renderer.canvas_size.0 > 0.0 && renderer.canvas_size.1 > 0.0 {
            renderer.update_layout();
            renderer
                .shared_state
                .data_manager
                .borrow_mut()
                .initialize_visible_range(&renderer.shared_state.layout.borrow());
            renderer.update_layout();
            renderer
                .shared_state
                .data_manager
                .borrow_mut()
                .calculate_data_ranges();
        }

        Ok(renderer)
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
        self.force_render();
    }

    /// 处理画布大小改变
    pub fn handle_canvas_resize(&mut self, width: f64, height: f64) {
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
    pub fn render(&self) {
        // 节流已移至CommandManager
        self.render_internal();
    }

    /// 强制渲染图表
    pub fn force_render(&self) {
        self.render_internal();
    }

    /// 更新配置（供 KlineProcess 使用）
    pub fn update_config(&mut self, config: &ChartConfig, theme: &ChartTheme) {
        self.shared_state.theme = std::rc::Rc::new(theme.clone());
        self.shared_state.config = Some(std::rc::Rc::new(config.clone()));
    }

    // 移除性能监控器相关方法

    /// 内部渲染方法
    fn render_internal(&self) {
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
            return;
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

        // 调试：检查 DataZoom 渲染器是否被包含在渲染列表中

        let _ = strategy_factory.render_layers(&render_context, self.mode, &layers_to_render);

        self.shared_state
            .canvas_manager
            .borrow_mut()
            .clear_all_dirty_flags();
    }

    /// 获取光标样式
    pub fn get_cursor_style(&self, x: f64, y: f64) -> CursorStyle {
        let render_context = RenderContext::new(self.shared_state.clone(), None, self.mode);
        let strategy_factory = self.shared_state.strategy_factory.borrow();
        strategy_factory.get_cursor_style(x, y, &render_context, self.mode)
    }
}
