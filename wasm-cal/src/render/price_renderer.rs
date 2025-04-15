//! 价格图(K线图)模块 - 专门负责绘制K线图部分

use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartColors, ChartLayout};
use flatbuffers;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 价格图(K线图)绘制器
pub struct PriceRenderer;

impl PriceRenderer {
    /// 绘制价格图(K线图)
    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        min_low: f64,
        max_high: f64,
    ) {
        // 计算可显示的K线数量
        let visible_candles = (layout.chart_area_width / layout.total_candle_width) as usize;
        let start_idx = if items.len() > visible_candles {
            items.len() - visible_candles
        } else {
            0
        };

        // 批量绘制所有蜡烛线的影线，减少路径操作次数
        ctx.begin_path();
        ctx.set_stroke_style_str(ChartColors::WICK);
        ctx.set_line_width(1.0);

        for (i, item_idx) in (start_idx..items.len()).enumerate() {
            let item = items.get(item_idx);
            let x_center = layout.chart_area_x
                + (i as f64 * layout.total_candle_width)
                + layout.candle_width / 2.0;

            let high_y = layout.map_price_to_y(item.high(), min_low, max_high);
            let low_y = layout.map_price_to_y(item.low(), min_low, max_high);

            // 绘制影线
            ctx.move_to(x_center, high_y);
            ctx.line_to(x_center, low_y);
        }
        ctx.stroke();

        // 批量绘制所有蜡烛线的实体
        for (i, item_idx) in (start_idx..items.len()).enumerate() {
            let item = items.get(item_idx);
            let x = layout.chart_area_x + (i as f64 * layout.total_candle_width);

            let open_y = layout.map_price_to_y(item.open(), min_low, max_high);
            let close_y = layout.map_price_to_y(item.close(), min_low, max_high);

            // 判断是上涨还是下跌
            let is_bullish = item.close() >= item.open();
            let candle_color = if is_bullish {
                ChartColors::BULLISH
            } else {
                ChartColors::BEARISH
            };

            // 计算实体高度
            let (top_y, height) = if is_bullish {
                (close_y, open_y - close_y)
            } else {
                (open_y, close_y - open_y)
            };

            // 绘制实体
            ctx.set_fill_style_str(candle_color);
            ctx.fill_rect(x, top_y, layout.candle_width, height.max(1.0)); // 确保高度至少为1像素
        }
    }

    /// 计算价格范围
    pub fn calculate_price_range(
        &self,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        visible_start: usize,
        visible_count: usize,
    ) -> (f64, f64) {
        let mut min_low = f64::MAX;
        let mut max_high = f64::MIN;

        // 计算可见区域的最低价和最高价
        let end_idx = (visible_start + visible_count).min(items.len());
        for i in visible_start..end_idx {
            let item = items.get(i);
            min_low = min_low.min(item.low());
            max_high = max_high.max(item.high());
        }

        // 如果没有有效数据，返回默认值
        if min_low == f64::MAX || max_high == f64::MIN {
            return (0.0, 100.0);
        }

        // 添加一定的边距，使图表不会贴边
        let price_range = max_high - min_low;
        let padding = price_range * 0.05; // 5%的边距

        (min_low - padding, max_high + padding)
    }
}
