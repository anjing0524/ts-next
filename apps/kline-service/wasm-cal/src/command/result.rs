//! src/command/result.rs
use crate::canvas::CanvasLayerType;
use crate::render::cursor_style::CursorStyle;

/// 命令执行结果，指导后续操作
#[derive(Debug, Clone, PartialEq)]
pub enum CommandResult {
    /// 无操作
    None,
    /// 事件已处理，但无需重绘
    Handled,
    /// 需要重绘指定图层
    Redraw(CanvasLayerType),
    /// 需要重绘所有图层
    RedrawAll,
    /// 布局已改变，需要重新计算布局并重绘所有图层
    LayoutChanged,
    /// 光标样式已改变
    CursorChanged(CursorStyle),
}
