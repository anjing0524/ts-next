//! `pingora-proxy` 最终架构入口点

use pingora::prelude::*;
use pingora::server::{Server, ServerOptions};
use pingora::services::listening::Service;
use std::sync::Arc;

// 导入项目模块
mod config;
mod error;
mod health;
mod metrics;
mod proxy;
mod security;

use crate::config::ProxyConfig;
use crate::health::setup_health_check;
use crate::metrics::{get_metrics, init_metrics};
use crate::proxy::service::ProxyService;
use crate::security::jwt::JwtValidator;

fn main() -> anyhow::Result<()> {
    // 初始化环境和日志
    env_logger::init();
    let config = match ProxyConfig::from_env_and_file() {
        Ok(cfg) => cfg,
        Err(e) => {
            eprintln!("配置加载失败: {e}");
            std::process::exit(1);
        }
    };

    // 初��化服务器
    let options = ServerOptions {
        worker_threads: config.server.worker_threads.unwrap_or(8),
        graceful_shutdown_timeout_secs: config.server.graceful_timeout_seconds,
        ..Default::default()
    };
    let mut my_server = Server::new(Some(options))?;

    // 初始化监控
    init_metrics()?;
    let metrics = get_metrics().unwrap();

    // 初始化上游
    let mut upstream_map = std::collections::HashMap::new();
    for up_config in &config.upstreams {
        let mut lb = LoadBalancer::try_from_iter([up_config.addrs()].iter())?;
        setup_health_check(&up_config.name, &mut lb, up_config);
        upstream_map.insert(up_config.path_prefix.clone(), Arc::new(lb));
    }

    // 初始化 JWT 验证器
    let jwt_validator = Arc::new(JwtValidator::new(
        config.jwt.jwks_url.clone(),
        config.jwt.audience.clone(),
        config.jwt.issuer.clone(),
        100, // cache size
    ));

    // 创建代理服务
    let proxy_service = Arc::new(ProxyService::new(
        upstream_map,
        jwt_validator,
        metrics,
    ));
    let mut service = Service::new("HTTP Proxy".to_string(), proxy_service);
    service.add_tcp(&format!(
        "{}:{}",
        config.server.listen_address, config.server.listen_port
    ));

    // 添加 TLS 支持
    if let Some(tls_config) = &config.tls {
        if tls_config.enabled {
            let cert_path = tls_config.cert_path.as_ref().expect("缺少 cert_path");
            let key_path = tls_config.key_path.as_ref().expect("缺少 key_path");
            let mut tls_settings =
                pingora::listeners::TlsSettings::new(cert_path, key_path)?;
            if tls_config.http2_enabled.unwrap_or(false) {
                tls_settings.enable_h2();
            }
            service.add_tls_with_settings(
                &format!("0.0.0.0:{}", tls_config.listen_port.unwrap_or(443)),
                None,
                tls_settings,
            );
        }
    }

    my_server.add_service(service);
    my_server.bootstrap();
    my_server.run_forever();
}




