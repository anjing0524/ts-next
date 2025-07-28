//! 渲染器trait定义 - 基于Rust trait的可扩展渲染架构

use crate::config::ChartTheme;
use crate::data::DataManager;
use crate::layout::ChartLayout;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 渲染错误类型
#[derive(Debug)]
pub enum RenderError {
    /// 渲染上下文错误
    ContextError(String),
    /// 数据错误
    DataError(String),
    /// 配置错误
    ConfigError(String),
    /// 内存不足错误
    OutOfMemory,
    /// 其他错误
    Other(String),
}

impl std::fmt::Display for RenderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RenderError::ContextError(msg) => write!(f, "Context error: {}", msg),
            RenderError::DataError(msg) => write!(f, "Data error: {}", msg),
            RenderError::ConfigError(msg) => write!(f, "Config error: {}", msg),
            RenderError::OutOfMemory => write!(f, "Out of memory"),
            RenderError::Other(msg) => write!(f, "Other error: {}", msg),
        }
    }
}

impl std::error::Error for RenderError {}

/// 渲染上下文 - 封装渲染所需的所有上下文信息
pub struct RenderContext<'a> {
    /// Canvas上下文
    pub ctx: &'a OffscreenCanvasRenderingContext2d,
    /// 图表布局
    pub layout: &'a ChartLayout,
    /// 数据管理器
    pub data_manager: &'a Rc<RefCell<DataManager>>,
    /// 图表主题
    pub theme: &'a ChartTheme,
    /// 渲染时间戳
    pub timestamp: f64,
    /// 视口信息
    pub viewport: ViewportInfo,
}

/// 视口信息
#[derive(Debug, Clone)]
pub struct ViewportInfo {
    /// 视口宽度
    pub width: f64,
    /// 视口高度
    pub height: f64,
    /// 视口偏移X
    pub offset_x: f64,
    /// 视口偏移Y
    pub offset_y: f64,
    /// 缩放比例
    pub scale: f64,
}

impl Default for ViewportInfo {
    fn default() -> Self {
        Self {
            width: 0.0,
            height: 0.0,
            offset_x: 0.0,
            offset_y: 0.0,
            scale: 1.0,
        }
    }
}

/// 基础渲染器trait - 所有渲染器必须实现的接口
pub trait Renderer: std::fmt::Debug {
    /// 获取渲染器名称
    fn name(&self) -> &'static str;
    
    /// 执行渲染操作
    fn render(&self, context: &RenderContext) -> Result<(), RenderError>;
    
    /// 检查是否需要渲染（用于脏标记优化）
    fn needs_render(&self, context: &RenderContext) -> bool {
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
    fn handle_mouse_move(&mut self, x: f64, y: f64, context: &RenderContext) -> bool {
        false
    }
    
    /// 处理点击事件
    fn handle_click(&mut self, x: f64, y: f64, context: &RenderContext) -> bool {
        false
    }
    
    /// 处理滚轮事件
    fn handle_wheel(&mut self, delta: f64, x: f64, y: f64, context: &RenderContext) -> bool {
        false
    }
    
    /// 处理键盘事件
    fn handle_key_down(&mut self, key: &str, context: &RenderContext) -> bool {
        false
    }
    
    /// 获取当前光标样式
    fn get_cursor_style(&self, x: f64, y: f64, context: &RenderContext) -> CursorStyle {
        CursorStyle::Default
    }
    
    /// 检查点是否在交互区域内
    fn is_point_in_interactive_area(&self, x: f64, y: f64, context: &RenderContext) -> bool {
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

/// 性能监控渲染器trait - 支持性能监控的渲染器
pub trait PerformanceMonitoredRenderer: Renderer {
    /// 开始性能监控
    fn start_timing(&mut self, label: &str);
    
    /// 结束性能监控并记录
    fn end_timing(&mut self, label: &str) -> f64;
    
    /// 获取性能统计
    fn performance_stats(&self) -> &PerformanceStats;
    
    /// 重置性能统计
    fn reset_performance_stats(&mut self);
}

/// 性能统计结构
#[derive(Debug, Default)]
pub struct PerformanceStats {
    pub total_render_time: f64,
    pub average_frame_time: f64,
    pub cache_hit_rate: f64,
    pub memory_usage: usize,
    pub draw_calls: usize,
    pub batch_count: usize,
}

/// 数据预处理渲染器trait - 支持数据预处理的渲染器
pub trait DataPreprocessingRenderer: Renderer {
    /// 预处理数据以提高渲染效率
    fn preprocess_data(&mut self, context: &RenderContext) -> Result<PreprocessingResult, RenderError>;
    
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
    Critical = 0,  // 必须立即渲染
    High = 1,      // 高优先级
    Normal = 2,    // 普通优先级
    Low = 3,       // 低优先级
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