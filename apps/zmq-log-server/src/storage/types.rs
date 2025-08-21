use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use chrono::{DateTime, Utc};

/// 存储配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    /// 日志目录
    pub log_dir: PathBuf,
    
    /// 最大文件大小（字节）
    pub max_file_size: usize,
    
    /// 最大文件数量
    pub max_files: usize,
    
    /// 启用压缩
    pub enable_compression: bool,
    
    /// 压缩级别（1-9）
    pub compression_level: u8,
    
    /// 文件命名模式
    pub file_name_pattern: String,
    
    /// 启用轮转
    pub enable_rotation: bool,
    
    /// 轮转策略
    pub rotation_strategy: RotationStrategy,
    
    /// 缓冲区大小
    pub buffer_size: usize,
    
    /// 异步写入超时
    pub write_timeout: std::time::Duration,
    
    /// 启用内存缓存
    pub enable_memory_cache: bool,
    
    /// 内存缓存大小
    pub memory_cache_size: usize,
    
    /// 内存池缓冲区大小
    pub memory_pool_buffer_size: Option<usize>,
    
    /// 内存池最大缓冲区数量
    pub memory_pool_max_buffers: Option<usize>,
    
    /// 内存池初始缓冲区数量
    pub memory_pool_initial_buffers: Option<usize>,
    
    /// 备份配置
    pub backup: BackupConfig,
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            log_dir: PathBuf::from("./logs"),
            max_file_size: 100 * 1024 * 1024, // 100MB
            max_files: 30,
            enable_compression: true,
            compression_level: 6,
            file_name_pattern: "app-{date}.log".to_string(),
            enable_rotation: true,
            rotation_strategy: RotationStrategy::SizeBased,
            buffer_size: 8192,
            write_timeout: std::time::Duration::from_secs(5),
            enable_memory_cache: true,
            memory_cache_size: 1024 * 1024, // 1MB
            memory_pool_buffer_size: Some(64 * 1024), // 64KB
            memory_pool_max_buffers: Some(1000),
            memory_pool_initial_buffers: Some(100),
            backup: BackupConfig::default(),
        }
    }
}

/// 轮转策略
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RotationStrategy {
    /// 基于大小轮转
    SizeBased,
    /// 基于时间轮转
    TimeBased,
    /// 基于大小和时间轮转
    SizeAndTimeBased,
}

impl Default for RotationStrategy {
    fn default() -> Self {
        RotationStrategy::SizeBased
    }
}

/// 备份配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupConfig {
    /// 启用备份
    pub enabled: bool,
    
    /// 备份目录
    pub backup_dir: PathBuf,
    
    /// 备份保留天数
    pub retention_days: u32,
    
    /// 备份间隔（小时）
    pub backup_interval_hours: u32,
    
    /// 压缩备份
    pub compress_backups: bool,
}

impl Default for BackupConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            backup_dir: PathBuf::from("./backups"),
            retention_days: 30,
            backup_interval_hours: 24,
            compress_backups: true,
        }
    }
}

/// 文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    /// 文件名
    pub name: String,
    
    /// 文件路径
    pub path: PathBuf,
    
    /// 文件大小
    pub size: u64,
    
    /// 创建时间
    pub created_at: DateTime<Utc>,
    
    /// 修改时间
    pub modified_at: DateTime<Utc>,
    
    /// 是否压缩
    pub compressed: bool,
    
    /// 文件状态
    pub status: FileStatus,
}

/// 文件状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FileStatus {
    /// 活跃文件
    Active,
    /// 轮转完成
    Rotated,
    /// 压缩完成
    Compressed,
    /// 已备份
    BackedUp,
    /// 待删除
    PendingDeletion,
}

/// 存储统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageStats {
    /// 总文件数
    pub total_files: u64,
    
    /// 总大小
    pub total_size: u64,
    
    /// 活跃文件数
    pub active_files: u64,
    
    /// 压缩文件数
    pub compressed_files: u64,
    
    /// 总写入字节数
    pub total_bytes_written: u64,
    
    /// 总写入次数
    pub total_writes: u64,
    
    /// 平均写入大小
    pub avg_write_size: f64,
    
    /// 写入失败次数
    pub write_failures: u64,
    
    /// 压缩统计
    pub compression_stats: CompressionStats,
    
    /// 缓存统计
    pub cache_stats: CacheStats,
    
    /// 最后更新时间
    pub last_updated: DateTime<Utc>,
}

impl Default for StorageStats {
    fn default() -> Self {
        Self {
            total_files: 0,
            total_size: 0,
            active_files: 0,
            compressed_files: 0,
            total_bytes_written: 0,
            total_writes: 0,
            avg_write_size: 0.0,
            write_failures: 0,
            compression_stats: CompressionStats::default(),
            cache_stats: CacheStats::default(),
            last_updated: Utc::now(),
        }
    }
}

/// 压缩统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionStats {
    /// 压缩文件数
    pub compressed_files: u64,
    
    /// 压缩前总大小
    pub original_size: u64,
    
    /// 压缩后总大小
    pub compressed_size: u64,
    
    /// 压缩率
    pub compression_ratio: f64,
    
    /// 压缩时间（毫秒）
    pub total_compression_time_ms: u64,
}

impl Default for CompressionStats {
    fn default() -> Self {
        Self {
            compressed_files: 0,
            original_size: 0,
            compressed_size: 0,
            compression_ratio: 0.0,
            total_compression_time_ms: 0,
        }
    }
}

/// 缓存统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    /// 缓存命中次数
    pub hits: u64,
    
    /// 缓存未命中次数
    pub misses: u64,
    
    /// 缓存命中率
    pub hit_rate: f64,
    
    /// 当前缓存大小
    pub current_size: usize,
    
    /// 最大缓存大小
    pub max_size: usize,
    
    /// 缓存条目数
    pub entries: u64,
}

impl Default for CacheStats {
    fn default() -> Self {
        Self {
            hits: 0,
            misses: 0,
            hit_rate: 0.0,
            current_size: 0,
            max_size: 0,
            entries: 0,
        }
    }
}

/// 存储错误类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StorageError {
    /// IO错误
    IoError(String),
    
    /// 文件不存在
    FileNotFound(String),
    
    /// 权限错误
    PermissionDenied(String),
    
    /// 磁盘空间不足
    DiskFull(String),
    
    /// 配置错误
    ConfigError(String),
    
    /// 压缩错误
    CompressionError(String),
    
    /// 缓存错误
    CacheError(String),
    
    /// 备份错误
    BackupError(String),
}

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StorageError::IoError(msg) => write!(f, "IO Error: {}", msg),
            StorageError::FileNotFound(msg) => write!(f, "File not found: {}", msg),
            StorageError::PermissionDenied(msg) => write!(f, "Permission denied: {}", msg),
            StorageError::DiskFull(msg) => write!(f, "Disk full: {}", msg),
            StorageError::ConfigError(msg) => write!(f, "Config error: {}", msg),
            StorageError::CompressionError(msg) => write!(f, "Compression error: {}", msg),
            StorageError::CacheError(msg) => write!(f, "Cache error: {}", msg),
            StorageError::BackupError(msg) => write!(f, "Backup error: {}", msg),
        }
    }
}

impl std::error::Error for StorageError {}

/// 从std::io::Error转换
impl From<std::io::Error> for StorageError {
    fn from(err: std::io::Error) -> Self {
        StorageError::IoError(err.to_string())
    }
}

/// 写入选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteOptions {
    /// 是否同步写入
    pub sync: bool,
    
    /// 是否追加写入
    pub append: bool,
    
    /// 是否创建新文件
    pub create: bool,
    
    /// 是否创建目录
    pub create_dir: bool,
    
    /// 写入超时
    pub timeout: Option<std::time::Duration>,
    
    /// 重试次数
    pub retry_count: u32,
    
    /// 重试间隔
    pub retry_delay: std::time::Duration,
}

impl Default for WriteOptions {
    fn default() -> Self {
        Self {
            sync: false,
            append: true,
            create: true,
            create_dir: true,
            timeout: Some(std::time::Duration::from_secs(5)),
            retry_count: 3,
            retry_delay: std::time::Duration::from_millis(100),
        }
    }
}

/// 查询选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryOptions {
    /// 查询模式
    pub mode: QueryMode,
    
    /// 缓存结果
    pub cache_results: bool,
    
    /// 最大结果数
    pub max_results: Option<usize>,
    
    /// 排序字段
    pub sort_by: Option<String>,
    
    /// 排序方向
    pub sort_order: Option<SortOrder>,
    
    /// 包含元数据
    pub include_metadata: bool,
}

impl Default for QueryOptions {
    fn default() -> Self {
        Self {
            mode: QueryMode::Recent,
            cache_results: true,
            max_results: Some(1000),
            sort_by: Some("timestamp".to_string()),
            sort_order: Some(SortOrder::Desc),
            include_metadata: false,
        }
    }
}

/// 查询模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum QueryMode {
    /// 最近日志
    Recent,
    /// 历史日志
    Historical,
    /// 实时日志
    Realtime,
    /// 范围查询
    Range,
}

/// 批量写入选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchWriteOptions {
    /// 批量大小
    pub batch_size: usize,
    
    /// 批量超时
    pub batch_timeout: std::time::Duration,
    
    /// 是否压缩批量数据
    pub compress_batch: bool,
    
    /// 并发写入数
    pub concurrent_writes: usize,
    
    /// 失败时是否跳过
    pub skip_on_failure: bool,
}

impl Default for BatchWriteOptions {
    fn default() -> Self {
        Self {
            batch_size: 100,
            batch_timeout: std::time::Duration::from_secs(1),
            compress_batch: false,
            concurrent_writes: 4,
            skip_on_failure: true,
        }
    }
}

/// 排序方向
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SortOrder {
    Asc,
    Desc,
}

impl Default for SortOrder {
    fn default() -> Self {
        SortOrder::Desc
    }
}