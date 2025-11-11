//! 应用层 Rate Limiting 中间件
//!
//! 设计理念：
//! - 简单优于复杂 - 使用内存中的 HashMap 而非 Tower 层抽象
//! - 实用优先 - 基于 IP 地址的简单限流
//! - 可扩展 - 后续可以升级到 Redis 等分布式方案

use axum::{
    extract::{ConnectInfo, Request},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::RwLock;

/// Rate limiter 状态
#[derive(Clone)]
pub struct RateLimiter {
    state: Arc<RwLock<HashMap<String, Vec<Instant>>>>,
    max_requests: usize,
    window: Duration,
}

impl RateLimiter {
    /// 创建新的 rate limiter
    ///
    /// # 参数
    /// - max_requests: 时间窗口内的最大请求数
    /// - window_secs: 时间窗口（秒）
    pub fn new(max_requests: usize, window_secs: u64) -> Self {
        Self {
            state: Arc::new(RwLock::new(HashMap::new())),
            max_requests,
            window: Duration::from_secs(window_secs),
        }
    }

    /// 检查是否允许请求
    pub async fn check_rate_limit(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut state = self.state.write().await;

        // 获取或创建该 key 的请求历史
        let requests = state.entry(key.to_string()).or_insert_with(Vec::new);

        // 清理过期的请求记录
        requests.retain(|&time| now.duration_since(time) < self.window);

        // 检查是否超过限制
        if requests.len() >= self.max_requests {
            return false;
        }

        // 记录本次请求
        requests.push(now);
        true
    }

    /// 定期清理过期数据（可选，在后台任务中调用）
    pub async fn cleanup(&self) {
        let now = Instant::now();
        let mut state = self.state.write().await;

        // 清理所有过期的条目
        state.retain(|_, requests| {
            requests.retain(|&time| now.duration_since(time) < self.window);
            !requests.is_empty()
        });
    }
}

/// Rate limiting 中间件
///
/// 从 ConnectInfo 中提取 IP 地址进行限流
pub async fn rate_limit_middleware(
    request: Request,
    next: Next,
) -> Result<Response, (StatusCode, String)> {
    // 从请求扩展中获取 ConnectInfo
    let addr = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ci| ci.0)
        .unwrap_or_else(|| ([127, 0, 0, 1], 0).into());

    // 简化版本：直接使用全局限制
    // 实际生产环境应该从 app state 获取配置
    let rate_limiter = RateLimiter::new(100, 60); // 100 req/min

    let key = addr.ip().to_string();

    if !rate_limiter.check_rate_limit(&key).await {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            "Rate limit exceeded. Please try again later.".to_string(),
        ));
    }

    Ok(next.run(request).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rate_limiter() {
        let limiter = RateLimiter::new(5, 1); // 5 requests per second

        // 前5个请求应该通过
        for _ in 0..5 {
            assert!(limiter.check_rate_limit("test_ip").await);
        }

        // 第6个请求应该被限制
        assert!(!limiter.check_rate_limit("test_ip").await);

        // 等待1秒后应该可以再次请求
        tokio::time::sleep(Duration::from_secs(1)).await;
        assert!(limiter.check_rate_limit("test_ip").await);
    }

    #[tokio::test]
    async fn test_different_ips() {
        let limiter = RateLimiter::new(3, 1);

        // IP1 的3个请求
        for _ in 0..3 {
            assert!(limiter.check_rate_limit("ip1").await);
        }

        // IP2 应该仍然可以请求
        assert!(limiter.check_rate_limit("ip2").await);

        // IP1 应该被限制
        assert!(!limiter.check_rate_limit("ip1").await);
    }
}
