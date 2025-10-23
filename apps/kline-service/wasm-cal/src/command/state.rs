//! src/command/state.rs
use crate::render::datazoom_renderer::DragHandleType;

/// 统一的鼠标状态管理
#[derive(Debug, Clone, Default)]
pub struct MouseState {
    pub x: f64,
    pub y: f64,
    pub is_in_chart_area: bool, // 是否在主图表+成交量区域
    pub is_in_navigator: bool,  // 是否在导航器区域
    pub hover_candle_index: Option<usize>,
    pub last_hover_index: Option<usize>,
    // 拖动相关状态
    pub is_dragging: bool,
    pub drag_start_x: f64,
    pub drag_start_y: f64,
    pub drag_handle_type: DragHandleType, // 来自 DataZoomRenderer
    pub drag_start_visible_range: (usize, usize), // 拖动起始的可见范围
}
