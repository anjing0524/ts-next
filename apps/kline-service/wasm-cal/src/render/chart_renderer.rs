//! 图表渲染器 - 整合所有模块，提供统一的渲染接口

use super::SharedRenderState;
use super::cursor_style::CursorStyle;
use super::strategy::{RenderContext, RenderStrategyFactory};
use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::config::{ChartConfig, ConfigManager};
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
    /// Canvas管理器
    canvas_manager: Rc<RefCell<CanvasManager>>,
    /// 数据管理器
    data_manager: Rc<RefCell<DataManager>>,
    /// 配置管理器
    config_manager: ConfigManager,
    /// 策略工厂
    strategy_factory: RenderStrategyFactory,
    /// 渲染模式
    mode: RenderMode,
    /// 节流配置
    throttle_config: ThrottleConfig,
    /// 计算后的布局信息
    chart_layout: Rc<RefCell<ChartLayout>>,
    /// 画布尺寸
    canvas_size: (f64, f64),
    /// 鼠标悬停的K线索引
    hover_candle_index: Option<usize>,
    /// 鼠标是否在图表区域内
    mouse_in_chart: bool,
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
        let canvas_manager = Rc::new(RefCell::new(CanvasManager::new(
            base_canvas,
            main_canvas,
            overlay_canvas,
        )?));
        let data_manager = Rc::new(RefCell::new(DataManager::new()));

        // 临时创建默认布局以初始化
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

        let mut renderer = Self {
            canvas_manager,
            data_manager,
            config_manager: ConfigManager::new(),
            strategy_factory: RenderStrategyFactory::new(),
            mode: RenderMode::Kmap,
            throttle_config: ThrottleConfig::default(),
            chart_layout: Rc::new(RefCell::new(initial_layout)),
            canvas_size,
            hover_candle_index: None,
            mouse_in_chart: false,
        };

        // 先设置数据
        if let Some(_data) = parsed_data {
            let items = _data.items().expect("Data must contain items");
            let tick = _data.tick();
            let mut dm = renderer.data_manager.borrow_mut();
            dm.set_items(items, tick);
        }

        // 获取数据长度并在设置数据后重新计算布局
        let items_len = renderer
            .data_manager
            .borrow()
            .get_items()
            .map_or(0, |items| items.len());

        if items_len > 0 && renderer.canvas_size.0 > 0.0 && renderer.canvas_size.1 > 0.0 {
            log(&format!(
                "[ChartRenderer] 开始初始化可见范围 - 数据长度: {}, Canvas尺寸: {:?}",
                items_len, renderer.canvas_size
            ));
            renderer.update_layout();
            renderer
                .data_manager
                .borrow_mut()
                .initialize_visible_range(&renderer.chart_layout.borrow());
            // 再次更新布局以使用正确的可见计数
            renderer.update_layout();
            renderer.data_manager.borrow_mut().calculate_data_ranges();
            log("[ChartRenderer] 可见范围初始化完成");
        } else {
            log(&format!(
                "[ChartRenderer] 跳过初始化 - items_len={}, canvas_size={:?}",
                items_len, renderer.canvas_size
            ));
        }

        Ok(renderer)
    }

    /// 核心：更新布局的方法
    fn update_layout(&mut self) {
        // 1. 根据当前模式生成布局定义
        let layout_template = layout::create_layout_template(self.mode);

        // 2. 获取画布尺寸
        let canvas_bounds = Rect {
            x: 0.0,
            y: 0.0,
            width: self.canvas_size.0,
            height: self.canvas_size.1,
        };

        // 3. 调用布局引擎计算
        let computed_panes = LayoutEngine::calculate(&layout_template, canvas_bounds);

        // 4. 获取可见K线数
        let visible_count = self.data_manager.borrow().get_visible().1;

        // 5. 创建新的 ChartLayout 实例并替换旧的
        self.chart_layout = Rc::new(RefCell::new(ChartLayout::new(
            computed_panes,
            visible_count,
        )));
    }

    /// 处理画布大小改变
    /// 当窗口大小改变时调用此方法，需要重新初始化可见范围
    pub fn handle_canvas_resize(&mut self, width: f64, height: f64) {
        // 更新画布尺寸
        self.canvas_size = (width, height);

        // 更新布局
        self.update_layout();

        // 重新初始化可见范围以适应新的尺寸
        self.data_manager
            .borrow_mut()
            .initialize_visible_range(&self.chart_layout.borrow());

        // 再次更新布局以使用正确的可见计数
        self.update_layout();

        // 强制重绘
        self.force_render();
    }

    /// 创建图表渲染器（带配置）
    pub fn new_with_config(
        base_canvas: &OffscreenCanvas,
        main_canvas: &OffscreenCanvas,
        overlay_canvas: &OffscreenCanvas,
        parsed_data: Option<KlineData<'static>>,
        config: ChartConfig,
    ) -> Result<Self, WasmError> {
        let mut renderer = Self::new(base_canvas, main_canvas, overlay_canvas, parsed_data)?;
        renderer.update_config(config);
        Ok(renderer)
    }

    /// 获取当前渲染模式
    pub fn get_mode(&self) -> RenderMode {
        self.mode
    }

    /// 设置渲染模式（使用策略模式）
    pub fn set_mode(&mut self, mode: RenderMode) {
        if self.mode != mode {
            self.mode = mode;
            self.update_layout();
            self.force_render();
        }
    }

    /// 更新配置
    pub fn update_config(&mut self, config: ChartConfig) {
        self.config_manager.config.symbol = config.symbol;
        self.config_manager.config.theme = config.theme;
        self.config_manager.update_theme();
        if let Some(custom_theme) = config.custom_theme {
            self.config_manager.theme = custom_theme.clone();
            self.config_manager.config.custom_theme = Some(custom_theme);
        }
    }

    /// 从JSON字符串加载配置
    pub fn load_config_from_json(&mut self, json: &str) -> Result<(), String> {
        self.config_manager
            .load_from_json(json)
            .map_err(|e| e.to_string())
    }

    /// 渲染图表 (使用策略模式重构)
    pub fn render(&self) {
        // 应用渲染节流机制
        if !RenderThrottle::should_render(&self.throttle_config) {
            return;
        }
        self.render_internal();
    }

    /// 强制渲染图表（忽略节流限制）
    /// 用于需要立即更新的场景，如窗口大小改变、数据更新等
    pub fn force_render(&self) {
        self.render_internal();
    }

    /// 内部渲染方法，绕过节流检查
    fn render_internal(&self) {
        // 1. 重要：不再每次渲染都重置可见范围！
        // 只重新计算数据范围，保持用户设置的可见范围
        self.data_manager.borrow_mut().calculate_data_ranges();

        // 2. 获取Canvas上下文
        let canvas_manager = self.canvas_manager.borrow();
        let base_ctx = canvas_manager.get_context(CanvasLayerType::Base);
        let main_ctx = canvas_manager.get_context(CanvasLayerType::Main);
        let _overlay_ctx = canvas_manager.get_context(CanvasLayerType::Overlay);

        // 3. 清除画布内容 - 区分不同层级的清理策略
        base_ctx.clear_rect(0.0, 0.0, self.canvas_size.0, self.canvas_size.1);
        main_ctx.clear_rect(0.0, 0.0, self.canvas_size.0, self.canvas_size.1);
        // overlay层保留datazoom等持久化交互元素，只清除临时交互元素
        // 由具体的渲染器负责清理各自的区域

        // 4. 创建渲染上下文
        let shared_state = SharedRenderState {
            canvas_manager: self.canvas_manager.clone(),
            data_manager: self.data_manager.clone(),
            layout: self.chart_layout.clone(), // 传递当前计算好的布局
            theme: Rc::new(self.config_manager.theme.clone()),
            config: Some(Rc::new(self.config_manager.config.clone())),
        };
        let mut render_context = RenderContext::new(shared_state, None, self.mode);
        render_context.set_hover_index(self.hover_candle_index);

        // 5. 使用策略工厂执行渲染（按图层分别渲染）
        if let Err(e) = self.strategy_factory.render_all(&render_context, self.mode) {
            // 错误处理：记录日志或采取其他措施
            web_sys::console::error_1(&format!("渲染错误: {:?}", e).into());
        }
    }

    /// 获取当前鼠标位置的光标样式
    pub fn get_cursor_style(&self, x: f64, y: f64) -> CursorStyle {
        let shared = SharedRenderState {
            canvas_manager: self.canvas_manager.clone(),
            data_manager: self.data_manager.clone(),
            layout: self.chart_layout.clone(),
            theme: Rc::new(self.config_manager.theme.clone()),
            config: None,
        };
        let render_context = RenderContext::new(shared, None, self.mode);

        self.strategy_factory
            .get_cursor_style(x, y, &render_context, self.mode)
    }

    /// 处理鼠标移动事件 - 安全地管理状态和借用
    pub fn handle_mouse_move(&mut self, x: f64, y: f64) {
        let (needs_render, hover_changed, is_in_chart, new_hover_index) = {
            // --- 借用作用域开始 ---
            let layout = self.chart_layout.borrow();
            let drawing_area = layout.get_rect(&PaneId::DrawingArea);
            let order_book_rect = layout.get_rect(&PaneId::OrderBook);

            // 获取K线/热图和成交量图的区域
            let heatmap_area_rect = layout.get_rect(&PaneId::HeatmapArea);
            let volume_chart_rect = layout.get_rect(&PaneId::VolumeChart);

            // 计算有效交互区域的底部边界
            let valid_interaction_bottom =
                heatmap_area_rect.y() + heatmap_area_rect.height() + volume_chart_rect.height();

            // 检查是否在订单簿区域内，并且在K线图+成交量图的垂直范围内
            let is_in_order_book = order_book_rect.contains(x, y) && y < valid_interaction_bottom;

            // 只有在主图形区域（非订单簿区域）时才认为在图表内
            let is_currently_in_chart = drawing_area.contains(x, y) && !is_in_order_book;

            let mut new_idx = None;
            if is_currently_in_chart {
                let data_manager = self.data_manager.borrow();
                let (visible_start, _, _) = data_manager.get_visible();
                let main_chart_rect = layout.get_rect(&PaneId::HeatmapArea);
                if layout.total_candle_width > 0.0 {
                    let relative_x = x - main_chart_rect.x;
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
            let chart_state_changed = is_currently_in_chart != self.mouse_in_chart;
            let needs_render = hover_changed || chart_state_changed || is_currently_in_chart;

            (needs_render, hover_changed, is_currently_in_chart, new_idx)
            // --- 借用作用域结束 ---
        };

        // 更新状态
        self.mouse_in_chart = is_in_chart;
        self.hover_candle_index = new_hover_index;

        // 调用渲染（现在是安全的）
        if needs_render {
            // 创建一个临时的RenderContext来传递给策略
            let shared = SharedRenderState {
                canvas_manager: self.canvas_manager.clone(),
                data_manager: self.data_manager.clone(),
                layout: self.chart_layout.clone(),
                theme: Rc::new(self.config_manager.theme.clone()),
                config: None,
            };
            let render_context = RenderContext::new(shared, None, self.mode);
            // 通知策略更新内部状态（如鼠标坐标）
            self.strategy_factory
                .handle_mouse_move(x, y, &render_context, self.mode);

            if hover_changed || !is_in_chart {
                self.force_render();
            } else {
                self.render();
            }
        }
    }

    /// 处理鼠标按下事件
    pub fn handle_mouse_down(&self, x: f64, y: f64) -> bool {
        let shared = SharedRenderState {
            canvas_manager: self.canvas_manager.clone(),
            data_manager: self.data_manager.clone(),
            layout: self.chart_layout.clone(),
            theme: Rc::new(self.config_manager.theme.clone()),
            config: None,
        };
        let render_context = RenderContext::new(shared, None, self.mode);

        self.strategy_factory
            .handle_mouse_down(x, y, &render_context, self.mode)
    }

    /// 处理鼠标抬起事件
    pub fn handle_mouse_up(&self, x: f64, y: f64) -> bool {
        let shared = SharedRenderState {
            canvas_manager: self.canvas_manager.clone(),
            data_manager: self.data_manager.clone(),
            layout: self.chart_layout.clone(),
            theme: Rc::new(self.config_manager.theme.clone()),
            config: None,
        };
        let render_context = RenderContext::new(shared, None, self.mode);

        self.strategy_factory
            .handle_mouse_up(x, y, &render_context, self.mode)
    }

    // 处理鼠标拖动事件
    pub fn handle_mouse_drag(&mut self, x: f64, y: f64) -> bool {
        // 处理拖动逻辑，使用作用域确保借用在render调用前释放
        let drag_result = {
            let shared = SharedRenderState {
                canvas_manager: self.canvas_manager.clone(),
                data_manager: self.data_manager.clone(),
                layout: self.chart_layout.clone(),
                theme: Rc::new(self.config_manager.theme.clone()),
                config: None,
            };
            let render_context = RenderContext::new(shared, None, self.mode);

            self.strategy_factory
                .handle_mouse_drag(x, y, &render_context, self.mode)
        }; // 在这里释放所有借用

        // 根据拖拽结果决定是否需要重绘和更新布局
        match drag_result {
            super::datazoom_renderer::DragResult::Released => {
                self.update_layout(); // 更新布局以反映新的可见范围
                self.force_render(); // 使用强制渲染以确保UI立即响应
                true
            }
            super::datazoom_renderer::DragResult::NeedRedraw => {
                self.update_layout(); // 更新布局以反映新的可见范围
                self.force_render(); // 使用强制渲染以确保拖动时UI流畅
                true
            }
            super::datazoom_renderer::DragResult::None => false,
        }
    }

    /// 处理鼠标离开事件
    pub fn handle_mouse_leave(&mut self) -> bool {
        if self.mouse_in_chart {
            self.mouse_in_chart = false;
            self.hover_candle_index = None;

            // 通知策略
            let shared = SharedRenderState {
                canvas_manager: self.canvas_manager.clone(),
                data_manager: self.data_manager.clone(),
                layout: self.chart_layout.clone(),
                theme: Rc::new(self.config_manager.theme.clone()),
                config: None,
            };
            let render_context = RenderContext::new(shared, None, self.mode);
            self.strategy_factory
                .handle_mouse_leave(&render_context, self.mode);

            self.force_render(); // 强制重绘以清除十字线和更新订单簿
            return true;
        }
        false
    }

    // 处理鼠标滚轮事件
    // 将滚轮事件委托给策略工厂处理，由具体的渲染策略决定如何响应
    pub fn handle_wheel(&mut self, delta: f64, x: f64, y: f64) {
        let handled = {
            let layout = self.chart_layout.borrow();
            let main_chart_rect = layout.get_rect(&PaneId::HeatmapArea);
            let is_in_chart = main_chart_rect.contains(x, y);

            if is_in_chart {
                // 主图区域的缩放
                let mut data_manager = self.data_manager.borrow_mut();
                data_manager.handle_wheel(
                    x,
                    y,
                    delta,
                    main_chart_rect.x,
                    main_chart_rect.width,
                    is_in_chart,
                )
            } else {
                // 检查是否在导航器区域
                let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);
                let is_in_nav = nav_rect.contains(x, y);

                if is_in_nav {
                    // 导航器区域的滚轮缩放由 DataZoomRenderer 处理
                    if let Some(datazoom_renderer) = self.strategy_factory.get_datazoom_renderer() {
                        // 创建 SharedRenderState
                        let shared_state = SharedRenderState::new(
                            self.canvas_manager.clone(),
                            self.data_manager.clone(),
                            self.chart_layout.clone(),
                            Rc::new(self.config_manager.get_theme().clone()),
                            None,
                        );
                        let ctx = RenderContext::new(shared_state, None, self.mode);
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
            self.force_render();
        }
    }

    /// 处理鼠标点击事件 (移除模式切换逻辑，专注于渲染)
    pub fn handle_click(&mut self, _x: f64, _y: f64) -> bool {
        // 模式切换逻辑已迁移到React层
        // Canvas点击事件不再用于模式切换
        false
    }
}
