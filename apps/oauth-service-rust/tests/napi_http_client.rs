#[cfg(test)]
mod tests {
    use oauth_service_rust::napi::config::SDKConfig;
    use oauth_service_rust::napi::http_client::HttpClient;

    #[test]
    fn test_config_creation() {
        let config = SDKConfig::new("http://localhost:8080".to_string())
            .with_timeout(10000)
            .with_retry(5, 200)
            .with_debug(true);

        assert_eq!(config.base_url, "http://localhost:8080");
        assert_eq!(config.timeout, Some(10000));
        assert_eq!(config.retry_count, Some(5));
        assert_eq!(config.retry_delay, Some(200));
        assert_eq!(config.debug, Some(true));
    }

    #[tokio::test]
    async fn test_http_client_creation() {
        let config = SDKConfig::new("http://localhost:8080".to_string());
        let client = HttpClient::new(config);
        assert!(client.is_ok());
    }
}
