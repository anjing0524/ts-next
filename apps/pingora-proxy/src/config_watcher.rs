/// 配置文件热重载监听器
/// Configuration hot reload watcher that monitors file changes and triggers reloads

use anyhow::Result;
use notify::{Watcher, RecursiveMode};
use std::sync::mpsc;
use std::path::Path;
use std::thread;
use tracing::info;

/// 配置变更事件
#[derive(Debug)]
pub enum ConfigEvent {
    /// 配置文件已修改
    ConfigModified,
    /// 配置文件已删除
    ConfigDeleted,
    /// 监听器遇到错误
    Error(String),
}

/// 配置监听器 - 监视配置文件的变更
pub struct ConfigWatcher {
    config_path: String,
}

impl ConfigWatcher {
    /// 创建配置监听器
    pub fn new(config_path: &str) -> Self {
        Self {
            config_path: config_path.to_string(),
        }
    }

    /// 启动配置文件监听（在后台线程运行）
    pub fn watch(&self, on_change: impl Fn(ConfigEvent) + Send + 'static) -> Result<()> {
        let config_path = self.config_path.clone();

        thread::spawn(move || {
            // 创建监听通道
            let (tx, rx) = mpsc::channel();

            // 创建文件系统监听器
            let mut watcher: notify::RecommendedWatcher = match notify::recommended_watcher(
                move |res| {
                    let _ = tx.send(res);
                }
            ) {
                Ok(w) => w,
                Err(e) => {
                    on_change(ConfigEvent::Error(format!("Failed to create watcher: {}", e)));
                    return;
                }
            };

            // 获取配置文件的父目录
            let config_file = Path::new(&config_path);
            let watch_path = config_file.parent().unwrap_or_else(|| Path::new("."));

            // 监听配置文件所在的目录
            if let Err(e) = watcher.watch(watch_path, RecursiveMode::NonRecursive) {
                on_change(ConfigEvent::Error(format!("Failed to watch config directory: {}", e)));
                return;
            }

            info!("Configuration watcher started for: {}", config_path);

            // 处理文件系统事件
            for res in rx {
                match res {
                    Ok(event) => {
                        // 检查是否是目标配置文件的事件
                        let is_target_file = event.paths.iter().any(|p| {
                            p.file_name()
                                .and_then(|n| n.to_str())
                                .map(|n| n == config_file.file_name().unwrap_or_default().to_str().unwrap_or(""))
                                .unwrap_or(false)
                        });

                        if !is_target_file {
                            continue;
                        }

                        // 处理不同的文件事件
                        match event.kind {
                            notify::EventKind::Modify(_) => {
                                info!("Configuration file modified: {}", config_path);
                                on_change(ConfigEvent::ConfigModified);
                            }
                            notify::EventKind::Remove(_) => {
                                info!("Configuration file removed: {}", config_path);
                                on_change(ConfigEvent::ConfigDeleted);
                            }
                            _ => {}
                        }
                    }
                    Err(e) => {
                        on_change(ConfigEvent::Error(format!("Watcher error: {}", e)));
                    }
                }
            }
        });

        Ok(())
    }

    /// 启动配置监听并在变更时输出日志（简化版本）
    pub fn watch_with_logging(&self) -> Result<()> {
        let config_path = self.config_path.clone();

        self.watch(move |event| {
            match event {
                ConfigEvent::ConfigModified => {
                    info!(
                        "⚠️  Configuration file changed: {}. Server restart required to apply changes.",
                        config_path
                    );
                }
                ConfigEvent::ConfigDeleted => {
                    info!(
                        "⚠️  Configuration file was deleted: {}. Server will continue using current settings.",
                        config_path
                    );
                }
                ConfigEvent::Error(msg) => {
                    eprintln!("Configuration watcher error: {}", msg);
                }
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::{Arc, Mutex};

    #[test]
    fn test_config_watcher_creation() {
        let watcher = ConfigWatcher::new("config/default.yaml");
        assert_eq!(watcher.config_path, "config/default.yaml");
    }
}
