//! src/command/action.rs
use crate::render::datazoom_renderer::DragHandleType;

/// 状态变更操作枚举 - 定义所有可能的状态变更
#[derive(Debug, Clone, Copy)]
pub enum StateMutation {
    /// 更新鼠标位置
    UpdateMousePosition { x: f64, y: f64 },
    
    /// 设置悬停状态
    UpdateHoverStatus { 
        is_in_chart_area: bool, 
        is_in_navigator: bool, 
        hover_candle_index: Option<usize> 
    },
    
    /// 开始拖拽操作
    StartDrag { 
        handle: DragHandleType, 
        start_x: f64, 
        start_y: f64, 
        visible_range: (usize, usize) 
    },
    
    /// 结束拖拽操作
    EndDrag,
    
    /// 更新可见范围
    UpdateVisibleRange { start: usize, count: usize },
    
    /// 重置鼠标状态
    ResetMouseState,
}