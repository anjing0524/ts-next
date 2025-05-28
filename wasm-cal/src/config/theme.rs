//! 主题结构体与合并逻辑

use serde::{Deserialize, Serialize};

/// 图表主题配置结构体
///
/// 所有字段均为用户可配置的主题项，支持自定义配色和字体。
/// 字段含义与默认值参考 @layout/colors.rs 和 @layout/font.rs。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartTheme {
    // --- 基础颜色 ---
    /// 画布背景色
    pub background: String,
    /// 顶部区域背景色
    pub header_bg: String,
    // --- 边框和网格线 ---
    /// 图表外边框色
    pub border: String,
    /// 网格线颜色
    pub grid: String,
    // --- 文本颜色 ---
    /// 主要文本颜色
    pub text: String,
    /// 坐标轴文本颜色
    pub axis_text: String,
    // --- K线颜色 ---
    /// 上涨K线颜色
    pub bullish: String,
    /// 下跌K线颜色
    pub bearish: String,
    // --- 价格线颜色 ---
    /// 最新价线颜色
    pub last_price_line: String,
    /// 买一价线颜色
    pub bid_price_line: String,
    /// 卖一价线颜色
    pub ask_price_line: String,
    // --- 导航器颜色 ---
    /// 导航器背景色
    pub navigator_bg: String,
    /// 导航器滑块颜色
    pub navigator_handle: String,
    /// 导航器活动手柄颜色
    pub navigator_active_handle: String,
    /// 导航器不可见区域遮罩色
    pub navigator_mask: String,
    /// 导航器边框颜色
    pub navigator_border: String,
    /// 导航器活动手柄阴影颜色
    pub navigator_active_handle_shadow: String,
    // --- 成交量颜色 ---
    /// 成交量曲线颜色
    pub volume_line: String,
    /// 成交量区域填充色
    pub volume_area: String,
    // --- 交互元素 ---
    /// 十字线颜色
    pub crosshair: String,
    /// 提示框背景色
    pub tooltip_bg: String,
    /// 提示框边框色
    pub tooltip_border: String,
    /// 提示框文本色
    pub tooltip_text: String,
    // --- 开关按钮 ---
    /// 开关按钮背景色
    pub switch_bg: String,
    /// 开关按钮激活背景色
    pub switch_active_bg: String,
    /// 开关按钮边框色
    pub switch_border: String,
    /// 开关按钮文本色
    pub switch_text: String,
    /// 开关按钮激活文本色
    pub switch_active_text: String,
    /// 通用阴影色
    pub shadow: String,
    // --- 订单簿悬浮效果 ---
    /// 订单簿悬浮背景色
    pub book_hover_bg: String,
    /// 订单簿悬浮边框色
    pub book_hover_border: String,
    // --- 字体 ---
    /// 坐标轴/标签字体
    pub font_axis: String,
    /// 标题字体
    pub font_header: String,
    /// 图例字体
    pub font_legend: String,
    /// 切换按钮字体
    pub font_switch: String,
}

impl Default for ChartTheme {
    fn default() -> Self {
        Self {
            background: "#f5f5f5".into(),
            header_bg: "#ffffff".into(),
            border: "#e6e6e6".into(),
            grid: "#eeeeee".into(),
            text: "#333333".into(),
            axis_text: "#666666".into(),
            bullish: "#ef5350".into(),
            bearish: "#26a69a".into(),
            last_price_line: "#FF9800".into(),
            bid_price_line: "#F44336".into(),
            ask_price_line: "#4CAF50".into(),
            navigator_bg: "#f8f9fa".into(),
            navigator_handle: "#b0b8c9".into(),
            navigator_active_handle: "#5c7cfa".into(),
            navigator_mask: "rgba(180, 180, 180, 0.3)".into(),
            navigator_border: "#dee2e6".into(),
            navigator_active_handle_shadow: "rgba(92, 124, 250, 0.6)".into(),
            volume_line: "#6C8CD5".into(),
            volume_area: "rgba(108, 140, 213, 0.2)".into(),
            crosshair: "rgba(100, 100, 100, 0.5)".into(),
            tooltip_bg: "rgba(255, 255, 255, 0.95)".into(),
            tooltip_border: "#e0e0e0".into(),
            tooltip_text: "#333333".into(),
            switch_bg: "#f0f0f0".into(),
            switch_active_bg: "#e0e0e0".into(),
            switch_border: "#dddddd".into(),
            switch_text: "#666666".into(),
            switch_active_text: "#333333".into(),
            shadow: "rgba(0, 0, 0, 0.5)".into(),
            book_hover_bg: "rgba(255, 255, 255, 0.2)".into(),
            book_hover_border: "rgba(255, 255, 255, 0.8)".into(),
            font_axis: "10px Arial".into(),
            font_header: "bold 14px Arial".into(),
            font_legend: "12px Arial".into(),
            font_switch: "14px Arial".into(),
        }
    }
}

/// 可选主题配置结构体，用于部分字段合并
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PartialChartTheme {
    pub background: Option<String>,
    pub header_bg: Option<String>,
    pub border: Option<String>,
    pub grid: Option<String>,
    pub text: Option<String>,
    pub axis_text: Option<String>,
    pub bullish: Option<String>,
    pub bearish: Option<String>,
    pub last_price_line: Option<String>,
    pub bid_price_line: Option<String>,
    pub ask_price_line: Option<String>,
    pub navigator_bg: Option<String>,
    pub navigator_handle: Option<String>,
    pub navigator_active_handle: Option<String>,
    pub navigator_mask: Option<String>,
    pub navigator_border: Option<String>,
    pub navigator_active_handle_shadow: Option<String>,
    pub volume_line: Option<String>,
    pub volume_area: Option<String>,
    pub crosshair: Option<String>,
    pub tooltip_bg: Option<String>,
    pub tooltip_border: Option<String>,
    pub tooltip_text: Option<String>,
    pub switch_bg: Option<String>,
    pub switch_active_bg: Option<String>,
    pub switch_border: Option<String>,
    pub switch_text: Option<String>,
    pub switch_active_text: Option<String>,
    pub shadow: Option<String>,
    pub book_hover_bg: Option<String>,
    pub book_hover_border: Option<String>,
    pub font_axis: Option<String>,
    pub font_header: Option<String>,
    pub font_legend: Option<String>,
    pub font_switch: Option<String>,
}

impl ChartTheme {
    /// 从JSON字符串加载主题
    pub fn from_json(json: &str) -> Result<ChartTheme, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// 合并部分配置，未指定字段保持原值
    pub fn merge(&mut self, partial: PartialChartTheme) {
        macro_rules! merge_field {
            ($field:ident) => {
                if let Some(val) = partial.$field {
                    self.$field = val;
                }
            };
        }
        merge_field!(background);
        merge_field!(header_bg);
        merge_field!(border);
        merge_field!(grid);
        merge_field!(text);
        merge_field!(axis_text);
        merge_field!(bullish);
        merge_field!(bearish);
        merge_field!(last_price_line);
        merge_field!(bid_price_line);
        merge_field!(ask_price_line);
        merge_field!(navigator_bg);
        merge_field!(navigator_handle);
        merge_field!(navigator_active_handle);
        merge_field!(navigator_mask);
        merge_field!(navigator_border);
        merge_field!(navigator_active_handle_shadow);
        merge_field!(volume_line);
        merge_field!(volume_area);
        merge_field!(crosshair);
        merge_field!(tooltip_bg);
        merge_field!(tooltip_border);
        merge_field!(tooltip_text);
        merge_field!(switch_bg);
        merge_field!(switch_active_bg);
        merge_field!(switch_border);
        merge_field!(switch_text);
        merge_field!(switch_active_text);
        merge_field!(shadow);
        merge_field!(book_hover_bg);
        merge_field!(book_hover_border);
        merge_field!(font_axis);
        merge_field!(font_header);
        merge_field!(font_legend);
        merge_field!(font_switch);
    }

    /// 从部分 JSON 合并
    pub fn merge_from_json(&mut self, json: &str) -> Result<(), serde_json::Error> {
        let partial: PartialChartTheme = serde_json::from_str(json)?;
        self.merge(partial);
        Ok(())
    }
}
