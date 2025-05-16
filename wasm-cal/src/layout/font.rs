//! 字体样式常量定义

/// 图表字体常量
pub struct ChartFont;

impl ChartFont {
    pub const AXIS: &'static str = "10px Arial"; // 坐标轴、标签
    pub const AXIS_BOLD: &'static str = "bold 10px Arial";
    pub const HEADER: &'static str = "bold 14px Arial"; // 标题
    pub const LEGEND: &'static str = "12px Arial"; // 图例
    pub const SWITCH: &'static str = "14px Arial"; // 切换按钮
    pub const TOOLTIP: &'static str = "10px Arial"; // 提示框
}
