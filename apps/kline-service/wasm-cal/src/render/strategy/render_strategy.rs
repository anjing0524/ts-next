//! 渲染策略 trait 定义

use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::config::{ChartConfig, ChartTheme};
use crate::data::DataManager;
use crate::layout::ChartLayout;
use crate::render::chart_renderer::RenderMode;
use crate::render::cursor_style::CursorStyle;
use crate::render::datazoom_renderer::DragResult;
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::JsValue;

/// 渲染上下文
pub struct RenderContext<'a> {
    pub canvas_manager: &'a Rc<RefCell<CanvasManager>>,
    pub data_manager: &'a Rc<RefCell<DataManager>>,
    pub layout: &'a Rc<RefCell<ChartLayout>>,
    pub theme: &'a ChartTheme,
    pub config: Option<&'a ChartConfig>, // 可选的配置信息
    pub mode: RenderMode,
}

/// 渲染错误类型
#[derive(Debug)]
pub enum RenderError {
    JsError(JsValue),
    Custom(String),
}

impl From<JsValue> for RenderError {
    fn from(err: JsValue) -> Self {
        RenderError::JsError(err)
    }
}

impl std::fmt::Display for RenderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RenderError::JsError(_) => write!(f, "JavaScript error"),
            RenderError::Custom(msg) => write!(f, "Custom error: {}", msg),
        }
    }
}

impl std::error::Error for RenderError {}

/// 渲染策略 trait
pub trait RenderStrategy {
    /// 执行渲染操作
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError>;

    /// 检查是否支持指定的渲染模式
    fn supports_mode(&self, mode: RenderMode) -> bool;

    /// 获取渲染层类型
    fn get_layer_type(&self) -> CanvasLayerType;

    /// 获取渲染优先级，数值越小优先级越高
    fn get_priority(&self) -> u32 {
        0 // 默认优先级
    }

    // === 事件处理方法（可选实现） ===

    /// 获取鼠标位置的光标样式
    fn get_cursor_style(&self, _x: f64, _y: f64, _ctx: &RenderContext) -> CursorStyle {
        CursorStyle::Default
    }

    /// 处理鼠标移动事件
    fn handle_mouse_move(&mut self, _x: f64, _y: f64, _ctx: &RenderContext) -> bool {
        false // 默认不处理
    }

    /// 处理鼠标按下事件
    fn handle_mouse_down(&mut self, _x: f64, _y: f64, _ctx: &RenderContext) -> bool {
        false // 默认不处理
    }

    /// 处理鼠标抬起事件
    fn handle_mouse_up(&mut self, _x: f64, _y: f64, _ctx: &RenderContext) -> bool {
        false // 默认不处理
    }

    /// 处理鼠标拖动事件
    fn handle_mouse_drag(&mut self, _x: f64, _y: f64, _ctx: &RenderContext) -> DragResult {
        DragResult::None // 默认不处理
    }

    /// 处理鼠标离开事件
    fn handle_mouse_leave(&mut self, _ctx: &RenderContext) -> bool {
        false // 默认不处理
    }

    /// 处理鼠标滚轮事件
    fn handle_wheel(&mut self, _x: f64, _y: f64, _delta: f64, _ctx: &RenderContext) -> bool {
        false // 默认不处理
    }

    /// 强制重置拖动状态（用于鼠标离开等情况）
    fn force_reset_drag_state(&mut self) -> bool {
        false // 默认不处理
    }
}
