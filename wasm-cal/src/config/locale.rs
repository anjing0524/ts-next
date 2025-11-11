use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocaleConfig {
    pub rise: String,
    pub fall: String,
    pub volume: String,
    pub time: String,
    pub price: String,
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
