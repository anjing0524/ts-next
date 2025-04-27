//! 图表颜色定义

/// 图表颜色常量
pub struct ChartColors;

impl ChartColors {
    // --- 基础 ---
    pub const BACKGROUND: &'static str = "#f5f5f5"; // 画布背景色 - 浅灰色背景
    pub const HEADER_BG: &'static str = "#ffffff"; // 顶部区域背景色 - 白色

    // --- 边框和网格线 ---
    pub const BORDER: &'static str = "#e6e6e6"; // 图表外边框 (浅灰)
    pub const GRID: &'static str = "#eeeeee"; // 网格线 (更浅的灰)

    // --- 文本颜色 ---
    pub const TEXT: &'static str = "#333333"; // 主要文本 (深灰)
    pub const AXIS_TEXT: &'static str = "#666666"; // 坐标轴文本 (中灰)

    // --- K线颜色 ---
    pub const BULLISH: &'static str = "#26a69a"; // 上涨 (绿色)
    pub const BEARISH: &'static str = "#ef5350"; // 下跌 (红色)
    pub const WICK: &'static str = "#888888"; // 影线 (中灰)

    // --- 导航器颜色 ---
    pub const NAVIGATOR_BG: &'static str = "#f8f9fa"; // 导航器背景 (非常浅的灰)
    pub const NAVIGATOR_HANDLE: &'static str = "#b0b8c9"; // 导航器滑块
    pub const NAVIGATOR_ACTIVE_HANDLE: &'static str = "#5c7cfa"; // 活动状态手柄颜色（更醒目的蓝色）
    pub const NAVIGATOR_MASK: &'static str = "rgba(180, 180, 180, 0.3)"; // 导航器不可见区域遮罩
    pub const NAVIGATOR_BORDER: &'static str = "#dee2e6"; // 导航器边框颜色
    pub const NAVIGATOR_ACTIVE_HANDLE_SHADOW: &'static str = "rgba(92, 124, 250, 0.6)"; // 活动状态手柄阴影颜色
    pub const TRANSPARENT: &'static str = "transparent"; // 透明颜色

    // 成交量相关颜色
    pub const VOLUME_LINE: &'static str = "#6C8CD5"; // 成交量曲线颜色
    pub const VOLUME_AREA: &'static str = "rgba(108, 140, 213, 0.2)"; // 成交量区域填充颜色

    // --- 交互元素 ---
    pub const CROSSHAIR: &'static str = "rgba(100, 100, 100, 0.5)"; // 十字线 (半透明灰)
    pub const TOOLTIP_BG: &'static str = "rgba(255, 255, 255, 0.95)"; // 提示框背景 (半透明白色)
    pub const TOOLTIP_BORDER: &'static str = "#dddddd"; // 提示框边框 (浅灰)
    pub const TOOLTIP_TEXT: &'static str = "#333333"; // 提示框文本颜色
    
    // --- 开关按钮 ---
    pub const SWITCH_BG: &'static str = "#f0f0f0"; // 开关背景色
    pub const SWITCH_ACTIVE_BG: &'static str = "#5c7cfa"; // 开关激活背景色
    pub const SWITCH_BORDER: &'static str = "#dddddd"; // 开关边框
    pub const SWITCH_TEXT: &'static str = "#555555"; // 开关文本颜色
    pub const SWITCH_ACTIVE_TEXT: &'static str = "#ffffff"; // 开关激活文本颜色
}
