//! 上游服务健康检查模块

use crate::config::UpstreamConfig;
use async_trait::async_trait;
use pingora::lb::health_check::HealthCheck;
use pingora::lb::Backend;
use pingora::prelude::*;
use std::time::Duration;
use tracing::info;

/// 根据上游配置创建健康检查任务
pub fn setup_health_check(
    name: &str,
    lb: &mut LoadBalancer<RoundRobin>,
    upstream_config: &UpstreamConfig,
) {
    if let Some(ref health_check_path) = upstream_config.health_check_path {
        info!(
            "为上游 '{}' 设置健康检查，路径: {}, 间隔: 5s",
            name, health_check_path
        );

        let custom_hc = CustomHealthCheck::new(
            &upstream_config.host,
            upstream_config.port,
            health_check_path.clone(),
            upstream_config.tls_enabled.unwrap_or(false),
        );

        lb.set_health_check(Box::new(custom_hc));
        lb.health_check_frequency = Some(Duration::from_secs(5));
    }
}

/// 自定义健康检查以支持特定路径
#[derive(Debug, Clone)]
pub struct CustomHealthCheck {
    host: String,
    port: u16,
    path: String,
    use_tls: bool,
}

impl CustomHealthCheck {
    pub fn new(host: &str, port: u16, path: String, use_tls: bool) -> Self {
        Self {
            host: host.to_string(),
            port,
            path,
            use_tls,
        }
    }
}



#[async_trait]
impl HealthCheck for CustomHealthCheck {
    async fn check(&self, _peer: &Backend) -> Result<()> {
        let schema = if self.use_tls { "https" } else { "http" };
        let url = format!("{}://{}:{}{}", schema, self.host, self.port, self.path);

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
            .map_err(|e| Error::new_str(Box::leak(e.to_string().into_boxed_str())))?;

        let response = client.get(&url)
            .send()
            .await
            .map_err(|e| Error::new_str(Box::leak(e.to_string().into_boxed_str())))?;

        if response.status().is_success() {
            Ok(())
        } else {
            let err_msg = format!(
                "健康检查失败，状态码: {}",
                response.status()
            );
            Err(Error::new_str(Box::leak(err_msg.into_boxed_str())))
        }
    }

    fn health_threshold(&self, success: bool) -> usize {
        if success {
            1 // 1次成功即认为健康
        } else {
            2 // 2次连续失败即认为不健康
        }
    }
}


