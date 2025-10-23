//! 渲染器trait定义 - 基于Rust trait的可扩展渲染架构

use crate::canvas::CanvasLayerType;
use crate::render::render_context::UnifiedRenderContext;
use crate::utils::error::WasmCalError;

/// 渲染错误类型别名，使用统一的错误类型
pub type RenderError = WasmCalError;

/// 渲染上下文类型别名，使用新的统一渲染上下文
pub type RenderContext = UnifiedRenderContext;

/// 基础渲染器trait - 所有渲染器必须实现的接口
pub trait Renderer: std::fmt::Debug {
    /// 获取渲染器名称
    fn name(&self) -> &'static str;

    /// 执行渲染操作
    fn render(&self, context: &RenderContext) -> Result<(), RenderError>;

    /// 检查是否需要重新渲染
    fn needs_render(&self, _context: &RenderContext) -> bool {
        true
    }

    /// 获取渲染优先级
    fn priority(&self) -> RenderPriority {
        RenderPriority::Normal
    }

    /// 获取渲染器支持的图层类型
    fn layer_type(&self) -> CanvasLayerType {
        CanvasLayerType::Main
    }

    /// 初始化渲染器
    fn initialize(&mut self) -> Result<(), RenderError> {
        Ok(())
    }

    /// 销毁渲染器资源
    fn destroy(&mut self) {
        // 默认实现为空
    }

    /// 重置渲染器状态
    fn reset(&mut self) {
        // 默认实现为空
    }
}

/// 渲染优先级枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum RenderPriority {
    Critical = 0,   // 必须立即渲染
    High = 1,       // 高优先级
    Normal = 2,     // 普通优先级
    Low = 3,        // 低优先级
    Background = 4, // 后台渲染
}
