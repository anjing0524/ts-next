//! 光标样式枚举 - 定义图表中使用的所有光标样式

use std::fmt;

/// 光标样式枚举 - 定义图表中使用的所有光标样式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CursorStyle {
    /// 默认光标
    #[default]
    Default,
    /// 东西方向调整大小 (用于DataZoom左右手柄)
    EwResize,
    /// 抓取样式 (用于DataZoom中间区域)
    Grab,
    /// 抓取中样式 (用于DataZoom拖动中)
    Grabbing,
    /// 指针样式 (用于可点击元素)
    Pointer,
    /// 文本选择样式
    Text,
    /// 移动样式
    Move,
    /// 等待样式
    Wait,
    /// 帮助样式
    Help,
    /// 不允许样式
    NotAllowed,
    /// 十字准线样式
    Crosshair,
}

impl fmt::Display for CursorStyle {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // 使用与to_css_string相同的光标样式字符串
        write!(f, "{}", self.to_css_string())
    }
}

impl CursorStyle {
    /// 将枚举转换为CSS光标样式字符串
    pub fn to_css_string(self) -> &'static str {
        match self {
            CursorStyle::Default => "default",
            CursorStyle::EwResize => "ew-resize",
            CursorStyle::Grab => "grab",
            CursorStyle::Grabbing => "grabbing",
            CursorStyle::Pointer => "pointer",
            CursorStyle::Text => "text",
            CursorStyle::Move => "move",
            CursorStyle::Wait => "wait",
            CursorStyle::Help => "help",
            CursorStyle::NotAllowed => "not-allowed",
            CursorStyle::Crosshair => "crosshair",
        }
    }
}
