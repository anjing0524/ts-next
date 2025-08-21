//! Integration tests for ZMQ Log Server

use tempfile::TempDir;
use zmq_log_server::{LogConfig, ZmqLogServer, LogEntry, LogLevel, config::LogLevel as ConfigLogLevel};

#[tokio::test]
async fn test_server_lifecycle() {
    let temp_dir = TempDir::new().unwrap();
    let config = LogConfig {
        storage: zmq_log_server::StorageConfig {
            log_dir: temp_dir.path().to_string_lossy().to_string(),
            ..Default::default()
        },
        ..Default::default()
    };
    
    let server = ZmqLogServer::new(config).await.unwrap();
    
    // Test server start
    let start_result = server.start().await;
    assert!(start_result.is_ok());
    
    // Test server stop
    let stop_result = server.stop().await;
    assert!(stop_result.is_ok());
}

#[tokio::test]
async fn test_log_entry_creation() {
    let entry = LogEntry::new(LogLevel::Info, "Test message".to_string());
    
    assert_eq!(entry.level, LogLevel::Info);
    assert_eq!(entry.message, "Test message");
    assert_ne!(entry.id, uuid::Uuid::nil());
    assert!(entry.process_id.unwrap_or(0) > 0);
    assert!(!entry.hostname.unwrap_or_default().is_empty());
}

#[tokio::test]
async fn test_log_entry_with_fields() {
    let entry = LogEntry::new(LogLevel::Error, "Error message".to_string())
        .with_field("error_code".to_string(), serde_json::Value::Number(500.into()))
        .with_field("error_message".to_string(), serde_json::Value::String("Internal error".to_string()))
        .with_service("test-service".to_string())
        .with_tag("critical".to_string());
    
    assert_eq!(entry.level, LogLevel::Error);
    assert_eq!(entry.message, "Error message");
    assert_eq!(entry.service, Some("test-service".to_string()));
    assert!(entry.tags.contains(&"critical".to_string()));
    assert_eq!(entry.fields.get("error_code"), Some(&serde_json::Value::Number(500.into())));
}

#[tokio::test]
async fn test_log_levels() {
    let levels = vec![
        LogLevel::Error,
        LogLevel::Warn,
        LogLevel::Info,
        LogLevel::Debug,
        LogLevel::Trace,
    ];
    
    for level in levels {
        let entry = LogEntry::new(level, format!("{} level test", level));
        assert_eq!(entry.level, level);
    }
}

#[tokio::test]
async fn test_configuration_defaults() {
    let config = LogConfig::default();
    
    assert_eq!(config.log_level, ConfigLogLevel::Info);
    assert_eq!(config.zmq.port, 5555);
    assert_eq!(config.zmq.bind_address, "tcp://0.0.0.0");
    assert_eq!(config.storage.log_dir, "./logs");
    assert_eq!(config.storage.max_file_size, 100 * 1024 * 1024);
    assert_eq!(config.storage.max_files, 30);
}

#[tokio::test]
async fn test_configuration_custom() {
    let config = LogConfig {
        log_level: ConfigLogLevel::Debug,
        zmq: zmq_log_server::ZmqConfig {
            port: 6666,
            bind_address: "tcp://127.0.0.1".to_string(),
            ..Default::default()
        },
        storage: zmq_log_server::StorageConfig {
            log_dir: "/tmp/test_logs".to_string(),
            max_file_size: 50 * 1024 * 1024,
            max_files: 10,
            ..Default::default()
        },
        processor: zmq_log_server::ProcessorConfig::default(),
        http: zmq_log_server::HttpConfig::default(),
        metrics: zmq_log_server::MetricsConfig::default(),
    };
    
    assert_eq!(config.log_level, ConfigLogLevel::Debug);
    assert_eq!(config.zmq.port, 6666);
    assert_eq!(config.zmq.bind_address, "tcp://127.0.0.1");
    assert_eq!(config.storage.log_dir, "/tmp/test_logs");
    assert_eq!(config.storage.max_file_size, 50 * 1024 * 1024);
    assert_eq!(config.storage.max_files, 10);
}

#[tokio::test]
async fn test_log_entry_serialization() {
    let entry = LogEntry::new(LogLevel::Info, "Serialization test".to_string())
        .with_field("test_field".to_string(), serde_json::Value::String("test_value".to_string()));
    
    let json = serde_json::to_string(&entry).unwrap();
    let deserialized: LogEntry = serde_json::from_str(&json).unwrap();
    
    assert_eq!(entry.level, deserialized.level);
    assert_eq!(entry.message, deserialized.message);
    assert_eq!(entry.fields, deserialized.fields);
}

#[tokio::test]
async fn test_log_level_parsing() {
    use std::str::FromStr;
    
    let levels = vec![
        ("error", LogLevel::Error),
        ("warn", LogLevel::Warn),
        ("info", LogLevel::Info),
        ("debug", LogLevel::Debug),
        ("trace", LogLevel::Trace),
    ];
    
    for (input, expected) in levels {
        let parsed = LogLevel::from_str(input).unwrap();
        assert_eq!(parsed, expected);
    }
    
    // Test invalid level
    let result = LogLevel::from_str("invalid");
    assert!(result.is_none());
}

#[tokio::test]
async fn test_log_level_display() {
    let levels = vec![
        (LogLevel::Error, "ERROR"),
        (LogLevel::Warn, "WARN"),
        (LogLevel::Info, "INFO"),
        (LogLevel::Debug, "DEBUG"),
        (LogLevel::Trace, "TRACE"),
    ];
    
    for (level, expected) in levels {
        assert_eq!(level.to_string(), expected);
    }
}