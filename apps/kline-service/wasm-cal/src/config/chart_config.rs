use super::theme::ChartTheme;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartConfig {
    #[serde(default)]
    pub symbol: String,
    #[serde(default)]
    pub theme: String,
    #[serde(default)]
    pub custom_theme: Option<ChartTheme>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub language: String,
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
