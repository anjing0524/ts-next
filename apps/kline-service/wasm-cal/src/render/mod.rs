//! 渲染模块 - 负责图表的各种渲染功能

pub mod axis_renderer;
pub mod book_renderer;
pub mod chart_renderer;
pub mod cursor_style;
pub mod datazoom_renderer;
pub mod header_renderer;
pub mod heat_renderer;
pub mod line_renderer;
pub mod overlay_renderer;
pub mod price_renderer;
pub mod render_context; // 新增：统一渲染上下文
pub mod renderer_traits;
pub mod strategy;
pub mod tooltip_renderer; // 新增：Tooltip渲染器
pub mod volume_renderer; // 新增：策略模式 // 新增：高级渲染器架构

pub use chart_renderer::ChartRenderer;
pub use render_context::{
    ConfigContext, DataContext, DrawContext, RenderContext, SharedRenderState,
    UnifiedRenderContext, ViewportInfo,
};
