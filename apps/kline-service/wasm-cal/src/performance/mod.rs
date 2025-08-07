//! WASM性能监控模块
//!
//! 提供K线图渲染过程中的性能监控功能，包括：
//! - 渲染性能指标（FPS、帧时间、绘制调用次数）
//! - 内存使用监控（堆内存、缓存大小）
//! - 性能历史记录和分析
//! - 与前端PerformancePanel组件的JS交互接口

pub mod metrics;
pub mod monitor;

// 重新导出主要组件
pub use metrics::{MemoryMetrics, PerformanceSnapshot, RenderMetrics};
pub use monitor::PerformanceMonitor;
