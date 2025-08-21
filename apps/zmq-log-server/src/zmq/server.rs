use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::Duration;
use tracing::{info, warn, error, debug};
use zmq;
use serde_json;

use crate::config::LogConfig;
use crate::processor::LogProcessor;
use crate::types::LogEntry;
use crate::error::{LogServerError, Result};

/// ZMQ服务器结构体
pub struct ZmqServer {
    config: Arc<LogConfig>,
    processor: Arc<LogProcessor>,
    
    /// ZMQ上下文
    context: zmq::Context,
    
    /// 消息循环句柄
    message_loop_handle: Option<tokio::task::JoinHandle<()>>,
    
    /// 运行状态
    running: Arc<RwLock<bool>>,
    
    /// 消息统计
    stats: Arc<RwLock<ServerStats>>,
}

/// 服务器统计信息
#[derive(Debug, Default)]
pub struct ServerStats {
    pub total_received: u64,
    pub total_processed: u64,
    pub total_errors: u64,
    pub bytes_received: u64,
}

impl ZmqServer {
    /// 创建新的ZMQ服务器
    pub async fn new(
        config: Arc<LogConfig>, 
        processor: Arc<LogProcessor>
    ) -> Result<Self> {
        let context = zmq::Context::new();
        
        let server = Self {
            config,
            processor,
            context,
            message_loop_handle: None,
            running: Arc::new(RwLock::new(false)),
            stats: Arc::new(RwLock::new(ServerStats::default())),
        };
        
        Ok(server)
    }
    
    /// 启动ZMQ服务器
    pub async fn start(&mut self) -> Result<()> {
        if *self.running.read().await {
            warn!("ZMQ server is already running");
            return Ok(());
        }
        
        info!("Starting ZMQ server on {}:{}", self.config.zmq.bind_address, self.config.zmq.port);
        
        // 创建PULL套接字
        let socket = self.context.socket(zmq::PULL)?;
        socket.set_rcvhwm(self.config.zmq.high_watermark)?;
        socket.set_ipv6(true)?;
        socket.set_rcvtimeo(self.config.zmq.recv_timeout as i32)?;
        
        let bind_address = format!("{}:{}", self.config.zmq.bind_address, self.config.zmq.port);
        socket.bind(&bind_address)?;
        
        *self.running.write().await = true;
        
        // 启动消息处理循环
        let socket_clone = socket;
        let running_clone = self.running.clone();
        let processor_clone = self.processor.clone();
        let stats_clone = self.stats.clone();
        
        let message_loop_handle = tokio::spawn(async move {
            if let Err(e) = Self::message_loop(
                socket_clone,
                running_clone,
                processor_clone,
                stats_clone
            ).await {
                error!("Message loop error: {}", e);
            }
        });
        
        // 存储消息循环句柄
        self.message_loop_handle = Some(message_loop_handle);
        
        info!("ZMQ server started successfully");
        Ok(())
    }
    
    /// 停止ZMQ服务器
    pub async fn stop(&mut self) -> Result<()> {
        if !*self.running.read().await {
            warn!("ZMQ server is not running");
            return Ok(());
        }
        
        info!("Stopping ZMQ server");
        
        *self.running.write().await = false;
        
        // 等待消息循环停止
        if let Some(handle) = self.message_loop_handle.take() {
            tokio::select! {
                _ = handle => {
                    info!("Message loop stopped gracefully");
                }
                _ = tokio::time::sleep(Duration::from_millis(500)) => {
                    warn!("Message loop did not stop within timeout");
                }
            }
        }
        
        info!("ZMQ server stopped");
        Ok(())
    }
    
    /// 消息处理循环
    async fn message_loop(
        socket: zmq::Socket,
        running: Arc<RwLock<bool>>,
        processor: Arc<LogProcessor>,
        stats: Arc<RwLock<ServerStats>>,
    ) -> Result<()> {
        let mut message = zmq::Message::new();
        
        while *running.read().await {
            match socket.recv(&mut message, zmq::DONTWAIT) {
                Ok(()) => {
                    if message.is_empty() {
                        continue;
                    }
                    
                    let message_data = &*message;
                    
                    // 更新统计信息
                    {
                        let mut stats = stats.write().await;
                        stats.total_received += 1;
                        stats.bytes_received += message.len() as u64;
                    }
                    
                    // 处理消息
                    if let Err(e) = Self::handle_message(message_data, &processor, &stats).await {
                        error!("Failed to handle message: {}", e);
                        
                        let mut stats = stats.write().await;
                        stats.total_errors += 1;
                    } else {
                        let mut stats = stats.write().await;
                        stats.total_processed += 1;
                    }
                }
                Err(zmq::Error::EAGAIN) => {
                    // 超时，继续循环
                    tokio::time::sleep(Duration::from_millis(1)).await;
                }
                Err(e) => {
                    error!("ZMQ receive error: {}", e);
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
        }
        
        Ok(())
    }
    
    /// 处理单个消息
    async fn handle_message(
        message_data: &[u8],
        processor: &Arc<LogProcessor>,
        _stats: &Arc<RwLock<ServerStats>>,
    ) -> Result<()> {
        // 尝试解析为JSON日志条目
        let log_entry: LogEntry = serde_json::from_slice(message_data)
            .map_err(|e| LogServerError::processing(
                crate::error::ProcessingErrorKind::Deserialization,
                format!("Failed to parse log entry: {}", e)
            ))?;
        
        debug!("Received log entry: {}", log_entry.message);
        
        // 处理日志条目
        processor.process_log_entry(log_entry).await?;
        
        Ok(())
    }
    
    /// 获取服务器统计信息
    pub async fn get_stats(&self) -> ServerStats {
        let stats = self.stats.read().await;
        ServerStats {
            total_received: stats.total_received,
            total_processed: stats.total_processed,
            total_errors: stats.total_errors,
            bytes_received: stats.bytes_received,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::LogConfig;
    
    #[tokio::test]
    async fn test_zmq_server_creation() {
        let config = Arc::new(LogConfig::default());
        let processor = Arc::new(crate::processor::LogProcessor::new(
            config.clone(), 
            Arc::new(crate::storage::LogStorage::new(config.storage.clone().into()).await.unwrap())
        ).await.unwrap());
        
        let server = ZmqServer::new(config, processor).await;
        assert!(server.is_ok());
    }
}