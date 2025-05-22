//! 订单簿可视化渲染器 - 在main层右侧20%宽度区域绘制订单簿深度

use crate::{
    canvas::{CanvasLayerType, CanvasManager}, // Added
    data::DataManager,
    layout::{ChartColors, ChartFont, ChartLayout},
    render::{chart_renderer::RenderMode, traits::ComprehensiveRenderer}, // Changed
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

    // clear_area remains a helper method for BookRenderer
    pub fn clear_area(&self, ctx: &OffscreenCanvasRenderingContext2d, layout: &ChartLayout) {
        let area_x = layout.chart_area_x + layout.main_chart_width;
        let area_y = layout.chart_area_y;
        let area_width = layout.book_area_width;
        let area_height = layout.price_chart_height;
        ctx.clear_rect(area_x, area_y, area_width, area_height);
    }
}

// impl LayerRenderer for BookRenderer { ... } // This block is removed

impl ComprehensiveRenderer for BookRenderer {
    /// 在main层右侧20%宽度区域绘制订单簿
    fn render_component(
        &self,
        canvas_manager: &CanvasManager, // Added
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        mode: RenderMode,
    ) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Main); // Get context

        // Logic from old draw_on_layer, hover_index is internally None as per original file
        let hover_index: Option<usize> = None; 
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
        let idx = hover_index.unwrap_or_else(|| visible_end - 1);
        if idx >= items.len() {
            return;
        }

        let last_mode_val = self.last_mode.get(); // Use a distinct variable name
        let last_idx_val = self.last_idx.get();   // Use a distinct variable name
        let need_render = last_mode_val != Some(mode) || last_idx_val != Some(idx);
        
        if !need_render {
            // return; // Commenting out to ensure it always clears and redraws if called by chart_renderer
        }
        self.last_mode.set(Some(mode));
        self.last_idx.set(Some(idx));

        let item = items.get(idx);
        let last_price = item.last_price();
        let volumes = match item.volumes() {
            Some(vols) => vols,
            None => return,
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
            all_levels.push((*p, *v, true)); // true: 卖盘
        }
        for (p, v) in bids.iter() {
            all_levels.push((*p, *v, false)); // false: 买盘
        }
        
        let max_volume = all_levels.iter().map(|(_, v, _)| *v).fold(0.0, f64::max);
        if max_volume <= 0.0 {
             // Still clear if max_volume is 0, to erase previous drawing
            self.clear_area(ctx, layout);
            return;
        }
        
        self.clear_area(ctx, layout); // Clear before drawing new content
        
        let bar_height = area_height / all_levels.len().max(1) as f64;
        for (i, (price_val, volume_val, is_ask)) in all_levels.iter().enumerate() { // Renamed to avoid conflict
            let norm = (*volume_val / max_volume).min(1.0);
            let text_reserved_width = 40.0; // Magic number
            let bar_width = (area_width - text_reserved_width) * norm;
            let bar_x = area_x;
            let bar_y = area_y + i as f64 * bar_height;
            
            ctx.set_fill_style_value(&(if *is_ask { ChartColors::BEARISH } else { ChartColors::BULLISH }).into());
            // ctx.global_alpha(); // This method does not exist. set_global_alpha(1.0) is likely intended.
            ctx.set_global_alpha(1.0); // Ensuring full opacity for bars
            ctx.fill_rect(bar_x, bar_y, bar_width, bar_height - 1.0); // Magic number 1.0
            
            if *volume_val > 0.0 {
                let text = format!("{}", *volume_val as u64);
                let text_x = bar_x + bar_width + 4.0; // Magic number 4.0
                let text_y = bar_y + bar_height / 2.0;
                ctx.set_fill_style_value(&ChartColors::TEXT.into());
                ctx.set_font(ChartFont::LEGEND);
                ctx.set_text_align("left");
                ctx.set_text_baseline("middle");
                ctx.fill_text(&text, text_x, text_y).ok();
            }
        }
        ctx.set_global_alpha(1.0); // Restore global alpha
    }
}
