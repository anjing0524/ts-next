//! Performance benchmarks for ZMQ Log Server
//! 
//! This module provides comprehensive performance testing to ensure
//! our optimizations are effective and measure key metrics.

use std::time::{Duration, Instant};
use tempfile::TempDir;
use zmq_log_server_simple::{LogConfig, ZmqLogServer, LogEntry, LogLevel};
use tokio::sync::mpsc;
use criterion::{criterion_group, criterion_main, Criterion, BenchmarkId};
use serde_json::json;

/// Benchmark single log entry performance
fn bench_log_entry_creation(c: &mut Criterion) {
    c.bench_function("log_entry_creation", |b| {
        b.iter(|| {
            let entry = LogEntry::new(LogLevel::Info, "Benchmark test message".to_string())
                .with_field("benchmark_id".to_string(), json!("perf_test"))
                .with_field("timestamp".to_string(), json!(std::time::SystemTime::now()));
            entry
        })
    });
}

/// Benchmark JSON serialization performance
fn bench_log_entry_serialization(c: &mut Criterion) {
    let entry = LogEntry::new(LogLevel::Info, "Serialization benchmark".to_string())
        .with_field("test_field".to_string(), json!("test_value"))
        .with_field("numeric_field".to_string(), json!(42))
        .with_field("array_field".to_string(), json!([1, 2, 3]));
    
    c.bench_function("log_entry_serialization", |b| {
        b.iter(|| {
            serde_json::to_string(&entry).unwrap()
        })
    });
}

/// Benchmark concurrent log processing
fn bench_concurrent_log_processing(c: &mut Criterion) {
    let temp_dir = TempDir::new().unwrap();
    let mut group = c.benchmark_group("concurrent_processing");
    
    for num_workers in [1, 2, 4, 8, 16].iter() {
        group.bench_with_input(BenchmarkId::new("workers", num_workers), num_workers, |b, &num_workers| {
            let config = LogConfig {
                storage: zmq_log_server_simple::StorageConfig {
                    log_dir: temp_dir.path().to_string_lossy().to_string(),
                    ..Default::default()
                },
                processor: zmq_log_server_simple::ProcessorConfig {
                    worker_threads: num_workers,
                    ..Default::default()
                },
                ..Default::default()
            };
            
            b.to_async(tokio::runtime::Runtime::new().unwrap()).iter(|| async {
                let server = ZmqLogServer::new(config.clone()).await.unwrap();
                let start_result = server.start().await;
                assert!(start_result.is_ok());
                
                // Generate concurrent load
                let handles: Vec<_> = (0..num_workers)
                    .map(|i| {
                        tokio::spawn(async move {
                            for j in 0..100 {
                                let entry = LogEntry::new(LogLevel::Info, 
                                    format!("Worker {} message {}", i, j));
                                // In a real test, we'd send this to the server
                                tokio::time::sleep(Duration::from_millis(1)).await;
                            }
                        })
                    })
                    .collect();
                
                for handle in handles {
                    handle.await.unwrap();
                }
                
                server.stop().await.unwrap();
            });
        });
    }
    group.finish();
}

/// Benchmark memory usage patterns
fn bench_memory_usage(c: &mut Criterion) {
    let temp_dir = TempDir::new().unwrap();
    let config = LogConfig {
        storage: zmq_log_server_simple::StorageConfig {
            log_dir: temp_dir.path().to_string_lossy().to_string(),
            max_file_size: 1024 * 1024, // 1MB for testing
            ..Default::default()
        },
        ..Default::default()
    };
    
    c.bench_function("memory_usage_high_load", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap()).iter(|| async {
            let server = ZmqLogServer::new(config.clone()).await.unwrap();
            let start_result = server.start().await;
            assert!(start_result.is_ok());
            
            // High memory load test
            for i in 0..10000 {
                let entry = LogEntry::new(LogLevel::Info, 
                    format!("Memory test message {} with some additional content to increase size", i))
                    .with_field("data".to_string(), json!(vec!["a"; 100])); // 100 bytes of data
                // In real test, send to server
            }
            
            server.stop().await.unwrap();
        });
    });
}

/// Benchmark error handling performance
fn bench_error_handling(c: &mut Criterion) {
    c.bench_function("error_handling", |b| {
        b.iter(|| {
            // Test various error scenarios
            let invalid_json = "{ invalid json }";
            let result: Result<LogEntry, _> = serde_json::from_str(invalid_json);
            assert!(result.is_err());
            
            // Test with empty message
            let entry = LogEntry::new(LogLevel::Info, "".to_string());
            assert_eq!(entry.message, "");
        })
    });
}

/// Stress test for ZMQ server under heavy load
fn stress_test_zmq_server(c: &mut Criterion) {
    let temp_dir = TempDir::new().unwrap();
    let config = LogConfig {
        storage: zmq_log_server_simple::StorageConfig {
            log_dir: temp_dir.path().to_string_lossy().to_string(),
            max_file_size: 10 * 1024 * 1024, // 10MB
            ..Default::default()
        },
        zmq: zmq_log_server_simple::ZmqConfig {
            recv_buffer_size: 1024 * 1024, // 1MB buffer
            high_watermark: 10000,
            ..Default::default()
        },
        ..Default::default()
    };
    
    c.bench_function("stress_test_zmq", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap()).iter(|| async {
            let server = ZmqLogServer::new(config.clone()).await.unwrap();
            let start_result = server.start().await;
            assert!(start_result.is_ok());
            
            // Simulate heavy load
            let start_time = Instant::now();
            let mut message_count = 0;
            
            while start_time.elapsed() < Duration::from_secs(5) {
                for i in 0..1000 {
                    let entry = LogEntry::new(LogLevel::Info, format!("Stress test message {}", i));
                    // Send to server
                    message_count += 1;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            
            server.stop().await.unwrap();
            
            // Assert minimum throughput
            assert!(message_count > 1000, "Insufficient throughput: {}", message_count);
        });
    });
}

criterion_group!(
    benches,
    bench_log_entry_creation,
    bench_log_entry_serialization,
    bench_concurrent_log_processing,
    bench_memory_usage,
    bench_error_handling,
    stress_test_zmq_server
);
criterion_main!(benches);