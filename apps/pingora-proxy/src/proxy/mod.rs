use async_trait::async_trait;
use pingora::prelude::*;
use pingora::lb::selection::RoundRobin;
use std::sync::Arc;
use tracing::info;

pub struct ProxyService {
    pub service_name: Arc<str>,
    pub upstreams: Arc<LoadBalancer<RoundRobin>>,
    pub use_tls: bool,
}

#[async_trait]
impl ProxyHttp for ProxyService {
    type CTX = ();

    fn new_ctx(&self) -> Self::CTX {}

    async fn upstream_peer(&self, session: &mut Session, _ctx: &mut Self::CTX) -> Result<Box<HttpPeer>> {
        let peer = self.upstreams
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
            request_uri = %session.req_header().uri,
            upstream_peer = %peer_address,
            "Forwarding request"
        );

        // For SNI, we will parse the host from the upstream address string.
        // This is a simple approach; a more robust solution might involve
        // a dedicated `sni` field in the configuration.
        let sni = peer_address.split(':').next().unwrap_or("").to_string();
        let http_peer = HttpPeer::new(&peer_address, self.use_tls, sni);

        Ok(Box::new(http_peer))
    }
}
