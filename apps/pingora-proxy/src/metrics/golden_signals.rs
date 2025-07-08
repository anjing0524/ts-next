//! 黄金信号监控模块
//! 
//! 提供简洁的黄金信号监控功能：延迟、错误率、流量、饱和度

use log::debug;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// 黄金信号监控配置
#[derive(Debug, Clone)]
pub struct GoldenSignalsConfig {
    /// 监控窗口大小（秒）
    pub window_size: u64,
    /// 是否启用监控
    pub enabled: bool,
}

impl Default for GoldenSignalsConfig {
    fn default() -> Self {
        Self {
            window_size: 60, // 1分钟窗口
            enabled: true,
        }
    }
}

/// 延迟统计器
pub struct LatencyTracker {
    /// 延迟样本（毫秒）
    samples: RwLock<Vec<u64>>,
    /// 最大样本数
    max_samples: usize,
}

impl LatencyTracker {
    pub fn new(max_samples: usize) -> Self {
        Self {
            samples: RwLock::new(Vec::with_capacity(max_samples)),
            max_samples,
        }
    }
    
    /// 记录延迟
    pub fn record(&self, latency_ms: u64) {
        let mut samples = self.samples.write();
        
        if samples.len() >= self.max_samples {
            samples.remove(0); // 移除最旧的样本
        }
        
        samples.push(latency_ms);
    }
    
    /// 获取延迟分位数
    pub fn get_percentiles(&self) -> HashMap<String, f64> {
        let mut samples = self.samples.read().clone();
        if samples.is_empty() {
            return HashMap::new();
        }
        
        samples.sort_unstable();
        let _len = samples.len();
        
        let mut percentiles = HashMap::new();
        percentiles.insert("p50".to_string(), percentile(&samples, 0.5) as f64);
        percentiles.insert("p95".to_string(), percentile(&samples, 0.95) as f64);
        percentiles.insert("p99".to_string(), percentile(&samples, 0.99) as f64);
        
        percentiles
    }
}

/// 流量统计器
pub struct TrafficTracker {
    /// 请求计数
    request_count: AtomicU64,
    /// 窗口开始时间
    window_start: RwLock<Instant>,
    /// 窗口大小
    window_size: Duration,
}

impl TrafficTracker {
    pub fn new(window_size: Duration) -> Self {
        Self {
            request_count: AtomicU64::new(0),
            window_start: RwLock::new(Instant::now()),
            window_size,
        }
    }
    
    /// 记录请求
    pub fn record_request(&self) {
        self.request_count.fetch_add(1, Ordering::Relaxed);
    }
    
    /// 获取当前 QPS
    pub fn get_qps(&self) -> f64 {
        let now = Instant::now();
        let mut window_start = self.window_start.write();
        
        if now.duration_since(*window_start) >= self.window_size {
            // 重置窗口
            let count = self.request_count.swap(0, Ordering::Relaxed);
            let elapsed = now.duration_since(*window_start).as_secs_f64();
            *window_start = now;
            
            if elapsed > 0.0 {
                count as f64 / elapsed
            } else {
                0.0
            }
        } else {
            // 计算当前 QPS
            let count = self.request_count.load(Ordering::Relaxed);
            let elapsed = now.duration_since(*window_start).as_secs_f64();
            
            if elapsed > 0.0 {
                count as f64 / elapsed
            } else {
                0.0
            }
        }
    }
}

/// 错误率统计器
pub struct ErrorTracker {
    /// 总请求数
    total_requests: AtomicU64,
    /// 错误请求数
    error_requests: AtomicU64,
    /// 窗口开始时间
    window_start: RwLock<Instant>,
    /// 窗口大小
    window_size: Duration,
}

impl ErrorTracker {
    pub fn new(window_size: Duration) -> Self {
        Self {
            total_requests: AtomicU64::new(0),
            error_requests: AtomicU64::new(0),
            window_start: RwLock::new(Instant::now()),
            window_size,
        }
    }
    
    /// 记录请求结果
    pub fn record(&self, is_error: bool) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        if is_error {
            self.error_requests.fetch_add(1, Ordering::Relaxed);
        }
    }
    
    /// 获取错误率
    pub fn get_error_rate(&self) -> f64 {
        let now = Instant::now();
        let mut window_start = self.window_start.write();
        
        if now.duration_since(*window_start) >= self.window_size {
            // 重置窗口
            let total = self.total_requests.swap(0, Ordering::Relaxed);
            let errors = self.error_requests.swap(0, Ordering::Relaxed);
            *window_start = now;
            
            if total > 0 {
                errors as f64 / total as f64
            } else {
                0.0
            }
        } else {
            // 计算当前错误率
            let total = self.total_requests.load(Ordering::Relaxed);
            let errors = self.error_requests.load(Ordering::Relaxed);
            
            if total > 0 {
                errors as f64 / total as f64
            } else {
                0.0
            }
        }
    }
}

/// 黄金信号监控器
pub struct GoldenSignalsMonitor {
    config: GoldenSignalsConfig,
    latency_tracker: LatencyTracker,
    traffic_tracker: TrafficTracker,
    error_tracker: ErrorTracker,
    active_connections: AtomicU64,
}

impl GoldenSignalsMonitor {
    /// 创建新的黄金信号监控器
    pub fn new(config: GoldenSignalsConfig) -> Self {
        let window_size = Duration::from_secs(config.window_size);
        
        Self {
            config,
            latency_tracker: LatencyTracker::new(1000), // 最多保存 1000 个延迟样本
            traffic_tracker: TrafficTracker::new(window_size),
            error_tracker: ErrorTracker::new(window_size),
            active_connections: AtomicU64::new(0),
        }
    }
    
    /// 记录请求
    pub fn record_request(&self, duration: Duration, is_error: bool) {
        if !self.config.enabled {
            return;
        }
        
        let latency_ms = duration.as_millis() as u64;
        
        // 记录延迟
        self.latency_tracker.record(latency_ms);
        
        // 记录流量
        self.traffic_tracker.record_request();
        
        // 记录错误率
        self.error_tracker.record(is_error);
        
        debug!("记录黄金信号: 延迟={latency_ms}ms, 错误={is_error}");
    }
    
    /// 增加活跃连接数
    pub fn inc_connections(&self) {
        self.active_connections.fetch_add(1, Ordering::Relaxed);
    }
    
    /// 减少活跃连接数
    pub fn dec_connections(&self) {
        self.active_connections.fetch_sub(1, Ordering::Relaxed);
    }
    
    /// 获取监控摘要
    pub fn get_summary(&self) -> serde_json::Value {
        let latency_percentiles = self.latency_tracker.get_percentiles();
        let qps = self.traffic_tracker.get_qps();
        let error_rate = self.error_tracker.get_error_rate();
        let connections = self.active_connections.load(Ordering::Relaxed);
        
        serde_json::json!({
            "latency": {
                "percentiles": latency_percentiles,
                "unit": "milliseconds"
            },
            "traffic": {
                "qps": qps,
                "unit": "requests_per_second"
            },
            "errors": {
                "error_rate": error_rate,
                "percentage": error_rate * 100.0
            },
            "saturation": {
                "active_connections": connections
            },
            "timestamp": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        })
    }
}

/// 计算分位数
fn percentile(sorted_samples: &[u64], p: f64) -> u64 {
    if sorted_samples.is_empty() {
        return 0;
    }
    
    let _len = sorted_samples.len();
    if _len == 1 {
        return sorted_samples[0];
    }
    
    let index = (p * (_len - 1) as f64).round() as usize;
    sorted_samples[index.min(_len - 1)]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_latency_tracker() {
        let tracker = LatencyTracker::new(10);
        
        // 记录一些延迟样本
        for i in 1..=10 {
            tracker.record(i * 10); // 10ms, 20ms, ..., 100ms
        }
        
        let percentiles = tracker.get_percentiles();
        assert!(percentiles.contains_key("p50"));
        assert!(percentiles.contains_key("p95"));
        assert!(percentiles.contains_key("p99"));
        
        // P50 应该大约是 50ms
        assert!((percentiles["p50"] - 50.0).abs() < 10.0);
    }

    #[test]
    fn test_traffic_tracker() {
        let tracker = TrafficTracker::new(Duration::from_secs(1));
        
        // 记录一些请求
        for _ in 0..10 {
            tracker.record_request();
        }
        
        let qps = tracker.get_qps();
        assert!(qps > 0.0);
    }

    #[test]
    fn test_error_tracker() {
        let tracker = ErrorTracker::new(Duration::from_secs(1));
        
        // 记录 7 个成功和 3 个错误
        for _ in 0..7 {
            tracker.record(false);
        }
        for _ in 0..3 {
            tracker.record(true);
        }
        
        let error_rate = tracker.get_error_rate();
        assert!((error_rate - 0.3).abs() < 0.1); // 30% 错误率
    }

    #[test]
    fn test_golden_signals_monitor() {
        let config = GoldenSignalsConfig::default();
        let monitor = GoldenSignalsMonitor::new(config);
        
        // 记录一些请求
        monitor.record_request(Duration::from_millis(100), false);
        monitor.record_request(Duration::from_millis(200), true);
        
        // 增加连接
        monitor.inc_connections();
        monitor.inc_connections();
        monitor.dec_connections();
        
        let summary = monitor.get_summary();
        assert!(summary["latency"]["percentiles"].is_object());
        assert!(summary["traffic"]["qps"].is_number());
        assert!(summary["errors"]["error_rate"].is_number());
        assert_eq!(summary["saturation"]["active_connections"], 1);
    }
} 