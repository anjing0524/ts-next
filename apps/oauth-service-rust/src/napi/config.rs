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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sdk_config_serialization() {
        // 验证 SDKConfig 序列化 - Verifies SDKConfig serialization
        let config = SDKConfig::new("http://localhost:8080".to_string())
            .with_timeout(5000)
            .with_retry(1, 0)
            .with_debug(false);

        let json = serde_json::to_value(&config).unwrap();

        assert_eq!(json["base_url"], "http://localhost:8080");
        assert_eq!(json["timeout"], 5000);
        assert_eq!(json["retry_count"], 1);
        assert_eq!(json["retry_delay"], 0);
        assert_eq!(json["debug"], false);

        // 验证数值类型 - Verify numeric types
        assert!(json["timeout"].is_u64());
        assert!(json["retry_count"].is_u64());
    }

    #[test]
    fn test_sdk_config_round_trip() {
        // 验证 SDKConfig 往返序列化 - Verifies SDKConfig round trip
        let config = SDKConfig::new("https://api.example.com".to_string())
            .with_timeout(10000)
            .with_retry(3, 100)
            .with_debug(true);

        // 序列化 - Serialize
        let json_str = serde_json::to_string(&config).unwrap();

        // 反序列化 - Deserialize
        let deserialized: SDKConfig = serde_json::from_str(&json_str).unwrap();

        // 验证所有字段 - Verify all fields
        assert_eq!(deserialized.base_url, config.base_url);
        assert_eq!(deserialized.timeout, config.timeout);
        assert_eq!(deserialized.retry_count, config.retry_count);
        assert_eq!(deserialized.retry_delay, config.retry_delay);
        assert_eq!(deserialized.debug, config.debug);
    }

    #[test]
    fn test_sdk_config_default() {
        // 验证 SDKConfig 默认值 - Verifies SDKConfig default values
        let config = SDKConfig::default();

        assert_eq!(config.base_url, "http://localhost:8080");
        assert_eq!(config.timeout, Some(5000));
        assert_eq!(config.retry_count, Some(3));
        assert_eq!(config.retry_delay, Some(100));
        assert_eq!(config.debug, Some(false));
    }
}
