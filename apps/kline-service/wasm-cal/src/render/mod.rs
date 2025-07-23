//! 渲染模块 - 负责图表的各种渲染功能

pub mod axis_renderer;
pub mod book_renderer;
pub mod chart_renderer;
pub mod cursor_style;
pub mod datazoom_renderer;
pub mod heat_renderer;
pub mod line_renderer;
pub mod overlay_renderer;
pub mod price_renderer;
pub mod volume_renderer;
pub mod renderer_factory;  // 新增：工厂模式

pub use chart_renderer::ChartRenderer;
pub use renderer_factory::{RendererFactory, RenderStrategy, KlineRenderStrategy, HeatmapRenderStrategy};
