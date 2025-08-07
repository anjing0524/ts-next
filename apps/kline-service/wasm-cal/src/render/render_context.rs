//! 统一的渲染上下文管理
//! 使用 Rc<RefCell<T>> 解决借用检查问题，提供专用上下文对象

use crate::canvas::CanvasManager;
use crate::command::state::MouseState;
use crate::config::{ChartConfig, ChartTheme};
use crate::data::DataManager;
use crate::layout::ChartLayout;
use crate::render::chart_renderer::RenderMode;
use crate::render::strategy::strategy_factory::RenderStrategyFactory;

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
    /// 策略工厂
    pub strategy_factory: Rc<RefCell<RenderStrategyFactory>>,
    /// 鼠标状态（用于渲染器访问）
    pub mouse_state: Rc<RefCell<crate::command::state::MouseState>>,
}

impl SharedRenderState {
    /// 创建新的共享渲染状态
    pub fn new(
        canvas_manager: Rc<RefCell<CanvasManager>>,
        data_manager: Rc<RefCell<DataManager>>,
        layout: Rc<RefCell<ChartLayout>>,
        theme: Rc<ChartTheme>,
        config: Option<Rc<ChartConfig>>,
        strategy_factory: Rc<RefCell<RenderStrategyFactory>>,
        mouse_state: Rc<RefCell<crate::command::state::MouseState>>,
    ) -> Self {
        Self {
            canvas_manager,
            data_manager,
            layout,
            theme,
            config,
            strategy_factory,
            mouse_state,
        }
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
        }
    }

    /// 创建带有悬浮索引的统一渲染上下文（保留向后兼容）
    pub fn new_with_hover(
        shared: SharedRenderState,
        ctx: Option<OffscreenCanvasRenderingContext2d>,
        mode: RenderMode,
        _hover_index: Option<usize>,
    ) -> Self {
        Self {
            shared,
            ctx,
            mode,
            timestamp: 0.0,
            viewport: ViewportInfo::default(),
        }
    }

    /// 从共享状态创建
    pub fn from_shared(shared: SharedRenderState) -> Self {
        Self {
            shared,
            ctx: None,
            mode: RenderMode::Kmap,
            timestamp: 0.0,
            viewport: ViewportInfo::default(),
        }
    }

    /// 从共享状态和鼠标状态创建（保留向后兼容）
    pub fn from_shared_with_mouse_state(
        shared: SharedRenderState,
        _mouse_state: &MouseState,
    ) -> Self {
        Self::from_shared(shared)
    }

    /// 获取鼠标悬浮的K线索引
    pub fn hover_index(&self) -> Option<usize> {
        self.shared.mouse_state.borrow().hover_candle_index
    }

    /// 获取鼠标X坐标
    pub fn mouse_x(&self) -> f64 {
        self.shared.mouse_state.borrow().x
    }

    /// 获取鼠标Y坐标
    pub fn mouse_y(&self) -> f64 {
        self.shared.mouse_state.borrow().y
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
