use thiserror::Error;
use crate::types::log_entry::LogEntry;

/// 日志服务错误类型
#[derive(Debug, Error)]
pub enum LogError {
    /// ZMQ相关错误
    #[error("ZMQ error: {0}")]
    Zmq(#[from] zmq::Error),
    
    /// 序列化错误
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    /// IO错误
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    /// 存储错误
    #[error("Storage error: {0}")]
    Storage(String),
    
    /// 配置错误
    #[error("Configuration error: {0}")]
    Config(String),
    
    /// 处理器错误
    #[error("Processor error: {0}")]
    Processor(String),
    
    /// HTTP错误
    #[error("HTTP error: {0}")]
    Http(String),
    
    /// 无效的日志级别
    #[error("Invalid log level: {0}")]
    InvalidLogLevel(String),
    
    /// 无效的日志条目
    #[error("Invalid log entry: {0}")]
    InvalidLogEntry(String),
    
    /// 缓冲区已满
    #[error("Buffer full")]
    BufferFull,
    
    /// 超时错误
    #[error("Timeout: {0}")]
    Timeout(String),
    
    /// 连接错误
    #[error("Connection error: {0}")]
    Connection(String),
    
    /// 认证错误
    #[error("Authentication error: {0}")]
    Authentication(String),
    
    /// 权限错误
    #[error("Permission error: {0}")]
    Permission(String),
    
    /// 验证错误
    #[error("Validation error: {0}")]
    Validation(String),
    
    /// 资源不足
    #[error("Resource exhausted: {0}")]
    ResourceExhausted(String),
    
    /// 内部错误
    #[error("Internal error: {0}")]
    Internal(String),
}

/// 日志服务结果类型
pub type LogResult<T> = Result<T, LogError>;

/// 日志查询结果
#[derive(Debug, Clone)]
pub struct LogQueryResult {
    /// 日志条目列表
    pub entries: Vec<LogEntry>,
    
    /// 总数
    pub total_count: u64,
    
    /// 是否还有更多结果
    pub has_more: bool,
    
    /// 游标
    pub cursor: Option<String>,
}

impl LogQueryResult {
    /// 创建新的查询结果
    pub fn new(entries: Vec<LogEntry>, total_count: u64) -> Self {
        Self {
            entries,
            total_count,
            has_more: false,
            cursor: None,
        }
    }
    
    /// 创建分页查询结果
    pub fn paginated(entries: Vec<LogEntry>, total_count: u64, cursor: Option<String>) -> Self {
        Self {
            entries,
            total_count,
            has_more: cursor.is_some(),
            cursor,
        }
    }
}

/// 日志操作状态
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogOperationStatus {
    /// 成功
    Success,
    /// 失败
    Failed,
    /// 重试中
    Retrying,
    /// 已取消
    Cancelled,
}

impl LogOperationStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            LogOperationStatus::Success => "success",
            LogOperationStatus::Failed => "failed",
            LogOperationStatus::Retrying => "retrying",
            LogOperationStatus::Cancelled => "cancelled",
        }
    }
}

impl std::fmt::Display for LogOperationStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// 日志操作结果
#[derive(Debug, Clone)]
pub struct LogOperationResult {
    /// 操作状态
    pub status: LogOperationStatus,
    
    /// 处理的日志数量
    pub processed_count: usize,
    
    /// 错误消息
    pub error_message: Option<String>,
    
    /// 操作耗时（毫秒）
    pub duration_ms: u64,
    
    /// 额外信息
    pub metadata: Option<serde_json::Value>,
}

impl LogOperationResult {
    /// 创建成功的操作结果
    pub fn success(processed_count: usize, duration_ms: u64) -> Self {
        Self {
            status: LogOperationStatus::Success,
            processed_count,
            error_message: None,
            duration_ms,
            metadata: None,
        }
    }
    
    /// 创建失败的操作结果
    pub fn failed(error_message: String, duration_ms: u64) -> Self {
        Self {
            status: LogOperationStatus::Failed,
            processed_count: 0,
            error_message: Some(error_message),
            duration_ms,
            metadata: None,
        }
    }
    
    /// 创建重试中的操作结果
    pub fn retrying(processed_count: usize, error_message: String, duration_ms: u64) -> Self {
        Self {
            status: LogOperationStatus::Retrying,
            processed_count,
            error_message: Some(error_message),
            duration_ms,
            metadata: None,
        }
    }
    
    /// 设置元数据
    pub fn with_metadata(mut self, metadata: serde_json::Value) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

impl Default for LogOperationResult {
    fn default() -> Self {
        Self {
            status: LogOperationStatus::Success,
            processed_count: 0,
            error_message: None,
            duration_ms: 0,
            metadata: None,
        }
    }
}

/// 批量操作结果
#[derive(Debug, Clone)]
pub struct BatchOperationResult {
    /// 总条目数
    pub total_count: usize,
    
    /// 成功处理的条目数
    pub success_count: usize,
    
    /// 失败的条目数
    pub failed_count: usize,
    
    /// 操作结果列表
    pub results: Vec<LogOperationResult>,
    
    /// 总耗时（毫秒）
    pub total_duration_ms: u64,
}

impl BatchOperationResult {
    /// 创建新的批量操作结果
    pub fn new(results: Vec<LogOperationResult>, total_duration_ms: u64) -> Self {
        let total_count = results.len();
        let success_count = results.iter().filter(|r| r.status == LogOperationStatus::Success).count();
        let failed_count = total_count - success_count;
        
        Self {
            total_count,
            success_count,
            failed_count,
            results,
            total_duration_ms,
        }
    }
    
    /// 获取成功率
    pub fn success_rate(&self) -> f64 {
        if self.total_count == 0 {
            0.0
        } else {
            self.success_count as f64 / self.total_count as f64
        }
    }
    
    /// 获取失败率
    pub fn failure_rate(&self) -> f64 {
        if self.total_count == 0 {
            0.0
        } else {
            self.failed_count as f64 / self.total_count as f64
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_query_result() {
        let entries = vec![];
        let result = LogQueryResult::new(entries, 0);
        assert_eq!(result.total_count, 0);
        assert!(!result.has_more);
    }

    #[test]
    fn test_log_operation_result() {
        let result = LogOperationResult::success(10, 100);
        assert_eq!(result.status, LogOperationStatus::Success);
        assert_eq!(result.processed_count, 10);
        assert_eq!(result.duration_ms, 100);
    }

    #[test]
    fn test_batch_operation_result() {
        let results = vec![
            LogOperationResult::success(5, 50),
            LogOperationResult::failed("error".to_string(), 30),
        ];
        let batch_result = BatchOperationResult::new(results, 80);
        
        assert_eq!(batch_result.total_count, 2);
        assert_eq!(batch_result.success_count, 1);
        assert_eq!(batch_result.failed_count, 1);
        assert_eq!(batch_result.success_rate(), 0.5);
        assert_eq!(batch_result.failure_rate(), 0.5);
    }
}