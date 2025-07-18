//! 价格图(K线图)模块 - 专门负责绘制K线图部分

use crate::config::ChartTheme;
use crate::data::DataManager;
use crate::layout::ChartLayout;
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
        theme: &ChartTheme,
    ) {
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

        // 预分配缓冲区，避免重复分配
        let mut bullish_path = Path2D::new();
        let mut bearish_path = Path2D::new();
        let mut bullish_fill = Path2D::new();
        let mut bearish_fill = Path2D::new();

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

            let candle_x = x_center - (layout.candle_width / 2.0);
            let candle_width = layout.candle_width.max(1.0);

            if item.close() >= item.open() {
                bullish_path.move_to(x_center, high_y);
                bullish_path.line_to(x_center, low_y);
                bullish_fill.rect(candle_x, close_y.min(open_y), candle_width, (open_y - close_y).abs().max(1.0));
            } else {
                bearish_path.move_to(x_center, high_y);
                bearish_path.line_to(x_center, low_y);
                bearish_fill.rect(candle_x, close_y.min(open_y), candle_width, (close_y - open_y).abs().max(1.0));
            }
        }

        // 批量绘制影线
        if !bullish_path.is_empty() {
            ctx.set_stroke_style_str(&theme.bullish);
            ctx.set_line_width(1.5);
            ctx.stroke(&bullish_path);
        }
        
        if !bearish_path.is_empty() {
            ctx.set_stroke_style_str(&theme.bearish);
            ctx.set_line_width(1.5);
            ctx.stroke(&bearish_path);
        }

        // 批量绘制实体
        if !bullish_fill.is_empty() {
            ctx.set_fill_style_str(&theme.bullish);
            ctx.fill(&bullish_fill);
        }
        
        if !bearish_fill.is_empty() {
            ctx.set_fill_style_str(&theme.bearish);
            ctx.fill(&bearish_fill);
        }
    }
}
