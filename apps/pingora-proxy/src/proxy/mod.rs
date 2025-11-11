use async_trait::async_trait;
use pingora::prelude::*;
use pingora::http::ResponseHeader;
use pingora::lb::selection::RoundRobin;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::info;

use crate::config::RouteConfig;

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

        let backend = self.select_backend(&uri)
            .ok_or_else(|| Error::new_str("No backend found for request"))?;

        let peer = backend.load_balancer
            .select(b"", 256) // hash doesn't matter for round robin
            .ok_or_else(|| Error::new_str("No healthy upstream peer"))?;

        let client_ip = if let Some(sockaddr) = session.client_addr() {
            match sockaddr {
                pingora::protocols::l4::socket::SocketAddr::Inet(addr) => addr.ip().to_string(),
                pingora::protocols::l4::socket::SocketAddr::Unix(_) => "unix_socket".to_string(),
            }
        } else {
            "unknown".to_string()
        };
        let peer_address = peer.addr.to_string();

        info!(
            service = %self.service_name,
            client_ip = %client_ip,
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
        // TODO: 修改 Set-Cookie header 的 Domain 属性
        // 目前 Pingora 的 ResponseHeader 不支持直接修改 headers
        // 需要在后端服务（oauth-service 和 admin-portal）中设置正确的 Domain

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
