//! 价格图(K线图)模块 - 专门负责绘制K线图部分

use crate::{
    canvas::{CanvasLayerType, CanvasManager},
    data::DataManager,
    layout::{ChartColors, ChartLayout, theme::*}, // Added theme::*
    render::{chart_renderer::RenderMode, traits::ComprehensiveRenderer},
};
use std::cell::RefCell;
use std::rc::Rc;

/// 价格图(K线图)绘制器
pub struct PriceRenderer;

impl ComprehensiveRenderer for PriceRenderer {
    fn render_component(
        &self,
        canvas_manager: &CanvasManager,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        _mode: RenderMode,
    ) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Main);
        let data_manager_ref = data_manager.borrow();
        let items = match data_manager_ref.get_items() {
            Some(items) => items,
            None => return,
        };

        let visible_range = data_manager_ref.get_visible_range();
        let (visible_start, visible_count, visible_end) = visible_range.get_range();

        if visible_start >= visible_end {
            return;
        }

        let (min_low, max_high, _) = data_manager_ref.get_cached_cal();
        let x_coordinates = visible_range.precompute_x_coordinates(layout);

        let mut bullish_high_low_lines = Vec::with_capacity(visible_count);
        let mut bearish_high_low_lines = Vec::with_capacity(visible_count);
        let mut bullish_rects = Vec::with_capacity(visible_count);
        let mut bearish_rects = Vec::with_capacity(visible_count);

        for (rel_idx, global_idx) in (visible_start..visible_end).enumerate() {
            if global_idx >= items.len() || rel_idx >= x_coordinates.len() {
                break;
            }

            let item = items.get(global_idx);
            let x_center = x_coordinates[rel_idx];

            let high_y = layout.map_price_to_y(item.high(), min_low, max_high);
            let low_y = layout.map_price_to_y(item.low(), min_low, max_high);
            let open_y = layout.map_price_to_y(item.open(), min_low, max_high);
            let close_y = layout.map_price_to_y(item.close(), min_low, max_high);

            if item.close() >= item.open() {
                bullish_high_low_lines.push((x_center, high_y, x_center, low_y));
            } else {
                bearish_high_low_lines.push((x_center, high_y, x_center, low_y));
            }

            let candle_x = x_center - (layout.candle_width / 2.0);
            // Use PRICE_MIN_CANDLE_WIDTH for minimum candle width
            let candle_width = layout.candle_width.max(PRICE_MIN_CANDLE_WIDTH); 

            if item.close() >= item.open() {
                // Use PRICE_MIN_CANDLE_BODY_HEIGHT for minimum height
                let height = (open_y - close_y).max(PRICE_MIN_CANDLE_BODY_HEIGHT); 
                bullish_rects.push((candle_x, close_y, candle_width, height));
            } else {
                // Use PRICE_MIN_CANDLE_BODY_HEIGHT for minimum height
                let height = (close_y - open_y).max(PRICE_MIN_CANDLE_BODY_HEIGHT); 
                bearish_rects.push((candle_x, open_y, candle_width, height));
            }
        }

        if !bullish_high_low_lines.is_empty() {
            ctx.begin_path();
            ctx.set_stroke_style_js_value(&ChartColors::BULLISH.into());
            ctx.set_line_width(PRICE_WICK_LINE_WIDTH); // Use constant
            let empty_array = js_sys::Float64Array::new_with_length(0);
            ctx.set_line_dash(&empty_array).unwrap();
            for (x1, y1, x2, y2) in bullish_high_low_lines {
                ctx.move_to(x1, y1);
                ctx.line_to(x2, y2);
            }
            ctx.stroke();
        }

        if !bearish_high_low_lines.is_empty() {
            ctx.begin_path();
            ctx.set_stroke_style_js_value(&ChartColors::BEARISH.into());
            ctx.set_line_width(PRICE_WICK_LINE_WIDTH); // Use constant
            let empty_array = js_sys::Float64Array::new_with_length(0);
            ctx.set_line_dash(&empty_array).unwrap();
            for (x1, y1, x2, y2) in bearish_high_low_lines {
                ctx.move_to(x1, y1);
                ctx.line_to(x2, y2);
            }
            ctx.stroke();
        }

        if !bullish_rects.is_empty() {
            ctx.set_fill_style_js_value(&ChartColors::BULLISH.into());
            ctx.begin_path();
            for (x, y, width, height) in bullish_rects {
                ctx.rect(x, y, width, height);
            }
            ctx.fill();
        }

        if !bearish_rects.is_empty() {
            ctx.set_fill_style_js_value(&ChartColors::BEARISH.into());
            ctx.begin_path();
            for (x, y, width, height) in bearish_rects {
                ctx.rect(x, y, width, height);
            }
            ctx.fill();
        }
    }
}
