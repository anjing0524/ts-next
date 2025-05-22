//! 成交量图模块 - 专门负责绘制成交量图部分

use crate::{
    canvas::{CanvasLayerType, CanvasManager},
    data::DataManager,
    layout::{ChartColors, ChartLayout, theme::*}, // Added theme::*
    render::{chart_renderer::RenderMode, traits::ComprehensiveRenderer},
};
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 成交量图绘制器
pub struct VolumeRenderer;

impl VolumeRenderer {
    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
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

        let (_, _, max_volume) = data_manager_ref.get_cached_cal();
        let x_coordinates = visible_range.precompute_x_coordinates(layout);

        let mut bullish_rects = Vec::with_capacity(visible_count);
        let mut bearish_rects = Vec::with_capacity(visible_count);

        for (rel_idx, global_idx) in (visible_start..visible_end).enumerate() {
            if global_idx >= items.len() || rel_idx >= x_coordinates.len() {
                break;
            }

            let item = items.get(global_idx);
            let x_center = x_coordinates[rel_idx];

            let candle_x = x_center - (layout.candle_width / 2.0);
            // Use VOLUME_MIN_BAR_WIDTH for minimum bar width
            let candle_width = layout.candle_width.max(VOLUME_MIN_BAR_WIDTH); 

            let volume = item.b_vol() + item.s_vol();
            let height = if max_volume > 0.0 {
                (volume / max_volume) * layout.volume_chart_height
            } else {
                0.0
            };

            let volume_y = layout.volume_chart_y + layout.volume_chart_height - height;

            if item.close() >= item.open() {
                bullish_rects.push((candle_x, volume_y, candle_width, height));
            } else {
                bearish_rects.push((candle_x, volume_y, candle_width, height));
            }
        }

        if !bullish_rects.is_empty() {
            ctx.set_fill_style_str(ChartColors::BULLISH);
            ctx.begin_path();
            for (x, y, width, height) in bullish_rects {
                ctx.rect(x, y, width, height);
            }
            ctx.fill();
        }

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

impl ComprehensiveRenderer for VolumeRenderer {
    fn render_component(
        &self,
        canvas_manager: &CanvasManager,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        _mode: RenderMode,
    ) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Main);
        self.draw(ctx, layout, data_manager);
    }
}
