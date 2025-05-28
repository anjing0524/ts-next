//! 图表配置模块 - 负责管理外部配置参数

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub mod theme;

/// 图表配置结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartConfig {
    /// 交易对符号 (如 "BTC/USDT")
    pub symbol: String,
    /// 颜色主题名称 (如 "light", "dark")
    pub theme: String,
    /// 自定义主题配置
    pub custom_theme: Option<ChartTheme>,
    /// 图表标题
    pub title: Option<String>,
    /// 语言设置
    pub language: String,
}

/// 颜色主题配置
pub use theme::ChartTheme;

/// 本地化文本配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocaleConfig {
    pub rise: String,
    pub fall: String,
    pub volume: String,
    pub time: String,
    pub price: String,
}

impl Default for ChartConfig {
    fn default() -> Self {
        Self {
            symbol: "BTC/USDT".to_string(),
            theme: "light".to_string(),
            custom_theme: None,
            title: None,
            language: "zh-CN".to_string(),
        }
    }
}

impl Default for LocaleConfig {
    fn default() -> Self {
        Self {
            rise: "上涨".to_string(),
            fall: "下跌".to_string(),
            volume: "成交量".to_string(),
            time: "时间".to_string(),
            price: "价格".to_string(),
        }
    }
}

/// 配置管理器
pub struct ConfigManager {
    pub config: ChartConfig,
    pub theme: ChartTheme,
    pub locale: LocaleConfig,
    pub custom_themes: HashMap<String, ChartTheme>,
}

impl ConfigManager {
    /// 创建新的配置管理器
    pub fn new() -> Self {
        let mut manager = Self {
            config: ChartConfig::default(),
            theme: ChartTheme::default(),
            locale: LocaleConfig::default(),
            custom_themes: HashMap::new(),
        };
        // 注册内置主题
        manager.register_builtin_themes();
        manager
    }

    /// 从JSON字符串加载配置
    pub fn load_from_json(&mut self, json: &str) -> Result<(), Box<dyn std::error::Error>> {
        let new_config: ChartConfig = serde_json::from_str(json)?;
        // 合并 custom_theme
        if let Some(ref new_theme) = new_config.custom_theme {
            // 直接用 new_theme，未填字段 serde 已自动补全
            self.theme = new_theme.clone();
            self.config.custom_theme = Some(self.theme.clone());
        }
        // 其余字段直接替换
        self.config.symbol = new_config.symbol;
        self.config.theme = new_config.theme;
        self.config.title = new_config.title;
        self.config.language = new_config.language;
        Ok(())
    }

    /// 注册内置主题
    fn register_builtin_themes(&mut self) {
        // 亮色主题 (默认)
        self.custom_themes
            .insert("light".to_string(), ChartTheme::default());
        // 如需其它主题，可在此插入
    }

    /// 更新当前主题
    pub fn update_theme(&mut self) {
        if let Some(custom_theme) = &self.config.custom_theme {
            self.theme = custom_theme.clone();
        } else if let Some(theme) = self.custom_themes.get(&self.config.theme) {
            self.theme = theme.clone();
        } else {
            self.theme = ChartTheme::default();
        }
    }
}

impl Default for ConfigManager {
    fn default() -> Self {
        Self::new()
    }
}
