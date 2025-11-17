//! Test server utilities
//!
//! Helpers for spawning and managing test Axum servers.

use oauth_service_rust::app::create_app;
use oauth_service_rust::config::Config;
use sqlx::{Pool, Sqlite};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

/// Test server instance
pub struct TestServer {
    pub base_url: String,
    pub addr: SocketAddr,
}

impl TestServer {
    /// Spawn a test server with the given database pool
    pub async fn spawn(pool: Pool<Sqlite>) -> Self {
        // Load or create test config
        let config = Arc::new(Config::from_env().expect("Failed to load config"));

        // Create the Axum app
        let app = create_app(Arc::new(pool), config).await;

        // Bind to a random available port
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("Failed to bind to random port");

        let addr = listener.local_addr().expect("Failed to get local address");
        let base_url = format!("http://{}", addr);

        // Spawn the server in a background task
        tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("Server failed to start");
        });

        // Give the server a moment to start
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        Self { base_url, addr }
    }

    /// Get the full URL for a given path
    pub fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::e2e::setup_test_database;

    #[tokio::test]
    async fn test_spawn_server() {
        let pool = setup_test_database().await;
        let server = TestServer::spawn(pool).await;

        // Verify server is accessible
        let client = reqwest::Client::new();
        let response = client
            .get(server.url("/health"))
            .send()
            .await
            .expect("Failed to send request");

        assert!(response.status().is_success());
    }
}
