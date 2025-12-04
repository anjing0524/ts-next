// 登陆端点速率限制
// Login endpoint specific rate limiting - 5 attempts per 5 minutes per IP

use std::{
    collections::HashMap,
    net::IpAddr,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::RwLock;

/// 登陆专用速率限制器
/// 更严格的限制：5 attempts / 5 minutes per IP
#[derive(Clone)]
pub struct LoginRateLimiter {
    state: Arc<RwLock<HashMap<IpAddr, Vec<Instant>>>>,
    max_attempts: usize,
    window: Duration,
}

impl LoginRateLimiter {
    /// 创建登陆速率限制器
    /// max_attempts: 5 (尝试次数)
    /// window: 5分钟 (时间窗口)
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(HashMap::new())),
            max_attempts: 5,
            window: Duration::from_secs(300), // 5 minutes
        }
    }

    /// 创建自定义参数的登陆速率限制器（主要用于测试）
    /// max_attempts: 最大尝试次数
    /// window: 时间窗口
    #[cfg(test)]
    pub fn with_window(max_attempts: usize, window: Duration) -> Self {
        Self {
            state: Arc::new(RwLock::new(HashMap::new())),
            max_attempts,
            window,
        }
    }

    /// 检查是否允许登陆尝试
    /// 返回 true 表示允许继续登陆
    /// 返回 false 表示超过速率限制
    pub async fn check_login_attempt(&self, ip: IpAddr) -> bool {
        let now = Instant::now();
        let mut state = self.state.write().await;

        // 获取或创建该IP的登陆尝试历史
        let attempts = state.entry(ip).or_insert_with(Vec::new);

        // 清理过期的尝试记录（5分钟以外的）
        attempts.retain(|&time| now.duration_since(time) < self.window);

        // 检查是否超过限制
        if attempts.len() >= self.max_attempts {
            return false;
        }

        // 记录本次尝试
        attempts.push(now);
        true
    }

    /// 清理过期数据（应在后台任务中定期调用）
    pub async fn cleanup(&self) {
        let now = Instant::now();
        let mut state = self.state.write().await;

        state.retain(|_, attempts| {
            attempts.retain(|&time| now.duration_since(time) < self.window);
            !attempts.is_empty()
        });
    }

    /// 获取剩余尝试次数
    pub async fn get_remaining_attempts(&self, ip: IpAddr) -> usize {
        let now = Instant::now();
        let mut state = self.state.write().await;

        if let Some(attempts) = state.get_mut(&ip) {
            // 清理过期的尝试记录
            attempts.retain(|&time| now.duration_since(time) < self.window);
            return self.max_attempts.saturating_sub(attempts.len());
        }

        self.max_attempts
    }
}

impl Default for LoginRateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{sleep, Duration};

    #[tokio::test]
    async fn test_login_rate_limiter_basic() {
        let limiter = LoginRateLimiter::new();
        let ip: IpAddr = "192.168.1.1".parse().unwrap();

        // 前5次尝试应该被允许
        for i in 0..5 {
            assert!(
                limiter.check_login_attempt(ip).await,
                "Attempt {} should be allowed",
                i + 1
            );
        }

        // 第6次尝试应该被拒绝
        assert!(
            !limiter.check_login_attempt(ip).await,
            "6th attempt should be rate limited"
        );
    }

    #[tokio::test]
    async fn test_login_rate_limiter_different_ips() {
        let limiter = LoginRateLimiter::new();
        let ip1: IpAddr = "192.168.1.1".parse().unwrap();
        let ip2: IpAddr = "192.168.1.2".parse().unwrap();

        // IP1进行5次尝试
        for _ in 0..5 {
            assert!(limiter.check_login_attempt(ip1).await);
        }

        // IP1被限制
        assert!(!limiter.check_login_attempt(ip1).await);

        // IP2应该仍然可以尝试
        assert!(
            limiter.check_login_attempt(ip2).await,
            "Different IP should not be affected"
        );
    }

    #[tokio::test]
    async fn test_login_rate_limiter_get_remaining_attempts() {
        let limiter = LoginRateLimiter::new();
        let ip: IpAddr = "192.168.1.1".parse().unwrap();

        // 初始应该有5次机会
        assert_eq!(limiter.get_remaining_attempts(ip).await, 5);

        // 进行2次尝试
        limiter.check_login_attempt(ip).await;
        limiter.check_login_attempt(ip).await;

        // 应该剩余3次
        assert_eq!(limiter.get_remaining_attempts(ip).await, 3);

        // 用完剩余次数
        limiter.check_login_attempt(ip).await;
        limiter.check_login_attempt(ip).await;
        limiter.check_login_attempt(ip).await;

        // 应该为0
        assert_eq!(limiter.get_remaining_attempts(ip).await, 0);
    }

    #[tokio::test]
    async fn test_login_rate_limiter_cleanup() {
        let limiter = LoginRateLimiter::with_window(5, Duration::from_millis(100));
        let ip: IpAddr = "192.168.1.1".parse().unwrap();

        // 使用所有5次尝试
        for _ in 0..5 {
            limiter.check_login_attempt(ip).await;
        }

        // 应该被限制
        assert!(!limiter.check_login_attempt(ip).await);

        // 等待时间窗口过期
        sleep(Duration::from_millis(150)).await;

        // 手动清理
        limiter.cleanup().await;

        // 应该可以再次尝试
        assert!(
            limiter.check_login_attempt(ip).await,
            "Should allow new attempts after window expires"
        );
    }

    #[tokio::test]
    async fn test_login_rate_limiter_ipv6() {
        let limiter = LoginRateLimiter::new();
        let ipv6: IpAddr = "2001:0db8::1".parse().unwrap();

        // IPv6地址也应该正常工作
        for i in 0..5 {
            assert!(
                limiter.check_login_attempt(ipv6).await,
                "IPv6 attempt {} should be allowed",
                i + 1
            );
        }

        assert!(
            !limiter.check_login_attempt(ipv6).await,
            "IPv6 6th attempt should be rate limited"
        );
    }

    #[tokio::test]
    async fn test_login_rate_limiter_concurrent_requests() {
        let limiter = Arc::new(LoginRateLimiter::new());
        let ip: IpAddr = "192.168.1.1".parse().unwrap();

        // 并发发送10个请求
        let mut handles = vec![];
        for _ in 0..10 {
            let limiter_clone = Arc::clone(&limiter);
            let handle = tokio::spawn(async move {
                limiter_clone.check_login_attempt(ip).await
            });
            handles.push(handle);
        }

        // 收集结果
        let mut allowed_count = 0;
        let mut denied_count = 0;
        for handle in handles {
            if handle.await.unwrap() {
                allowed_count += 1;
            } else {
                denied_count += 1;
            }
        }

        // 应该有5次被允许，5次被拒绝
        assert_eq!(allowed_count, 5, "Should allow exactly 5 attempts");
        assert_eq!(denied_count, 5, "Should deny exactly 5 attempts");
    }

    #[tokio::test]
    async fn test_login_rate_limiter_multiple_cycles() {
        let limiter = LoginRateLimiter::with_window(5, Duration::from_millis(100));
        let ip: IpAddr = "192.168.1.1".parse().unwrap();

        // 第一个周期：用完5次
        for _ in 0..5 {
            limiter.check_login_attempt(ip).await;
        }
        assert!(!limiter.check_login_attempt(ip).await);

        // 等待窗口过期
        sleep(Duration::from_millis(150)).await;
        limiter.cleanup().await;

        // 第二个周期：应该又有5次机会
        for i in 0..5 {
            assert!(
                limiter.check_login_attempt(ip).await,
                "Second cycle attempt {} should be allowed",
                i + 1
            );
        }
        assert!(!limiter.check_login_attempt(ip).await);
    }
}
