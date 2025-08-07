//! 性能监控器实现
//!
//! 提供WASM环境下的实时性能监控功能

use super::metrics::{MemoryMetrics, PerformanceSnapshot, RenderMetrics};
use serde::{Deserialize, Serialize};
use serde_wasm_bindgen;
use std::collections::VecDeque;
use web_time::Instant;
use wasm_bindgen::prelude::*;

/// WASM性能监控器
///
/// 提供实时的性能监控功能，与前端PerformancePanel组件集成
/// 通过JS接口提供FPS、内存使用、渲染时间等指标
#[wasm_bindgen]
#[derive(Serialize, Deserialize)]
pub struct PerformanceMonitor {
    /// 是否启用监控
    enabled: bool,
    /// 渲染指标
    render_metrics: RenderMetrics,
    /// 内存指标
    memory_metrics: MemoryMetrics,
    /// 监控开始时间（不参与序列化）
    #[serde(skip)]
    start_time: Option<Instant>,
    /// 上一帧时间（不参与序列化）
    #[serde(skip)]
    last_frame_time: Option<Instant>,
    /// 性能历史记录 (最近100个快照)
    history: VecDeque<PerformanceSnapshot>,
    /// 最大历史记录数
    max_history_size: usize,
    /// 新增：与JS接口兼容的字段
    frame_count: u32,
    last_fps_time: f64,
    current_fps: f64,
}

#[wasm_bindgen]
impl PerformanceMonitor {
    /// 创建新的性能监控器
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            enabled: true,
            render_metrics: RenderMetrics::default(),
            memory_metrics: MemoryMetrics::default(),
            start_time: None,
            last_frame_time: None,
            history: VecDeque::with_capacity(100),
            max_history_size: 100,
            frame_count: 0,
            last_fps_time: 0.0,
            current_fps: 0.0,
        }
    }

    /// 启用监控
    #[wasm_bindgen]
    pub fn enable(&mut self) {
        self.enabled = true;
        self.start_time = Some(Instant::now());
    }

    /// 禁用监控
    #[wasm_bindgen]
    pub fn disable(&mut self) {
        self.enabled = false;
        self.start_time = None;
    }

    /// 开始帧监控
    #[wasm_bindgen]
    pub fn start_frame(&mut self) {
        if !self.enabled {
            return;
        }

        self.last_frame_time = Some(Instant::now());
        self.render_metrics.draw_calls = 0;
    }

    /// 结束帧监控
    #[wasm_bindgen]
    pub fn end_frame(&mut self) {
        if !self.enabled || self.last_frame_time.is_none() {
            return;
        }

        let frame_duration = self.last_frame_time.unwrap().elapsed();
        self.render_metrics.frame_time_ms = frame_duration.as_secs_f64() * 1000.0;
        self.render_metrics.calculate_fps();

        // 更新内存指标
        self.update_memory_metrics();

        // 创建性能快照
        let snapshot =
            PerformanceSnapshot::new(self.render_metrics.clone(), self.memory_metrics.clone())
                .with_duration(frame_duration);

        // 添加到历史记录
        self.add_to_history(snapshot);
    }

    /// 记录绘制调用
    #[wasm_bindgen]
    pub fn record_draw_call(&mut self) {
        if self.enabled {
            self.render_metrics.draw_calls += 1;
        }
    }

    /// 设置渲染的K线数量
    #[wasm_bindgen]
    pub fn set_candles_rendered(&mut self, count: usize) {
        if self.enabled {
            self.render_metrics.candles_rendered = count;
        }
    }

    /// 设置渲染的技术指标数量
    #[wasm_bindgen]
    pub fn set_indicators_rendered(&mut self, count: usize) {
        if self.enabled {
            self.render_metrics.indicators_rendered = count;
        }
    }

    // 删除了未使用的方法：get_fps、get_frame_time、get_memory_usage、
    // get_snapshot_json、get_history_json、clear_history

    // 删除了未使用的reset方法

    /// 记录帧开始（用于FPS计算，与JS接口兼容）
    #[wasm_bindgen]
    pub fn frame_start(&mut self) {
        if !self.enabled {
            return;
        }

        self.frame_count += 1;
        let now = self.get_current_time();

        // 每秒计算一次FPS
        if now - self.last_fps_time >= 1000.0 {
            self.current_fps = (self.frame_count as f64 * 1000.0) / (now - self.last_fps_time);
            self.frame_count = 0;
            self.last_fps_time = now;
        }
    }

    /// 获取当前FPS（与JS接口兼容）
    #[wasm_bindgen]
    pub fn get_current_fps(&self) -> f64 {
        self.current_fps
    }

    /// 获取渲染时间（与JS接口兼容）
    #[wasm_bindgen]
    pub fn get_render_time(&self) -> f64 {
        self.render_metrics.frame_time_ms
    }

    /// 获取内存使用量（MB，与JS接口兼容）
    #[wasm_bindgen]
    pub fn get_memory_usage_mb(&self) -> f64 {
        (self.memory_metrics.heap_used as f64) / (1024.0 * 1024.0)
    }

    /// 获取内存使用百分比（与JS接口兼容）
    #[wasm_bindgen]
    pub fn get_memory_percentage(&self) -> f64 {
        let total = self.memory_metrics.total_memory() as f64;
        if total > 0.0 {
            (self.memory_metrics.heap_used as f64 / total) * 100.0
        } else {
            0.0
        }
    }

    /// 获取完整的性能指标JSON（与PerformancePanel兼容）
    #[wasm_bindgen]
    pub fn get_metrics_json(&self) -> String {
        let metrics = serde_json::json!({
            "fps": self.current_fps,
            "memory": {
                "used": self.get_memory_usage_mb(),
                "total": (self.memory_metrics.total_memory() as f64) / (1024.0 * 1024.0),
                "percentage": self.get_memory_percentage()
            },
            "renderTime": self.render_metrics.frame_time_ms,
            "eventLatency": 0.0, // WASM中暂不支持事件延迟监控
            "timestamp": self.get_current_time() as u64
        });

        serde_json::to_string(&metrics).unwrap_or_else(|_| "{}".to_string())
    }

    /// 获取性能指标（使用 serde-wasm-bindgen 高效序列化）
    #[wasm_bindgen]
    pub fn get_metrics_wasm(&self) -> Result<JsValue, JsValue> {
        let metrics = serde_json::json!({
            "fps": self.current_fps,
            "memory": {
                "used": self.get_memory_usage_mb(),
                "total": (self.memory_metrics.total_memory() as f64) / (1024.0 * 1024.0),
                "percentage": self.get_memory_percentage()
            },
            "renderTime": self.render_metrics.frame_time_ms,
            "eventLatency": 0.0,
            "timestamp": self.get_current_time() as u64
        });

        serde_wasm_bindgen::to_value(&metrics)
            .map_err(|e| JsValue::from_str(&format!("序列化错误: {}", e)))
    }

    /// 获取性能快照（使用 serde-wasm-bindgen 高效序列化）
    #[wasm_bindgen]
    pub fn get_snapshot_wasm(&self) -> Result<JsValue, JsValue> {
        if let Some(latest) = self.history.back() {
            serde_wasm_bindgen::to_value(latest)
                .map_err(|e| JsValue::from_str(&format!("序列化错误: {}", e)))
        } else {
            let snapshot =
                PerformanceSnapshot::new(self.render_metrics.clone(), self.memory_metrics.clone());
            serde_wasm_bindgen::to_value(&snapshot)
                .map_err(|e| JsValue::from_str(&format!("序列化错误: {}", e)))
        }
    }

    /// 初始化性能监控器（从KlineProcess迁移）
    /// 重新初始化监控器状态
    #[wasm_bindgen]
    pub fn init_monitor(&mut self) {
        self.enabled = true;
        self.start_time = Some(Instant::now());
        self.last_frame_time = None;
        self.render_metrics = RenderMetrics::default();
        self.memory_metrics = MemoryMetrics::default();
        self.history.clear();
        self.frame_count = 0;
        self.last_fps_time = 0.0;
        self.current_fps = 0.0;
    }

    /// 获取性能统计信息（从KlineProcess迁移）
    /// 返回JSON格式的性能指标
    #[wasm_bindgen]
    pub fn get_performance_stats(&self) -> Result<String, JsValue> {
        if !self.enabled {
            return Err(JsValue::from_str("Performance monitor not enabled"));
        }
        Ok(self.get_metrics_json())
    }

    // 删除了未使用的record_interaction方法

    // 删除了未使用的get_stats_json方法

    // 删除了未使用的start和stop方法

    /// 获取当前时间戳（毫秒）
    fn get_current_time(&self) -> f64 {
        // 在WASM环境中使用performance.now()的近似值
        web_sys::window()
            .and_then(|w| w.performance())
            .map(|p| p.now())
            .unwrap_or(0.0)
    }
}

impl PerformanceMonitor {
    /// 更新内存指标
    fn update_memory_metrics(&mut self) {
        // 在WASM环境中，我们使用近似的内存监控
        // 由于web-sys的Performance API限制，我们使用估算值

        // 估算堆内存使用量 (基于渲染复杂度)
        let base_memory = 1024 * 1024; // 1MB基础内存
        let data_memory = self.render_metrics.candles_rendered * 64; // 每个K线约64字节
        let indicator_memory = self.render_metrics.indicators_rendered * 32; // 每个指标点约32字节

        self.memory_metrics.heap_used = base_memory + data_memory + indicator_memory;

        // 估算数据缓存大小 (基于渲染的数据量)
        self.memory_metrics.data_cache_size = self.render_metrics.candles_rendered * 64 + // 每个K线约64字节
            self.render_metrics.indicators_rendered * 32; // 每个指标点约32字节

        // 估算渲染缓存大小 (基于绘制调用)
        self.memory_metrics.render_cache_size = self.render_metrics.draw_calls * 128; // 每次绘制调用约128字节缓存

        self.memory_metrics.allocations += 1;
    }

    /// 添加到历史记录
    fn add_to_history(&mut self, snapshot: PerformanceSnapshot) {
        self.history.push_back(snapshot);

        // 保持历史记录在限制范围内
        while self.history.len() > self.max_history_size {
            self.history.pop_front();
        }
    }

    // 删除了未使用的方法：get_average_fps、get_average_frame_time、get_memory_trend
}

impl Default for PerformanceMonitor {
    fn default() -> Self {
        Self::new()
    }
}