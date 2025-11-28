use async_trait::async_trait;
use pingora::prelude::*;
use pingora::http::ResponseHeader;
use pingora::lb::selection::RoundRobin;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tracing::info;

use crate::config::RouteConfig;
use crate::rate_limit::IpRateLimiter; // rate_limit module from src/rate_limit.rs

pub struct Backend {
    pub name: String,
    pub load_balancer: Arc<LoadBalancer<RoundRobin>>,
    pub use_tls: bool,
}

pub struct ProxyService {
    pub service_name: Arc<str>,
    pub routes: Arc<Vec<RouteConfig>>,
    pub backends: Arc<HashMap<String, Backend>>,
    pub default_backend: Arc<str>,
    pub rate_limiter: Arc<Mutex<IpRateLimiter>>,
}

impl ProxyService {
    fn select_backend(&self, uri: &str) -> Option<&Backend> {
        // 按最长前缀匹配路由规则
        let matched_route = self.routes
            .iter()
            .filter(|route| uri.starts_with(&route.path_prefix))
            .max_by_key(|route| route.path_prefix.len());

        let backend_name: &str = if let Some(route) = matched_route {
            &route.backend
        } else {
            self.default_backend.as_ref()
        };

        self.backends.get(backend_name)
    }
}

#[async_trait]
impl ProxyHttp for ProxyService {
    type CTX = ();

    fn new_ctx(&self) -> Self::CTX {}

    async fn upstream_peer(&self, session: &mut Session, _ctx: &mut Self::CTX) -> Result<Box<HttpPeer>> {
        let uri = session.req_header().uri.to_string();

        // 提取客户端 IP 并检查速率限制
        let client_ip = if let Some(sockaddr) = session.client_addr() {
            match sockaddr {
                pingora::protocols::l4::socket::SocketAddr::Inet(addr) => addr.ip(),
                pingora::protocols::l4::socket::SocketAddr::Unix(_) => {
                    "127.0.0.1".parse().unwrap_or_else(|_| "0.0.0.0".parse().unwrap())
                }
            }
        } else {
            "0.0.0.0".parse().unwrap_or_else(|_| "127.0.0.1".parse().unwrap())
        };

        // 检查速率限制
        {
            let mut limiter = self.rate_limiter.lock().unwrap();
            if !limiter.check(client_ip) {
                info!(
                    service = %self.service_name,
                    client_ip = %client_ip,
                    "Rate limit exceeded for client"
                );
                return Err(Error::new_str("Rate limit exceeded"));
            }
        }

        let backend = self.select_backend(&uri)
            .ok_or_else(|| Error::new_str("No backend found for request"))?;

        let peer = backend.load_balancer
            .select(b"", 256) // hash doesn't matter for round robin
            .ok_or_else(|| Error::new_str("No healthy upstream peer"))?;

        let client_ip_str = client_ip.to_string();
        let peer_address = peer.addr.to_string();

        info!(
            service = %self.service_name,
            client_ip = %client_ip_str,
            request_uri = %uri,
            backend = %backend.name,
            upstream_peer = %peer_address,
            "Forwarding request"
        );

        // For SNI, we will parse the host from the upstream address string.
        let sni = peer_address.split(':').next().unwrap_or("").to_string();
        let http_peer = HttpPeer::new(&peer_address, backend.use_tls, sni);

        Ok(Box::new(http_peer))
    }

    async fn response_filter(
        &self,
        _session: &mut Session,
        upstream_response: &mut ResponseHeader,
        _ctx: &mut Self::CTX,
    ) -> Result<()> where Self::CTX: Send + Sync {
        // 为 Next.js SSR 流式响应优化
        // Enable streaming for Next.js SSR responses
        // Pingora 默认会传递流式响应给客户端而不缓冲

        // 检查是否为流式响应（Transfer-Encoding: chunked 或 Content-Length 缺失）
        let has_chunked = upstream_response
            .headers
            .get("transfer-encoding")
            .map(|v| v.to_str().unwrap_or("").to_lowercase().contains("chunked"))
            .unwrap_or(false);

        let is_streaming = has_chunked || upstream_response.headers.get("content-length").is_none();

        if is_streaming {
            info!(
                service = %self.service_name,
                chunked = %has_chunked,
                "Processing streaming response (Next.js SSR)"
            );
        }

        // 记录 Set-Cookie headers 用于调试
        let set_cookie_count = upstream_response
            .headers
            .get_all("set-cookie")
            .iter()
            .count();

        if set_cookie_count > 0 {
            info!("Forwarding {} Set-Cookie headers", set_cookie_count);
        }

        Ok(())
    }
}
