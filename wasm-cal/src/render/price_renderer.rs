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
        let visible_range = data_manager_ref.get_visible_range();
        let (visible_start, visible_count, visible_end) = visible_range.get_range();

        if visible_start >= visible_end {
            return;
        }

        // 获取价格范围
        let (min_low, max_high, _) = data_manager_ref.get_cached_cal();

        // 预先计算所有可见K线的X坐标
        let x_coordinates = visible_range.precompute_x_coordinates(layout);

        // 优化：使用临时数组收集所有绘制操作，减少绘制调用次数
        let mut bullish_high_low_lines = Vec::with_capacity(visible_count);
        let mut bearish_high_low_lines = Vec::with_capacity(visible_count);
        let mut bullish_rects = Vec::with_capacity(visible_count);
        let mut bearish_rects = Vec::with_capacity(visible_count);

        // 遍历所有可见的K线数据
        for (rel_idx, global_idx) in (visible_start..visible_end).enumerate() {
            if global_idx >= items.len() {
                break;
            }
            
            let item = items.get(global_idx);
            let x_center = x_coordinates[rel_idx];
            
            // 计算价格对应的Y坐标
            let high_y = layout.map_price_to_y(item.high(), min_low, max_high);
            let low_y = layout.map_price_to_y(item.low(), min_low, max_high);
            let open_y = layout.map_price_to_y(item.open(), min_low, max_high);
            let close_y = layout.map_price_to_y(item.close(), min_low, max_high);
            
            // 收集影线绘制信息 - 根据涨跌分别收集
            if item.close() >= item.open() {
                // 上涨K线 - 绿色影线
                bullish_high_low_lines.push((x_center, high_y, x_center, low_y));
            } else {
                // 下跌K线 - 红色影线
                bearish_high_low_lines.push((x_center, high_y, x_center, low_y));
            }
            
            // 收集实体绘制信息
            let candle_x = x_center - (layout.candle_width / 2.0);
            let candle_width = layout.candle_width.max(1.0);
            
            if item.close() >= item.open() {
                // 上涨K线
                let height = (open_y - close_y).max(1.0);
                bullish_rects.push((candle_x, close_y, candle_width, height));
            } else {
                // 下跌K线
                let height = (close_y - open_y).max(1.0);
                bearish_rects.push((candle_x, open_y, candle_width, height));
            }
        }
        
        // 批量绘制所有上涨K线影线 (绿色)
        if !bullish_high_low_lines.is_empty() {
            ctx.begin_path();
            ctx.set_stroke_style_str(ChartColors::BULLISH);
            ctx.set_line_width(1.5);
            let empty_array = js_sys::Float64Array::new_with_length(0);
            ctx.set_line_dash(&empty_array).unwrap();
            for (x1, y1, x2, y2) in bullish_high_low_lines {
                ctx.move_to(x1, y1);
                ctx.line_to(x2, y2);
            }
            ctx.stroke();
        }
        
        // 批量绘制所有下跌K线影线 (红色)
        if !bearish_high_low_lines.is_empty() {
            ctx.begin_path();
            ctx.set_stroke_style_str(ChartColors::BEARISH);
            ctx.set_line_width(1.5);
            let empty_array = js_sys::Float64Array::new_with_length(0);
            ctx.set_line_dash(&empty_array).unwrap();
            for (x1, y1, x2, y2) in bearish_high_low_lines {
                ctx.move_to(x1, y1);
                ctx.line_to(x2, y2);
            }
            ctx.stroke();
        }
        
        // 批量绘制所有上涨K线实体
        if !bullish_rects.is_empty() {
            ctx.set_fill_style_str(ChartColors::BULLISH);
            ctx.begin_path();
            for (x, y, width, height) in bullish_rects {
                ctx.rect(x, y, width, height);
            }
            ctx.fill();
        }
        
        // 批量绘制所有下跌K线实体
        if !bearish_rects.is_empty() {
            ctx.set_fill_style_str(ChartColors::BEARISH);
            ctx.begin_path();
            for (x, y, width, height) in bearish_rects {
                ctx.rect(x, y, width, height);
            }
            ctx.fill();
        }
    }
}
