//! ZMQ Log Server - High-performance logging service with Node.js bindings
//! 
//! This library provides a complete logging solution with:
//! - ZMQ-based message reception
//! - Async file storage with Tokio
//! - Node.js bindings via NAPI

pub mod config;
pub mod types;
pub mod zmq;
pub mod storage;
pub mod processor;
pub mod error;

// #[cfg(feature = "napi")]
// pub mod napi;

pub use config::{LogConfig, ZmqConfig, StorageConfig, ProcessorConfig};
pub use types::{LogEntry, LogLevel, LogBatch, LogQuery, LogError};
pub use zmq::ZmqServer;
pub use storage::LogStorage;
pub use processor::LogProcessor;

use crate::error::Result;
use tokio::signal;
use std::sync::Arc;

/// Main ZMQ Log Server
pub struct ZmqLogServer {
    zmq_server: Arc<RwLock<ZmqServer>>,
    _processor: Arc<LogProcessor>,
    _storage: Arc<LogStorage>,
}

impl ZmqLogServer {
    /// Create a new ZMQ log server instance
    pub async fn new(config: LogConfig) -> Result<Self> {
        let config = std::sync::Arc::new(config);
        let storage = Arc::new(LogStorage::new(Arc::new(config.storage.clone())).await?);
        let processor = Arc::new(LogProcessor::new(Arc::new(config.processor.clone()), storage.clone()).await?);
        let zmq_server = ZmqServer::new(config.clone(), processor.clone()).await?;

        Ok(Self {
            zmq_server: Arc::new(RwLock::new(zmq_server)),
            _processor: processor,
            _storage: storage,
        })
    }

    /// Start the server
    pub async fn start(&self) -> Result<()> {
        tracing::info!("Starting ZMQ Log Server");

        // Start ZMQ server
        let zmq_result = {
            let mut zmq_server = self.zmq_server.write().await;
            zmq_server.start().await
        };

        // Wait for shutdown signal
        tokio::select! {
            _ = signal::ctrl_c() => {
                tracing::info!("Received shutdown signal");
            }
        }

        // Stop ZMQ server
        if let Err(e) = zmq_result {
            tracing::error!("ZMQ server error: {}", e);
        }
        {
            let mut zmq_server = self.zmq_server.write().await;
            let _ = zmq_server.stop().await;
        }

        Ok(())
    }

    /// Stop the server gracefully
    pub async fn stop(&self) -> Result<()> {
        tracing::info!("Stopping ZMQ Log Server");

        // Stop all services
        let zmq_result = {
            let mut zmq_server = self.zmq_server.write().await;
            zmq_server.stop().await
        };
        let storage_result = self._storage.shutdown().await;

        // Check for errors
        if let Err(e) = zmq_result {
            tracing::error!("Error stopping ZMQ server: {}", e);
        }
        if let Err(e) = storage_result {
            tracing::error!("Error stopping storage: {}", e);
        }

        Ok(())
    }
}

// #[cfg(feature = "napi")]
// pub use napi::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_server_creation() {
        let config = LogConfig::default();
        let server = ZmqLogServer::new(config).await;
        assert!(server.is_ok());
    }
}