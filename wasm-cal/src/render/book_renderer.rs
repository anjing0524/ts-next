//! 订单簿可视化渲染器 - 在main层右侧20%宽度区域绘制订单簿深度

use crate::{
    canvas::{CanvasLayerType, CanvasManager},
    data::DataManager,
    layout::{ChartColors, ChartFont, ChartLayout, theme::*}, // Ensure theme is imported
    render::{chart_renderer::RenderMode, traits::ComprehensiveRenderer},
};
use std::cell::Cell;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

pub struct BookRenderer {
    last_idx: Cell<Option<usize>>,
    last_mode: Cell<Option<RenderMode>>,
}

impl BookRenderer {
    pub fn new() -> Self {
        Self {
            last_idx: Cell::new(None),
            last_mode: Cell::new(None),
        }
    }

    pub fn clear_area(&self, ctx: &OffscreenCanvasRenderingContext2d, layout: &ChartLayout) {
        let area_x = layout.chart_area_x + layout.main_chart_width;
        let area_y = layout.chart_area_y;
        let area_width = layout.book_area_width;
        let area_height = layout.price_chart_height;
        ctx.clear_rect(area_x, area_y, area_width, area_height);
    }
}

impl ComprehensiveRenderer for BookRenderer {
    fn render_component(
        &self,
        canvas_manager: &CanvasManager,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        mode: RenderMode,
    ) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Main);
        let data_manager_ref = data_manager.borrow();
        let items = match data_manager_ref.get_items() {
            Some(items) => items,
            None => return,
        };
        let visible_range = data_manager_ref.get_visible_range();
        let (visible_start, _visible_count, visible_end) = visible_range.get_range();
        if visible_start >= visible_end {
            return;
        }

        let idx = visible_end.saturating_sub(1); // Use saturating_sub
        if idx >= items.len() && !items.is_empty() {
            // Allow idx == 0 if items.len() == 0
            // If items is not empty, but idx is out of bounds (e.g. visible_end was 0), return.
            // This can happen if visible_range gives 0,0,0 but items is not empty (e.g. after full zoom out then zoom in)
            // A more robust fix might be in how visible_range is calculated or handled when items exist.
            // For now, just guard against panic.
            if !items.is_empty() {
                return;
            }
        } else if items.is_empty() {
            // If items is empty, idx will be high, so return.
            return;
        }

        let _last_mode_val = self.last_mode.get();
        let _last_idx_val = self.last_idx.get();
        // The check `last_mode_val != Some(mode) || last_idx_val != Some(idx)` was commented out.
        // If it's meant to be active, it should be here.
        // For now, assuming it always redraws if called.
        self.last_mode.set(Some(mode));
        self.last_idx.set(Some(idx));

        let item = items.get(idx); // This could panic if idx is out of bounds. Added guard above.
        let last_price = item.last_price();
        let volumes = match item.volumes() {
            Some(vols) => vols,
            None => {
                self.clear_area(ctx, layout);
                return;
            } // Clear if no volumes
        };

        let area_x = layout.chart_area_x + layout.main_chart_width;
        let area_y = layout.chart_area_y;
        let area_width = layout.book_area_width;
        let area_height = layout.price_chart_height;

        let mut bids = Vec::new();
        let mut asks = Vec::new();
        for i in 0..volumes.len() {
            let pv = volumes.get(i);
            let price = pv.price();
            let volume = pv.volume();
            if price < last_price {
                bids.push((price, volume));
            } else if price > last_price {
                asks.push((price, volume));
            }
        }

        asks.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        bids.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

        let mut all_levels = Vec::new();
        for (p, v) in asks.iter() {
            all_levels.push((*p, *v, true));
        }
        for (p, v) in bids.iter() {
            all_levels.push((*p, *v, false));
        }

        let max_volume = all_levels.iter().map(|(_, v, _)| *v).fold(0.0, f64::max);

        self.clear_area(ctx, layout); // Always clear before drawing new content or returning
        if max_volume <= 0.0 {
            return;
        } // If no volume, area is cleared, then return.

        let bar_height = area_height / all_levels.len().max(1) as f64; // .max(1) to avoid div by zero
        for (i, (_price_val, volume_val, is_ask)) in all_levels.iter().enumerate() {
            let norm = (*volume_val / max_volume).min(1.0); // .min(1.0) to cap norm
            // Use BOOK_TEXT_RESERVED_WIDTH
            let bar_width = (area_width - BOOK_TEXT_RESERVED_WIDTH) * norm;
            let bar_x = area_x;
            let bar_y = area_y + i as f64 * bar_height;

            ctx.set_fill_style_str(if *is_ask {
                ChartColors::BEARISH
            } else {
                ChartColors::BULLISH
            });
            ctx.set_global_alpha(1.0);
            // Use BOOK_BAR_BORDER_ADJUST
            ctx.fill_rect(
                bar_x,
                bar_y,
                bar_width.max(0.0),
                bar_height - BOOK_BAR_BORDER_ADJUST,
            ); // Ensure bar_width is not negative

            if *volume_val > 0.0 {
                let text = format!("{}", *volume_val as u64);
                // Use BOOK_TEXT_X_OFFSET
                let text_x = bar_x + bar_width.max(0.0) + BOOK_TEXT_X_OFFSET; // Ensure bar_width is not negative for text placement
                let text_y = bar_y + bar_height / 2.0; // 2.0 is factor for centering
                ctx.set_fill_style_str(ChartColors::TEXT);
                ctx.set_font(ChartFont::LEGEND);
                ctx.set_text_align("left");
                ctx.set_text_baseline("middle");
                let _ = ctx.fill_text(&text, text_x, text_y);
            }
        }
        ctx.set_global_alpha(1.0);
    }
}
