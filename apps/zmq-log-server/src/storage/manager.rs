use std::sync::Arc;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::sync::{RwLock, mpsc};
use tokio::fs;
use tokio::io::{AsyncWriteExt, AsyncReadExt};
use tokio::time::{Duration, Instant};
use tracing::{info, error, debug};
use chrono::{DateTime, Utc};
use flate2::{write::GzEncoder, Compression};
use std::io::Write;

use crate::config::StorageConfig;
use crate::types::{LogEntry, LogBatch};
use crate::memory::{MemoryPool, MemoryPoolConfig, ZeroCopyBuffer};
use super::types::{
    StorageStats, FileInfo, FileStatus, WriteOptions, 
    BatchWriteOptions, StorageError, CacheStats
};

/// 日志存储管理器
#[derive(Clone)]
pub struct LogStorage {
    /// 存储配置
    config: Arc<StorageConfig>,
    
    /// 当前活跃文件
    current_file: Arc<RwLock<Option<fs::File>>>,
    
    /// 当前文件路径
    current_file_path: Arc<RwLock<Option<PathBuf>>>,
    
    /// 当前文件大小
    current_file_size: Arc<RwLock<u64>>,
    
    /// 文件信息缓存
    file_cache: Arc<RwLock<HashMap<String, FileInfo>>>,
    
    /// 内存缓存
    memory_cache: Arc<RwLock<HashMap<String, Vec<u8>>>>,
    
    /// 内存池
    memory_pool: Arc<MemoryPool>,
    
    /// 统计信息
    stats: Arc<RwLock<StorageStats>>,
    
    /// 写入通道
    write_channel: Arc<RwLock<Option<mpsc::UnboundedSender<WriteRequest>>>>,
    
    /// 运行状态
    running: Arc<RwLock<bool>>,
}

/// 写入请求
#[derive(Debug, Clone)]
pub struct WriteRequest {
    /// 数据
    pub data: Vec<u8>,
    /// 写入选项
    pub options: WriteOptions,
    /// 完成回调
    pub callback: Option<mpsc::UnboundedSender<Result<(), StorageError>>>,
}

impl LogStorage {
    /// 创建新的存储实例
    pub async fn new(config: Arc<StorageConfig>) -> Result<Self, crate::error::LogServerError> {
        
        // 创建日志目录
        fs::create_dir_all(&config.log_dir).await?;
        
        // 创建内存池
        let memory_pool_config = MemoryPoolConfig {
            buffer_size: config.memory_pool_buffer_size.unwrap_or(64 * 1024), // 64KB default
            max_buffers: config.memory_pool_max_buffers.unwrap_or(1000),
            initial_buffers: config.memory_pool_initial_buffers.unwrap_or(100),
            enable_stats: true,
            aggressive_recycling: true,
        };
        
        let memory_pool = Arc::new(MemoryPool::new(memory_pool_config).await?);
        
        let storage = Self {
            config: config.clone(),
            current_file: Arc::new(RwLock::new(None)),
            current_file_path: Arc::new(RwLock::new(None)),
            current_file_size: Arc::new(RwLock::new(0)),
            file_cache: Arc::new(RwLock::new(HashMap::new())),
            memory_cache: Arc::new(RwLock::new(HashMap::new())),
            memory_pool,
            stats: Arc::new(RwLock::new(StorageStats::default())),
            write_channel: Arc::new(RwLock::new(None)),
            running: Arc::new(RwLock::new(false)),
        };
        
        // 初始化文件
        storage.initialize_current_file().await?;
        
        // 启动写入处理器
        storage.start_write_processor().await?;
        
        // 启动维护任务
        storage.start_maintenance_tasks().await?;
        
        info!("Log storage initialized with config: {:?}", config);
        Ok(storage)
    }
    
    /// 初始化当前文件
    async fn initialize_current_file(&self) -> Result<(), StorageError> {
        let file_path = self.generate_file_path().await?;
        
        let file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file_path)
            .await?;
        
        let metadata = file.metadata().await?;
        let file_size = metadata.len();
        
        *self.current_file.write().await = Some(file);
        *self.current_file_path.write().await = Some(file_path.clone());
        *self.current_file_size.write().await = file_size;
        
        // 更新文件缓存
        let file_info = FileInfo {
            name: file_path.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string(),
            path: file_path.clone(),
            size: file_size,
            created_at: DateTime::from(metadata.created().unwrap_or(std::time::SystemTime::UNIX_EPOCH)),
            modified_at: DateTime::from(metadata.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH)),
            compressed: false,
            status: FileStatus::Active,
        };
        
        self.file_cache.write().await.insert(file_path.to_string_lossy().to_string(), file_info);
        
        Ok(())
    }
    
    /// 生成文件路径
    async fn generate_file_path(&self) -> Result<PathBuf, StorageError> {
        let now = Utc::now();
        let filename = self.config.file_name_pattern
            .replace("{date}", &now.format("%Y-%m-%d").to_string())
            .replace("{time}", &now.format("%H-%M-%S").to_string())
            .replace("{datetime}", &now.format("%Y-%m-%d_%H-%M-%S").to_string())
            .replace("{timestamp}", &now.timestamp().to_string());
        
        let file_path = std::path::PathBuf::from(&self.config.log_dir).join(filename);
        
        // 检查文件是否已存在
        if file_path.exists() {
            // 如果文件已存在，添加序号
            for i in 1..=100 {
                let new_path = std::path::PathBuf::from(&self.config.log_dir).join(format!("{}.{}", i, file_path.file_name().unwrap().to_string_lossy()));
                if !new_path.exists() {
                    return Ok(new_path);
                }
            }
        }
        
        Ok(file_path)
    }
    
    /// 启动写入处理器
    async fn start_write_processor(&self) -> Result<(), StorageError> {
        let (tx, mut rx) = mpsc::unbounded_channel();
        *self.write_channel.write().await = Some(tx);
        
        let config = self.config.clone();
        let current_file = self.current_file.clone();
        let current_file_path = self.current_file_path.clone();
        let current_file_size = self.current_file_size.clone();
        let stats = self.stats.clone();
        let memory_cache = self.memory_cache.clone();
        let file_cache = self.file_cache.clone();
        
        tokio::spawn(async move {
            while let Some(request) = rx.recv().await {
                let start_time = Instant::now();
                
                match Self::process_write_request(
                    request,
                    &config,
                    &current_file,
                    &current_file_path,
                    &current_file_size,
                    &stats,
                    &memory_cache,
                    &file_cache
                ).await {
                    Ok(_) => {
                        let processing_time = start_time.elapsed();
                        debug!("Write request processed in {:?}", processing_time);
                    }
                    Err(e) => {
                        error!("Failed to process write request: {}", e);
                    }
                }
            }
        });
        
        Ok(())
    }
    
    /// 处理写入请求
    async fn process_write_request(
        request: WriteRequest,
        config: &Arc<StorageConfig>,
        current_file: &Arc<RwLock<Option<fs::File>>>,
        current_file_path: &Arc<RwLock<Option<PathBuf>>>,
        current_file_size: &Arc<RwLock<u64>>,
        stats: &Arc<RwLock<StorageStats>>,
        memory_cache: &Arc<RwLock<HashMap<String, Vec<u8>>>>,
        file_cache: &Arc<RwLock<HashMap<String, FileInfo>>>,
    ) -> Result<(), StorageError> {
        let data = request.data;
        let options = request.options;
        
        // 检查是否需要轮转
        if config.enable_rotation {
            if let Some(file_size) = Some(*current_file_size.read().await) {
                if file_size + data.len() as u64 > config.max_file_size as u64 {
                    Self::rotate_file(config, current_file, current_file_path, current_file_size, file_cache).await?;
                }
            }
        }
        
        // 执行写入
        let write_result = if options.sync {
            Self::write_sync(&data, current_file, options.timeout).await
        } else {
            Self::write_async(&data, current_file, options.timeout).await
        };
        
        match write_result {
            Ok(bytes_written) => {
                // 更新统计信息
                {
                    let mut stats = stats.write().await;
                    stats.total_bytes_written += bytes_written as u64;
                    stats.total_writes += 1;
                    stats.avg_write_size = stats.total_bytes_written as f64 / stats.total_writes as f64;
                    stats.last_updated = Utc::now();
                }
                
                // 更新当前文件大小
                {
                    let mut file_size = current_file_size.write().await;
                    *file_size += bytes_written as u64;
                }
                
                // 更新内存缓存
                if config.enable_memory_cache {
                    let mut cache = memory_cache.write().await;
                    if let Some(path) = current_file_path.read().await.as_ref() {
                        let key = path.to_string_lossy().to_string();
                        cache.entry(key).or_insert_with(Vec::new).extend(data.iter().cloned());
                        
                        // 限制缓存大小
                        let total_size: usize = cache.values().map(|v| v.len()).sum();
                        if total_size > config.memory_cache_size {
                            // 清理最老的缓存
                            if let Some(key) = cache.keys().next().cloned() {
                                cache.remove(&key);
                            }
                        }
                    }
                }
                
                // 发送完成回调
                if let Some(callback) = request.callback {
                    let _ = callback.send(Ok(()));
                }
                
                Ok(())
            }
            Err(e) => {
                // 更新失败统计
                {
                    let mut stats = stats.write().await;
                    stats.write_failures += 1;
                }
                
                // 发送错误回调
                if let Some(callback) = request.callback {
                    let _ = callback.send(Err(e.clone()));
                }
                
                Err(e)
            }
        }
    }
    
    /// 同步写入
    async fn write_sync(
        data: &[u8],
        current_file: &Arc<RwLock<Option<fs::File>>>,
        timeout_duration: Option<Duration>,
    ) -> Result<usize, StorageError> {
        let mut file_guard = current_file.write().await;
        let file = file_guard.as_mut().ok_or_else(|| StorageError::IoError("No active file".to_string()))?;
        
        let write_future = async {
            file.write_all(data).await?;
            file.flush().await?;
            Ok(data.len())
        };
        
        match timeout_duration {
            Some(t) => tokio::time::timeout(t, write_future).await
                .map_err(|_| StorageError::IoError("Write timeout".to_string()))?,
            None => write_future.await,
        }
    }
    
    /// 异步写入
    async fn write_async(
        data: &[u8],
        current_file: &Arc<RwLock<Option<fs::File>>>,
        timeout_duration: Option<Duration>,
    ) -> Result<usize, StorageError> {
        let mut file_guard = current_file.write().await;
        let file = file_guard.as_mut().ok_or_else(|| StorageError::IoError("No active file".to_string()))?;
        
        let write_future = async {
            file.write_all(data).await?;
            Ok(data.len())
        };
        
        match timeout_duration {
            Some(t) => tokio::time::timeout(t, write_future).await
                .map_err(|_| StorageError::IoError("Write timeout".to_string()))?,
            None => write_future.await,
        }
    }
    
    /// 轮转文件
    async fn rotate_file(
        config: &Arc<StorageConfig>,
        current_file: &Arc<RwLock<Option<fs::File>>>,
        current_file_path: &Arc<RwLock<Option<PathBuf>>>,
        current_file_size: &Arc<RwLock<u64>>,
        file_cache: &Arc<RwLock<HashMap<String, FileInfo>>>,
    ) -> Result<(), StorageError> {
        info!("Rotating log file");
        
        // 关闭当前文件
        {
            let mut file_guard = current_file.write().await;
            *file_guard = None;
        }
        
        // 更新文件状态
        if let Some(path) = current_file_path.read().await.as_ref() {
            let mut cache = file_cache.write().await;
            if let Some(file_info) = cache.get_mut(&path.to_string_lossy().to_string()) {
                file_info.status = FileStatus::Rotated;
            }
        }
        
        // 压缩旧文件
        if config.enable_compression {
            if let Some(path) = current_file_path.read().await.as_ref() {
                Self::compress_file(path, config.compression_level).await?;
            }
        }
        
        // 清理旧文件
        Self::cleanup_old_files(config, file_cache).await?;
        
        // 创建新文件
        let new_file_path = Self::generate_file_path_for_config(config).await?;
        let new_file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&new_file_path)
            .await?;
        
        // 更新状态
        *current_file.write().await = Some(new_file);
        *current_file_path.write().await = Some(new_file_path.clone());
        *current_file_size.write().await = 0;
        
        // 更新文件缓存
        let file_info = FileInfo {
            name: new_file_path.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string(),
            path: new_file_path.clone(),
            size: 0,
            created_at: Utc::now(),
            modified_at: Utc::now(),
            compressed: false,
            status: FileStatus::Active,
        };
        
        file_cache.write().await.insert(new_file_path.to_string_lossy().to_string(), file_info);
        
        Ok(())
    }
    
    /// 生成文件路径（配置版本）
    async fn generate_file_path_for_config(config: &StorageConfig) -> Result<PathBuf, StorageError> {
        let now = Utc::now();
        let filename = config.file_name_pattern
            .replace("{date}", &now.format("%Y-%m-%d").to_string())
            .replace("{time}", &now.format("%H-%M-%S").to_string())
            .replace("{datetime}", &now.format("%Y-%m-%d_%H-%M-%S").to_string())
            .replace("{timestamp}", &now.timestamp().to_string());
        
        Ok(std::path::PathBuf::from(&config.log_dir).join(filename))
    }
    
    /// 压缩文件
    async fn compress_file(file_path: &Path, compression_level: u8) -> Result<(), StorageError> {
        let start_time = Instant::now();
        
        // 读取原始文件
        let mut original_file = fs::File::open(file_path).await?;
        let mut original_data = Vec::new();
        original_file.read_to_end(&mut original_data).await?;
        
        // 压缩数据
        let mut encoder = GzEncoder::new(Vec::new(), Compression::new(compression_level.into()));
        encoder.write_all(&original_data)?;
        let compressed_data = encoder.finish()?;
        
        // 写入压缩文件
        let compressed_path = file_path.with_extension("log.gz");
        let mut compressed_file = fs::File::create(&compressed_path).await?;
        compressed_file.write_all(&compressed_data).await?;
        
        // 删除原始文件
        fs::remove_file(file_path).await?;
        
        let compression_time = start_time.elapsed();
        info!("File compressed: {} -> {} ({:.2}% reduction, took {:?})",
            file_path.display(),
            compressed_path.display(),
            (1.0 - compressed_data.len() as f64 / original_data.len() as f64) * 100.0,
            compression_time);
        
        Ok(())
    }
    
    /// 清理旧文件
    async fn cleanup_old_files(
        config: &StorageConfig,
        file_cache: &Arc<RwLock<HashMap<String, FileInfo>>>,
    ) -> Result<(), StorageError> {
        let mut files = Vec::new();
        
        // 读取目录中的文件
        let mut entries = fs::read_dir(&config.log_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_file() {
                if let Ok(metadata) = entry.metadata().await {
                    files.push((path, metadata));
                }
            }
        }
        
        // 按修改时间排序
        files.sort_by(|a, b| b.1.modified().unwrap().cmp(&a.1.modified().unwrap()));
        
        // 删除超出限制的文件
        if files.len() > config.max_files {
            for (path, _) in files.iter().skip(config.max_files) {
                fs::remove_file(path).await?;
                file_cache.write().await.remove(&path.to_string_lossy().to_string());
            }
        }
        
        Ok(())
    }
    
    /// 启动维护任务
    async fn start_maintenance_tasks(&self) -> Result<(), StorageError> {
        let config = self.config.clone();
        let current_file = self.current_file.clone();
        let current_file_path = self.current_file_path.clone();
        let current_file_size = self.current_file_size.clone();
        let stats = self.stats.clone();
        let file_cache = self.file_cache.clone();
        let running = self.running.clone();
        
        *running.write().await = true;
        
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60)); // 每分钟检查一次
            
            while *running.read().await {
                interval.tick().await;
                
                // 检查文件轮转
                if config.enable_rotation {
                    if let Some(file_size) = Some(*current_file_size.read().await) {
                        if file_size > config.max_file_size as u64 {
                            if let Err(e) = Self::rotate_file(
                                &config,
                                &current_file,
                                &current_file_path,
                                &current_file_size,
                                &file_cache
                            ).await {
                                error!("Failed to rotate file: {}", e);
                            }
                        }
                    }
                }
                
                // 更新统计信息
                Self::update_storage_stats(&config, &stats, &file_cache).await;
            }
        });
        
        Ok(())
    }
    
    /// 更新存储统计信息
    async fn update_storage_stats(
        config: &StorageConfig,
        stats: &Arc<RwLock<StorageStats>>,
        file_cache: &Arc<RwLock<HashMap<String, FileInfo>>>,
    ) {
        let mut stats = stats.write().await;
        let cache = file_cache.read().await;
        
        stats.total_files = cache.len() as u64;
        stats.total_size = cache.values().map(|f| f.size).sum();
        stats.active_files = cache.values().filter(|f| f.status == FileStatus::Active).count() as u64;
        stats.compressed_files = cache.values().filter(|f| f.compressed).count() as u64;
        stats.last_updated = Utc::now();
        
        // 更新缓存统计
        if config.enable_memory_cache {
            let mut cache_stats = CacheStats::default();
            cache_stats.max_size = config.memory_cache_size;
            // 这里可以添加更详细的缓存统计
            stats.cache_stats = cache_stats;
        }
    }
    
    /// 写入日志条目
    pub async fn write_log_entry(&self, entry: &LogEntry) -> Result<(), StorageError> {
        let data = entry.to_json().map_err(|e| StorageError::IoError(e.to_string()))?;
        let data = data.as_bytes();
        
        let request = WriteRequest {
            data: data.to_vec(),
            options: WriteOptions::default(),
            callback: None,
        };
        
        if let Some(ref channel) = *self.write_channel.read().await {
            channel.send(request)
                .map_err(|_| StorageError::IoError("Failed to send write request".to_string()))?;
        } else {
            return Err(StorageError::IoError("Write channel not available".to_string()));
        }
        
        Ok(())
    }
    
    /// 批量写入日志条目
    pub async fn write_log_batch(&self, batch: &LogBatch) -> Result<(), StorageError> {
        let options = BatchWriteOptions::default();
        
        // 分批处理
        for chunk in batch.entries.chunks(options.batch_size) {
            let mut batch_data = Vec::new();
            
            for entry in chunk {
                let entry_data = entry.to_json()
                    .map_err(|e| StorageError::IoError(e.to_string()))?;
                batch_data.extend_from_slice(entry_data.as_bytes());
                batch_data.push(b'\n'); // 添加换行符分隔
            }
            
            let request = WriteRequest {
                data: batch_data,
                options: WriteOptions::default(),
                callback: None,
            };
            
            if let Some(ref channel) = *self.write_channel.read().await {
                channel.send(request)
                    .map_err(|_| StorageError::IoError("Failed to send write request".to_string()))?;
            } else {
                return Err(StorageError::IoError("Write channel not available".to_string()));
            }
        }
        
        Ok(())
    }
    
    /// 获取存储统计信息
    pub async fn get_stats(&self) -> StorageStats {
        self.stats.read().await.clone()
    }
    
    /// 获取内存池引用
    pub async fn get_memory_pool(&self) -> Arc<MemoryPool> {
        self.memory_pool.clone()
    }
    
    /// 获取文件列表
    pub async fn list_files(&self) -> Vec<FileInfo> {
        let cache = self.file_cache.read().await;
        cache.values().cloned().collect()
    }
    
    /// 停止存储服务
    pub async fn stop(&self) -> Result<(), StorageError> {
        *self.running.write().await = false;
        
        // 等待写入通道关闭
        drop(self.write_channel.write().await.take());
        
        // 关闭当前文件
        let mut file_guard = self.current_file.write().await;
        *file_guard = None;
        
        info!("Log storage stopped");
        Ok(())
    }
    
    /// 关闭存储服务（兼容接口）
    pub async fn shutdown(&self) -> Result<(), StorageError> {
        self.stop().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::StorageConfig;
    
    #[tokio::test]
    async fn test_storage_creation() {
        let config = Arc::new(StorageConfig::default());
        let storage = LogStorage::new(config).await;
        assert!(storage.is_ok());
    }
    
    #[tokio::test]
    async fn test_log_entry_write() {
        let config = Arc::new(StorageConfig::default());
        let storage = LogStorage::new(config).await.unwrap();
        
        let entry = LogEntry::new(crate::types::LogLevel::Info, "Test message".to_string());
        let result = storage.write_log_entry(&entry).await;
        assert!(result.is_ok());
    }
}