use serde::Deserialize;
use std::collections::HashMap;
use std::fs;

#[derive(Debug, Clone, Deserialize)]
pub struct Settings {
    pub services: Vec<ServiceConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServiceConfig {
    pub name: String,
    pub bind_address: String,
    #[serde(default)]
    pub backends: HashMap<String, BackendConfig>,
    #[serde(default)]
    pub routes: Vec<RouteConfig>,
    pub default_backend: String,
    #[serde(default)]
    pub health_check: HealthCheckConfig,
    #[serde(default)]
    pub tls: Option<TlsConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BackendConfig {
    pub upstreams: Vec<String>,
    #[serde(default)]
    pub tls: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RouteConfig {
    pub path_prefix: String,
    pub backend: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HealthCheckConfig {
    #[serde(default = "default_health_check_timeout_ms")]
    pub timeout_ms: u64,
    #[serde(default = "default_health_check_frequency_secs")]
    pub frequency_secs: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TlsConfig {
    /// 证书文件路径 (PEM 格式)
    pub cert_path: String,
    /// 私钥文件路径 (PEM 格式)
    pub key_path: String,
    /// TLS 最小版本 (default: "1.3")
    #[serde(default = "default_tls_min_version")]
    pub min_version: String,
}

fn default_health_check_timeout_ms() -> u64 {
    500
}

fn default_health_check_frequency_secs() -> u64 {
    5
}

fn default_tls_min_version() -> String {
    "1.3".to_string()
}

impl Default for HealthCheckConfig {
    fn default() -> Self {
        Self {
            timeout_ms: default_health_check_timeout_ms(),
            frequency_secs: default_health_check_frequency_secs(),
        }
    }
}

impl Settings {
    pub fn from_file(path: &str) -> Result<Self, anyhow::Error> {
        let content = fs::read_to_string(path)?;
        let settings: Settings = serde_yaml::from_str(&content)?;
        Ok(settings)
    }

    pub fn validate(&self) -> Result<(), anyhow::Error> {
        for service in &self.services {
            // 验证后端配置
            if service.backends.is_empty() {
                return Err(anyhow::anyhow!(
                    "Service '{}' has no defined backends.",
                    service.name
                ));
            }

            // 验证每个后端都有 upstreams
            for (backend_name, backend_config) in &service.backends {
                if backend_config.upstreams.is_empty() {
                    return Err(anyhow::anyhow!(
                        "Backend '{}' in service '{}' has no upstreams.",
                        backend_name,
                        service.name
                    ));
                }
            }

            // 验证默认后端存在
            if !service.backends.contains_key(&service.default_backend) {
                return Err(anyhow::anyhow!(
                    "Default backend '{}' not found in service '{}' backends.",
                    service.default_backend,
                    service.name
                ));
            }

            // 验证所有路由引用的后端都存在
            for route in &service.routes {
                if !service.backends.contains_key(&route.backend) {
                    return Err(anyhow::anyhow!(
                        "Route '{}' references non-existent backend '{}' in service '{}'.",
                        route.path_prefix,
                        route.backend,
                        service.name
                    ));
                }
            }

            // 验证 TLS 配置
            if let Some(tls_config) = &service.tls {
                if !std::path::Path::new(&tls_config.cert_path).exists() {
                    return Err(anyhow::anyhow!(
                        "TLS certificate file not found: {}",
                        tls_config.cert_path
                    ));
                }
                if !std::path::Path::new(&tls_config.key_path).exists() {
                    return Err(anyhow::anyhow!(
                        "TLS key file not found: {}",
                        tls_config.key_path
                    ));
                }
            }
        }
        Ok(())
    }
}