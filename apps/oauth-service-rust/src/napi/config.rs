use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SDKConfig {
    /// OAuth Service 基础 URL
    pub base_url: String,
    /// 请求超时时间（毫秒）
    pub timeout: Option<u64>,
    /// 最大重试次数
    pub retry_count: Option<u32>,
    /// 重试延迟基数（毫秒）
    pub retry_delay: Option<u64>,
    /// 是否启用调试日志
    pub debug: Option<bool>,
}

impl Default for SDKConfig {
    fn default() -> Self {
        Self {
            base_url: "http://localhost:8080".to_string(),
            timeout: Some(5000),
            retry_count: Some(3),
            retry_delay: Some(100),
            debug: Some(false),
        }
    }
}

impl SDKConfig {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url,
            ..Default::default()
        }
    }

    pub fn with_timeout(mut self, timeout: u64) -> Self {
        self.timeout = Some(timeout);
        self
    }

    pub fn with_retry(mut self, count: u32, delay: u64) -> Self {
        self.retry_count = Some(count);
        self.retry_delay = Some(delay);
        self
    }

    pub fn with_debug(mut self, debug: bool) -> Self {
        self.debug = Some(debug);
        self
    }
}
