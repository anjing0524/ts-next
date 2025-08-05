use serde::Deserialize;
use std::fs;

#[derive(Debug, Clone, Deserialize)]
pub struct Settings {
    pub services: Vec<ServiceConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServiceConfig {
    pub name: String,
    pub bind_address: String,
    pub upstreams: Vec<String>,
    #[serde(default)]
    pub tls: bool,
    #[serde(default)]
    pub health_check: HealthCheckConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HealthCheckConfig {
    #[serde(default = "default_health_check_timeout_ms")]
    pub timeout_ms: u64,
    #[serde(default = "default_health_check_frequency_secs")]
    pub frequency_secs: u64,
}

fn default_health_check_timeout_ms() -> u64 {
    500
}

fn default_health_check_frequency_secs() -> u64 {
    5
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
            if service.upstreams.is_empty() {
                return Err(anyhow::anyhow!(
                    "Service '{}' has no defined upstreams.",
                    service.name
                ));
            }
        }
        Ok(())
    }
}