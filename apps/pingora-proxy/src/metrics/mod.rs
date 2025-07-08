//! 监控指标模块

use crate::error::ProxyResult;
use log::warn;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::sync::Arc;

pub mod collector;
pub mod golden_signals;

pub use collector::{MetricsCollector, RequestInfo, ResponseInfo};

/// 全局指标收集器实例
static GLOBAL_METRICS: Lazy<Arc<Mutex<Option<Arc<MetricsCollector>>>>> =
    Lazy::new(|| Arc::new(Mutex::new(None)));

/// 初始化全局指标收集器
pub fn init_metrics() -> ProxyResult<()> {
    let collector = Arc::new(MetricsCollector::new()?);
    *GLOBAL_METRICS.lock() = Some(collector);
    Ok(())
}

/// 获取全局指标收集器
pub fn get_metrics() -> Option<Arc<MetricsCollector>> {
    GLOBAL_METRICS.lock().clone()
}

/// 记录请求指标的便捷函数
pub fn record_request(request: RequestInfo, response: ResponseInfo) {
    if let Some(metrics) = get_metrics() {
        metrics.record_request(&request, &response);
    } else {
        warn!("指标收集器未初始化，无法记录请求指标");
    }
}

/// 增加连接数的便捷函数
pub fn inc_connections() {
    if let Some(metrics) = get_metrics() {
        metrics.inc_connections();
    }
}

/// 减少连接数的便捷函数
pub fn dec_connections() {
    if let Some(metrics) = get_metrics() {
        metrics.dec_connections();
    }
}
                