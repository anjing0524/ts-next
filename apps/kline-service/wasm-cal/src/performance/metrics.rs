//! 性能指标定义
//!
//! 定义WASM环境下的性能监控指标结构

use serde::{Deserialize, Serialize};
use web_time::Duration;

// RenderMetrics 结构体已移除，现在直接使用 f64 存储帧渲染时间

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
    /// 内存指标
    pub memory: MemoryMetrics,
    /// 监控持续时间 (毫秒)
    pub duration_ms: f64,
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

impl MemoryMetrics {
    /// 计算总内存使用量 - 只计算实际堆内存使用量
    /// data_cache_size 和 render_cache_size 应由实际缓存管理器提供
    pub fn total_memory(&self) -> usize {
        // 只返回实际测量的堆内存，缓存大小由具体实现提供
        self.heap_used + self.data_cache_size + self.render_cache_size
    }

    /// 重置指标
    pub fn reset(&mut self) {
        *self = Self::default();
    }
}

impl PerformanceSnapshot {
    /// 创建新的性能快照
    pub fn new(memory: MemoryMetrics) -> Self {
        Self {
            timestamp: js_sys::Date::now() as u64,
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
