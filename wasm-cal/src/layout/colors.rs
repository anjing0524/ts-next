//! 图表颜色定义

/// 图表颜色常量
pub struct ChartColors;

impl ChartColors {
    // 背景色
    pub const HEADER_BG: &'static str = "#FFF";

    // 边框和网格线
    pub const BORDER: &'static str = "#2a2e39";
    pub const GRID: &'static str = "#2a2e39";

    // 文本颜色
    pub const TEXT: &'static str = "#d1d4dc";

    // K线颜色
    pub const BULLISH: &'static str = "#26a69a"; // 上涨
    pub const BEARISH: &'static str = "#ef5350"; // 下跌
    pub const WICK: &'static str = "#787b86"; // 影线

    // 成交量颜色
    pub const VOLUME_BULLISH: &'static str = "#26a69a80"; // 上涨成交量
    pub const VOLUME_BEARISH: &'static str = "#ef535080"; // 下跌成交量

    // 导航器颜色
    pub const NAVIGATOR_BG: &'static str = "#181c2780";
}
