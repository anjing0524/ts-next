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
    ) {
        // 计算可显示的K线数量
        let visible_candles = (layout.chart_area_width / layout.total_candle_width) as usize;
        let start_idx = if items.len() > visible_candles {
            items.len() - visible_candles
        } else {
            0
        };

        // 计算最大成交量 - 只计算可见区域的最大值
        let max_volume = self.calculate_max_volume(items, start_idx, items.len());

        // 预先设置绘图样式，减少状态切换
        ctx.set_line_width(0.0);

        // 绘制成交量柱状图
        for (i, item_idx) in (start_idx..items.len()).enumerate() {
            let item = items.get(item_idx);
            let x = layout.chart_area_x + (i as f64 * layout.total_candle_width);

            // 判断是上涨还是下跌
            let is_bullish = item.close() >= item.open();

            // 计算总成交量和位置
            let total_volume = item.b_vol() + item.s_vol();
            let y = layout.map_volume_to_y(total_volume, max_volume);
            let height = layout.volume_chart_y + layout.volume_chart_height - y;

            // 绘制成交量柱状图
            if is_bullish {
                ctx.set_fill_style_str(ChartColors::VOLUME_BULLISH);
            } else {
                ctx.set_fill_style_str(ChartColors::VOLUME_BEARISH);
            }
            ctx.fill_rect(x, y, layout.candle_width, height);
        }
    }

    /// 计算最大成交量
    pub fn calculate_max_volume(
        &self,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        start_idx: usize,
        end_idx: usize,
    ) -> f64 {
        let mut max_volume: f64 = 0.0;
        for i in start_idx..end_idx {
            let item = items.get(i);
            // 使用b_vol和s_vol的总和作为总成交量
            let volume = item.b_vol() + item.s_vol();
            max_volume = max_volume.max(volume);
        }

        // 如果最大成交量为0，返回一个默认值
        if max_volume == 0.0 {
            return 1000.0;
        }

        // 添加一点边距，使图表更美观
        max_volume * 1.05
    }
}
