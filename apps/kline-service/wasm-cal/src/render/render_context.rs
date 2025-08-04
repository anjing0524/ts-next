//! 统一的渲染上下文管理
//! 使用 Rc<RefCell<T>> 解决借用检查问题，提供专用上下文对象

use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::config::{ChartConfig, ChartTheme};
use crate::data::DataManager;
use crate::layout::ChartLayout;
use crate::render::chart_renderer::RenderMode;
use crate::utils::error::WasmCalError;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 共享渲染状态，使用 Rc<RefCell<T>> 管理所有可变状态
#[derive(Clone)]
pub struct SharedRenderState {
    /// Canvas 管理器
    pub canvas_manager: Rc<RefCell<CanvasManager>>,
    /// 数据管理器
    pub data_manager: Rc<RefCell<DataManager>>,
    /// 图表布局
    pub layout: Rc<RefCell<ChartLayout>>,
    /// 图表主题（通常不可变，但为了一致性使用 Rc）
    pub theme: Rc<ChartTheme>,
    /// 图表配置（可选）
    pub config: Option<Rc<ChartConfig>>,
}

impl SharedRenderState {
    /// 创建新的共享渲染状态
    pub fn new(
        canvas_manager: Rc<RefCell<CanvasManager>>,
        data_manager: Rc<RefCell<DataManager>>,
        layout: Rc<RefCell<ChartLayout>>,
        theme: Rc<ChartTheme>,
        config: Option<Rc<ChartConfig>>,
    ) -> Self {
        Self {
            canvas_manager,
            data_manager,
            layout,
            theme,
            config,
        }
    }
}

/// 绘制上下文，专门处理 Canvas 绘制操作
pub struct DrawContext {
    /// 共享状态
    pub shared: SharedRenderState,
    /// Canvas 上下文（如果可用）
    pub ctx: Option<OffscreenCanvasRenderingContext2d>,
    /// 当前渲染模式
    pub mode: RenderMode,
    /// 渲染时间戳
    pub timestamp: f64,
}

impl DrawContext {
    /// 创建新的绘制上下文
    pub fn new(
        shared: SharedRenderState,
        ctx: Option<OffscreenCanvasRenderingContext2d>,
        mode: RenderMode,
    ) -> Self {
        Self {
            shared,
            ctx,
            mode,
            timestamp: 0.0,
        }
    }

    /// 获取 Canvas 上下文
    pub fn get_canvas_context(&self) -> Result<&OffscreenCanvasRenderingContext2d, WasmCalError> {
        self.ctx
            .as_ref()
            .ok_or_else(|| WasmCalError::canvas("Canvas context not available"))
    }

    /// 使用指定层的 Canvas 上下文执行操作
    pub fn with_layer_context<F, R>(&self, layer: CanvasLayerType, f: F) -> R
    where
        F: FnOnce(&OffscreenCanvasRenderingContext2d) -> R,
    {
        let canvas_manager = self.shared.canvas_manager.borrow();
        let ctx = canvas_manager.get_context(layer);
        f(ctx)
    }
}

/// 数据上下文，专门处理数据访问操作
pub struct DataContext {
    /// 共享状态
    pub shared: SharedRenderState,
}

impl DataContext {
    /// 创建新的数据上下文
    pub fn new(shared: SharedRenderState) -> Self {
        Self { shared }
    }

    /// 安全地访问数据管理器
    pub fn with_data_manager<F, R>(&self, f: F) -> Result<R, WasmCalError>
    where
        F: FnOnce(&DataManager) -> R,
    {
        let data_manager = self
            .shared
            .data_manager
            .try_borrow()
            .map_err(|_| WasmCalError::data("Data manager is already borrowed"))?;
        Ok(f(&data_manager))
    }

    /// 安全地修改数据管理器
    pub fn with_data_manager_mut<F, R>(&self, f: F) -> Result<R, WasmCalError>
    where
        F: FnOnce(&mut DataManager) -> R,
    {
        let mut data_manager = self
            .shared
            .data_manager
            .try_borrow_mut()
            .map_err(|_| WasmCalError::data("Data manager is already borrowed mutably"))?;
        Ok(f(&mut data_manager))
    }
}

/// 配置上下文，专门处理配置访问操作
pub struct ConfigContext {
    /// 共享状态
    pub shared: SharedRenderState,
}

impl ConfigContext {
    /// 创建新的配置上下文
    pub fn new(shared: SharedRenderState) -> Self {
        Self { shared }
    }

    /// 获取主题配置
    pub fn theme(&self) -> &ChartTheme {
        &self.shared.theme
    }

    /// 获取图表配置
    pub fn config(&self) -> Option<&ChartConfig> {
        self.shared.config.as_deref()
    }

    /// 安全地访问布局
    pub fn with_layout<F, R>(&self, f: F) -> Result<R, WasmCalError>
    where
        F: FnOnce(&ChartLayout) -> R,
    {
        let layout = self
            .shared
            .layout
            .try_borrow()
            .map_err(|_| WasmCalError::config("Layout is already borrowed"))?;
        Ok(f(&layout))
    }

    /// 安全地修改布局
    pub fn with_layout_mut<F, R>(&self, f: F) -> Result<R, WasmCalError>
    where
        F: FnOnce(&mut ChartLayout) -> R,
    {
        let mut layout = self
            .shared
            .layout
            .try_borrow_mut()
            .map_err(|_| WasmCalError::config("Layout is already borrowed mutably"))?;
        Ok(f(&mut layout))
    }
}

/// 统一的渲染上下文，兼容现有代码结构
pub struct UnifiedRenderContext {
    /// 共享状态
    pub shared: SharedRenderState,
    /// Canvas 上下文（如果可用）
    pub ctx: Option<OffscreenCanvasRenderingContext2d>,
    /// 当前渲染模式
    pub mode: RenderMode,
    /// 渲染时间戳
    pub timestamp: f64,
    /// 视口信息
    pub viewport: ViewportInfo,
    /// 鼠标悬浮的K线索引（用于订单簿等需要悬浮状态的渲染器）
    pub hover_index: Option<usize>,
    /// 鼠标X坐标
    pub mouse_x: f64,
    /// 鼠标Y坐标
    pub mouse_y: f64,
}

impl UnifiedRenderContext {
    /// 创建新的统一渲染上下文
    pub fn new(
        shared: SharedRenderState,
        ctx: Option<OffscreenCanvasRenderingContext2d>,
        mode: RenderMode,
    ) -> Self {
        Self {
            shared,
            ctx,
            mode,
            timestamp: 0.0,
            viewport: ViewportInfo::default(),
            hover_index: None,
            mouse_x: 0.0,
            mouse_y: 0.0,
        }
    }

    /// 创建带有悬浮索引的统一渲染上下文
    pub fn new_with_hover(
        shared: SharedRenderState,
        ctx: Option<OffscreenCanvasRenderingContext2d>,
        mode: RenderMode,
        hover_index: Option<usize>,
    ) -> Self {
        Self {
            shared,
            ctx,
            mode,
            timestamp: 0.0,
            viewport: ViewportInfo::default(),
            hover_index,
            mouse_x: 0.0,
            mouse_y: 0.0,
        }
    }

    /// 从共享状态创建
    pub fn from_shared(shared: SharedRenderState) -> Self {
        Self::new(shared, None, RenderMode::Kmap)
    }

    /// 设置悬浮索引
    pub fn set_hover_index(&mut self, hover_index: Option<usize>) {
        self.hover_index = hover_index;
    }

    /// 设置鼠标位置
    pub fn set_mouse_position(&mut self, x: f64, y: f64) {
        self.mouse_x = x;
        self.mouse_y = y;
    }

    /// 获取绘制上下文
    pub fn draw(&self) -> DrawContext {
        DrawContext::new(self.shared.clone(), self.ctx.clone(), self.mode)
    }

    /// 获取数据上下文
    pub fn data(&self) -> DataContext {
        DataContext::new(self.shared.clone())
    }

    /// 获取配置上下文
    pub fn config(&self) -> ConfigContext {
        ConfigContext::new(self.shared.clone())
    }

    /// 获取 Canvas 管理器的不可变借用
    pub fn canvas_manager_ref(&self) -> std::cell::Ref<CanvasManager> {
        self.shared.canvas_manager.borrow()
    }

    /// 获取数据管理器的不可变借用
    pub fn data_manager_ref(&self) -> std::cell::Ref<DataManager> {
        self.shared.data_manager.borrow()
    }

    /// 获取数据管理器的可变借用
    pub fn data_manager_mut_ref(&self) -> std::cell::RefMut<'_, DataManager> {
        self.shared.data_manager.borrow_mut()
    }

    /// 获取图表布局的不可变借用
    pub fn layout_ref(&self) -> std::cell::Ref<ChartLayout> {
        self.shared.layout.borrow()
    }

    /// 获取图表主题
    pub fn theme_ref(&self) -> &ChartTheme {
        &self.shared.theme
    }

    /// 获取图表配置
    pub fn config_ref(&self) -> Option<Rc<ChartConfig>> {
        self.shared.config.clone()
    }
}

/// 视口信息
#[derive(Debug, Clone)]
pub struct ViewportInfo {
    /// 视口宽度
    pub width: f64,
    /// 视口高度
    pub height: f64,
    /// X 轴偏移
    pub offset_x: f64,
    /// Y 轴偏移
    pub offset_y: f64,
    /// 缩放比例
    pub scale: f64,
}

impl Default for ViewportInfo {
    fn default() -> Self {
        Self {
            width: 800.0,
            height: 600.0,
            offset_x: 0.0,
            offset_y: 0.0,
            scale: 1.0,
        }
    }
}

/// 兼容性类型别名，保持向后兼容
pub type RenderContext = UnifiedRenderContext;
