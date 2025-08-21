use std::path::Path;
use std::fs;
use std::env;
use tracing::{info, warn};

use super::config::LogConfig;

/// 配置加载器
pub struct ConfigLoader {
    config_path: String,
}

impl ConfigLoader {
    /// 创建新的配置加载器
    pub fn new(config_path: String) -> Self {
        Self { config_path }
    }
    
    /// 加载配置
    pub fn load_config(&self) -> Result<LogConfig, Box<dyn std::error::Error>> {
        info!("Loading configuration from: {}", self.config_path);
        
        // 检查配置文件是否存在
        if !Path::new(&self.config_path).exists() {
            warn!("Configuration file not found, using defaults: {}", self.config_path);
            return Ok(LogConfig::default());
        }
        
        // 读取配置文件
        let config_content = fs::read_to_string(&self.config_path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;
        
        // 解析TOML
        let config: LogConfig = toml::from_str(&config_content)
            .map_err(|e| format!("Failed to parse TOML: {}", e))?;
        
        info!("Configuration loaded successfully");
        Ok(config)
    }
    
    /// 加载配置并应用环境变量覆盖
    pub fn load_config_with_env_override(&self) -> Result<LogConfig, Box<dyn std::error::Error>> {
        let mut config = self.load_config()?;
        
        // 应用环境变量覆盖
        config = self.apply_env_overrides(config);
        
        info!("Configuration loaded with environment overrides");
        Ok(config)
    }
    
    /// 应用环境变量覆盖
    fn apply_env_overrides(&self, mut config: LogConfig) -> LogConfig {
        // 日志级别
        if let Ok(log_level) = env::var("LOG_LEVEL") {
            if let Ok(level) = log_level.parse::<super::config::LogLevel>() {
                config.log_level = level;
                info!("Overridden log level from environment: {}", level);
            }
        }
        
        // ZMQ端口
        if let Ok(port) = env::var("ZMQ_PORT") {
            if let Ok(p) = port.parse::<u16>() {
                config.zmq.port = p;
                info!("Overridden ZMQ port from environment: {}", p);
            }
        }
        
        // HTTP端口
        if let Ok(port) = env::var("HTTP_PORT") {
            if let Ok(p) = port.parse::<u16>() {
                config.http.port = p;
                info!("Overridden HTTP port from environment: {}", p);
            }
        }
        
        // 日志目录
        if let Ok(log_dir) = env::var("LOG_DIR") {
            config.storage.log_dir = log_dir;
            info!("Overridden log directory from environment: {}", config.storage.log_dir);
        }
        
        config
    }
    
    /// 保存配置到文件
    pub fn save_config(&self, config: &LogConfig) -> Result<(), Box<dyn std::error::Error>> {
        let config_content = toml::to_string_pretty(config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        
        // 确保目录存在
        if let Some(parent) = Path::new(&self.config_path).parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }
        
        fs::write(&self.config_path, config_content)
            .map_err(|e| format!("Failed to write config file: {}", e))?;
        
        info!("Configuration saved to: {}", self.config_path);
        Ok(())
    }
    
    /// 验证配置
    pub fn validate_config(&self, config: &LogConfig) -> Result<(), String> {
        // 验证端口范围
        if config.zmq.port == 0 {
            return Err("ZMQ port cannot be 0".to_string());
        }
        
        if config.http.port == 0 {
            return Err("HTTP port cannot be 0".to_string());
        }
        
        // 验证日志目录
        if config.storage.log_dir.is_empty() {
            return Err("Log directory cannot be empty".to_string());
        }
        
        // 验证缓冲区大小
        if config.storage.write_buffer_size == 0 {
            return Err("Write buffer size cannot be 0".to_string());
        }
        
        // 验证批量大小
        if config.processor.batch_size == 0 {
            return Err("Batch size cannot be 0".to_string());
        }
        
        // 验证队列大小
        if config.processor.queue_size == 0 {
            return Err("Queue size cannot be 0".to_string());
        }
        
        // 验证采样率
        if config.processor.sample_rate < 0.0 || config.processor.sample_rate > 1.0 {
            return Err("Sample rate must be between 0.0 and 1.0".to_string());
        }
        
        info!("Configuration validation passed");
        Ok(())
    }
}

impl Default for ConfigLoader {
    fn default() -> Self {
        Self::new("config/config.toml".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;
    
    #[test]
    fn test_config_loader_creation() {
        let loader = ConfigLoader::new("test_config.toml".to_string());
        assert_eq!(loader.config_path, "test_config.toml");
    }
    
    #[test]
    fn test_default_config_loader() {
        let loader = ConfigLoader::default();
        assert_eq!(loader.config_path, "config/config.toml");
    }
    
    #[test]
    fn test_env_override() {
        let loader = ConfigLoader::new("test_config.toml".to_string());
        
        // 设置环境变量
        env::set_var("LOG_LEVEL", "debug");
        env::set_var("ZMQ_PORT", "6666");
        
        let config = LogConfig::default();
        let overridden = loader.apply_env_overrides(config);
        
        assert_eq!(overridden.log_level, super::super::config::LogLevel::Debug);
        assert_eq!(overridden.zmq.port, 6666);
        
        // 清理环境变量
        env::remove_var("LOG_LEVEL");
        env::remove_var("ZMQ_PORT");
    }
    
    #[test]
    fn test_config_validation() {
        let loader = ConfigLoader::new("test_config.toml".to_string());
        
        // 测试有效配置
        let valid_config = LogConfig::default();
        assert!(loader.validate_config(&valid_config).is_ok());
        
        // 测试无效配置
        let mut invalid_config = LogConfig::default();
        invalid_config.zmq.port = 0;
        assert!(loader.validate_config(&invalid_config).is_err());
    }
}