//! 指标收集器

use crate::error::ProxyResult;
use prometheus::{
    HistogramOpts, HistogramVec, IntCounterVec, IntGauge, Gauge,
    Opts, Registry, proto::MetricFamily
};
use std::time::{Duration, Instant};

/// 请求指标信息
#[derive(Debug, Clone)]
pub struct RequestInfo {
    pub method: String,
    pub path: String,
    pub start_time: Instant,
}

/// 响应指标信息
#[derive(Debug, Clone)]
pub struct ResponseInfo {
    pub status_code: u16,
    pub duration: Duration,
    pub upstream: Option<String>,
    pub error: Option<String>,
}

/// 简化的指标收集器 - 专注于黄金信号
#[derive(Clone)]
pub struct MetricsCollector {
    pub registry: Registry,
    
    // 黄金信号指标
    /// 延迟 - 请求持续时间分布
    request_duration: HistogramVec,
    /// 流量 - 请求总数
    requests_total: IntCounterVec,
    /// 错误率 - 错误总数
    errors_total: IntCounterVec,
    /// 饱和度 - 活跃连接数
    active_connections: IntGauge,
    /// 延迟 P50
    latency_p50: Gauge,
    /// 延迟 P95
    latency_p95: Gauge,
    /// 延迟 P99
    latency_p99: Gauge,
    /// 实时 QPS
    qps_gauge: Gauge,
    /// 错误��
    error_rate_gauge: Gauge,
}

impl MetricsCollector {
    /// 创建新的指标收集器
    pub fn new() -> ProxyResult<Self> {
        let registry = Registry::new();
        
        // 延迟指标 - P50/P95/P99 延迟分位数
        let request_duration = HistogramVec::new(
            HistogramOpts::new("pingora_request_duration_seconds", "Request duration")
                .buckets(vec![0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]),
            &["method", "status"],
        )?;
        
        // 流量指标 - QPS
        let requests_total = IntCounterVec::new(
            Opts::new("pingora_requests_total", "Total requests"),
            &["method", "status"],
        )?;
        
        // 错误率指标
        let errors_total = IntCounterVec::new(
            Opts::new("pingora_errors_total", "Total errors"),
            &["method", "type"],
        )?;
        
        // 饱和度指标 - 活跃连接数
        let active_connections = IntGauge::new(
            "pingora_active_connections", "Active connections"
        )?;

        // 额外黄金信号 Gauge
        let latency_p50 = Gauge::new("pingora_latency_p50_ms", "Latency p50 (ms)")?;
        let latency_p95 = Gauge::new("pingora_latency_p95_ms", "Latency p95 (ms)")?;
        let latency_p99 = Gauge::new("pingora_latency_p99_ms", "Latency p99 (ms)")?;
        let qps_gauge = Gauge::new("pingora_qps", "Queries per second")?;
        let error_rate_gauge = Gauge::new("pingora_error_rate", "Error rate 0~1")?;
 
        // 注册指标
        registry.register(Box::new(request_duration.clone()))?;
        registry.register(Box::new(requests_total.clone()))?;
        registry.register(Box::new(errors_total.clone()))?;
        registry.register(Box::new(active_connections.clone()))?;
        registry.register(Box::new(latency_p50.clone()))?;
        registry.register(Box::new(latency_p95.clone()))?;
        registry.register(Box::new(latency_p99.clone()))?;
        registry.register(Box::new(qps_gauge.clone()))?;
        registry.register(Box::new(error_rate_gauge.clone()))?;
        
        Ok(Self {
            registry,
            request_duration,
            requests_total,
            errors_total,
            active_connections,
            latency_p50,
            latency_p95,
            latency_p99,
            qps_gauge,
            error_rate_gauge,
        })
    }
    
    /// 记录请求指标
    pub fn record_request(&self, request: &RequestInfo, response: &ResponseInfo) {
        let status = response.status_code.to_string();
        let method = &request.method;
        
        // 记录延迟
        self.request_duration
            .with_label_values(&[method, &status])
            .observe(response.duration.as_secs_f64());
        
        // 记录请求总数
        self.requests_total
            .with_label_values(&[method, &status])
            .inc();
        
        // 记录错误
        if response.status_code >= 400 {
            let error_type = if response.status_code >= 500 {
                "server_error"
            } else {
                "client_error"
            };
            
            self.errors_total
                .with_label_values(&[method, error_type])
                .inc();
        }
    }
    
    /// 增加活跃连接数
    pub fn inc_connections(&self) {
        self.active_connections.inc();
    }
    
    /// 减少活跃连接数
    pub fn dec_connections(&self) {
        self.active_connections.dec();
    }

    /// 更新黄金信号指标
    pub fn update_golden_signals(&self, p50: f64, p95: f64, p99: f64, qps: f64, error_rate: f64) {
        self.latency_p50.set(p50);
        self.latency_p95.set(p95);
        self.latency_p99.set(p99);
        self.qps_gauge.set(qps);
        self.error_rate_gauge.set(error_rate);
    }
    
    pub fn gather(&self) -> Vec<MetricFamily> {
        self.registry.gather()
    }
}
