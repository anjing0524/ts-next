//! 渲染策略 trait 定义

use crate::canvas::CanvasLayerType;
use crate::render::chart_renderer::RenderMode;
use crate::render::cursor_style::CursorStyle;
use crate::render::datazoom_renderer::{DragResult, DragState};
use crate::render::render_context::UnifiedRenderContext;
use crate::utils::error::WasmCalError;

/// 渲染上下文类型别名，使用新的统一渲染上下文
pub type RenderContext = UnifiedRenderContext;

/// 渲染错误类型别名，使用统一的错误类型
pub type RenderError = WasmCalError;

/// 渲染策略 trait
pub trait RenderStrategy: 'static {
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

    fn get_drag_state(&self) -> DragState {
        DragState::default()
    }
}
