//! 提示框模块 - 专门负责处理提示框的绘制和交互

use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartColors, ChartLayout};
use flatbuffers;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 提示框绘制器
pub struct TooltipRenderer;

impl TooltipRenderer {
    /// 绘制提示框
    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
    ) {
        // 检查是否需要显示提示框
        if !layout.show_tooltip
            || layout.hover_candle_index.is_none()
            || layout.hover_position.is_none()
        {
            return;
        }
    }
}
