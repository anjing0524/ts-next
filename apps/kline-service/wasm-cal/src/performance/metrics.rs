//! 性能指标定义
//!
//! 定义WASM环境下的性能监控指标结构

use serde::{Deserialize, Serialize};
use web_time::Duration;

/// 渲染性能指标
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderMetrics {
    /// 帧渲染时间 (毫秒)
    pub frame_time_ms: f64,
    /// 帧率 (FPS)
    pub fps: f64,
    /// 渲染的K线数量
    pub candles_rendered: usize,
    /// 渲染的技术指标数量
    pub indicators_rendered: usize,
    /// 画布绘制调用次数
    pub draw_calls: usize,
}

/// 内存使用指标
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryMetrics {
    /// WASM堆内存使用量 (字节)
    pub heap_used: usize,
    /// 数据缓存大小 (字节)
    pub data_cache_size: usize,
    /// 渲染缓存大小 (字节)
    pub render_cache_size: usize,
    /// 内存分配次数
    pub allocations: usize,
}

/// 性能快照
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceSnapshot {
    /// 时间戳
    pub timestamp: u64,
    /// 渲染指标
    pub render: RenderMetrics,
    /// 内存指标
    pub memory: MemoryMetrics,
    /// 监控持续时间 (毫秒)
    pub duration_ms: f64,
}

impl Default for RenderMetrics {
    fn default() -> Self {
        Self {
            frame_time_ms: 0.0,
            fps: 0.0,
            candles_rendered: 0,
            indicators_rendered: 0,
            draw_calls: 0,
        }
    }
}

impl Default for MemoryMetrics {
    fn default() -> Self {
        Self {
            heap_used: 0,
            data_cache_size: 0,
            render_cache_size: 0,
            allocations: 0,
        }
    }
}

impl RenderMetrics {
    /// 计算FPS
    pub fn calculate_fps(&mut self) {
        if self.frame_time_ms > 0.0 {
            self.fps = 1000.0 / self.frame_time_ms;
        }
    }

    /// 重置指标
    pub fn reset(&mut self) {
        *self = Self::default();
    }
}

impl MemoryMetrics {
    /// 计算总内存使用量
    pub fn total_memory(&self) -> usize {
        self.heap_used + self.data_cache_size + self.render_cache_size
    }

    /// 重置指标
    pub fn reset(&mut self) {
        *self = Self::default();
    }
}

impl PerformanceSnapshot {
    /// 创建新的性能快照
    pub fn new(render: RenderMetrics, memory: MemoryMetrics) -> Self {
        Self {
            timestamp: js_sys::Date::now() as u64,
            render,
            memory,
            duration_ms: 0.0,
        }
    }

    /// 设置监控持续时间
    pub fn with_duration(mut self, duration: Duration) -> Self {
        self.duration_ms = duration.as_secs_f64() * 1000.0;
        self
    }
}