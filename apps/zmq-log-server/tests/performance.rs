//! Performance tests for ZMQ Log Server

use std::time::{Duration, Instant};
use tempfile::TempDir;
use zmq_log_server::{LogConfig, ZmqLogServer, LogEntry, LogLevel};

#[tokio::test]
async fn test_log_entry_creation_performance() {
    let iterations = 10000;
    let start = Instant::now();
    
    for _ in 0..iterations {
        let _entry = LogEntry::new(LogLevel::Info, "Performance test message".to_string());
    }
    
    let duration = start.elapsed();
    let rate = iterations as f64 / duration.as_secs_f64();
    
    println!("Log entry creation rate: {:.0} entries/second", rate);
    assert!(rate > 10000.0, "Log entry creation should be fast");
}

#[tokio::test]
async fn test_log_entry_serialization_performance() {
    let iterations = 5000;
    let entry = LogEntry::new(LogLevel::Info, "Serialization performance test".to_string())
        .with_field("test_field".to_string(), serde_json::Value::String("test_value".to_string()));
    
    let start = Instant::now();
    
    for _ in 0..iterations {
        let _json = serde_json::to_string(&entry).unwrap();
    }
    
    let duration = start.elapsed();
    let rate = iterations as f64 / duration.as_secs_f64();
    
    println!("Log entry serialization rate: {:.0} entries/second", rate);
    assert!(rate > 5000.0, "Log entry serialization should be fast");
}

#[tokio::test]
async fn test_log_entry_deserialization_performance() {
    let iterations = 5000;
    let entry = LogEntry::new(LogLevel::Info, "Deserialization performance test".to_string())
        .with_field("test_field".to_string(), serde_json::Value::String("test_value".to_string()));
    
    let json = serde_json::to_string(&entry).unwrap();
    
    let start = Instant::now();
    
    for _ in 0..iterations {
        let _deserialized: LogEntry = serde_json::from_str(&json).unwrap();
    }
    
    let duration = start.elapsed();
    let rate = iterations as f64 / duration.as_secs_f64();
    
    println!("Log entry deserialization rate: {:.0} entries/second", rate);
    assert!(rate > 5000.0, "Log entry deserialization should be fast");
}

#[tokio::test]
async fn test_storage_performance() {
    let temp_dir = TempDir::new().unwrap();
    let config = LogConfig {
        storage: zmq_log_server::StorageConfig {
            log_dir: temp_dir.path().to_string_lossy().to_string(),
            write_buffer_size: 8192,
            flush_interval: 1000,
            ..Default::default()
        },
        ..Default::default()
    };
    
    let storage = zmq_log_server::LogStorage::new(std::sync::Arc::new(config.storage.clone())).await.unwrap();
    
    let iterations = 1000;
    let start = Instant::now();
    
    for i in 0..iterations {
        let entry = LogEntry::new(LogLevel::Info, format!("Performance test message {}", i));
        storage.write_log_entry(&entry).await.unwrap();
    }
    
    let duration = start.elapsed();
    let rate = iterations as f64 / duration.as_secs_f64();
    
    println!("Storage write rate: {:.0} entries/second", rate);
    assert!(rate > 100.0, "Storage writes should be reasonably fast");
    
    let stats = storage.get_stats().await;
    assert_eq!(stats.total_writes, iterations as u64);
}

#[tokio::test]
async fn test_concurrent_log_writes() {
    let temp_dir = TempDir::new().unwrap();
    let config = LogConfig {
        storage: zmq_log_server::StorageConfig {
            log_dir: temp_dir.path().to_string_lossy().to_string(),
            ..Default::default()
        },
        ..Default::default()
    };
    
    let storage = std::sync::Arc::new(zmq_log_server::LogStorage::new(std::sync::Arc::new(config.storage.clone())).await.unwrap());
    
    let num_threads = 10;
    let entries_per_thread = 100;
    
    let start = Instant::now();
    
    let mut handles = vec![];
    
    for thread_id in 0..num_threads {
        let storage_clone = storage.clone();
        let handle = tokio::spawn(async move {
            for i in 0..entries_per_thread {
                let entry = LogEntry::new(LogLevel::Info, format!("Concurrent test message {}-{}", thread_id, i));
                storage_clone.write_log_entry(&entry).await.unwrap();
            }
        });
        handles.push(handle);
    }
    
    // Wait for all threads to complete
    for handle in handles {
        handle.await.unwrap();
    }
    
    let duration = start.elapsed();
    let total_entries = num_threads * entries_per_thread;
    let rate = total_entries as f64 / duration.as_secs_f64();
    
    println!("Concurrent storage write rate: {:.0} entries/second", rate);
    assert!(rate > 50.0, "Concurrent storage writes should be reasonably fast");
    
    let stats = storage.get_stats().await;
    assert_eq!(stats.total_writes, total_entries as u64);
}

#[tokio::test]
async fn test_memory_usage() {
    let temp_dir = TempDir::new().unwrap();
    let config = LogConfig {
        storage: zmq_log_server::StorageConfig {
            log_dir: temp_dir.path().to_string_lossy().to_string(),
            ..Default::default()
        },
        ..Default::default()
    };
    
    let storage = zmq_log_server::LogStorage::new(std::sync::Arc::new(config.storage.clone())).await.unwrap();
    
    let iterations = 1000;
    let start = Instant::now();
    
    for i in 0..iterations {
        let entry = LogEntry::new(LogLevel::Info, format!("Memory test message {}", i));
        storage.write_log_entry(&entry).await.unwrap();
    }
    
    let duration = start.elapsed();
    let rate = iterations as f64 / duration.as_secs_f64();
    
    println!("Memory usage test rate: {:.0} entries/second", rate);
    assert!(rate > 100.0, "Memory usage should be reasonable");
}

#[tokio::test]
async fn test_large_log_entries() {
    let temp_dir = TempDir::new().unwrap();
    let config = LogConfig {
        storage: zmq_log_server::StorageConfig {
            log_dir: temp_dir.path().to_string_lossy().to_string(),
            max_file_size: 1024 * 1024, // 1MB
            ..Default::default()
        },
        ..Default::default()
    };
    
    let storage = zmq_log_server::LogStorage::new(std::sync::Arc::new(config.storage.clone())).await.unwrap();
    
    let iterations = 100;
    let large_message = "x".repeat(1024); // 1KB message
    
    let start = Instant::now();
    
    for i in 0..iterations {
        let entry = LogEntry::new(LogLevel::Info, format!("Large message test {}: {}", i, large_message));
        storage.write_log_entry(&entry).await.unwrap();
    }
    
    let duration = start.elapsed();
    let rate = iterations as f64 / duration.as_secs_f64();
    let throughput = (iterations * large_message.len()) as f64 / duration.as_secs_f64() / 1024.0; // KB/s
    
    println!("Large log entry rate: {:.0} entries/second", rate);
    println!("Large log entry throughput: {:.0} KB/s", throughput);
    
    assert!(rate > 10.0, "Large log entries should be handled reasonably fast");
    assert!(throughput > 100.0, "Large log entry throughput should be good");
}

#[tokio::test]
async fn test_server_startup_time() {
    let temp_dir = TempDir::new().unwrap();
    let config = LogConfig {
        storage: zmq_log_server::StorageConfig {
            log_dir: temp_dir.path().to_string_lossy().to_string(),
            ..Default::default()
        },
        ..Default::default()
    };
    
    let iterations = 10;
    let mut total_startup_time = Duration::from_millis(0);
    
    for _ in 0..iterations {
        let start = Instant::now();
        let server = ZmqLogServer::new(config.clone()).await.unwrap();
        let startup_time = start.elapsed();
        total_startup_time += startup_time;
        
        // Stop the server
        server.stop().await.unwrap();
    }
    
    let avg_startup_time = total_startup_time / iterations;
    
    println!("Average server startup time: {:?}", avg_startup_time);
    assert!(avg_startup_time < Duration::from_millis(100), "Server startup should be fast");
}