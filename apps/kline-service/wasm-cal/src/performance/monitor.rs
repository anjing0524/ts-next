//! 性能监控器实现
//!
//! 提供WASM环境下的实时性能监控功能

use super::metrics::MemoryMetrics;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use web_time::Instant;

/// WASM性能监控器
///
/// 提供实时的性能监控功能，与前端PerformancePanel组件集成
/// 通过JS接口提供FPS、内存使用、渲染时间等指标
#[wasm_bindgen]
#[derive(Serialize, Deserialize)]
pub struct PerformanceMonitor {
    /// 是否启用监控
    enabled: bool,
    /// 帧渲染时间 (毫秒)
    frame_time_ms: f64,
    /// 内存指标
    memory_metrics: MemoryMetrics,
    /// 监控开始时间（不参与序列化）
    #[serde(skip)]
    start_time: Option<Instant>,
    /// 上一帧时间（不参与序列化）
    #[serde(skip)]
    last_frame_time: Option<Instant>,
}

#[wasm_bindgen]
impl PerformanceMonitor {
    /// 创建新的性能监控器
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            enabled: true,
            frame_time_ms: 0.0,
            memory_metrics: MemoryMetrics::default(),
            start_time: None,
            last_frame_time: None,
        }
    }

    /// 开始渲染性能测量
    #[wasm_bindgen]
    pub fn start_render_measurement(&mut self) {
        if !self.enabled {
            return;
        }

        self.start_time = Some(Instant::now());
    }

    /// 结束渲染性能测量
    #[wasm_bindgen]
    pub fn end_render_measurement(&mut self) {
        if !self.enabled {
            return;
        }

        if let Some(start) = self.start_time {
            let elapsed = start.elapsed();
            self.frame_time_ms = elapsed.as_millis() as f64;
            self.last_frame_time = Some(Instant::now());
        }

        self.update_memory_metrics();
    }

    /// 初始化性能监控器（从KlineProcess迁移）
    /// 重新初始化监控器状态
    #[wasm_bindgen]
    pub fn init_monitor(&mut self) {
        self.enabled = true;
        self.start_time = Some(Instant::now());
        self.last_frame_time = None;
        self.frame_time_ms = 0.0;
        self.memory_metrics = MemoryMetrics::default();
    }

    /// 获取性能统计信息（从KlineProcess迁移）
    /// 返回JSON格式的性能指标
    #[wasm_bindgen]
    pub fn get_performance_stats(&self) -> Result<String, JsValue> {
        if !self.enabled {
            return Err(JsValue::from_str("Performance monitor not enabled"));
        }

        let metrics = serde_json::json!({
            "renderTime": self.frame_time_ms,
            "memoryUsage": self.get_memory_usage_mb(),
            "memoryPercentage": self.get_memory_percentage()
        });

        Ok(serde_json::to_string(&metrics).unwrap_or_else(|_| "{}".to_string()))
    }
}

impl PerformanceMonitor {
    /// 获取实际的WASM内存使用量（字节）
    fn get_wasm_memory_usage(&self) -> usize {
        // 使用 wasm_bindgen::memory() 获取 WASM 内存实例
        let memory = wasm_bindgen::memory().unchecked_into::<js_sys::WebAssembly::Memory>();
        let buffer = memory.buffer().unchecked_into::<js_sys::ArrayBuffer>();
        buffer.byte_length() as usize
    }

    /// 获取JS堆内存信息
    fn get_js_memory_info(&self) -> Option<(f64, f64, f64)> {
        let window = web_sys::window()?;
        let performance = window.performance()?;

        // 尝试获取内存信息（仅在支持的浏览器中可用）
        if let Ok(memory) = js_sys::Reflect::get(&performance, &"memory".into()) {
            if !memory.is_undefined() {
                // 手动获取内存属性
                let used = js_sys::Reflect::get(&memory, &"usedJSHeapSize".into()).ok()?;
                let total = js_sys::Reflect::get(&memory, &"totalJSHeapSize".into()).ok()?;
                let limit = js_sys::Reflect::get(&memory, &"jsHeapSizeLimit".into()).ok()?;

                Some((
                    used.as_f64().unwrap_or(0.0),
                    total.as_f64().unwrap_or(0.0),
                    limit.as_f64().unwrap_or(0.0),
                ))
            } else {
                None
            }
        } else {
            None
        }
    }

    /// 测量渲染性能 - 接受一个闭包并测量其执行时间
    pub fn measure_render_performance<F, R>(&mut self, _operation_name: &str, operation: F) -> R
    where
        F: FnOnce() -> R,
    {
        if !self.enabled {
            return operation();
        }

        // 执行操作并测量时间
        let start_time = Instant::now();
        let result = operation();
        let duration = start_time.elapsed();

        // 记录渲染时间（毫秒）
        self.frame_time_ms = duration.as_millis() as f64;

        result
    }

    /// 获取内存使用量（MB）
    fn get_memory_usage_mb(&self) -> f64 {
        self.memory_metrics.heap_used as f64 / 1024.0 / 1024.0
    }

    /// 获取内存使用百分比
    fn get_memory_percentage(&self) -> f64 {
        // 简化计算，基于堆内存使用量
        let usage_mb = self.get_memory_usage_mb();
        // 假设总内存为100MB作为基准
        (usage_mb / 100.0 * 100.0).min(100.0)
    }

    /// 更新内存指标 - 使用实际测量值
    fn update_memory_metrics(&mut self) {
        // 获取实际的WASM内存使用量
        let wasm_memory = self.get_wasm_memory_usage();

        // 获取JS堆内存信息
        let (js_used, _js_total, _js_limit) = self.get_js_memory_info().unwrap_or((0.0, 0.0, 0.0));

        // 更新内存指标 - 只使用真实测量值
        self.memory_metrics.heap_used = wasm_memory + js_used as usize;

        // 增加分配计数
        self.memory_metrics.allocations += 1;
    }
}

impl Default for PerformanceMonitor {
    fn default() -> Self {
        Self::new()
    }
}
