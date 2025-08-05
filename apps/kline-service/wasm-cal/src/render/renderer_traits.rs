//! 渲染器trait定义 - 基于Rust trait的可扩展渲染架构

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
    fn layer_type(&self) -> CanvasLayer {
        CanvasLayer::Main
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

/// 交互式渲染器trait - 支持用户交互的渲染器
pub trait InteractiveRenderer: Renderer {
    /// 处理鼠标移动事件
    fn handle_mouse_move(&mut self, _x: f64, _y: f64, _context: &RenderContext) -> bool {
        false
    }

    /// 处理点击事件
    fn handle_click(&mut self, _x: f64, _y: f64, _context: &RenderContext) -> bool {
        false
    }

    /// 处理滚轮事件
    fn handle_wheel(&mut self, _delta: f64, _x: f64, _y: f64, _context: &RenderContext) -> bool {
        false
    }

    /// 处理键盘事件
    fn handle_key_down(&mut self, _key: &str, _context: &RenderContext) -> bool {
        false
    }

    /// 获取当前光标样式
    fn get_cursor_style(&self, _x: f64, _y: f64, _context: &RenderContext) -> CursorStyle {
        CursorStyle::Default
    }

    /// 检查点是否在交互区域内
    fn is_point_in_interactive_area(&self, _x: f64, _y: f64, _context: &RenderContext) -> bool {
        false
    }
}

/// 缓存感知渲染器trait - 支持缓存机制的渲染器
pub trait CacheAwareRenderer: Renderer {
    /// 无效化缓存
    fn invalidate_cache(&mut self);

    /// 更新缓存
    fn update_cache(&mut self, context: &RenderContext);

    /// 检查缓存是否有效
    fn is_cache_valid(&self, context: &RenderContext) -> bool;

    /// 获取缓存统计信息
    fn cache_stats(&self) -> CacheStats;
}

/// 缓存统计信息
#[derive(Debug, Default)]
pub struct CacheStats {
    /// 缓存命中次数
    pub hits: usize,
    /// 缓存未命中次数
    pub misses: usize,
    /// 缓存大小（字节）
    pub size: usize,
    /// 最后更新时间
    pub last_update: f64,
}

/// 数据预处理渲染器trait - 支持数据预处理的渲染器
pub trait DataPreprocessingRenderer: Renderer {
    /// 预处理数据以提高渲染效率
    fn preprocess_data(
        &mut self,
        context: &RenderContext,
    ) -> Result<PreprocessingResult, RenderError>;

    /// 获取预处理缓存
    fn get_preprocessing_cache(&self) -> Option<&PreprocessingCache>;

    /// 清理预处理缓存
    fn clear_preprocessing_cache(&mut self);

    /// 检查是否需要重新预处理数据
    fn needs_preprocessing(&self, context: &RenderContext) -> bool;
}

/// 预处理结果
#[derive(Debug)]
pub struct PreprocessingResult {
    pub processed: bool,
    pub cache_hit: bool,
    pub processing_time: f64,
    pub data_size: usize,
}

/// 预处理缓存
#[derive(Debug)]
pub struct PreprocessingCache {
    pub timestamp: f64,
    pub data_hash: u64,
    pub processed_data: Vec<u8>,
    pub metadata: std::collections::HashMap<String, String>,
}

/// Canvas层枚举
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CanvasLayer {
    Base,    // 静态背景层
    Main,    // 数据渲染层
    Overlay, // 交互覆盖层
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

/// 光标样式枚举
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CursorStyle {
    Default,
    Pointer,
    Crosshair,
    Move,
    ResizeHorizontal,
    ResizeVertical,
    Grab,
    Grabbing,
    Wait,
    Help,
    Text,
}
