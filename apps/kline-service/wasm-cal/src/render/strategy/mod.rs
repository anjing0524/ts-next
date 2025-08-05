//! 渲染策略模块 - 提供渲染策略模式实现

pub mod render_strategy;
pub mod strategy_factory;

pub use render_strategy::{RenderContext, RenderStrategy};
pub use strategy_factory::RenderStrategyFactory;
