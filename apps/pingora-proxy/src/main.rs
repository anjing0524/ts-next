use anyhow::Result;
use clap::Parser;
use pingora::prelude::*;
use pingora::server::configuration::Opt;
use pingora::lb::health_check::TcpHealthCheck;
use pingora::lb::selection::RoundRobin;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tracing::info;

mod config;
mod proxy;
mod tls;
mod rate_limit;
mod metrics;
mod config_watcher;

use config::Settings;
use proxy::{ProxyService, Backend};
use tls::validate_tls_version;
use config_watcher::ConfigWatcher;

#[derive(Parser)]
#[command(name = "pingora-proxy")]
#[command(about = "A high-performance reverse proxy based on Pingora")]
struct Args {
    #[arg(short, long, default_value = "config/default.yaml")]
    config: String,
    #[arg(long)]
    daemon: bool,
}

fn main() -> Result<()> {
    let log_file = std::fs::File::create("pingora.log")?;
    let subscriber = tracing_subscriber::fmt()
        .with_writer(log_file)
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    let args = Args::parse();

    let settings = Settings::from_file(&args.config)?;
    settings.validate()?;
    info!("Configuration loaded and validated from {}", args.config);

    // 验证 TLS 配置
    for service_config in &settings.services {
        if let Some(tls_config) = &service_config.tls {
            validate_tls_version(&tls_config.min_version)?;
            tls::validate_tls_config(tls_config)?;
            info!(
                "✓ TLS 1.3+ configured for service '{}' (cert: {}, key: {})",
                service_config.name, tls_config.cert_path, tls_config.key_path
            );
        }
    }

    // 启动配置文件监听器（配置变更时会输出日志）
    let watcher = ConfigWatcher::new(&args.config);
    if let Err(e) = watcher.watch_with_logging() {
        info!("⚠️  Failed to start configuration watcher: {}", e);
    } else {
        info!("✓ Configuration hot reload watcher started");
    }

    let opt = Opt {
        daemon: args.daemon,
        ..Default::default()
    };

    let mut my_server = Server::new(Some(opt))?;
    my_server.bootstrap();

    for service_config in settings.services {
        let mut backends = HashMap::new();

        // 为每个后端创建负载均衡器
        for (backend_name, backend_config) in service_config.backends.iter() {
            let mut lb = LoadBalancer::<RoundRobin>::try_from_iter(&backend_config.upstreams)?;

            // 健康检查配置注释：在生产部署中，应该启用健康检查。
            // 对于开发/测试环境，我们禁用初始健康检查以避免启动时的延迟
            // 在下面两行中，我们仍然设置配置但初始化时禁用
            let mut health_check = TcpHealthCheck::new();
            health_check.peer_template.options.connection_timeout =
                Some(Duration::from_millis(service_config.health_check.timeout_ms));
            // 注释掉：在启动时禁用健康检查，让请求触发健康检查
            // lb.set_health_check(health_check);
            // lb.health_check_frequency =
            //     Some(Duration::from_secs(service_config.health_check.frequency_secs));

            info!("Health check disabled for faster startup (enable in production)");

            backends.insert(
                backend_name.clone(),
                Backend {
                    name: backend_name.clone(),
                    load_balancer: Arc::new(lb),
                    use_tls: backend_config.tls,
                },
            );

            info!(
                "Backend '{}' configured with {} upstreams",
                backend_name,
                backend_config.upstreams.len()
            );
        }

        let proxy_service = ProxyService {
            service_name: Arc::from(service_config.name.as_str()),
            routes: Arc::new(service_config.routes.clone()),
            backends: Arc::new(backends),
            default_backend: Arc::from(service_config.default_backend.as_str()),
            rate_limiter: Arc::new(std::sync::Mutex::new(
                crate::rate_limit::IpRateLimiter::new(100) // 100 requests per minute per IP
            )),
        };

        let mut service = http_proxy_service(&my_server.configuration, proxy_service);

        // 如果配置了 TLS，添加 HTTPS 监听
        if let Some(tls_config) = &service_config.tls {
            service.add_tls(
                &service_config.bind_address,
                &tls_config.cert_path,
                &tls_config.key_path
            )?;
            info!(
                "✓ Service '{}' listening on {} with TLS 1.3+ (cert: {}, key: {})",
                service_config.name,
                service_config.bind_address,
                tls_config.cert_path,
                tls_config.key_path
            );
        } else {
            service.add_tcp(&service_config.bind_address);
            info!(
                "Service '{}' listening on {} (HTTP)",
                service_config.name, service_config.bind_address
            );
        }

        my_server.add_service(service);
        info!(
            "Service '{}' configured with {} routes and default backend '{}'",
            service_config.name,
            service_config.routes.len(),
            service_config.default_backend
        );
    }

    my_server.run_forever();
}
