use crate::metrics::MetricsCollector;
use crate::proxy::routing::select_upstream;
use crate::security::jwt::JwtValidator;
use async_trait::async_trait;
use pingora::http::ResponseHeader;
use pingora::prelude::*;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::warn;
use prometheus::{Encoder, TextEncoder};

/// 代理服务结构体
pub struct ProxyService {
    /// 上游服务的映射表 (路径前缀 -> 负载均衡器)
    pub upstream_map: HashMap<String, Arc<LoadBalancer<RoundRobin>>>,
    /// JWT 验证器
    jwt_validator: Arc<JwtValidator>,
    /// 指标收集器
    metrics: Arc<MetricsCollector>,
}

impl ProxyService {
    /// 创建一个新的代理服务实例
    pub fn new(
        upstream_map: HashMap<String, Arc<LoadBalancer<RoundRobin>>>,
        jwt_validator: Arc<JwtValidator>,
        metrics: Arc<MetricsCollector>,
    ) -> Self {
        Self {
            upstream_map,
            jwt_validator,
            metrics,
        }
    }
}

#[async_trait]
impl ProxyHttp for ProxyService {
    type CTX = ();

    fn new_ctx(&self) -> Self::CTX {}

    /// 请求过滤器，用于在请求转发到上游之前执行逻辑，如认证
    async fn request_filter(&self, session: &mut Session, _ctx: &mut Self::CTX) -> Result<bool> {
        let path = session.req_header().uri.path();

        // metrics endpoint
        if path == "/metrics" {
            let encoder = TextEncoder::new();
            let metric_families = self.metrics.gather();
            let mut buffer = vec![];
            encoder.encode(&metric_families, &mut buffer).unwrap();

            let mut response = ResponseHeader::build(200, None)?;
            response.insert_header("Content-Type", "text/plain; version=0.0.4")?;
            session.write_response_header(Box::new(response), false).await?;
            session.write_response_body(Some(buffer.into()), true).await?;
            return Ok(true);
        }

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
                    warn!("请求 {} 缺少 Bearer token", path);
                    session.respond_error(401).await?;
                    return Ok(true); // 终止请求
                }
            };

            match self.jwt_validator.validate(token).await {
                Ok(_) => return Ok(false), // 继续请求
                Err(e) => {
                    warn!("JWT 验证失败 for path {}: {}", path, e);
                    session.respond_error(403).await?;
                    return Ok(true); // 终止请求
                }
            }
        }

        // 其他路径直接放行
        Ok(false)
    }

    /// 选择上游服务器
    async fn upstream_peer(
        &self,
        session: &mut Session,
        _ctx: &mut Self::CTX,
    ) -> Result<Box<HttpPeer>> {
        let upstream = select_upstream(session, &self.upstream_map)?;

        // TODO: 从配置中获取 SNI 名称
        let sni_name = "upstream.internal".to_string();

        let peer = Box::new(HttpPeer::new(
            upstream.select(b"", 256).unwrap(), // b"" means no hashing key
            true, // use TLS
            sni_name,
        ));
        Ok(peer)
    }
}
