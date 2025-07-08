use criterion::{criterion_group, criterion_main, Criterion};
use pingora_proxy::config::settings::{Settings, UpstreamConfig, ServerConfig, TlsConfig, PerformanceConfig};
use pingora_proxy::proxy::service::ProxyService;
use std::sync::Arc;

// 构造具有 N 条路径前缀的测试配置
fn build_settings(n: usize) -> Settings {
    let mut upstreams = Vec::with_capacity(n);
    for i in 0..n {
        upstreams.push(UpstreamConfig {
            name: format!("backend{i}"),
            host: "127.0.0.1".into(),
            port: 3000 + (i as u16),
            path_prefix: format!("/api/v{i}/"),
            health_check_path: None,
            timeout_seconds: 30,
            tls_enabled: false,
        });
    }
    Settings {
        server: ServerConfig {
            listen_address: "0.0.0.0".into(),
            listen_port: 8080,
            worker_threads: 2,
            graceful_shutdown: true,
            graceful_timeout_seconds: 30,
        },
        upstreams,
        tls: TlsConfig::default(),
        performance: PerformanceConfig::default(),
    }
}

fn bench_path_match(c: &mut Criterion) {
    let settings = Arc::new(build_settings(100));
    let (service, _bg) = ProxyService::new(settings).expect("create");
    let test_paths = vec!["/api/v10/users", "/api/v50/items", "/api/v1/info"];

    c.bench_function("path_prefix_match", |b| {
        b.iter(|| {
            for p in &test_paths {
                // 仅调用内部匹配逻辑
                let _ = service
                    .upstreams
                    .iter()
                    .find(|u| p.starts_with(&u.path_prefix));
            }
        })
    });
}

criterion_group!(benches, bench_path_match);
criterion_main!(benches); 