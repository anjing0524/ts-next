//! 配置模块，适配 default.yaml 结构
//! 支持 server、upstreams、tls、performance 等嵌套字段

use serde::Deserialize;
use config::{Config, ConfigError, File, Environment};

#[derive(Debug, Deserialize, Clone)]
pub struct ServerConfig {
    pub listen_address: String,
    pub listen_port: u16,
    pub worker_threads: Option<u16>,
    pub graceful_shutdown: Option<bool>,
    pub graceful_timeout_seconds: Option<u16>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct UpstreamConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub path_prefix: String,
    pub health_check_path: Option<String>,
    pub timeout_seconds: Option<u16>,
    pub tls_enabled: Option<bool>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TlsConfig {
    pub enabled: bool,
    pub listen_port: Option<u16>,
    pub cert_path: Option<String>,
    pub key_path: Option<String>,
    pub http2_enabled: Option<bool>,
    pub http3_enabled: Option<bool>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct PerformanceConfig {
    pub zero_copy_enabled: Option<bool>,
    pub memory_pool_enabled: Option<bool>,
    pub compression_enabled: Option<bool>,
    pub cache_enabled: Option<bool>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct JwtConfig {
    pub jwks_url: String,
    pub audience: String,
    pub issuer: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct MonitoringConfig {
    pub enabled: Option<bool>,
    pub listen_port: Option<u16>,
    pub metrics_path: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ProxyConfig {
    pub server: ServerConfig,
    pub jwt: JwtConfig,
    pub upstreams: Vec<UpstreamConfig>,
    pub tls: Option<TlsConfig>,
    pub performance: Option<PerformanceConfig>,
    pub monitoring: Option<MonitoringConfig>,
}

impl ProxyConfig {
    /// 加载配置，优先级：环境变量 > default.yaml
    pub fn from_env_and_file() -> Result<Self, ConfigError> {
        let mut s = Config::builder()
            .add_source(File::with_name("config/default.yaml").required(true))
            .add_source(Environment::with_prefix("PINGORA").separator("__"))
            .build()?;
        s.try_deserialize()
    }
} 