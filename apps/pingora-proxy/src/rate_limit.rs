/// IP 级别速率限制实现 (简化版)
use std::collections::HashMap;
use std::net::IpAddr;
use std::time::{SystemTime, Duration};

pub struct IpRateLimiter {
    // IP -> (请求计数, 重置时间)
    limiters: HashMap<IpAddr, (u32, SystemTime)>,
    max_requests_per_minute: u32,
}

impl IpRateLimiter {
    pub fn new(max_requests_per_minute: u32) -> Self {
        Self {
            limiters: HashMap::new(),
            max_requests_per_minute,
        }
    }

    /// 检查 IP 是否超过速率限制
    /// 返回 true 表示请求被允许，false 表示被限制
    pub fn check(&mut self, ip: IpAddr) -> bool {
        let now = SystemTime::now();
        let window = Duration::from_secs(60);

        // 获取或创建此 IP 的限制记录
        let (count, reset_time) = self.limiters.entry(ip).or_insert((0, now));

        // 如果时间窗口已过期，重置计数
        if now.duration_since(*reset_time).unwrap_or_default() > window {
            *count = 0;
            *reset_time = now;
        }

        // 检查是否超过限制
        if *count >= self.max_requests_per_minute {
            return false;
        }

        // 增加计数器
        *count += 1;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limit() {
        let mut limiter = IpRateLimiter::new(10);
        let ip = "127.0.0.1".parse::<IpAddr>().unwrap();

        // 前 10 个请求应该被允许
        for _ in 0..10 {
            assert!(limiter.check(ip));
        }

        // 第 11 个请求应该被拒绝
        assert!(!limiter.check(ip));
    }
}
