use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{Duration, Instant, sleep};
use tracing::{debug, info};
use crate::error::{LogServerError, Result};

use crate::config::ProcessorConfig;
use crate::storage::LogStorage;
use crate::types::{LogEntry, LogBatch, LogLevel};
use crate::memory::{MemoryPool, ZeroCopyBuffer};
use crate::processor::types::{
    ProcessingTask, ProcessingError, TaskType,
    ProcessorStats, ProcessingChannel,
};

/// 日志处理器 - 负责处理日志条目的核心逻辑
pub struct LogProcessor {
    config: Arc<ProcessorConfig>,
    storage: Arc<LogStorage>,
    memory_pool: Arc<MemoryPool>,
    running: Arc<RwLock<bool>>,
    stats: Arc<RwLock<ProcessorStats>>,
    processing_channel: Arc<RwLock<Option<ProcessingChannel>>>,
    batch_buffer: Arc<RwLock<Vec<LogEntry>>>,
    batch_timer: Arc<RwLock<Option<Instant>>>,
}

impl LogProcessor {
    /// 创建新的日志处理器
    pub async fn new(
        config: Arc<ProcessorConfig>,
        storage: Arc<LogStorage>,
    ) -> Result<Self> {
        // 使用存储中的内存池
        let memory_pool = storage.get_memory_pool().await;
        
        let processor = Self {
            config,
            storage,
            memory_pool,
            running: Arc::new(RwLock::new(false)),
            stats: Arc::new(RwLock::new(ProcessorStats::default())),
            processing_channel: Arc::new(RwLock::new(None)),
            batch_buffer: Arc::new(RwLock::new(Vec::new())),
            batch_timer: Arc::new(RwLock::new(None)),
        };

        Ok(processor)
    }

    /// 启动处理器
    pub async fn start(&self) -> Result<()> {
        let mut running = self.running.write().await;
        if *running {
            return Ok(());
        }

        *running = true;
        info!("Log processor started");

        // 初始化处理通道
        let (tx, rx) = tokio::sync::mpsc::channel(self.config.queue_size);
        *self.processing_channel.write().await = Some((tx, rx));

        // 启动处理循环
        self.start_processing_loop().await;

        Ok(())
    }

    /// 停止处理器
    pub async fn stop(&self) -> Result<()> {
        let mut running = self.running.write().await;
        if !*running {
            return Ok(());
        }

        *running = false;
        info!("Log processor stopped");

        Ok(())
    }

    /// 启动处理循环
    async fn start_processing_loop(&self) {
        let running = self.running.clone();
        let config = self.config.clone();
        let storage = self.storage.clone();
        let stats = self.stats.clone();
        let _processing_channel = self.processing_channel.clone();
        let batch_buffer = self.batch_buffer.clone();
        let batch_timer = self.batch_timer.clone();

        // 创建并发信号量
        let concurrency_semaphore = Arc::new(tokio::sync::Semaphore::new(config.max_concurrent));
        
        // 创建各种缓存和队列
        let dead_letter_queue = Arc::new(RwLock::new(std::collections::VecDeque::<LogEntry>::new()));
        let filter_cache = Arc::new(RwLock::new(std::collections::HashMap::<String, bool>::new()));
        let transform_cache = Arc::new(RwLock::new(std::collections::HashMap::<String, serde_json::Value>::new()));
        
        // 创建处理队列
        let processing_queue = Arc::new(RwLock::new(std::collections::VecDeque::<ProcessingTask>::new()));

        tokio::spawn(async move {
            while *running.read().await {
                // 检查批量缓冲区
                if config.enable_batching {
                    Self::check_batch_buffer(
                        &batch_buffer,
                        &batch_timer,
                        &config,
                        &processing_queue,
                    ).await;
                }
                
                // 处理队列中的任务
                if !processing_queue.read().await.is_empty() {
                    if let Some(task) = processing_queue.write().await.pop_front() {
                        let _config = config.clone();
                        let _storage = storage.clone();
                        let _stats = stats.clone();
                        let concurrency_semaphore = concurrency_semaphore.clone();
                        let _dead_letter_queue = dead_letter_queue.clone();
                        let _filter_cache = filter_cache.clone();
                        let _transform_cache = transform_cache.clone();
                        
                        tokio::spawn(async move {
                            let _permit = concurrency_semaphore.acquire().await.unwrap();
                            
                            // Process the task with proper error handling
                            if let Err(e) = Self::process_task(
                                task,
                                &config,
                                &storage,
                                &stats,
                                &dead_letter_queue,
                                &filter_cache,
                                &transform_cache,
                            ).await {
                                error!("Failed to process task: {}", e);
                            }
                        });
                    }
                }
                
                // 短暂休眠避免CPU占用过高
                sleep(Duration::from_millis(1)).await;
            }
        });
        
        // 启动统计更新任务
        self.start_stats_updater().await;
    }
    
    /// 检查批量缓冲区
    async fn check_batch_buffer(
        batch_buffer: &Arc<RwLock<Vec<LogEntry>>>,
        batch_timer: &Arc<RwLock<Option<Instant>>>,
        config: &Arc<ProcessorConfig>,
        processing_queue: &Arc<RwLock<std::collections::VecDeque<ProcessingTask>>>,
    ) {
        let should_process = {
            let buffer = batch_buffer.read().await;
            let timer = batch_timer.read().await;
            
            // 检查是否达到批量大小
            if buffer.len() >= config.batch_size {
                true
            }
            // 检查是否超时
            else if let Some(start_time) = *timer {
                start_time.elapsed() >= config.batch_timeout
            } else {
                false
            }
        };
        
        if should_process {
            // 创建批量任务
            let batch_task = ProcessingTask {
                entry: LogEntry::new(
                    LogLevel::Info,
                    "Batch processing".to_string(),
                ).with_source("system".to_string()),
                priority: 2,
                created_at: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
                retry_count: 0,
                task_type: TaskType::Batch,
            };
            
            processing_queue.write().await.push_back(batch_task);
            
            // 清空缓冲区
            batch_buffer.write().await.clear();
            *batch_timer.write().await = None;
        }
        
        // 启动定时器
        let timer = batch_timer.read().await;
        if timer.is_none() && !batch_buffer.read().await.is_empty() {
            *batch_timer.write().await = Some(Instant::now());
        }
    }
    
    /// 启动统计更新任务
    async fn start_stats_updater(&self) {
        let stats = self.stats.clone();
        let running = self.running.clone();
        
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(5));
            
            while *running.read().await {
                interval.tick().await;
                
                // 更新统计信息的时间戳
                {
                    let mut stats = stats.write().await;
                    stats.last_updated = chrono::Utc::now();
                }
            }
        });
    }
    
    /// 处理单个日志条目
    pub async fn process_log_entry(&self, entry: LogEntry) -> Result<(), ProcessingError> {
        let task = ProcessingTask {
            entry,
            priority: 1,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            retry_count: 0,
            task_type: TaskType::Single,
        };
        
        if let Some(channel) = self.processing_channel.read().await.as_ref() {
            channel.0.send(task).await
                .map_err(|_| ProcessingError::QueueFullError("Failed to send processing task".to_string()))?;
        } else {
            return Err(ProcessingError::ConfigError("Processing channel not available".to_string()));
        }
        
        Ok(())
    }
    
    /// 处理批量日志条目
    pub async fn process_log_batch(&self, batch: LogBatch) -> Result<(), ProcessingError> {
        // 添加到批量缓冲区
        {
            let mut buffer = self.batch_buffer.write().await;
            buffer.extend(batch.entries);
        }
        
        // 启动批量定时器
        {
            let mut timer = self.batch_timer.write().await;
            if timer.is_none() {
                *timer = Some(Instant::now());
            }
        }
        
        Ok(())
    }
    
    /// 获取处理器统计信息
    pub async fn get_stats(&self) -> ProcessorStats {
        self.stats.read().await.clone()
    }
    
    /// 添加日志条目到批量缓冲区
    pub async fn add_to_batch(&self, entry: LogEntry) -> Result<(), ProcessingError> {
        let mut buffer = self.batch_buffer.write().await;
        buffer.push(entry);
        
        // 检查是否需要触发批量处理
        if buffer.len() >= self.config.batch_size {
            drop(buffer);
            self.process_log_batch(LogBatch::new(vec![])).await?;
        }
        
        Ok(())
    }
    
    /// 强制刷新批量缓冲区
    pub async fn flush_batch(&self) -> Result<(), ProcessingError> {
        let buffer = self.batch_buffer.read().await;
        if !buffer.is_empty() {
            drop(buffer);
            self.process_log_batch(LogBatch::new(vec![])).await?;
        }
        Ok(())
    }
    
    /// 检查处理器状态
    pub async fn is_running(&self) -> bool {
        *self.running.read().await
    }
    
    /// 重置统计信息
    pub async fn reset_stats(&self) -> Result<(), ProcessingError> {
        let mut stats = self.stats.write().await;
        *stats = ProcessorStats::default();
        Ok(())
    }
    
    /// 获取队列大小
    pub async fn get_queue_size(&self) -> usize {
        self.batch_buffer.read().await.len()
    }
    
    /// 检查是否可以接受更多日志
    pub async fn can_accept_more(&self) -> bool {
        self.batch_buffer.read().await.len() < self.config.queue_size
    }
    
    /// 处理单个任务
    async fn process_task(
        task: ProcessingTask,
        config: &Arc<ProcessorConfig>,
        storage: &Arc<LogStorage>,
        stats: &Arc<RwLock<ProcessorStats>>,
        dead_letter_queue: &Arc<RwLock<std::collections::VecDeque<LogEntry>>>,
        _filter_cache: &Arc<RwLock<std::collections::HashMap<String, bool>>>,
        _transform_cache: &Arc<RwLock<std::collections::HashMap<String, serde_json::Value>>>,
    ) -> Result<(), ProcessingError> {
        let start_time = std::time::Instant::now();
        
        // 根据任务类型处理
        match task.task_type {
            TaskType::Single => {
                Self::process_single_entry(task.entry, config, storage).await?;
            }
            TaskType::Batch => {
                Self::process_batch_task(task.entry, config, storage).await?;
            }
            TaskType::Retry => {
                Self::process_retry_task(task, config, storage, dead_letter_queue).await?;
            }
        }
        
        // 更新统计信息
        {
            let mut stats = stats.write().await;
            stats.total_processed += 1;
            stats.success_count += 1;
            
            // 更新延迟统计
            let processing_time_ms = start_time.elapsed().as_millis() as f64;
            stats.latency_stats.avg_processing_time_ms = 
                (stats.latency_stats.avg_processing_time_ms * (stats.total_processed - 1) as f64 + processing_time_ms) 
                / stats.total_processed as f64;
            stats.latency_stats.max_processing_time_ms = 
                stats.latency_stats.max_processing_time_ms.max(processing_time_ms);
            stats.latency_stats.min_processing_time_ms = 
                stats.latency_stats.min_processing_time_ms.min(processing_time_ms);
            
            stats.last_updated = chrono::Utc::now();
        }
        
        Ok(())
    }
    
    /// 处理单个日志条目
    async fn process_single_entry(
        entry: LogEntry,
        config: &Arc<ProcessorConfig>,
        storage: &Arc<LogStorage>,
    ) -> Result<(), ProcessingError> {
        debug!("Processing single entry: {}", entry.message);
        
        // 应用过滤规则
        if !Self::apply_filters(&entry, &config.filters).await? {
            return Ok(()); // 被过滤掉，不算错误
        }
        
        // 应用验证规则
        Self::apply_validations(&entry, &config.validations).await?;
        
        // 应用转换规则
        let transformed_entry = Self::apply_transformations(entry, &config.transforms).await?;
        
        // 应用路由规则
        Self::apply_routing(&transformed_entry, &config.routing, storage).await?;
        
        Ok(())
    }
    
    /// 处理批量任务
    async fn process_batch_task(
        entry: LogEntry,
        config: &Arc<ProcessorConfig>,
        storage: &Arc<LogStorage>,
    ) -> Result<(), ProcessingError> {
        debug!("Processing batch task");
        
        // 从批量缓冲区获取所有条目
        // 注意：这里需要重新设计以获取实际的批量数据
        // 目前简化处理单个条目
        Self::process_single_entry(entry, config, storage).await?;
        
        Ok(())
    }
    
    /// 处理重试任务
    async fn process_retry_task(
        task: ProcessingTask,
        config: &Arc<ProcessorConfig>,
        storage: &Arc<LogStorage>,
        dead_letter_queue: &Arc<RwLock<std::collections::VecDeque<LogEntry>>>,
    ) -> Result<(), ProcessingError> {
        debug!("Processing retry task (attempt {})", task.retry_count + 1);
        
        // 检查重试次数限制
        if task.retry_count >= config.retry.max_attempts {
            warn!("Max retry attempts exceeded for entry, moving to dead letter queue");
            
            // 添加到死信队列
            {
                let mut dlq = dead_letter_queue.write().await;
                dlq.push_back(task.entry.clone());
                
                // 限制死信队列大小
                if dlq.len() > config.dead_letter.max_size {
                    dlq.pop_front();
                }
            }
            
            return Err(ProcessingError::RetryError(
                format!("Max retry attempts ({}) exceeded", config.retry.max_attempts)
            ));
        }
        
        // 尝试重新处理
        match Self::process_single_entry(task.entry.clone(), config, storage).await {
            Ok(_) => {
                debug!("Retry successful for entry");
                Ok(())
            }
            Err(e) => {
                // 延迟后重试
                tokio::time::sleep(tokio::time::Duration::from_millis(
                    config.retry.delay_ms * (task.retry_count + 1) as u64
                )).await;
                
                // 创建新的重试任务
                let retry_task = ProcessingTask {
                    entry: task.entry,
                    priority: task.priority,
                    created_at: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs(),
                    retry_count: task.retry_count + 1,
                    task_type: TaskType::Retry,
                };
                
                // 重新入队（这里需要通过处理通道）
                // 由于架构限制，暂时返回错误让外层处理
                Err(ProcessingError::RetryError(
                    format!("Retry failed: {}", e)
                ))
            }
        }
    }
    
    /// 应用过滤规则
    async fn apply_filters(
        entry: &LogEntry,
        filters: &[crate::config::FilterRule],
    ) -> Result<bool, ProcessingError> {
        for filter in filters {
            match filter.filter_type {
                crate::config::FilterType::Level => {
                    if entry.level != filter.target_level.unwrap() {
                        return Ok(false);
                    }
                }
                crate::config::FilterType::Source => {
                    if let Some(ref source_filter) = filter.source_pattern {
                        if !entry.source.contains(source_filter) {
                            return Ok(false);
                        }
                    }
                }
                crate::config::FilterType::Service => {
                    if let Some(ref service_filter) = filter.service_pattern {
                        if entry.service.as_ref().map_or(false, |s| s.contains(service_filter)) {
                            return Ok(false);
                        }
                    }
                }
                _ => {
                    // 其他过滤类型暂时跳过
                    continue;
                }
            }
        }
        
        Ok(true)
    }
    
    /// 应用验证规则
    async fn apply_validations(
        entry: &LogEntry,
        validations: &[crate::config::ValidationRule],
    ) -> Result<(), ProcessingError> {
        for validation in validations {
            match validation.validation_type {
                crate::config::ValidationType::Required => {
                    if let Some(ref required_field) = validation.required_field {
                        if !entry.fields.contains_key(required_field) {
                            return Err(ProcessingError::ValidationError(
                                format!("Required field '{}' is missing", required_field)
                            ));
                        }
                    }
                }
                crate::config::ValidationType::Length => {
                    if let Some(ref field) = validation.field {
                        if let Some(value) = entry.fields.get(field) {
                            if let Some(s) = value.as_str() {
                                if let Some(min_len) = validation.min_length {
                                    if s.len() < min_len {
                                        return Err(ProcessingError::ValidationError(
                                            format!("Field '{}' length {} is less than minimum {}", field, s.len(), min_len)
                                        ));
                                    }
                                }
                                if let Some(max_len) = validation.max_length {
                                    if s.len() > max_len {
                                        return Err(ProcessingError::ValidationError(
                                            format!("Field '{}' length {} exceeds maximum {}", field, s.len(), max_len)
                                        ));
                                    }
                                }
                            }
                        }
                    }
                }
                _ => {
                    // 其他验证类型暂时跳过
                    continue;
                }
            }
        }
        
        Ok(())
    }
    
    /// 应用转换规则
    async fn apply_transformations(
        mut entry: LogEntry,
        transforms: &[crate::config::TransformRule],
    ) -> Result<LogEntry, ProcessingError> {
        for transform in transforms {
            match transform.transform_type {
                crate::config::TransformType::Rename => {
                    if let (Some(old_name), Some(new_name)) = (&transform.old_name, &transform.new_name) {
                        if let Some(value) = entry.fields.remove(old_name) {
                            entry.fields.insert(new_name.clone(), value);
                        }
                    }
                }
                crate::config::TransformType::ValueTransform => {
                    if let Some(ref field) = transform.field {
                        if let Some(value) = entry.fields.get_mut(field) {
                            // 简单的值转换示例
                            if let Some(s) = value.as_str() {
                                if transform.to_lowercase.unwrap_or(false) {
                                    *value = serde_json::Value::String(s.to_lowercase());
                                }
                                if transform.to_uppercase.unwrap_or(false) {
                                    *value = serde_json::Value::String(s.to_uppercase());
                                }
                            }
                        }
                    }
                }
                _ => {
                    // 其他转换类型暂时跳过
                    continue;
                }
            }
        }
        
        Ok(entry)
    }
    
    /// 应用路由规则
    async fn apply_routing(
        entry: &LogEntry,
        routing: &[crate::config::RoutingRule],
        storage: &Arc<LogStorage>,
    ) -> Result<(), ProcessingError> {
        if routing.is_empty() {
            // 默认路由到存储
            storage.store_entry(entry.clone()).await
                .map_err(|e| ProcessingError::StorageError(e.to_string()))?;
            return Ok(());
        }
        
        for rule in routing {
            // 简化的路由匹配
            let matches = match rule.target_type {
                crate::config::RoutingTargetType::File => {
                    rule.file_pattern.as_ref().map_or(false, |pattern| {
                        entry.source.contains(pattern)
                    })
                }
                _ => false,
            };
            
            if matches {
                // 根据路由目标处理
                match rule.target_type {
                    crate::config::RoutingTargetType::File => {
                        if let Some(ref file_path) = rule.file_path {
                            // 这里应该实现文件路由逻辑
                            // 目前简化处理，直接存储
                            storage.store_entry(entry.clone()).await
                                .map_err(|e| ProcessingError::StorageError(e.to_string()))?;
                        }
                    }
                    _ => {
                        // 其他路由类型暂时跳过
                        continue;
                    }
                }
                return Ok(());
            }
        }
        
        // 没有匹配的路由规则，使用默认存储
        storage.store_entry(entry.clone()).await
            .map_err(|e| ProcessingError::StorageError(e.to_string()))?;
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ProcessorConfig;
    
    #[tokio::test]
    async fn test_processor_creation() {
        let config = ProcessorConfig::default();
        let storage = Arc::new(LogStorage::new(Arc::new(crate::config::StorageConfig::default())).await.unwrap());
        
        let processor = LogProcessor::new(
            Arc::new(config),
            storage,
        ).await;
        
        assert!(processor.is_ok());
    }
    
    #[tokio::test]
    async fn test_processor_lifecycle() {
        let config = ProcessorConfig::default();
        let storage = Arc::new(LogStorage::new(Arc::new(crate::config::StorageConfig::default())).await.unwrap());
        
        let processor = LogProcessor::new(
            Arc::new(config),
            storage,
        ).await.unwrap();
        
        // 测试启动
        assert!(!processor.is_running().await);
        processor.start().await.unwrap();
        assert!(processor.is_running().await);
        
        // 测试停止
        processor.stop().await.unwrap();
        assert!(!processor.is_running().await);
    }
}