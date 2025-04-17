//! 成交量图模块 - 专门负责绘制成交量图部分

use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartColors, ChartLayout};
use flatbuffers;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 成交量图绘制器
pub struct VolumeRenderer;

impl VolumeRenderer {
    /// 绘制成交量图
    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        max_volume: f64,      // 最大成交量
        visible_start: usize, // 可见区域起始索引
        visible_count: usize, // 可见区域K线数量
    ) {
        // 计算可见区域的结束索引 (确保不越界)
        let visible_end = (visible_start + visible_count).min(items.len());
        // 如果可见区域为空，或最大成交量无效，则不绘制
        if visible_start >= visible_end || max_volume <= 0.0 {
            return;
        }

        // 只清空成交量图区域，而不是整个画布
        ctx.clear_rect(
            layout.chart_area_x,
            layout.volume_chart_y,
            layout.chart_area_width,
            layout.volume_chart_height,
        );

        // 预先设置绘图样式，减少状态切换
        ctx.set_line_width(0.0); // 成交量柱状图不需要边框

        // 使用缓存机制减少重复计算
        let mut volume_y_cache = std::collections::HashMap::new();
        let mut map_volume = |volume: f64| -> f64 {
            // 将浮点数转换为位模式的u64，作为HashMap的键
            let volume_bits = volume.to_bits();
            *volume_y_cache
                .entry(volume_bits)
                .or_insert_with(|| layout.map_volume_to_y(volume, max_volume))
        };

        // 计算底部Y坐标（只计算一次）
        let bottom_y = layout.volume_chart_y + layout.volume_chart_height - layout.volume_margin;

        // 绘制成交量柱状图
        for (i, item_idx) in (visible_start..visible_end).enumerate() {
            let item = items.get(item_idx);
            // 使用 i (相对索引) 计算 X 坐标
            let x = layout.chart_area_x + (i as f64 * layout.total_candle_width);
            // 判断是上涨还是下跌
            let is_bullish = item.close() >= item.open();
            // 计算总成交量
            let total_volume = item.b_vol() + item.s_vol();

            // 使用缓存函数获取Y坐标
            let y = map_volume(total_volume);

            // 计算柱子高度，确保从底部开始绘制
            let height = bottom_y - y;

            // 设置颜色
            ctx.set_fill_style_str(if is_bullish {
                ChartColors::VOLUME_BULLISH
            } else {
                ChartColors::VOLUME_BEARISH
            });

            // 确保高度至少为1像素，避免绘制负高度
            ctx.fill_rect(x, y, layout.candle_width, height.max(1.0));
        }
    }

    /// 计算最大成交量 (此函数已正确使用 start_idx 和 end_idx)
    pub fn calculate_max_volume(
        &self,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        start_idx: usize, // 可见区域的起始绝对索引
        end_idx: usize,   // 可见区域的结束绝对索引 (exclusive)
    ) -> f64 {
        let mut max_volume: f64 = 0.0;
        // 确保索引有效
        let actual_end_idx = end_idx.min(items.len());
        if start_idx < actual_end_idx {
            for i in start_idx..actual_end_idx {
                let item = items.get(i);
                // 使用b_vol和s_vol的总和作为总成交量
                let volume = item.b_vol() + item.s_vol();
                max_volume = max_volume.max(volume);
            }
        }

        // 如果最大成交量为0，返回一个默认值，防止除零错误
        if max_volume == 0.0 {
            return 1.0; // 返回 1.0 而不是 1000.0，避免坐标轴刻度过大
        }

        // 添加一点边距，使图表更美观 (例如 5%)
        max_volume * 1.05
    }
}
