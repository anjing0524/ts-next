use crate::napi::config::SDKConfig;
use crate::napi::error::{SDKError, SDKResult};
use reqwest::{Client, Method};
use serde_json::Value;
use std::time::Duration;

#[derive(Clone)]
pub struct HttpClient {
    client: Client,
    config: SDKConfig,
}

impl HttpClient {
    pub fn new(config: SDKConfig) -> SDKResult<Self> {
        let timeout = Duration::from_millis(config.timeout.unwrap_or(5000));
        let client = Client::builder()
            .timeout(timeout)
            .build()
            .map_err(|e| SDKError::new("HTTP_CLIENT_ERROR", e.to_string()))?;

        Ok(Self { client, config })
    }

    async fn request(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
    ) -> SDKResult<Value> {
        let url = format!("{}{}", self.config.base_url, path);
        let mut retries = 0;
        let max_retries = self.config.retry_count.unwrap_or(3);

        loop {
            let response = if let Some(ref body) = body {
                self.client
                    .request(method.clone(), &url)
                    .json(body)
                    .send()
                    .await
            } else {
                self.client.request(method.clone(), &url).send().await
            };

            match response {
                Ok(resp) => {
                    if resp.status().is_success() {
                        return resp
                            .json::<Value>()
                            .await
                            .map_err(|e| SDKError::new("JSON_PARSE_ERROR", e.to_string()));
                    } else {
                        let status = resp.status();
                        let body = resp
                            .text()
                            .await
                            .unwrap_or_else(|_| "Unknown error".to_string());

                        // 不重试客户端错误（4xx）
                        if status.is_client_error() {
                            return Err(SDKError::new(
                                format!("HTTP_{}", status.as_u16()),
                                body,
                            )
                            .with_status(status.as_u16()));
                        }

                        // 重试服务器错误（5xx）
                        if retries < max_retries {
                            retries += 1;
                            let delay = self.config.retry_delay.unwrap_or(100) * (2_u64.pow(retries - 1));
                            tokio::time::sleep(Duration::from_millis(delay)).await;
                            continue;
                        }

                        return Err(SDKError::new(
                            format!("HTTP_{}", status.as_u16()),
                            body,
                        )
                        .with_status(status.as_u16()));
                    }
                }
                Err(e) => {
                    if retries < max_retries && !e.is_status() {
                        retries += 1;
                        let delay = self.config.retry_delay.unwrap_or(100) * (2_u64.pow(retries - 1));
                        tokio::time::sleep(Duration::from_millis(delay)).await;
                        continue;
                    }
                    return Err(SDKError::new("REQUEST_ERROR", e.to_string()));
                }
            }
        }
    }

    pub async fn get(&self, path: &str) -> SDKResult<Value> {
        self.request(Method::GET, path, None).await
    }

    pub async fn post(&self, path: &str, body: Value) -> SDKResult<Value> {
        self.request(Method::POST, path, Some(body)).await
    }

    pub async fn put(&self, path: &str, body: Value) -> SDKResult<Value> {
        self.request(Method::PUT, path, Some(body)).await
    }

    pub async fn patch(&self, path: &str, body: Value) -> SDKResult<Value> {
        self.request(Method::PATCH, path, Some(body)).await
    }

    pub async fn delete(&self, path: &str) -> SDKResult<Value> {
        self.request(Method::DELETE, path, None).await
    }
}
