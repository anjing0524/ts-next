use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use super::log_level::LogLevel;

/// 日志条目结构体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    /// 日志ID
    pub id: Uuid,
    
    /// 时间戳
    pub timestamp: DateTime<Utc>,
    
    /// 日志级别
    pub level: LogLevel,
    
    /// 日志消息
    pub message: String,
    
    /// 日志来源
    pub source: String,
    
    /// 日志标签
    pub tags: Vec<String>,
    
    /// 额外字段
    pub fields: HashMap<String, serde_json::Value>,
    
    /// 线程ID
    pub thread_id: Option<u64>,
    
    /// 进程ID
    pub process_id: Option<u32>,
    
    /// 主机名
    pub hostname: Option<String>,
    
    /// 服务名
    pub service: Option<String>,
    
    /// 版本
    pub version: Option<String>,
    
    /// 环境信息
    pub environment: Option<String>,
    
    /// 错误堆栈
    pub stack_trace: Option<String>,
    
    /// 用户ID
    pub user_id: Option<String>,
    
    /// 会话ID
    pub session_id: Option<String>,
    
    /// 请求ID
    pub request_id: Option<String>,
    
    /// 跟踪ID
    pub trace_id: Option<String>,
    
    /// 父跟踪ID
    pub parent_trace_id: Option<String>,
    
    /// 自定义元数据
    pub metadata: HashMap<String, serde_json::Value>,
}

impl LogEntry {
    /// 创建新的日志条目
    pub fn new(level: LogLevel, message: String) -> Self {
        Self {
            id: Uuid::new_v4(),
            timestamp: Utc::now(),
            level,
            message,
            source: String::new(),
            tags: Vec::new(),
            fields: HashMap::new(),
            thread_id: 0u64.into(),
            process_id: std::process::id().into(),
            hostname: gethostname::gethostname().to_string_lossy().to_string().into(),
            service: None,
            version: None,
            environment: None,
            stack_trace: None,
            user_id: None,
            session_id: None,
            request_id: None,
            trace_id: None,
            parent_trace_id: None,
            metadata: HashMap::new(),
        }
    }
    
    /// 设置日志来源
    pub fn with_source(mut self, source: String) -> Self {
        self.source = source;
        self
    }
    
    /// 添加标签
    pub fn with_tag(mut self, tag: String) -> Self {
        self.tags.push(tag);
        self
    }
    
    /// 添加多个标签
    pub fn with_tags(mut self, tags: Vec<String>) -> Self {
        self.tags.extend(tags);
        self
    }
    
    /// 添加字段
    pub fn with_field<K, V>(mut self, key: K, value: V) -> Self 
    where 
        K: Into<String>,
        V: Into<serde_json::Value>,
    {
        self.fields.insert(key.into(), value.into());
        self
    }
    
    /// 添加多个字段
    pub fn with_fields(mut self, fields: HashMap<String, serde_json::Value>) -> Self {
        self.fields.extend(fields);
        self
    }
    
    /// 设置服务名
    pub fn with_service(mut self, service: String) -> Self {
        self.service = Some(service);
        self
    }
    
    /// 设置版本
    pub fn with_version(mut self, version: String) -> Self {
        self.version = Some(version);
        self
    }
    
    /// 设置环境
    pub fn with_environment(mut self, environment: String) -> Self {
        self.environment = Some(environment);
        self
    }
    
    /// 设置错误堆栈
    pub fn with_stack_trace(mut self, stack_trace: String) -> Self {
        self.stack_trace = Some(stack_trace);
        self
    }
    
    /// 设置用户ID
    pub fn with_user_id(mut self, user_id: String) -> Self {
        self.user_id = Some(user_id);
        self
    }
    
    /// 设置会话ID
    pub fn with_session_id(mut self, session_id: String) -> Self {
        self.session_id = Some(session_id);
        self
    }
    
    /// 设置请求ID
    pub fn with_request_id(mut self, request_id: String) -> Self {
        self.request_id = Some(request_id);
        self
    }
    
    /// 设置跟踪ID
    pub fn with_trace_id(mut self, trace_id: String) -> Self {
        self.trace_id = Some(trace_id);
        self
    }
    
    /// 设置父跟踪ID
    pub fn with_parent_trace_id(mut self, parent_trace_id: String) -> Self {
        self.parent_trace_id = Some(parent_trace_id);
        self
    }
    
    /// 添加元数据
    pub fn with_metadata<K, V>(mut self, key: K, value: V) -> Self 
    where 
        K: Into<String>,
        V: Into<serde_json::Value>,
    {
        self.metadata.insert(key.into(), value.into());
        self
    }
    
    /// 转换为JSON字符串
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
    
    /// 转换为格式化的JSON字符串
    pub fn to_json_pretty(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }
    
    /// 从JSON字符串创建日志条目
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
    
    /// 创建错误日志
    pub fn error(message: String) -> Self {
        Self::new(LogLevel::Error, message)
    }
    
    /// 创建警告日志
    pub fn warn(message: String) -> Self {
        Self::new(LogLevel::Warn, message)
    }
    
    /// 创建信息日志
    pub fn info(message: String) -> Self {
        Self::new(LogLevel::Info, message)
    }
    
    /// 创建调试日志
    pub fn debug(message: String) -> Self {
        Self::new(LogLevel::Debug, message)
    }
    
    /// 创建跟踪日志
    pub fn trace(message: String) -> Self {
        Self::new(LogLevel::Trace, message)
    }
    
    /// 检查是否包含特定标签
    pub fn has_tag(&self, tag: &str) -> bool {
        self.tags.contains(&tag.to_string())
    }
    
    /// 获取特定字段的值
    pub fn get_field(&self, key: &str) -> Option<&serde_json::Value> {
        self.fields.get(key)
    }
    
    /// 获取特定元数据的值
    pub fn get_metadata(&self, key: &str) -> Option<&serde_json::Value> {
        self.metadata.get(key)
    }
    
    /// 转换为简单的日志格式
    pub fn to_simple_format(&self) -> String {
        format!("[{}] {}: {}", self.timestamp.format("%Y-%m-%d %H:%M:%S%.3f"), self.level, self.message)
    }
    
    /// 转换为结构化的日志格式
    pub fn to_structured_format(&self) -> String {
        let mut fields = self.fields.clone();
        fields.insert("timestamp".to_string(), self.timestamp.to_rfc3339().into());
        fields.insert("level".to_string(), self.level.as_str().into());
        fields.insert("message".to_string(), self.message.clone().into());
        fields.insert("source".to_string(), self.source.clone().into());
        
        if let Some(service) = &self.service {
            fields.insert("service".to_string(), service.clone().into());
        }
        
        if let Some(trace_id) = &self.trace_id {
            fields.insert("trace_id".to_string(), trace_id.clone().into());
        }
        
        serde_json::to_string(&fields).unwrap_or_else(|_| self.to_simple_format())
    }
}

impl Default for LogEntry {
    fn default() -> Self {
        Self::new(LogLevel::Info, String::new())
    }
}

/// 日志批量结构体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogBatch {
    /// 批次ID
    pub id: Uuid,
    
    /// 日志条目列表
    pub entries: Vec<LogEntry>,
    
    /// 创建时间
    pub created_at: DateTime<Utc>,
    
    /// 批次大小
    pub size: usize,
    
    /// 压缩标志
    pub compressed: bool,
}

impl LogBatch {
    /// 创建新的日志批次
    pub fn new(entries: Vec<LogEntry>) -> Self {
        let size = entries.len();
        Self {
            id: Uuid::new_v4(),
            entries,
            created_at: Utc::now(),
            size,
            compressed: false,
        }
    }
    
    /// 获取批次大小（字节）
    pub fn byte_size(&self) -> usize {
        self.entries.iter()
            .map(|entry| entry.to_json().unwrap_or_default().len())
            .sum()
    }
    
    /// 分割批次
    pub fn split(self, max_size: usize) -> Vec<Self> {
        let mut batches = Vec::new();
        let mut current_batch = Vec::new();
        let mut current_size = 0;
        
        for entry in self.entries {
            let entry_size = entry.to_json().unwrap_or_default().len();
            
            if current_size + entry_size > max_size && !current_batch.is_empty() {
                batches.push(LogBatch::new(current_batch));
                current_batch = Vec::new();
                current_size = 0;
            }
            
            current_batch.push(entry);
            current_size += entry_size;
        }
        
        if !current_batch.is_empty() {
            batches.push(LogBatch::new(current_batch));
        }
        
        batches
    }
}

/// 日志查询参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogQuery {
    /// 日志级别过滤
    pub level: Option<LogLevel>,
    
    /// 时间范围开始
    pub start_time: Option<DateTime<Utc>>,
    
    /// 时间范围结束
    pub end_time: Option<DateTime<Utc>>,
    
    /// 来源过滤
    pub source: Option<String>,
    
    /// 服务过滤
    pub service: Option<String>,
    
    /// 标签过滤
    pub tags: Option<Vec<String>>,
    
    /// 消息内容过滤
    pub message_contains: Option<String>,
    
    /// 用户ID过滤
    pub user_id: Option<String>,
    
    /// 跟踪ID过滤
    pub trace_id: Option<String>,
    
    /// 字段过滤
    pub fields: Option<HashMap<String, serde_json::Value>>,
    
    /// 限制数量
    pub limit: Option<usize>,
    
    /// 偏移量
    pub offset: Option<usize>,
    
    /// 排序字段
    pub sort_by: Option<String>,
    
    /// 排序方向
    pub sort_order: Option<SortOrder>,
}

/// 排序方向
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SortOrder {
    Asc,
    Desc,
}

impl SortOrder {
    pub fn as_str(&self) -> &'static str {
        match self {
            SortOrder::Asc => "asc",
            SortOrder::Desc => "desc",
        }
    }
}

/// 日志统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogStats {
    /// 总日志数
    pub total_count: u64,
    
    /// 按级别统计
    pub level_counts: HashMap<LogLevel, u64>,
    
    /// 按来源统计
    pub source_counts: HashMap<String, u64>,
    
    /// 按服务统计
    pub service_counts: HashMap<String, u64>,
    
    /// 按时间统计（每小时）
    pub hourly_counts: HashMap<String, u64>,
    
    /// 平均处理时间
    pub avg_processing_time_ms: f64,
    
    /// 最大处理时间
    pub max_processing_time_ms: f64,
    
    /// 最小处理时间
    pub min_processing_time_ms: f64,
    
    /// 最后更新时间
    pub last_updated: DateTime<Utc>,
}

impl Default for LogStats {
    fn default() -> Self {
        Self {
            total_count: 0,
            level_counts: HashMap::new(),
            source_counts: HashMap::new(),
            service_counts: HashMap::new(),
            hourly_counts: HashMap::new(),
            avg_processing_time_ms: 0.0,
            max_processing_time_ms: 0.0,
            min_processing_time_ms: 0.0,
            last_updated: Utc::now(),
        }
    }
}