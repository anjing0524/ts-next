//! 渲染器trait定义 - 基于Rust trait的可扩展渲染架构

use crate::config::ChartTheme;
use crate::data::DataManager;
use crate::layout::ChartLayout;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 渲染器生命周期管理trait
pub trait Renderer {
    /// 初始化渲染器
    fn new() -> Self where Self: Sized;
    
    /// 执行渲染
    fn render(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        theme: &ChartTheme,
    );
    
    /// 检查是否需要渲染（用于脏标记优化）
    fn needs_render(&self, data_manager: &Rc<RefCell<DataManager>>) -> bool {
        true
    }
    
    /// 设置渲染优先级
    fn priority(&self) -> RenderPriority {
        RenderPriority::Normal
    }
}

/// 交互式渲染器trait
pub trait InteractiveRenderer: Renderer {
    /// 处理鼠标移动事件
    fn handle_mouse_move(&mut self, x: f64, y: f64, layout: &ChartLayout) -> bool;
    
    /// 处理点击事件
    fn handle_click(&mut self, x: f64, y: f64, layout: &ChartLayout) -> bool;
    
    /// 处理滚轮事件
    fn handle_wheel(&mut self, delta: f64, x: f64, y: f64, layout: &ChartLayout) -> bool;
    
    /// 获取当前光标样式
    fn get_cursor_style(&self, x: f64, y: f64, layout: &ChartLayout) -> CursorStyle;
}

/// 缓存感知渲染器trait
pub trait CacheAwareRenderer: Renderer {
    /// 无效化缓存
    fn invalidate_cache(&mut self);
    
    /// 更新缓存
    fn update_cache(&mut self, data_manager: &Rc<RefCell<DataManager>>, layout: &ChartLayout);
    
    /// 检查缓存是否有效
    fn is_cache_valid(&self) -> bool;
}

/// 图层特定渲染器trait
pub trait LayerSpecificRenderer: Renderer {
    /// 获取渲染器对应的图层类型
    fn layer_type(&self) -> CanvasLayer;
    
    /// 获取图层特定的脏标记
    fn get_dirty_flag(&self) -> bool;
    
    /// 设置图层脏标记
    fn set_dirty_flag(&mut self, dirty: bool);
}

/// 性能监控trait
pub trait PerformanceMonitor {
    /// 开始性能监控
    fn start_timing(&mut self, label: &str);
    
    /// 结束性能监控并记录
    fn end_timing(&mut self, label: &str) -> f64;
    
    /// 获取性能统计
    fn get_performance_stats(&self) -> PerformanceStats;
}

/// 数据预处理trait
pub trait DataPreProcessor {
    /// 预处理数据以提高渲染效率
    fn preprocess_data(&mut self, data_manager: &Rc<RefCell<DataManager>>) -> PreprocessingResult;
    
    /// 获取预处理缓存
    fn get_preprocessing_cache(&self) -> Option<&PreprocessingCache>;
    
    /// 清理预处理缓存
    fn clear_preprocessing_cache(&mut self);
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
}

/// 性能统计结构
#[derive(Debug, Default)]
pub struct PerformanceStats {
    pub total_render_time: f64,
    pub average_frame_time: f64,
    pub cache_hit_rate: f64,
    pub memory_usage: usize,
}

/// 预处理结果
#[derive(Debug)]
pub struct PreprocessingResult {
    pub processed: bool,
    pub cache_hit: bool,
    pub processing_time: f64,
}

/// 预处理缓存
#[derive(Debug)]
pub struct PreprocessingCache {
    pub timestamp: f64,
    pub data_hash: u64,
    pub processed_data: Vec<u8>,
}