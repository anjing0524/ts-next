//! 图表渲染器 - 整合所有模块，提供统一的渲染接口

use super::cursor_style::CursorStyle;
use super::render_context::SharedRenderState;
use super::strategy::{RenderContext, RenderStrategyFactory};
use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::config::ConfigManager;
use crate::data::DataManager;
use crate::kline_generated::kline::KlineData;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(message: &str);
}
use crate::layout::{self, ChartLayout, LayoutEngine, PaneId, Rect};
use crate::utils::{RenderThrottle, ThrottleConfig, WasmError};
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
    /// 策略工厂
    strategy_factory: RenderStrategyFactory,
    /// 渲染模式
    mode: RenderMode,
    /// 节流配置
    throttle_config: ThrottleConfig,
    /// 画布尺寸
    canvas_size: (f64, f64),
    /// 鼠标悬停的K线索引
    hover_candle_index: Option<usize>,
    /// 鼠标是否在图表区域内
    mouse_in_chart: bool,
    /// 鼠标X坐标
    mouse_x: f64,
    /// 鼠标Y坐标
    mouse_y: f64,
}

impl ChartRenderer {
    /// 创建图表渲染器
    pub fn new(
        base_canvas: &OffscreenCanvas,
        main_canvas: &OffscreenCanvas,
        overlay_canvas: &OffscreenCanvas,
        parsed_data: Option<KlineData<'static>>,
    ) -> Result<Self, WasmError> {
        let canvas_size = (base_canvas.width() as f64, base_canvas.height() as f64);
        let canvas_manager = CanvasManager::new(base_canvas, main_canvas, overlay_canvas)?;
        let data_manager = DataManager::new();
        let config_manager = ConfigManager::new();

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

        let shared_state = SharedRenderState::new(
            Rc::new(RefCell::new(canvas_manager)),
            Rc::new(RefCell::new(data_manager)),
            Rc::new(RefCell::new(initial_layout)),
            Rc::new(config_manager.theme),
            Some(Rc::new(config_manager.config)),
        );

        let mut renderer = Self {
            shared_state,
            strategy_factory: RenderStrategyFactory::new(),
            mode: RenderMode::Kmap,
            throttle_config: ThrottleConfig::default(),
            canvas_size,
            hover_candle_index: None,
            mouse_in_chart: false,
            mouse_x: 0.0,
            mouse_y: 0.0,
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

    /// 处理画布大小改变
    pub fn handle_canvas_resize(&mut self, width: f64, height: f64) {
        self.canvas_size = (width, height);
        self.update_layout();
        self.shared_state
            .data_manager
            .borrow_mut()
            .initialize_visible_range(&self.shared_state.layout.borrow());
        self.update_layout();
        {
            self.shared_state
                .canvas_manager
                .borrow_mut()
                .set_all_dirty();
        }
        self.force_render();
    }

    /// 设置渲染模式
    pub fn set_mode(&mut self, mode: RenderMode) {
        if self.mode != mode {
            self.mode = mode;
            self.update_layout();
            {
                self.shared_state
                    .canvas_manager
                    .borrow_mut()
                    .set_all_dirty();
            }
            self.force_render();
        }
    }

    /// 从JSON字符串加载配置
    pub fn load_config_from_json(&mut self, json: &str) -> Result<(), String> {
        let mut config_manager = ConfigManager::new();
        config_manager
            .load_from_json(json)
            .map_err(|e| e.to_string())?;
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
        if !RenderThrottle::should_render(&self.throttle_config) {
            return;
        }
        self.render_internal();
    }

    /// 强制渲染图表
    pub fn force_render(&self) {
        self.render_internal();
    }

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
                if layer_type != CanvasLayerType::Overlay {
                    ctx.clear_rect(0.0, 0.0, self.canvas_size.0, self.canvas_size.1);
                }
            }
        }

        let mut render_context = RenderContext::new(self.shared_state.clone(), None, self.mode);
        render_context.set_hover_index(self.hover_candle_index);
        render_context.set_mouse_position(self.mouse_x, self.mouse_y);

        if let Err(e) =
            self.strategy_factory
                .render_layers(&render_context, self.mode, &layers_to_render)
        {
            web_sys::console::error_1(&format!("渲染错误: {e:?}").into());
        }

        self.shared_state
            .canvas_manager
            .borrow_mut()
            .clear_all_dirty_flags();
    }

    /// 获取光标样式
    pub fn get_cursor_style(&self, x: f64, y: f64) -> CursorStyle {
        let render_context = RenderContext::new(self.shared_state.clone(), None, self.mode);
        self.strategy_factory
            .get_cursor_style(x, y, &render_context, self.mode)
    }

    /// 处理鼠标移动
    pub fn handle_mouse_move(&mut self, x: f64, y: f64) {
        self.mouse_x = x;
        self.mouse_y = y;

        let (needs_overlay_render, hover_changed, is_in_chart, new_hover_index) = {
            let layout = self.shared_state.layout.borrow();
            let heatmap_area_rect = layout.get_rect(&PaneId::HeatmapArea);
            let volume_chart_rect = layout.get_rect(&PaneId::VolumeChart);
            let is_in_main_or_volume =
                heatmap_area_rect.contains(x, y) || volume_chart_rect.contains(x, y);

            let mut new_idx = None;
            if is_in_main_or_volume {
                let data_manager = self.shared_state.data_manager.borrow();
                let (visible_start, _, _) = data_manager.get_visible();
                if layout.total_candle_width > 0.0 {
                    let relative_x = x - heatmap_area_rect.x;
                    let idx_in_visible = (relative_x / layout.total_candle_width).floor() as usize;
                    new_idx = Some(
                        (visible_start + idx_in_visible).min(
                            data_manager
                                .get_items()
                                .map_or(0, |i| i.len().saturating_sub(1)),
                        ),
                    );
                }
            }

            let hover_changed = new_idx != self.hover_candle_index;
            let chart_state_changed = is_in_main_or_volume != self.mouse_in_chart;
            let needs_render = hover_changed || chart_state_changed;

            (needs_render, hover_changed, is_in_main_or_volume, new_idx)
        };

        self.mouse_in_chart = is_in_chart;
        self.hover_candle_index = new_hover_index;

        if needs_overlay_render {
            {
                let mut canvas_manager = self.shared_state.canvas_manager.borrow_mut();
                canvas_manager.set_dirty(CanvasLayerType::Overlay, true);

                // 仅当新的 hover 索引有效时才刷新主画布，避免在空白区域移动鼠标时仍然触发订单簿重绘
                if hover_changed && new_hover_index.is_some() {
                    canvas_manager.set_dirty(CanvasLayerType::Main, true);
                }
            }
            self.render();
        }
    }

    /// 处理鼠标按下
    pub fn handle_mouse_down(&self, x: f64, y: f64) -> bool {
        let render_context = RenderContext::new(self.shared_state.clone(), None, self.mode);
        self.strategy_factory
            .handle_mouse_down(x, y, &render_context, self.mode)
    }

    /// 处理鼠标抬起
    pub fn handle_mouse_up(&self, x: f64, y: f64) -> bool {
        let render_context = RenderContext::new(self.shared_state.clone(), None, self.mode);
        self.strategy_factory
            .handle_mouse_up(x, y, &render_context, self.mode)
    }

    // 处理鼠标拖动
    pub fn handle_mouse_drag(&mut self, x: f64, y: f64) -> bool {
        let render_context = RenderContext::new(self.shared_state.clone(), None, self.mode);
        let drag_result = self
            .strategy_factory
            .handle_mouse_drag(x, y, &render_context, self.mode);

        match drag_result {
            super::datazoom_renderer::DragResult::Released
            | super::datazoom_renderer::DragResult::NeedRedraw => {
                self.update_layout();
                {
                    let mut canvas_manager = self.shared_state.canvas_manager.borrow_mut();
                    canvas_manager.set_dirty(CanvasLayerType::Main, true);
                    canvas_manager.set_dirty(CanvasLayerType::Base, true);
                    canvas_manager.set_dirty(CanvasLayerType::Overlay, true); // 新增：拖动时也更新Overlay层
                }
                self.force_render();
                true
            }
            super::datazoom_renderer::DragResult::None => false,
        }
    }

    /// 处理鼠标离开
    /// 鼠标离开整个图表容器后，立即清理交互层显示（主图与成交量图均离开时）
    pub fn handle_mouse_leave(&mut self) -> bool {
        // 将状态重置为“已离开图表区域”
        self.mouse_in_chart = false;
        self.hover_candle_index = None;

        // 让各渲染策略执行必要的离开清理逻辑
        let render_context = RenderContext::new(self.shared_state.clone(), None, self.mode);
        self.strategy_factory
            .handle_mouse_leave(&render_context, self.mode);

        // 标记 Overlay 图层为脏，强制重新渲染以清理十字线、浮框等交互元素
        {
            self.shared_state
                .canvas_manager
                .borrow_mut()
                .set_dirty(CanvasLayerType::Overlay, true);
        }
        self.force_render();
        true
    }

    // 处理鼠标滚轮
    pub fn handle_wheel(&mut self, delta: f64, x: f64, y: f64) {
        let handled = {
            let layout = self.shared_state.layout.borrow();
            let main_chart_rect = layout.get_rect(&PaneId::HeatmapArea);
            let is_in_chart = main_chart_rect.contains(x, y);

            if is_in_chart {
                let mut data_manager = self.shared_state.data_manager.borrow_mut();
                data_manager.handle_wheel(
                    x,
                    y,
                    delta,
                    main_chart_rect.x,
                    main_chart_rect.width,
                    is_in_chart,
                )
            } else {
                let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);
                if nav_rect.contains(x, y) {
                    if let Some(datazoom_renderer) = self.strategy_factory.get_datazoom_renderer() {
                        let ctx = RenderContext::new(self.shared_state.clone(), None, self.mode);
                        datazoom_renderer
                            .borrow_mut()
                            .handle_wheel(x, y, delta, &ctx)
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
        };

        if handled {
            self.update_layout();
            {
                let mut canvas_manager = self.shared_state.canvas_manager.borrow_mut();
                canvas_manager.set_dirty(CanvasLayerType::Base, true);
                canvas_manager.set_dirty(CanvasLayerType::Main, true);
            }
            self.force_render();
        }
    }
}
