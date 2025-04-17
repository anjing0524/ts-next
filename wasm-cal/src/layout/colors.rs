//! 图表颜色定义

/// 图表颜色常量
pub struct ChartColors;

impl ChartColors {
    // --- 基础 ---
    pub const BACKGROUND: &'static str = "#ffffff"; // 画布背景色
    pub const HEADER_BG: &'static str = "#ffffff"; // 顶部区域背景色

    // --- 边框和网格线 ---
    pub const BORDER: &'static str = "#e0e3eb"; // 图表外边框 (浅灰)
    pub const GRID: &'static str = "#f0f3fa"; // 网格线 (更浅的蓝灰)

    // --- 文本颜色 ---
    pub const TEXT: &'static str = "#333333"; // 主要文本 (深灰)
    pub const AXIS_TEXT: &'static str = "#666666"; // 坐标轴文本 (中灰)

    // --- K线颜色 ---
    pub const BULLISH: &'static str = "#26a69a"; // 上涨 (保持青绿)
    pub const BEARISH: &'static str = "#ef5350"; // 下跌 (保持红)
    pub const WICK: &'static str = "#888888"; // 影线 (中灰)

    // --- 成交量颜色 ---
    pub const VOLUME_BULLISH: &'static str = "rgba(38, 166, 154, 0.5)"; // 上涨成交量 (半透明绿)
    pub const VOLUME_BEARISH: &'static str = "rgba(239, 83, 80, 0.5)"; // 下跌成交量 (半透明红)

    // --- 导航器颜色 ---
    pub const NAVIGATOR_BG: &'static str = "#f8f9fa"; // 导航器背景 (非常浅的灰)
    pub const NAVIGATOR_BORDER: &'static str = "#e0e3eb"; // 导航器边框
    pub const NAVIGATOR_HANDLE: &'static str = "#b0b8c9"; // 导航器滑块
    pub const NAVIGATOR_WINDOW: &'static str = "rgba(176, 184, 201, 0.2)"; // 导航器选中区域

    // --- 交互元素 ---
    pub const CROSSHAIR: &'static str = "rgba(100, 100, 100, 0.5)"; // 十字线 (半透明灰)
    pub const TOOLTIP_BG: &'static str = "rgba(255, 255, 255, 0.95)"; // 提示框背景 (半透明白)
    pub const TOOLTIP_BORDER: &'static str = "#e0e3eb"; // 提示框边框
    pub const TOOLTIP_TEXT: &'static str = "#333333"; // 提示框文本
}
