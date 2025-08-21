//! Enhanced error handling for ZMQ Log Server
//! 
//! This module provides comprehensive error types and recovery mechanisms
//! for robust production operation.

use std::fmt;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Serialize, Deserialize};
use thiserror::Error;

/// Comprehensive error types for the ZMQ Log Server
#[derive(Error, Debug, Clone, Serialize, Deserialize)]
pub enum LogServerError {
    /// Configuration errors
    #[error("Configuration error: {message}")]
    Configuration { message: String },
    
    /// ZMQ-related errors
    #[error("ZMQ error: {code} - {message}")]
    Zmq { code: i32, message: String },
    
    /// Storage errors
    #[error("Storage error: {kind} - {message}")]
    Storage { 
        kind: StorageErrorKind,
        message: String 
    },
    
    /// Processing errors
    #[error("Processing error: {kind} - {message}")]
    Processing { 
        kind: ProcessingErrorKind,
        message: String 
    },
    
    /// Network errors
    #[error("Network error: {kind} - {message}")]
    Network { 
        kind: NetworkErrorKind,
        message: String 
    },
    
    /// Resource errors
    #[error("Resource error: {kind} - {message}")]
    Resource { 
        kind: ResourceErrorKind,
        message: String 
    },
    
    /// Validation errors
    #[error("Validation error: {field} - {message}")]
    Validation { 
        field: String,
        message: String 
    },
    
    /// System errors
    #[error("System error: {component} - {message}")]
    System { 
        component: String,
        message: String 
    },
}

/// Storage error types
#[derive(Error, Debug, Clone, Serialize, Deserialize)]
pub enum StorageErrorKind {
    #[error("IO error")]
    Io,
    #[error("File not found")]
    FileNotFound,
    #[error("Permission denied")]
    PermissionDenied,
    #[error("Disk full")]
    DiskFull,
    #[error("File too large")]
    FileTooLarge,
    #[error("Corrupted data")]
    CorruptedData,
    #[error("Compression error")]
    Compression,
    #[error("Rotation failed")]
    RotationFailed,
}

/// Processing error types
#[derive(Error, Debug, Clone, Serialize, Deserialize)]
pub enum ProcessingErrorKind {
    #[error("Serialization failed")]
    Serialization,
    #[error("Deserialization failed")]
    Deserialization,
    #[error("Validation failed")]
    Validation,
    #[error("Filter failed")]
    Filter,
    #[error("Transform failed")]
    Transform,
    #[error("Batch processing failed")]
    BatchProcessing,
    #[error("Message too large")]
    MessageTooLarge,
}

/// Network error types
#[derive(Error, Debug, Clone, Serialize, Deserialize)]
pub enum NetworkErrorKind {
    #[error("Connection failed")]
    ConnectionFailed,
    #[error("Timeout")]
    Timeout,
    #[error("Connection refused")]
    ConnectionRefused,
    #[error("Network unreachable")]
    NetworkUnreachable,
    #[error("Protocol error")]
    ProtocolError,
    #[error("Authentication failed")]
    AuthenticationFailed,
}

/// Resource error types
#[derive(Error, Debug, Clone, Serialize, Deserialize)]
pub enum ResourceErrorKind {
    #[error("Out of memory")]
    OutOfMemory,
    #[error("Too many files")]
    TooManyFiles,
    #[error("Resource busy")]
    ResourceBusy,
    #[error("Resource exhausted")]
    ResourceExhausted,
    #[error("Thread pool exhausted")]
    ThreadPoolExhausted,
}

impl LogServerError {
    /// Create a configuration error
    pub fn configuration<S: Into<String>>(message: S) -> Self {
        Self::Configuration {
            message: message.into(),
        }
    }
    
    /// Create a ZMQ error
    pub fn zmq<S: Into<String>>(code: i32, message: S) -> Self {
        Self::Zmq {
            code,
            message: message.into(),
        }
    }
    
    /// Create a storage error
    pub fn storage<S: Into<String>>(kind: StorageErrorKind, message: S) -> Self {
        Self::Storage {
            kind,
            message: message.into(),
        }
    }
    
    /// Create a processing error
    pub fn processing<S: Into<String>>(kind: ProcessingErrorKind, message: S) -> Self {
        Self::Processing {
            kind,
            message: message.into(),
        }
    }
    
    /// Create a network error
    pub fn network<S: Into<String>>(kind: NetworkErrorKind, message: S) -> Self {
        Self::Network {
            kind,
            message: message.into(),
        }
    }
    
    /// Create a resource error
    pub fn resource<S: Into<String>>(kind: ResourceErrorKind, message: S) -> Self {
        Self::Resource {
            kind,
            message: message.into(),
        }
    }
    
    /// Create a validation error
    pub fn validation<S: Into<String>>(field: S, message: S) -> Self {
        Self::Validation {
            field: field.into(),
            message: message.into(),
        }
    }
    
    /// Create a system error
    pub fn system<S: Into<String>>(component: S, message: S) -> Self {
        Self::System {
            component: component.into(),
            message: message.into(),
        }
    }
    
    /// Check if this error is recoverable
    pub fn is_recoverable(&self) -> bool {
        match self {
            Self::Zmq { .. } => true,
            Self::Network { kind, .. } => matches!(kind, NetworkErrorKind::Timeout),
            Self::Resource { kind, .. } => matches!(kind, ResourceErrorKind::ResourceBusy),
            Self::Storage { kind, .. } => matches!(
                kind,
                StorageErrorKind::Io | StorageErrorKind::DiskFull | StorageErrorKind::RotationFailed
            ),
            _ => false,
        }
    }
    
    /// Get error severity
    pub fn severity(&self) -> ErrorSeverity {
        match self {
            Self::Configuration { .. } => ErrorSeverity::Critical,
            Self::Resource { kind, .. } => match kind {
                ResourceErrorKind::OutOfMemory => ErrorSeverity::Critical,
                ResourceErrorKind::ResourceExhausted => ErrorSeverity::High,
                _ => ErrorSeverity::Medium,
            },
            Self::Storage { kind, .. } => match kind {
                StorageErrorKind::DiskFull => ErrorSeverity::High,
                StorageErrorKind::CorruptedData => ErrorSeverity::High,
                _ => ErrorSeverity::Medium,
            },
            Self::Network { kind, .. } => match kind {
                NetworkErrorKind::ConnectionRefused => ErrorSeverity::Medium,
                NetworkErrorKind::Timeout => ErrorSeverity::Low,
                _ => ErrorSeverity::Medium,
            },
            _ => ErrorSeverity::Medium,
        }
    }
    
    /// Get error category for metrics
    pub fn category(&self) -> &'static str {
        match self {
            Self::Configuration { .. } => "configuration",
            Self::Zmq { .. } => "zmq",
            Self::Storage { .. } => "storage",
            Self::Processing { .. } => "processing",
            Self::Network { .. } => "network",
            Self::Resource { .. } => "resource",
            Self::Validation { .. } => "validation",
            Self::System { .. } => "system",
        }
    }
}

/// Error severity levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum ErrorSeverity {
    Low,
    Medium,
    High,
    Critical,
}

impl fmt::Display for ErrorSeverity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ErrorSeverity::Low => write!(f, "low"),
            ErrorSeverity::Medium => write!(f, "medium"),
            ErrorSeverity::High => write!(f, "high"),
            ErrorSeverity::Critical => write!(f, "critical"),
        }
    }
}

/// Error context for better debugging
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorContext {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub component: String,
    pub operation: String,
    pub metadata: std::collections::HashMap<String, serde_json::Value>,
}

impl ErrorContext {
    pub fn new(component: String, operation: String) -> Self {
        Self {
            timestamp: chrono::Utc::now(),
            component,
            operation,
            metadata: std::collections::HashMap::new(),
        }
    }
    
    pub fn with_metadata<K, V>(mut self, key: K, value: V) -> Self 
    where 
        K: Into<String>,
        V: Into<serde_json::Value>,
    {
        self.metadata.insert(key.into(), value.into());
        self
    }
}

/// Enhanced error with context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhancedError {
    pub error: LogServerError,
    pub context: ErrorContext,
    pub stack_trace: Option<String>,
}

impl EnhancedError {
    pub fn new(error: LogServerError, context: ErrorContext) -> Self {
        Self {
            error,
            context,
            stack_trace: None,
        }
    }
    
    pub fn with_stack_trace(mut self, stack_trace: String) -> Self {
        self.stack_trace = Some(stack_trace);
        self
    }
}

impl fmt::Display for EnhancedError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "[{}] {} in {}.{}: {}",
            self.context.timestamp.format("%Y-%m-%d %H:%M:%S%.3f"),
            self.error.severity(),
            self.context.component,
            self.context.operation,
            self.error
        )
    }
}

impl std::error::Error for EnhancedError {}

/// Error recovery strategy
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RecoveryStrategy {
    /// Retry the operation
    Retry { max_attempts: usize, delay_ms: u64 },
    /// Fallback to alternative implementation
    Fallback { alternative: String },
    /// Skip the operation
    Skip,
    /// Panic (for unrecoverable errors)
    Panic,
    /// Graceful shutdown
    Shutdown,
}

/// Error recovery manager
pub struct ErrorRecoveryManager {
    strategies: std::collections::HashMap<String, RecoveryStrategy>,
    retry_counts: Arc<RwLock<std::collections::HashMap<String, usize>>>,
}

impl ErrorRecoveryManager {
    pub fn new() -> Self {
        let mut strategies = std::collections::HashMap::new();
        
        // Default recovery strategies
        strategies.insert(
            "zmq_timeout".to_string(),
            RecoveryStrategy::Retry { max_attempts: 3, delay_ms: 100 }
        );
        strategies.insert(
            "storage_io".to_string(),
            RecoveryStrategy::Retry { max_attempts: 5, delay_ms: 50 }
        );
        strategies.insert(
            "network_timeout".to_string(),
            RecoveryStrategy::Retry { max_attempts: 3, delay_ms: 200 }
        );
        strategies.insert(
            "validation".to_string(),
            RecoveryStrategy::Skip
        );
        strategies.insert(
            "resource_exhausted".to_string(),
            RecoveryStrategy::Fallback { alternative: "reduce_load".to_string() }
        );
        strategies.insert(
            "configuration".to_string(),
            RecoveryStrategy::Shutdown
        );
        
        Self {
            strategies,
            retry_counts: Arc::new(RwLock::new(std::collections::HashMap::new())),
        }
    }
    
    /// Get recovery strategy for an error
    pub fn get_strategy(&self, error: &LogServerError) -> RecoveryStrategy {
        let error_key = format!("{}_{}", error.category(), self.get_error_subtype(error));
        self.strategies.get(&error_key).cloned()
            .unwrap_or_else(|| self.get_default_strategy(error))
    }
    
    fn get_error_subtype(&self, error: &LogServerError) -> &'static str {
        match error {
            LogServerError::Zmq { .. } => "general",
            LogServerError::Storage { kind, .. } => match kind {
                StorageErrorKind::Io => "io",
                StorageErrorKind::DiskFull => "disk_full",
                _ => "other",
            },
            LogServerError::Network { kind, .. } => match kind {
                NetworkErrorKind::Timeout => "timeout",
                NetworkErrorKind::ConnectionFailed => "connection_failed",
                _ => "other",
            },
            _ => "general",
        }
    }
    
    fn get_default_strategy(&self, error: &LogServerError) -> RecoveryStrategy {
        if error.is_recoverable() {
            RecoveryStrategy::Retry { max_attempts: 3, delay_ms: 100 }
        } else {
            match error.severity() {
                ErrorSeverity::Critical => RecoveryStrategy::Shutdown,
                ErrorSeverity::High => RecoveryStrategy::Fallback { 
                    alternative: "degraded_mode".to_string() 
                },
                _ => RecoveryStrategy::Skip,
            }
        }
    }
    
    /// Execute recovery strategy
    pub async fn recover(
        &self,
        error: &LogServerError,
        operation: &str,
    ) -> Result<()> {
        let strategy = self.get_strategy(error);
        let error_key = format!("{}_{}", error.category(), self.get_error_subtype(error));
        
        match strategy {
            RecoveryStrategy::Retry { max_attempts, delay_ms } => {
                let mut retry_counts = self.retry_counts.write().await;
                let current_attempts = retry_counts.entry(error_key.clone()).or_insert(0);
                
                if *current_attempts >= max_attempts {
                    return Err(LogServerError::configuration(
                        format!("Max retry attempts ({}) exceeded for {}", max_attempts, operation)
                    ));
                }
                
                *current_attempts += 1;
                drop(retry_counts);
                
                // Wait before retry
                tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
                
                // Reset retry count on success (would be done by caller)
                Ok(())
            }
            RecoveryStrategy::Fallback { alternative } => {
                tracing::warn!("Falling back to alternative: {} for error: {}", alternative, error);
                Ok(())
            }
            RecoveryStrategy::Skip => {
                tracing::warn!("Skipping operation due to error: {}", error);
                Ok(())
            }
            RecoveryStrategy::Panic => {
                panic!("Unrecoverable error: {}", error);
            }
            RecoveryStrategy::Shutdown => {
                tracing::error!("Shutting down due to critical error: {}", error);
                // Signal shutdown to the main application
                Ok(())
            }
        }
    }
    
    /// Reset retry count for an error type
    pub async fn reset_retry_count(&self, error_key: &str) {
        let mut retry_counts = self.retry_counts.write().await;
        retry_counts.remove(error_key);
    }
}

impl Default for ErrorRecoveryManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Error metrics collector
pub struct ErrorMetrics {
    error_counts: Arc<RwLock<std::collections::HashMap<String, u64>>>,
    recovery_counts: Arc<RwLock<std::collections::HashMap<String, u64>>>,
    last_errors: Arc<RwLock<std::collections::VecDeque<EnhancedError>>>,
}

impl ErrorMetrics {
    pub fn new() -> Self {
        Self {
            error_counts: Arc::new(RwLock::new(std::collections::HashMap::new())),
            recovery_counts: Arc::new(RwLock::new(std::collections::HashMap::new())),
            last_errors: Arc::new(RwLock::new(std::collections::VecDeque::with_capacity(100))),
        }
    }
    
    /// Record an error
    pub async fn record_error(&self, error: &EnhancedError) {
        let category = error.error.category();
        
        // Update error counts
        {
            let mut counts = self.error_counts.write().await;
            *counts.entry(category.to_string()).or_insert(0) += 1;
        }
        
        // Add to recent errors
        {
            let mut errors = self.last_errors.write().await;
            errors.push_back(error.clone());
            if errors.len() > 100 {
                errors.pop_front();
            }
        }
    }
    
    /// Record a recovery
    pub async fn record_recovery(&self, error_key: &str) {
        let mut counts = self.recovery_counts.write().await;
        *counts.entry(error_key.to_string()).or_insert(0) += 1;
    }
    
    /// Get error statistics
    pub async fn get_stats(&self) -> ErrorStats {
        let error_counts = self.error_counts.read().await;
        let recovery_counts = self.recovery_counts.read().await;
        let last_errors = self.last_errors.read().await;
        
        ErrorStats {
            total_errors: error_counts.values().sum(),
            error_counts: error_counts.clone(),
            recovery_counts: recovery_counts.clone(),
            recent_errors: last_errors.clone().into(),
            last_updated: chrono::Utc::now(),
        }
    }
}

/// Error statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorStats {
    pub total_errors: u64,
    pub error_counts: std::collections::HashMap<String, u64>,
    pub recovery_counts: std::collections::HashMap<String, u64>,
    pub recent_errors: Vec<EnhancedError>,
    pub last_updated: chrono::DateTime<chrono::Utc>,
}

impl Default for ErrorMetrics {
    fn default() -> Self {
        Self::new()
    }
}

/// Result type for the ZMQ Log Server
pub type Result<T> = std::result::Result<T, LogServerError>;

/// Convert from other error types
impl From<std::io::Error> for LogServerError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => {
                Self::storage(StorageErrorKind::FileNotFound, err.to_string())
            }
            std::io::ErrorKind::PermissionDenied => {
                Self::storage(StorageErrorKind::PermissionDenied, err.to_string())
            }
            std::io::ErrorKind::StorageFull => {
                Self::storage(StorageErrorKind::DiskFull, err.to_string())
            }
            std::io::ErrorKind::TimedOut => {
                Self::network(NetworkErrorKind::Timeout, err.to_string())
            }
            std::io::ErrorKind::ConnectionRefused => {
                Self::network(NetworkErrorKind::ConnectionRefused, err.to_string())
            }
            _ => {
                Self::storage(StorageErrorKind::Io, err.to_string())
            }
        }
    }
}

impl From<serde_json::Error> for LogServerError {
    fn from(err: serde_json::Error) -> Self {
        Self::processing(ProcessingErrorKind::Serialization, err.to_string())
    }
}

impl From<zmq::Error> for LogServerError {
    fn from(err: zmq::Error) -> Self {
        Self::zmq(err as i32, err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_error_creation() {
        let error = LogServerError::configuration("Invalid configuration");
        assert_eq!(error.category(), "configuration");
        assert_eq!(error.severity(), ErrorSeverity::Critical);
        assert!(!error.is_recoverable());
    }
    
    #[test]
    fn test_error_recovery() {
        let manager = ErrorRecoveryManager::new();
        let error = LogServerError::network(NetworkErrorKind::Timeout, "Connection timeout");
        
        let strategy = manager.get_strategy(&error);
        match strategy {
            RecoveryStrategy::Retry { max_attempts, delay_ms } => {
                assert_eq!(max_attempts, 3);
                assert_eq!(delay_ms, 200);
            }
            _ => panic!("Expected retry strategy"),
        }
    }
    
    #[test]
    fn test_error_severity() {
        let config_error = LogServerError::configuration("Config error");
        assert_eq!(config_error.severity(), ErrorSeverity::Critical);
        
        let timeout_error = LogServerError::network(NetworkErrorKind::Timeout, "Timeout");
        assert_eq!(timeout_error.severity(), ErrorSeverity::Low);
        
        let disk_full_error = LogServerError::storage(StorageErrorKind::DiskFull, "Disk full");
        assert_eq!(disk_full_error.severity(), ErrorSeverity::High);
    }
    
    #[tokio::test]
    async fn test_error_metrics() {
        let metrics = ErrorMetrics::new();
        let context = ErrorContext::new("test".to_string(), "test_operation".to_string());
        let error = EnhancedError::new(
            LogServerError::configuration("Test error"),
            context
        );
        
        metrics.record_error(&error).await;
        let stats = metrics.get_stats().await;
        
        assert_eq!(stats.total_errors, 1);
        assert_eq!(stats.error_counts.get("configuration"), Some(&1));
    }
}