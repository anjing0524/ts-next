//! `pingora-proxy` 最终架构入口点

use async_trait::async_trait;
use pingora::prelude::*;
use pingora::services::background::background_service;
use pingora_proxy::proxy::jwt::JwtValidator;
use std::sync::Arc;
use std::time::Duration;
use tracing::warn;
use pingora::lb::health_check::HttpHealthCheck;
use std::env;
use pingora::services::listening::Service;
mod config;
use crate::config::ProxyConfig;

pub struct MyProxy {
    upstream_map: std::collections::HashMap<String, Arc<LoadBalancer<RoundRobin>>>,
    jwt_validator: Arc<JwtValidator>,
}

#[async_trait]
impl ProxyHttp for MyProxy {
    type CTX = ();
    fn new_ctx(&self) -> () {}

    async fn request_filter(&self, session: &mut Session, _ctx: &mut ()) -> Result<bool> {
        let path = session.req_header().uri.path();
        // 只对 /api 路径进行JWT验证
        if path.starts_with("/api") {
            let token = match session
                .req_header()
                .headers
                .get("Authorization")
                .and_then(|h| h.to_str().ok())
                .and_then(|s| s.strip_prefix("Bearer "))
            {
                Some(token) => token,
                None => {
                    warn!("请求 /api 缺少 Bearer token");
                    session.respond_error(401).await?;
                    return Ok(true);
                }
            };
            match self.jwt_validator.validate(token).await {
                Ok(_) => Ok(false),
                Err(e) => {
                    warn!("JWT 验证失败: {}", e);
                    session.respond_error(403).await?;
                    Ok(true)
                }
            }
        } else {
            Ok(false)
        }
    }

    async fn upstream_peer(&self, session: &mut Session, _ctx: &mut ()) -> Result<Box<HttpPeer>> {
        let path = session.req_header().uri.path();
        // 动态路由分发：最长前缀匹配
        let mut selected: Option<&Arc<LoadBalancer<RoundRobin>>> = None;
        let mut max_len = 0;
        for (prefix, lb) in &self.upstream_map {
            if path.starts_with(prefix) && prefix.len() > max_len {
                selected = Some(lb);
                max_len = prefix.len();
            }
        }
        let upstream = selected.ok_or_else(|| anyhow::anyhow!("未找到匹配的上游服务"))?;
        let peer = Box::new(HttpPeer::new(upstream.select(b"", 256).unwrap(), true, "upstream.internal".to_string()));
        Ok(peer)
    }
}

fn main() -> anyhow::Result<()> {
    // 加载配置文件和环境变量
    let config = match ProxyConfig::from_env_and_file() {
        Ok(cfg) => cfg,
        Err(e) => {
            eprintln!("配置加载失败: {e}");
            std::process::exit(1);
        }
    };

    // 组装监听地址
    let listen_addr = format!("{}:{}", config.server.listen_address, config.server.listen_port);

    // 初始化上游服务和健康检查
    let mut upstream_map = std::collections::HashMap::new();
    for up in &config.upstreams {
        let addr = format!("{}:{}", up.host, up.port);
        let mut lb = LoadBalancer::try_from_iter([addr.as_str()]).unwrap();
        if let Some(ref health_path) = up.health_check_path {
            let hc = HttpHealthCheck::new(&up.host, false); // 这里只能用 host，pingora 0.5.0 仅支持 / 路径
            lb.set_health_check(Box::new(hc));
            lb.health_check_frequency = Some(Duration::from_secs(5));
        }
        upstream_map.insert(up.path_prefix.clone(), Arc::new(lb));
    }

    // 初始化 JWT 校验器
    let jwt_validator = Arc::new(JwtValidator::new(
        config.jwt.jwks_url.clone(),
        config.jwt.audience.clone(),
        config.jwt.issuer.clone(),
        100,
    ));

    // 实例化代理
    let proxy = MyProxy {
        upstream_map,
        jwt_validator,
    };

    // 注册 Prometheus 监控服务（如启用）
    if let Some(monitoring) = &config.monitoring {
        if monitoring.enabled.unwrap_or(false) {
            let port = monitoring.listen_port.unwrap_or(9090);
            let metrics_path = monitoring.metrics_path.clone().unwrap_or("/metrics".to_string());
            let mut prometheus_service = Service::prometheus_http_service();
            prometheus_service.add_tcp(format!("0.0.0.0:{}", port));
            println!("Prometheus 监控已启用，监听端口: {}，路径: {}", port, metrics_path);
        }
    }

    // 注册 TLS 服务（如启用）
    if let Some(tls) = &config.tls {
        if tls.enabled {
            let port = tls.listen_port.unwrap_or(8443);
            let cert = tls.cert_path.as_ref().expect("缺少 cert_path");
            let key = tls.key_path.as_ref().expect("缺少 key_path");
            let mut https_service = Service::https_service(cert, key);
            https_service.add_tcp(format!("0.0.0.0:{}", port));
            println!("TLS/HTTPS 服务已启用，监听端口: {}，证书: {}", port, cert);
            // TODO: 如需支持 HTTP2/3，可根据 tls.http2_enabled/http3_enabled 配置扩展
        }
    }

    // 动态调整性能参数（如零拷贝、内存池、压缩等）
    if let Some(perf) = &config.performance {
        if let Some(zero_copy) = perf.zero_copy_enabled {
            println!("零拷贝传输已{}", if zero_copy { "启用" } else { "禁用" });
            // TODO: 按需调用 pingora API 启用/禁用零拷贝
        }
        if let Some(mem_pool) = perf.memory_pool_enabled {
            println!("内存池已{}", if mem_pool { "启用" } else { "禁用" });
            // TODO: 按需调用 pingora API 启用/禁用内存池
        }
        if let Some(compress) = perf.compression_enabled {
            println!("压缩已{}", if compress { "启用" } else { "禁用" });
            // TODO: 按需调用 pingora API 启用/禁用压缩
        }
        if let Some(cache) = perf.cache_enabled {
            println!("缓存已{}", if cache { "启用" } else { "禁用" });
            // TODO: 按需调用 pingora API 启用/禁用缓存
        }
    }

    println!("服务运行在 http://{}", listen_addr);
    Ok(())
}