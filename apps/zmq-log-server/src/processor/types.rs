use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

// 重新导出配置模块中的类型
pub use crate::config::{
    ProcessorConfig, FilterRule, TransformRule, ValidationRule, RoutingRule, 
    RetryConfig, DeadLetterConfig
};

/// 过滤类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FilterType {
    /// 级别过滤
    Level,
    /// 来源过滤
    Source,
    /// 服务过滤
    Service,
    /// 组件过滤
    Component,
    /// 自定义过滤
    Custom,
}

/// 过滤动作
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FilterAction {
    /// 允许
    Allow,
    /// 拒绝
    Reject,
    /// 跳过
    Skip,
    /// 重定向
    Redirect,
}

/// 转换类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TransformType {
    /// 重命名字段
    Rename,
    /// 值转换
    ValueTransform,
    /// 类型转换
    TypeTransform,
    /// 格式转换
    FormatTransform,
    /// 自定义转换
    Custom,
}

/// 验证类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ValidationType {
    /// 必填字段
    Required,
    /// 长度验证
    Length,
    /// 格式验证
    Format,
    /// 范围验证
    Range,
    /// 自定义验证
    Custom,
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

/// 处理器统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessorStats {
    /// 总处理数
    pub total_processed: u64,
    
    /// 成功数
    pub success_count: u64,
    
    /// 失败数
    pub failure_count: u64,
    
    /// 过滤数
    pub filtered_count: u64,
    
    /// 最后更新时间
    pub last_updated: DateTime<Utc>,
    
    /// 批量统计
    pub batch_stats: BatchStats,
    
    /// 延迟统计
    pub latency_stats: LatencyStats,
    
    /// 重试统计
    pub retry_stats: RetryStats,
    
    /// 死信队列统计
    pub dead_letter_stats: DeadLetterStats,
}

impl Default for ProcessorStats {
    fn default() -> Self {
        Self {
            total_processed: 0,
            success_count: 0,
            failure_count: 0,
            filtered_count: 0,
            last_updated: Utc::now(),
            batch_stats: BatchStats::default(),
            latency_stats: LatencyStats::default(),
            retry_stats: RetryStats::default(),
            dead_letter_stats: DeadLetterStats::default(),
        }
    }
}

/// 批量统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchStats {
    /// 总批次数
    pub total_batches: u64,
    
    /// 平均批量大小
    pub avg_batch_size: f64,
    
    /// 最大批量大小
    pub max_batch_size: usize,
    
    /// 最小批量大小
    pub min_batch_size: usize,
}

impl Default for BatchStats {
    fn default() -> Self {
        Self {
            total_batches: 0,
            avg_batch_size: 0.0,
            max_batch_size: 0,
            min_batch_size: usize::MAX,
        }
    }
}

/// 延迟统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatencyStats {
    /// 平均处理时间（毫秒）
    pub avg_processing_time_ms: f64,
    
    /// 最大处理时间（毫秒）
    pub max_processing_time_ms: f64,
    
    /// 最小处理时间（毫秒）
    pub min_processing_time_ms: f64,
}

impl Default for LatencyStats {
    fn default() -> Self {
        Self {
            avg_processing_time_ms: 0.0,
            max_processing_time_ms: 0.0,
            min_processing_time_ms: f64::MAX,
        }
    }
}

/// 重试统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryStats {
    /// 总重试次数
    pub total_retries: u64,
    
    /// 成功重试次数
    pub successful_retries: u64,
    
    /// 失败重试次数
    pub failed_retries: u64,
}

impl Default for RetryStats {
    fn default() -> Self {
        Self {
            total_retries: 0,
            successful_retries: 0,
            failed_retries: 0,
        }
    }
}

/// 死信队列统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeadLetterStats {
    /// 总入队数
    pub total_enqueued: u64,
    
    /// 总出队数
    pub total_dequeued: u64,
    
    /// 当前队列大小
    pub queue_size: usize,
}

impl Default for DeadLetterStats {
    fn default() -> Self {
        Self {
            total_enqueued: 0,
            total_dequeued: 0,
            queue_size: 0,
        }
    }
}

/// 处理错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProcessingError {
    /// 配置错误
    ConfigError(String),
    
    /// 队列满错误
    QueueFullError(String),
    
    /// 验证错误
    ValidationError(String),
    
    /// 过滤错误
    FilterError(String),
    
    /// 转换错误
    TransformError(String),
    
    /// 路由错误
    RoutingError(String),
    
    /// 存储错误
    StorageError(String),
    
    /// 重试错误
    RetryError(String),
    
    /// 死信队列错误
    DeadLetterError(String),
    
    /// 系统错误
    SystemError(String),
}

impl std::fmt::Display for ProcessingError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProcessingError::ConfigError(msg) => write!(f, "Config error: {}", msg),
            ProcessingError::QueueFullError(msg) => write!(f, "Queue full error: {}", msg),
            ProcessingError::ValidationError(msg) => write!(f, "Validation error: {}", msg),
            ProcessingError::FilterError(msg) => write!(f, "Filter error: {}", msg),
            ProcessingError::TransformError(msg) => write!(f, "Transform error: {}", msg),
            ProcessingError::RoutingError(msg) => write!(f, "Routing error: {}", msg),
            ProcessingError::StorageError(msg) => write!(f, "Storage error: {}", msg),
            ProcessingError::RetryError(msg) => write!(f, "Retry error: {}", msg),
            ProcessingError::DeadLetterError(msg) => write!(f, "Dead letter error: {}", msg),
            ProcessingError::SystemError(msg) => write!(f, "System error: {}", msg),
        }
    }
}

impl std::error::Error for ProcessingError {}

/// 处理任务类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskType {
    /// 单个条目
    Single,
    /// 批量处理
    Batch,
    /// 重试
    Retry,
}

/// 处理任务
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingTask {
    /// 日志条目
    pub entry: LogEntry,
    
    /// 优先级
    pub priority: u8,
    
    /// 创建时间（时间戳）
    pub created_at: u64,
    
    /// 重试次数
    pub retry_count: u32,
    
    /// 任务类型
    pub task_type: TaskType,
}

/// 处理通道
pub type ProcessingChannel = (
    tokio::sync::mpsc::Sender<ProcessingTask>,
    tokio::sync::mpsc::Receiver<ProcessingTask>,
);

// 重新导出LogEntry
pub use crate::types::LogEntry;