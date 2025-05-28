use super::{ChartConfig, ChartTheme, LocaleConfig};
use std::collections::HashMap;

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
