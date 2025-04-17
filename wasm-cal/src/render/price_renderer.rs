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
        visible_start: usize,
        visible_count: usize,
    ) {
        let visible_end = (visible_start + visible_count).min(items.len());
        if visible_start >= visible_end {
            return;
        }

        // 只清空价格图区域，而不是整个画布
        ctx.clear_rect(
            layout.chart_area_x,
            layout.chart_area_y,
            layout.chart_area_width,
            layout.price_chart_height,
        );

        // 绘制K线影线
        ctx.begin_path();
        ctx.set_stroke_style_str(ChartColors::WICK);
        ctx.set_line_width(1.0);

        // 使用FnvHashMap和整数键来避免浮点数比较问题
        let mut price_y_cache = std::collections::HashMap::new();
        let mut map_price = |price: f64| -> f64 {
            // 将浮点数转换为位模式的u64，作为HashMap的键
            let price_bits = price.to_bits();
            *price_y_cache
                .entry(price_bits)
                .or_insert_with(|| layout.map_price_to_y(price, min_low, max_high))
        };

        for (i, item_idx) in (visible_start..visible_end).enumerate() {
            let item = items.get(item_idx);
            let x_center = layout.chart_area_x
                + (i as f64 * layout.total_candle_width)
                + layout.candle_width / 2.0;

            // 使用缓存函数获取Y坐标
            let high_y = map_price(item.high());
            let low_y = map_price(item.low());

            ctx.move_to(x_center, high_y);
            ctx.line_to(x_center, low_y);
        }
        ctx.stroke();

        // 绘制K线实体
        for (i, item_idx) in (visible_start..visible_end).enumerate() {
            let item = items.get(item_idx);
            let x = layout.chart_area_x + (i as f64 * layout.total_candle_width);

            // 使用缓存函数获取Y坐标
            let open_y = map_price(item.open());
            let close_y = map_price(item.close());

            let is_bullish = item.close() >= item.open();
            let color = if is_bullish {
                ChartColors::BULLISH
            } else {
                ChartColors::BEARISH
            };

            let (top_y, height) = if is_bullish {
                (close_y, open_y - close_y)
            } else {
                (open_y, close_y - open_y)
            };
            ctx.set_fill_style_str(color);
            ctx.fill_rect(x, top_y, layout.candle_width, height.max(1.0));
        }
    }

    /// 计算价格范围 (此函数已正确使用 visible_start 和 visible_count)
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
        // 确保起始索引小于结束索引
        if visible_start < end_idx {
            for i in visible_start..end_idx {
                let item = items.get(i);
                min_low = min_low.min(item.low());
                max_high = max_high.max(item.high());
            }
        }

        // 如果没有有效数据，返回默认值
        if min_low == f64::MAX || max_high == f64::MIN {
            // 如果只有一个点，或者所有价格相同，给一个默认范围
            if items.len() > 0 && visible_start < end_idx {
                let item = items.get(visible_start);
                return (item.low() - 1.0, item.high() + 1.0); // 基于第一个可见点给个小范围
            } else {
                return (0.0, 100.0); // 完全没数据时的默认值
            }
        }

        // 添加一定的边距，使图表不会贴边
        let price_range = max_high - min_low;
        // 如果价格范围为0（例如只有一个点或所有价格相同），添加固定边距
        let padding = if price_range > 0.0 {
            price_range * 0.05 // 5%的边距
        } else {
            1.0 // 固定边距
        };

        (min_low - padding, max_high + padding)
    }
}
