//! Optimized memory management for ZMQ Log Server
//! 
//! This module provides efficient memory allocation patterns, buffer pooling,
//! and zero-copy operations to minimize memory overhead and GC pressure.

use std::sync::Arc;
use std::collections::VecDeque;
use tokio::sync::{RwLock, Mutex};
use bytes::{Bytes, BytesMut, BufMut};
use parking_lot::RawMutex;
use std::alloc::{GlobalAlloc, Layout, System};
use std::ptr::NonNull;
use serde::{Serialize, Deserialize};
use crate::error::{LogServerError, Result};

/// Memory pool configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryPoolConfig {
    /// Buffer size in bytes
    pub buffer_size: usize,
    /// Maximum number of buffers in the pool
    pub max_buffers: usize,
    /// Initial number of buffers
    pub initial_buffers: usize,
    /// Enable statistics collection
    pub enable_stats: bool,
    /// Enable aggressive recycling
    pub aggressive_recycling: bool,
}

impl Default for MemoryPoolConfig {
    fn default() -> Self {
        Self {
            buffer_size: 64 * 1024, // 64KB
            max_buffers: 1000,
            initial_buffers: 100,
            enable_stats: true,
            aggressive_recycling: true,
        }
    }
}

/// Memory pool statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryPoolStats {
    pub total_allocated: usize,
    pub total_freed: usize,
    pub current_pool_size: usize,
    pub hit_count: usize,
    pub miss_count: usize,
    pub allocation_failures: usize,
    pub average_allocation_time_ns: u64,
    pub peak_usage: usize,
    pub fragmentation_ratio: f64,
}

impl Default for MemoryPoolStats {
    fn default() -> Self {
        Self {
            total_allocated: 0,
            total_freed: 0,
            current_pool_size: 0,
            hit_count: 0,
            miss_count: 0,
            allocation_failures: 0,
            average_allocation_time_ns: 0,
            peak_usage: 0,
            fragmentation_ratio: 0.0,
        }
    }
}

/// Thread-safe memory buffer pool
pub struct MemoryPool {
    config: MemoryPoolConfig,
    pool: Arc<Mutex<VecDeque<BytesMut>>>,
    stats: Arc<RwLock<MemoryPoolStats>>,
    allocation_times: Arc<Mutex<Vec<u64>>>,
}

impl MemoryPool {
    /// Create a new memory pool with the given configuration
    pub fn new(config: MemoryPoolConfig) -> Result<Self> {
        if config.buffer_size == 0 {
            return Err(LogServerError::validation("buffer_size", "Buffer size must be greater than 0").into());
        }
        
        if config.max_buffers < config.initial_buffers {
            return Err(LogServerError::validation("max_buffers", "max_buffers must be >= initial_buffers").into());
        }
        
        let pool = Self {
            config: config.clone(),
            pool: Arc::new(Mutex::new(VecDeque::with_capacity(config.max_buffers))),
            stats: Arc::new(RwLock::new(MemoryPoolStats::default())),
            allocation_times: Arc::new(Mutex::new(Vec::new())),
        };
        
        // Pre-allocate initial buffers
        for _ in 0..config.initial_buffers {
            if let Err(e) = pool.allocate_buffer() {
                return Err(e);
            }
        }
        
        Ok(pool)
    }
    
    /// Get a buffer from the pool
    pub async fn get_buffer(&self) -> Result<BytesMut> {
        let start_time = std::time::Instant::now();
        
        // Try to get from pool first
        let buffer = {
            let mut pool_guard = self.pool.lock().await;
            pool_guard.pop_front()
        };
        
        let result = if let Some(mut buffer) = buffer {
            // Clear and reuse buffer
            buffer.clear();
            
            // Update stats
            if self.config.enable_stats {
                let mut stats = self.stats.write().await;
                stats.hit_count += 1;
            }
            
            buffer
        } else {
            // Allocate new buffer
            match self.allocate_buffer().await {
                Ok(buffer) => buffer,
                Err(e) => return Err(e),
            }
        };
        
        // Record allocation time
        if self.config.enable_stats {
            let alloc_time = start_time.elapsed().as_nanos() as u64;
            let mut times = self.allocation_times.lock().await;
            times.push(alloc_time);
            
            // Keep only last 1000 measurements
            if times.len() > 1000 {
                times.drain(0..times.len() - 1000);
            }
            
            // Update average allocation time
            let mut stats = self.stats.write().await;
            if !times.is_empty() {
                stats.average_allocation_time_ns = times.iter().sum::<u64>() / times.len() as u64;
            }
        }
        
        Ok(result)
    }
    
    /// Return a buffer to the pool
    pub async fn return_buffer(&self, buffer: BytesMut) -> Result<()> {
        if buffer.capacity() != self.config.buffer_size {
            // Buffer size mismatch, don't pool it
            return Ok(());
        }
        
        let mut pool_guard = self.pool.lock().await;
        
        if pool_guard.len() < self.config.max_buffers {
            pool_guard.push_back(buffer);
            
            // Update stats
            if self.config.enable_stats {
                let mut stats = self.stats.write().await;
                stats.current_pool_size = pool_guard.len();
                stats.peak_usage = stats.peak_usage.max(stats.current_pool_size);
            }
        }
        
        Ok(())
    }
    
    /// Allocate a new buffer
    async fn allocate_buffer(&self) -> Result<BytesMut> {
        let buffer = BytesMut::with_capacity(self.config.buffer_size);
        
        // Update stats
        if self.config.enable_stats {
            let mut stats = self.stats.write().await;
            stats.total_allocated += 1;
            stats.miss_count += 1;
            stats.current_pool_size = self.pool.lock().await.len();
            stats.peak_usage = stats.peak_usage.max(stats.current_pool_size);
        }
        
        Ok(buffer)
    }
    
    /// Get pool statistics
    pub async fn get_stats(&self) -> MemoryPoolStats {
        self.stats.read().await.clone()
    }
    
    /// Calculate memory efficiency metrics
    pub async fn get_efficiency_metrics(&self) -> MemoryEfficiencyMetrics {
        let stats = self.get_stats().await;
        let pool_size = self.pool.lock().await.len();
        
        MemoryEfficiencyMetrics {
            pool_utilization: pool_size as f64 / self.config.max_buffers as f64,
            hit_rate: if stats.hit_count + stats.miss_count > 0 {
                stats.hit_count as f64 / (stats.hit_count + stats.miss_count) as f64
            } else {
                0.0
            },
            total_memory_usage: pool_size * self.config.buffer_size,
            fragmentation_ratio: stats.fragmentation_ratio,
            average_allocation_time_ns: stats.average_allocation_time_ns,
        }
    }
    
    /// Shrink the pool to optimal size
    pub async fn shrink(&self) -> Result<()> {
        let mut pool_guard = self.pool.lock().await;
        let target_size = (self.config.initial_buffers as f64 * 0.8) as usize;
        
        while pool_guard.len() > target_size {
            pool_guard.pop_front();
        }
        
        // Update stats
        if self.config.enable_stats {
            let mut stats = self.stats.write().await;
            stats.current_pool_size = pool_guard.len();
            stats.total_freed += 1;
        }
        
        Ok(())
    }
    
    /// Pre-allocate additional buffers
    pub async fn pre_allocate(&self, count: usize) -> Result<()> {
        let mut buffers = Vec::with_capacity(count);
        
        for _ in 0..count {
            buffers.push(self.allocate_buffer().await?);
        }
        
        // Add to pool
        {
            let mut pool_guard = self.pool.lock().await;
            for buffer in buffers {
                if pool_guard.len() < self.config.max_buffers {
                    pool_guard.push_back(buffer);
                }
            }
        }
        
        Ok(())
    }
}

/// Memory efficiency metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEfficiencyMetrics {
    pub pool_utilization: f64,
    pub hit_rate: f64,
    pub total_memory_usage: usize,
    pub fragmentation_ratio: f64,
    pub average_allocation_time_ns: u64,
}

/// Zero-copy message buffer for efficient ZMQ message handling
pub struct ZeroCopyBuffer {
    data: Bytes,
    pool: Option<Arc<MemoryPool>>,
}

impl ZeroCopyBuffer {
    /// Create a new zero-copy buffer from existing data
    pub fn new(data: Bytes) -> Self {
        Self {
            data,
            pool: None,
        }
    }
    
    /// Create a new zero-copy buffer with pool backing
    pub fn with_pool(data: Bytes, pool: Arc<MemoryPool>) -> Self {
        Self {
            data,
            pool: Some(pool),
        }
    }
    
    /// Get a reference to the data
    pub fn as_slice(&self) -> &[u8] {
        &self.data
    }
    
    /// Get the data length
    pub fn len(&self) -> usize {
        self.data.len()
    }
    
    /// Check if the buffer is empty
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }
    
    /// Convert to owned Bytes (consumes the buffer)
    pub fn into_bytes(self) -> Bytes {
        self.data
    }
    
    /// Clone the data (may allocate)
    pub fn clone_data(&self) -> Bytes {
        self.data.clone()
    }
}

impl Drop for ZeroCopyBuffer {
    fn drop(&mut self) {
        // Return buffer to pool if applicable
        if let Some(pool) = &self.pool {
            if let Ok(mut buffer) = BytesMut::from_vec(self.data.to_vec()) {
                if buffer.capacity() == pool.config.buffer_size {
                    // This is a bit hacky - in a real implementation, we'd need
                    // to track which buffers came from the pool
                    // For now, we'll just let it drop
                }
            }
        }
    }
}

/// Batch processor for memory-efficient log processing
pub struct BatchProcessor {
    buffer_pool: Arc<MemoryPool>,
    batch_size: usize,
    current_batch: Arc<Mutex<Vec<ZeroCopyBuffer>>>,
    flush_callback: Arc<dyn Fn(Vec<ZeroCopyBuffer>) -> Result<()> + Send + Sync>,
}

impl BatchProcessor {
    /// Create a new batch processor
    pub fn new(
        buffer_pool: Arc<MemoryPool>,
        batch_size: usize,
        flush_callback: impl Fn(Vec<ZeroCopyBuffer>) -> Result<()> + Send + Sync + 'static,
    ) -> Self {
        Self {
            buffer_pool,
            batch_size,
            current_batch: Arc::new(Mutex::new(Vec::with_capacity(batch_size))),
            flush_callback: Arc::new(flush_callback),
        }
    }
    
    /// Add a message to the batch
    pub async fn add_message(&self, message: ZeroCopyBuffer) -> Result<()> {
        let mut batch = self.current_batch.lock().await;
        batch.push(message);
        
        if batch.len() >= self.batch_size {
            self.flush_batch(batch).await?;
        }
        
        Ok(())
    }
    
    /// Flush the current batch
    async fn flush_batch(&self, mut batch: Vec<ZeroCopyBuffer>) -> Result<()> {
        if batch.is_empty() {
            return Ok(());
        }
        
        // Create a new batch for future messages
        let new_batch = Vec::with_capacity(self.batch_size);
        *self.current_batch.lock().await = new_batch;
        
        // Process the batch
        (self.flush_callback)(batch)
    }
    
    /// Force flush of any pending messages
    pub async fn flush(&self) -> Result<()> {
        let batch = std::mem::take(&mut *self.current_batch.lock().await);
        self.flush_batch(batch).await
    }
    
    /// Get current batch size
    pub async fn batch_size(&self) -> usize {
        self.current_batch.lock().await.len()
    }
}

/// Memory-aware message serializer
pub struct MessageSerializer {
    buffer_pool: Arc<MemoryPool>,
    compression_threshold: usize,
}

impl MessageSerializer {
    /// Create a new message serializer
    pub fn new(buffer_pool: Arc<MemoryPool>, compression_threshold: usize) -> Self {
        Self {
            buffer_pool,
            compression_threshold,
        }
    }
    
    /// Serialize a message with memory efficiency
    pub async fn serialize<T: Serialize>(&self, message: &T) -> Result<ZeroCopyBuffer> {
        let mut buffer = self.buffer_pool.get_buffer().await?;
        
        // Serialize to buffer
        serde_json::to_writer(buffer.writer(), message)
            .map_err(|e| LogServerError::processing(
                crate::error::ProcessingErrorKind::Serialization,
                e.to_string()
            ))?;
        
        // Convert to ZeroCopyBuffer
        let data = buffer.freeze();
        Ok(ZeroCopyBuffer::with_pool(data, self.buffer_pool.clone()))
    }
    
    /// Serialize with optional compression
    pub async fn serialize_compressed<T: Serialize>(&self, message: &T) -> Result<ZeroCopyBuffer> {
        let buffer = self.serialize(message).await?;
        
        // Apply compression if message is large enough
        if buffer.len() > self.compression_threshold {
            self.compress_buffer(buffer).await
        } else {
            Ok(buffer)
        }
    }
    
    /// Compress a buffer
    async fn compress_buffer(&self, buffer: ZeroCopyBuffer) -> Result<ZeroCopyBuffer> {
        use flate2::{write::GzEncoder, Compression};
        use std::io::Write;
        
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(buffer.as_slice())
            .map_err(|e| LogServerError::processing(
                crate::error::ProcessingErrorKind::Serialization,
                e.to_string()
            ))?;
        
        let compressed_data = encoder.finish()
            .map_err(|e| LogServerError::processing(
                crate::error::ProcessingErrorKind::Serialization,
                e.to_string()
            ))?;
        
        let mut compressed_buffer = self.buffer_pool.get_buffer().await?;
        compressed_buffer.extend_from_slice(&compressed_data);
        
        Ok(ZeroCopyBuffer::with_pool(compressed_buffer.freeze(), self.buffer_pool.clone()))
    }
}

/// Memory usage monitor
pub struct MemoryMonitor {
    config: MemoryPoolConfig,
    stats: Arc<RwLock<MemoryPoolStats>>,
    monitor_interval: tokio::time::Duration,
    running: Arc<RwLock<bool>>,
}

impl MemoryMonitor {
    /// Create a new memory monitor
    pub fn new(
        config: MemoryPoolConfig,
        stats: Arc<RwLock<MemoryPoolStats>>,
        monitor_interval: tokio::time::Duration,
    ) -> Self {
        Self {
            config,
            stats,
            monitor_interval,
            running: Arc::new(RwLock::new(false)),
        }
    }
    
    /// Start monitoring memory usage
    pub async fn start(&self) -> Result<()> {
        *self.running.write().await = true;
        
        let stats = self.stats.clone();
        let running = self.running.clone();
        let interval = self.monitor_interval;
        
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(interval);
            
            while *running.read().await {
                ticker.tick().await;
                
                // Update memory statistics
                let mut stats = stats.write().await;
                
                // Calculate fragmentation ratio (simplified)
                if stats.total_allocated > 0 {
                    stats.fragmentation_ratio = 
                        (stats.total_allocated - stats.total_freed) as f64 / stats.total_allocated as f64;
                }
                
                // Log warnings for high memory usage
                if stats.current_pool_size > stats.peak_usage * 9 / 10 {
                    tracing::warn!("Memory pool usage is high: {}/{}", 
                        stats.current_pool_size, stats.peak_usage);
                }
                
                if stats.allocation_failures > 0 {
                    tracing::warn!("Memory allocation failures: {}", stats.allocation_failures);
                }
            }
        });
        
        Ok(())
    }
    
    /// Stop monitoring
    pub async fn stop(&self) {
        *self.running.write().await = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_memory_pool_creation() {
        let config = MemoryPoolConfig::default();
        let pool = MemoryPool::new(config).await.unwrap();
        
        let stats = pool.get_stats().await;
        assert!(stats.current_pool_size > 0);
    }
    
    #[tokio::test]
    async fn test_buffer_reuse() {
        let config = MemoryPoolConfig {
            buffer_size: 1024,
            max_buffers: 10,
            initial_buffers: 5,
            enable_stats: true,
            aggressive_recycling: true,
        };
        
        let pool = MemoryPool::new(config).await.unwrap();
        
        // Get a buffer
        let buffer1 = pool.get_buffer().await.unwrap();
        assert_eq!(buffer1.capacity(), 1024);
        
        // Return it to pool
        pool.return_buffer(buffer1).await.unwrap();
        
        // Get another buffer (should be reused)
        let buffer2 = pool.get_buffer().await.unwrap();
        assert_eq!(buffer2.capacity(), 1024);
        
        let stats = pool.get_stats().await;
        assert!(stats.hit_count > 0);
    }
    
    #[tokio::test]
    async fn test_batch_processor() {
        let config = MemoryPoolConfig::default();
        let pool = Arc::new(MemoryPool::new(config).await.unwrap());
        
        let flush_called = Arc::new(Mutex::new(false));
        let flush_called_clone = flush_called.clone();
        
        let processor = BatchProcessor::new(
            pool.clone(),
            3,
            move |_batch| {
                *flush_called_clone.lock() = true;
                Ok(())
            }
        );
        
        // Add messages
        for i in 0..3 {
            let buffer = pool.get_buffer().await.unwrap();
            let buffer = ZeroCopyBuffer::with_pool(buffer.freeze(), pool.clone());
            processor.add_message(buffer).await.unwrap();
        }
        
        // Check that flush was called
        assert!(*flush_called.lock());
    }
    
    #[test]
    fn test_zero_copy_buffer() {
        let data = Bytes::from_static(b"test data");
        let buffer = ZeroCopyBuffer::new(data.clone());
        
        assert_eq!(buffer.as_slice(), b"test data");
        assert_eq!(buffer.len(), 9);
        assert!(!buffer.is_empty());
        
        let recovered_data = buffer.into_bytes();
        assert_eq!(recovered_data, data);
    }
}