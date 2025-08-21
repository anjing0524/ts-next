use serde::{Deserialize, Serialize};
use std::time::Duration;

// 重新导出processor模块中的类型
pub use crate::processor::types::{FilterType, TransformType, ValidationType};

/// 日志服务配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogConfig {
    /// 日志级别
    pub log_level: LogLevel,
    
    /// ZMQ配置
    pub zmq: ZmqConfig,
    
    /// 存储配置
    pub storage: StorageConfig,
    
    /// 处理器配置
    pub processor: ProcessorConfig,
    
    /// HTTP配置
    pub http: HttpConfig,
    
    /// 监控配置
    pub metrics: MetricsConfig,
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            log_level: LogLevel::Info,
            zmq: ZmqConfig::default(),
            storage: StorageConfig::default(),
            processor: ProcessorConfig::default(),
            http: HttpConfig::default(),
            metrics: MetricsConfig::default(),
        }
    }
}

impl LogConfig {
    /// 转换为JSON
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "log_level": self.log_level,
            "zmq": self.zmq,
            "storage": self.storage,
            "processor": self.processor,
            "http": self.http,
            "metrics": self.metrics
        })
    }
}

/// 过滤条件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterCondition {
    pub field: String,
    pub operator: String,
    pub value: String,
}

impl Default for FilterCondition {
    fn default() -> Self {
        Self {
            field: String::new(),
            operator: "equals".to_string(),
            value: String::new(),
        }
    }
}

/// 过滤规则
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterRule {
    pub field: String,
    pub pattern: String,
    pub action: String,
    pub enabled: bool,
    pub rule_type: FilterType,
    pub condition: FilterCondition,
}

/// 转换规则
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransformRule {
    pub name: String,
    pub enabled: bool,
    pub rule_type: TransformType,
    pub source_field: String,
    pub target_field: String,
    pub transform_function: String,
    pub params: serde_json::Value,
}

/// 验证规则
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRule {
    pub field: String,
    pub rule_type: ValidationType,
    pub params: serde_json::Value,
    pub enabled: bool,
    pub error_message: String,
    pub condition: ValidationCondition,
}

/// 验证条件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationCondition {
    pub min_length: Option<usize>,
    pub max_length: Option<usize>,
    pub pattern: Option<String>,
    pub min_value: Option<f64>,
    pub max_value: Option<f64>,
}

impl Default for ValidationCondition {
    fn default() -> Self {
        Self {
            min_length: None,
            max_length: None,
            pattern: None,
            min_value: None,
            max_value: None,
        }
    }
}

/// 路由规则
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingRule {
    pub condition: RoutingCondition,
    pub target: RoutingTarget,
    pub enabled: bool,
}

/// 路由条件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingCondition {
    pub level: Option<Vec<String>>,
    pub source: Option<Vec<String>>,
    pub service: Option<Vec<String>>,
}

impl Default for RoutingCondition {
    fn default() -> Self {
        Self {
            level: None,
            source: None,
            service: None,
        }
    }
}

/// 路由目标
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingTarget {
    pub target_type: RoutingTargetType,
    pub target_address: String,
}

/// 路由目标类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RoutingTargetType {
    /// 文件
    File,
    /// 数据库
    Database,
    /// 消息队列
    MessageQueue,
    /// HTTP服务
    HttpService,
    /// 自定义目标
    Custom,
}

/// 重试配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryConfig {
    pub max_attempts: usize,
    pub max_retries: usize,
    pub base_delay: Duration,
    pub max_delay: Duration,
    pub retry_delay: Duration,
    pub max_retry_delay: Duration,
    pub backoff_multiplier: f64,
    pub exponential_backoff: bool,
}

/// 死信队列配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeadLetterConfig {
    pub enabled: bool,
    pub max_size: usize,
    pub retention_hours: u64,
    pub retry_interval: Duration,
    pub auto_retry: bool,
}

/// CORS配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorsConfig {
    pub allowed_origins: Vec<String>,
    pub allowed_methods: Vec<String>,
    pub allowed_headers: Vec<String>,
    pub allow_credentials: bool,
    pub max_age: usize,
}

/// 认证配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub enabled: bool,
    pub auth_type: String,
    pub secret_key: String,
    pub token_expiry: u64,
    
    /// API密钥配置
    pub api_key_config: ApiKeyConfig,
}

/// API密钥配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyConfig {
    /// 头部名称
    pub header_name: String,
    
    /// 有效的API密钥
    pub api_keys: Vec<String>,
}

impl Default for ApiKeyConfig {
    fn default() -> Self {
        Self {
            header_name: "X-API-Key".to_string(),
            api_keys: Vec::new(),
        }
    }
}

/// HTTPS配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpsConfig {
    pub enabled: bool,
    pub cert_path: String,
    pub key_path: String,
    pub min_tls_version: String,
}

/// 压缩配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionConfig {
    pub enabled: bool,
    pub compression_types: Vec<String>,
    pub min_size: usize,
}

/// 速率限制配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub enabled: bool,
    pub max_requests: usize,
    pub window_seconds: usize,
    
    /// 突发请求数
    pub burst: usize,
    
    /// 每分钟请求数
    pub requests_per_minute: usize,
}

/// 日志级别
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

impl std::str::FromStr for LogLevel {
    type Err = String;
    
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "error" => Ok(LogLevel::Error),
            "warn" => Ok(LogLevel::Warn),
            "info" => Ok(LogLevel::Info),
            "debug" => Ok(LogLevel::Debug),
            "trace" => Ok(LogLevel::Trace),
            _ => Err(format!("Invalid log level: {}", s)),
        }
    }
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogLevel::Error => write!(f, "error"),
            LogLevel::Warn => write!(f, "warn"),
            LogLevel::Info => write!(f, "info"),
            LogLevel::Debug => write!(f, "debug"),
            LogLevel::Trace => write!(f, "trace"),
        }
    }
}

/// ZMQ配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZmqConfig {
    /// 绑定地址
    pub bind_address: String,
    
    /// 端口
    pub port: u16,
    
    /// Socket类型
    pub socket_type: String,
    
    /// I/O线程数
    pub io_threads: i32,
    
    /// 高水位标记
    pub high_watermark: i32,
    
    /// 接收超时
    pub recv_timeout: u64,
    
    /// 接收缓冲区大小
    pub recv_buffer_size: usize,
    
    /// 启用心跳
    pub enable_heartbeat: bool,
    
    /// 心跳间隔
    pub heartbeat_interval: u64,
}

impl Default for ZmqConfig {
    fn default() -> Self {
        Self {
            bind_address: "tcp://0.0.0.0".to_string(),
            port: 5555,
            socket_type: "PULL".to_string(),
            io_threads: 1,
            high_watermark: 1000,
            recv_timeout: 1000,
            recv_buffer_size: 65536,
            enable_heartbeat: true,
            heartbeat_interval: 5000,
        }
    }
}

/// 存储配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    /// 日志目录
    pub log_dir: String,
    
    /// 最大文件大小
    pub max_file_size: usize,
    
    /// 最大文件数
    pub max_files: usize,
    
    /// 启用压缩
    pub enable_compression: bool,
    
    /// 压缩算法
    pub compression_algorithm: String,
    
    /// 启用轮转
    pub enable_rotation: bool,
    
    /// 轮转策略
    pub rotation_strategy: String,
    
    /// 写入缓冲区大小
    pub write_buffer_size: usize,
    
    /// 刷新间隔
    pub flush_interval: u64,
    
    /// 压缩级别
    pub compression_level: u8,
    
    /// 文件名模式
    pub file_name_pattern: String,
    
    /// 缓冲区大小
    pub buffer_size: usize,
    
    /// 写入超时
    pub write_timeout: u64,
    
    /// 启用内存缓存
    pub enable_memory_cache: bool,
    
    /// 内存缓存大小
    pub memory_cache_size: usize,
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            log_dir: "./logs".to_string(),
            max_file_size: 100 * 1024 * 1024, // 100MB
            max_files: 30,
            enable_compression: true,
            compression_algorithm: "zstd".to_string(),
            enable_rotation: true,
            rotation_strategy: "daily".to_string(),
            write_buffer_size: 8192,
            flush_interval: 1000,
            compression_level: 3,
            file_name_pattern: "app-{}.log".to_string(),
            buffer_size: 65536,
            write_timeout: 5000,
            enable_memory_cache: true,
            memory_cache_size: 1024 * 1024 * 1024, // 1GB
        }
    }
}

/// 处理器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessorConfig {
    /// 启用批量处理
    pub enable_batch: bool,
    
    /// 批量大小
    pub batch_size: usize,
    
    /// 批量超时
    pub batch_timeout: Duration,
    
    /// 启用过滤
    pub enable_filter: bool,
    
    /// 启用转换
    pub enable_transform: bool,
    
    /// 启用验证
    pub enable_validation: bool,
    
    /// 启用采样
    pub enable_sampling: bool,
    
    /// 采样率
    pub sample_rate: f64,
    
    /// 工作线程数
    pub worker_threads: usize,
    
    /// 队列大小
    pub queue_size: usize,
    
    /// 启用批量处理
    pub enable_batching: bool,
    
    /// 最大并发数
    pub max_concurrent: usize,
    
    /// 启用过滤
    pub enable_filtering: bool,
    
    /// 过滤规则
    pub filter_rules: Vec<FilterRule>,
    
    /// 转换规则
    pub transform_rules: Vec<TransformRule>,
    
    /// 验证规则
    pub validation_rules: Vec<ValidationRule>,
    
    /// 启用路由
    pub enable_routing: bool,
    
    /// 路由规则
    pub routing_rules: Vec<RoutingRule>,
    
    /// 采样率
    pub sampling_rate: f64,
    
    /// 启用重试
    pub enable_retry: bool,
    
    /// 重试配置
    pub retry_config: RetryConfig,
    
    /// 启用死信队列
    pub enable_dead_letter: bool,
    
    /// 死信队列配置
    pub dead_letter_config: DeadLetterConfig,
}

impl Default for ProcessorConfig {
    fn default() -> Self {
        Self {
            enable_batch: true,
            batch_size: 100,
            batch_timeout: Duration::from_millis(100),
            enable_filter: false,
            enable_transform: false,
            enable_validation: true,
            enable_sampling: false,
            sample_rate: 1.0,
            worker_threads: 4,
            queue_size: 10000,
            enable_batching: true,
            max_concurrent: 10,
            enable_filtering: false,
            filter_rules: Vec::new(),
            transform_rules: Vec::new(),
            validation_rules: Vec::new(),
            enable_routing: false,
            routing_rules: Vec::new(),
            sampling_rate: 1.0,
            enable_retry: false,
            retry_config: RetryConfig {
                max_attempts: 3,
                max_retries: 3,
                base_delay: Duration::from_millis(1000),
                max_delay: Duration::from_millis(30000),
                retry_delay: Duration::from_millis(1000),
                max_retry_delay: Duration::from_millis(30000),
                backoff_multiplier: 2.0,
                exponential_backoff: true,
            },
            enable_dead_letter: false,
            dead_letter_config: DeadLetterConfig {
                enabled: false,
                max_size: 1000,
                retention_hours: 24,
                retry_interval: Duration::from_secs(3600),
                auto_retry: false,
            },
        }
    }
}

/// HTTP配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpConfig {
    /// 启用HTTP服务
    pub enabled: bool,
    
    /// 绑定地址
    pub bind_address: String,
    
    /// 端口
    pub port: u16,
    
    /// 启用HTTPS
    pub enable_https: bool,
    
    /// 最大请求大小
    pub max_request_size: usize,
    
    /// 请求超时
    pub request_timeout: u64,
    
    /// 工作线程数
    pub workers: usize,
    
    /// 最大连接数
    pub max_connections: usize,
    
    /// 启用CORS
    pub enable_cors: bool,
    
    /// CORS源
    pub cors_origins: Vec<String>,
    
    /// CORS配置
    pub cors_config: CorsConfig,
    
    /// 启用认证
    pub enable_auth: bool,
    
    /// 认证配置
    pub auth_config: AuthConfig,
    
    /// HTTPS配置
    pub https_config: HttpsConfig,
    
    /// 启用压缩
    pub enable_compression: bool,
    
    /// 压缩配置
    pub compression_config: CompressionConfig,
    
    /// 速率限制
    pub rate_limit: RateLimitConfig,
    
    /// API版本
    pub api_version: String,
    
    /// 启用OpenAPI
    pub enable_openapi: bool,
    
    /// 启用Swagger
    pub enable_swagger: bool,
    
    /// 启用指标
    pub enable_metrics: bool,
    
    /// 启用健康检查
    pub enable_health_check: bool,
}

impl Default for HttpConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            bind_address: "127.0.0.1".to_string(),
            port: 3005,
            enable_https: false,
            max_request_size: 1024 * 1024, // 1MB
            request_timeout: 30000,
            workers: 4,
            max_connections: 1000,
            enable_cors: true,
            cors_origins: vec!["*".to_string()],
            cors_config: CorsConfig {
                allowed_origins: vec!["*".to_string()],
                allowed_methods: vec!["GET".to_string(), "POST".to_string(), "PUT".to_string(), "DELETE".to_string()],
                allowed_headers: vec!["*".to_string()],
                allow_credentials: false,
                max_age: 86400,
            },
            enable_auth: false,
            auth_config: AuthConfig {
                enabled: false,
                auth_type: "bearer".to_string(),
                secret_key: "".to_string(),
                token_expiry: 3600,
                api_key_config: ApiKeyConfig::default(),
            },
            https_config: HttpsConfig {
                enabled: false,
                cert_path: "".to_string(),
                key_path: "".to_string(),
                min_tls_version: "1.2".to_string(),
            },
            enable_compression: true,
            compression_config: CompressionConfig {
                enabled: true,
                compression_types: vec!["gzip".to_string(), "deflate".to_string()],
                min_size: 1024,
            },
            rate_limit: RateLimitConfig {
                enabled: true,
                max_requests: 1000,
                window_seconds: 60,
                burst: 100,
                requests_per_minute: 1000,
            },
            api_version: "v1".to_string(),
            enable_openapi: true,
            enable_swagger: true,
            enable_metrics: true,
            enable_health_check: true,
        }
    }
}

/// 监控配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsConfig {
    /// 启用指标
    pub enable_metrics: bool,
    
    /// 收集间隔
    pub collection_interval: u64,
    
    /// 启用Prometheus
    pub enable_prometheus: bool,
    
    /// Prometheus绑定地址
    pub prometheus_bind_address: String,
    
    /// Prometheus端口
    pub prometheus_port: u16,
    
    /// 启用系统指标
    pub enable_system_metrics: bool,
    
    /// 启用应用指标
    pub enable_app_metrics: bool,
    
    /// 保留周期
    pub retention_period: u64,
}

impl Default for MetricsConfig {
    fn default() -> Self {
        Self {
            enable_metrics: true,
            collection_interval: 10,
            enable_prometheus: true,
            prometheus_bind_address: "0.0.0.0".to_string(),
            prometheus_port: 9090,
            enable_system_metrics: true,
            enable_app_metrics: true,
            retention_period: 24,
        }
    }
}

