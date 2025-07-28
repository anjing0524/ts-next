//! 图表渲染器 - 整合所有模块，提供统一的渲染接口

use super::cursor_style::CursorStyle;
use super::strategy::{RenderContext, RenderStrategyFactory};
use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::config::{ChartConfig, ConfigManager};
use crate::data::DataManager;
use crate::kline_generated::kline::KlineData;
use crate::layout::ChartLayout;
use crate::utils::WasmError;
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
}

impl ChartRenderer {
    /// 创建图表渲染器
    pub fn new(
        base_canvas: &OffscreenCanvas,
        main_canvas: &OffscreenCanvas,
        overlay_canvas: &OffscreenCanvas,
        layout: ChartLayout,
        parsed_data: Option<KlineData<'static>>,
    ) -> Result<Self, WasmError> {
        // 创建Canvas管理器
        let canvas_manager = Rc::new(RefCell::new(CanvasManager::new(
            base_canvas,
            main_canvas,
            overlay_canvas,
            layout,
        )?));
        let data_manager = Rc::new(RefCell::new(DataManager::new()));
        match parsed_data {
            Some(data) => {
                let items = data.items().expect("Data must contain items");
                let tick = data.tick();
                let mut data_manager_ref = data_manager.borrow_mut();
                data_manager_ref.set_items(items, tick);
                let canvas_ref = canvas_manager.borrow();
                let layout = canvas_ref.layout.borrow();
                data_manager_ref.initialize_visible_range(&layout);
                data_manager_ref.calculate_data_ranges();
            }
            None => {
                return Err(WasmError::Data("No data provided".to_string()));
            }
        }
        // 创建渲染策略工厂（会自动注册所有默认策略）
        let strategy_factory = RenderStrategyFactory::new();

        // 创建配置管理器
        let config_manager = ConfigManager::new();

        Ok(Self {
            canvas_manager,
            data_manager,
            config_manager,
            strategy_factory,
            mode: RenderMode::Kmap,
        })
    }

    /// 创建图表渲染器（带配置）
    pub fn new_with_config(
        base_canvas: &OffscreenCanvas,
        main_canvas: &OffscreenCanvas,
        overlay_canvas: &OffscreenCanvas,
        layout: ChartLayout,
        parsed_data: Option<KlineData<'static>>,
        config: ChartConfig,
    ) -> Result<Self, WasmError> {
        let mut renderer = Self::new(
            base_canvas,
            main_canvas,
            overlay_canvas,
            layout,
            parsed_data,
        )?;
        renderer.update_config(config);
        Ok(renderer)
    }

    /// 获取当前渲染模式
    pub fn get_mode(&self) -> RenderMode {
        self.mode
    }

    /// 设置渲染模式（使用策略模式）
    pub fn set_mode(&mut self, mode: RenderMode) {
        self.mode = mode;
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
        // 1. 获取可见范围 - 使用作用域限制借用生命周期
        let visible_count = {
            let data_manager_ref = self.data_manager.borrow();
            let (_, visible_count, _) = data_manager_ref.get_visible();
            visible_count
        };

        // 2. 更新布局以适应当前可见K线数量和渲染模式
        {
            let canvas_ref = self.canvas_manager.borrow();
            let mut layout = canvas_ref.layout.borrow_mut();
            // 先更新基本布局
            layout.update_for_visible_count(visible_count);

            // 根据当前模式应用相应的布局
            match self.mode {
                RenderMode::Kmap => layout.apply_kline_layout(),
                RenderMode::Heatmap => layout.apply_heatmap_layout(),
            }
        } // 在这里释放 layout 的可变借用

        // 3. 在渲染前先计算数据范围，确保所有渲染器使用相同的比例
        {
            let mut data_manager_ref = self.data_manager.borrow_mut();
            data_manager_ref.calculate_data_ranges();
        } // 在这里释放 data_manager 的可变借用

        // 4. 获取布局信息
        let canvas_ref = self.canvas_manager.borrow();
        let layout = canvas_ref.layout.borrow();

        // 5. 获取Canvas上下文
        let canvas_manager = self.canvas_manager.borrow();
        let base_ctx = canvas_manager.get_context(CanvasLayerType::Base);
        let main_ctx = canvas_manager.get_context(CanvasLayerType::Main);
        let overlay_ctx = canvas_manager.get_context(CanvasLayerType::Overlay);

        // 6. 清除所有画布内容
        base_ctx.clear_rect(0.0, 0.0, layout.canvas_width, layout.canvas_height);
        main_ctx.clear_rect(0.0, 0.0, layout.canvas_width, layout.canvas_height);
        // 只清除非导航器区域，以避免清除DataZoom
        overlay_ctx.clear_rect(0.0, 0.0, layout.canvas_width, layout.navigator_y);

        // Canvas已清除，所有缓存都需要重置（通过策略工厂处理）

        // 7. 创建渲染上下文
        let render_context = RenderContext {
            canvas_manager: &self.canvas_manager,
            data_manager: &self.data_manager,
            layout: &self.canvas_manager.borrow().layout,
            theme: &self.config_manager.theme,
            config: Some(&self.config_manager.config),
            mode: self.mode,
        };

        // 8. 使用策略工厂执行渲染（按图层分别渲染）
        if let Err(e) = self.strategy_factory.render_all(&render_context, self.mode) {
            // 错误处理：记录日志或采取其他措施
            web_sys::console::error_1(&format!("渲染错误: {:?}", e).into());
        }
    }

    /// 获取当前鼠标位置的光标样式
    pub fn get_cursor_style(&self, x: f64, y: f64) -> CursorStyle {
        let render_context = RenderContext {
            canvas_manager: &self.canvas_manager,
            data_manager: &self.data_manager,
            layout: &self.canvas_manager.borrow().layout,
            theme: &self.config_manager.theme,
            config: None,
            mode: self.mode,
        };

        self.strategy_factory
            .get_cursor_style(x, y, &render_context, self.mode)
    }

    /// 只重绘订单簿区域
    pub fn render_book_only(&self) {
        // 通过策略工厂重新渲染订单簿相关的策略
        let render_context = RenderContext {
            canvas_manager: &self.canvas_manager,
            data_manager: &self.data_manager,
            layout: &self.canvas_manager.borrow().layout,
            theme: &self.config_manager.theme,
            config: None,
            mode: self.mode,
        };

        // 只渲染Main图层的Book策略
        if let Err(e) =
            self.strategy_factory
                .render_layer(&render_context, self.mode, CanvasLayerType::Main)
        {
            web_sys::console::error_1(&format!("订单簿渲染错误: {:?}", e).into());
        }
    }

    /// 处理鼠标移动事件
    pub fn handle_mouse_move(&self, x: f64, y: f64) {
        let render_context = RenderContext {
            canvas_manager: &self.canvas_manager,
            data_manager: &self.data_manager,
            layout: &self.canvas_manager.borrow().layout,
            theme: &self.config_manager.theme,
            config: None,
            mode: self.mode,
        };

        self.strategy_factory
            .handle_mouse_move(x, y, &render_context, self.mode);
    }

    /// 处理鼠标按下事件
    pub fn handle_mouse_down(&self, x: f64, y: f64) -> bool {
        let render_context = RenderContext {
            canvas_manager: &self.canvas_manager,
            data_manager: &self.data_manager,
            layout: &self.canvas_manager.borrow().layout,
            theme: &self.config_manager.theme,
            config: None,
            mode: self.mode,
        };

        self.strategy_factory
            .handle_mouse_down(x, y, &render_context, self.mode)
    }

    /// 处理鼠标抬起事件
    pub fn handle_mouse_up(&self, x: f64, y: f64) -> bool {
        let render_context = RenderContext {
            canvas_manager: &self.canvas_manager,
            data_manager: &self.data_manager,
            layout: &self.canvas_manager.borrow().layout,
            theme: &self.config_manager.theme,
            config: None,
            mode: self.mode,
        };

        self.strategy_factory
            .handle_mouse_up(x, y, &render_context, self.mode)
    }

    // 处理鼠标拖动事件
    pub fn handle_mouse_drag(&self, x: f64, y: f64) -> bool {
        // 处理拖动逻辑，使用作用域确保借用在render调用前释放
        let drag_result = {
            let render_context = RenderContext {
                canvas_manager: &self.canvas_manager,
                data_manager: &self.data_manager,
                layout: &self.canvas_manager.borrow().layout,
                theme: &self.config_manager.theme,
                config: None,
                mode: self.mode,
            };

            self.strategy_factory
                .handle_mouse_drag(x, y, &render_context, self.mode)
        }; // 在这里释放所有借用

        // 根据拖拽结果决定是否需要重绘
        match drag_result {
            super::datazoom_renderer::DragResult::Released => {
                self.render();
                true
            }
            super::datazoom_renderer::DragResult::NeedRedraw => {
                self.render();
                true
            }
            super::datazoom_renderer::DragResult::None => false,
        }
    }

    // 处理鼠标离开事件 - 清除所有交互元素并重置拖动状态
    pub fn handle_mouse_leave(&self) -> bool {
        // 检查是否在拖动状态，使用作用域确保借用在render调用前释放
        let was_dragging = {
            let render_context = RenderContext {
                canvas_manager: &self.canvas_manager,
                data_manager: &self.data_manager,
                layout: &self.canvas_manager.borrow().layout,
                theme: &self.config_manager.theme,
                config: None,
                mode: self.mode,
            };

            self.strategy_factory
                .handle_mouse_leave(&render_context, self.mode)
        }; // 在这里释放所有借用

        // 如果之前在拖动，重绘图表并返回true表示已处理
        if was_dragging {
            self.render();
            return true;
        }

        false
    }

    // 处理鼠标滚轮事件
    pub fn handle_wheel(&self, delta: f64, x: f64, y: f64) {
        let render_context = RenderContext {
            canvas_manager: &self.canvas_manager,
            data_manager: &self.data_manager,
            layout: &self.canvas_manager.borrow().layout,
            theme: &self.config_manager.theme,
            config: None,
            mode: self.mode,
        };

        let should_render =
            self.strategy_factory
                .handle_wheel(x, y, delta, &render_context, self.mode);

        if should_render {
            self.render();
        }
    }

    /// 处理鼠标点击事件 (移除模式切换逻辑，专注于渲染)
    pub fn handle_click(&mut self, _x: f64, _y: f64) -> bool {
        // 模式切换逻辑已迁移到React层
        // Canvas点击事件不再用于模式切换
        false
    }
}
