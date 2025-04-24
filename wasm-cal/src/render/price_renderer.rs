//! 价格图(K线图)模块 - 专门负责绘制K线图部分

use crate::data::DataManager;
use crate::layout::{ChartColors, ChartLayout};
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 价格图(K线图)绘制器
pub struct PriceRenderer;

impl PriceRenderer {
    /// 绘制价格图使用DataManager获取所有数据
    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
    ) {
        let data_manager_ref = data_manager.borrow();
        // 获取数据
        let items = match data_manager_ref.get_items() {
            Some(items) => items,
            None => return,
        };

        // 获取可见范围
        let data_manager_ref = data_manager.borrow();
        let (visible_start, _, visible_end) = data_manager_ref.get_visible();

        if visible_start >= visible_end {
            return;
        }

        // 获取价格范围
        let (min_low, max_high, _) = data_manager_ref.get_cached_cal();

        // 只清空价格图区域，而不是整个画布
        ctx.clear_rect(
            layout.chart_area_x,
            layout.chart_area_y,
            layout.chart_area_width,
            layout.price_chart_height,
        );

        // 绘制K线影线 - 使用路径批处理
        ctx.begin_path();
        ctx.set_stroke_style_str(ChartColors::WICK);
        ctx.set_line_width(1.0);

        // 使用HashMap和整数键来避免浮点数比较问题
        let mut price_y_cache = std::collections::HashMap::new();
        let mut map_price = |price: f64| -> f64 {
            // 将浮点数转换为位模式的u64，作为HashMap的键
            let price_bits = price.to_bits();
            *price_y_cache
                .entry(price_bits)
                .or_insert_with(|| layout.map_price_to_y(price, min_low, max_high))
        };

        let mut path_points = Vec::with_capacity((visible_end - visible_start) * 2);
        for (i, item_idx) in (visible_start..visible_end).enumerate() {
            let item = items.get(item_idx);
            let x_center = layout.chart_area_x
                + (i as f64 * layout.total_candle_width)
                + layout.candle_width / 2.0;

            let high_y = map_price(item.high());
            let low_y = map_price(item.low());

            path_points.push((x_center, high_y, x_center, low_y));
        }
        // 一次性绘制所有线段
        ctx.begin_path();
        for (x1, y1, x2, y2) in path_points {
            ctx.move_to(x1, y1);
            ctx.line_to(x2, y2);
        }
        ctx.stroke();

        // 预先准备好颜色
        let bullish_color = ChartColors::BULLISH;
        let bearish_color = ChartColors::BEARISH;

        // 分组绘制实体，减少颜色切换
        // 先绘制所有上涨K线
        ctx.set_fill_style_str(bullish_color);
        ctx.begin_path();
        for (i, item_idx) in (visible_start..visible_end).enumerate() {
            let item = items.get(item_idx);
            if item.close() >= item.open() {
                // 绘制上涨K线
                let x = layout.chart_area_x + (i as f64 * layout.total_candle_width);
                let open_y = map_price(item.open());
                let close_y = map_price(item.close());
                let candle_width = layout.candle_width.max(2.0);
                let height = (open_y - close_y).max(1.0);
                ctx.rect(x, close_y, candle_width, height);
            }
        }
        ctx.fill();

        // 再绘制所有下跌K线
        ctx.set_fill_style_str(bearish_color);
        ctx.begin_path();
        for (i, item_idx) in (visible_start..visible_end).enumerate() {
            let item = items.get(item_idx);
            if item.close() < item.open() {
                // 绘制下跌K线
                let x = layout.chart_area_x + (i as f64 * layout.total_candle_width);
                let open_y = map_price(item.open());
                let close_y = map_price(item.close());
                let candle_width = layout.candle_width.max(2.0);
                let height = (close_y - open_y).max(1.0);
                ctx.rect(x, open_y, candle_width, height);
            }
        }
        ctx.fill();
    }
}
