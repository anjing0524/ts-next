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
// pub mod renderer_factory;  // 已移除：工厂模式，现在使用策略模式
pub mod advanced;
pub mod strategy; // 新增：策略模式 // 新增：高级渲染器架构

pub use chart_renderer::ChartRenderer;
