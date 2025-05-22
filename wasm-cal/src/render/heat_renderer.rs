//! 热图渲染器 - 专门负责绘制类似Bookmap的热度图

use crate::{
    canvas::{CanvasLayerType, CanvasManager},
    data::DataManager,
    layout::{ChartLayout, theme::*}, // Added theme
    render::{chart_renderer::RenderMode, traits::ComprehensiveRenderer},
};
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 热图渲染器
pub struct HeatRenderer {
    color_cache: Vec<String>,
}

impl Default for HeatRenderer {
    fn default() -> Self {
        Self::new()
    }
}

impl HeatRenderer {
    pub fn new() -> Self {
        let mut color_cache = Vec::with_capacity(HEATMAP_COLOR_CACHE_SIZE); // Use constant
        for i in 0..HEATMAP_COLOR_CACHE_SIZE { // Use constant for loop bound
            // Use HEATMAP_NORM_DIVISOR_OFFSET for normalization, adjusting for 0-based index if cache_size is 100 for 0..99
            let norm = i as f64 / HEATMAP_NORM_DIVISOR_OFFSET; 
            color_cache.push(Self::calculate_heat_color_static(norm));
        }
        Self { color_cache }
    }

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
        let (visible_start, _visible_count, visible_end) = visible_range.get_range();
        if visible_start >= visible_end { return; }

        let (min_low, max_high, _) = data_manager_ref.get_cached_cal();
        let tick = data_manager_ref.get_tick();
        if tick <= 0.0 || min_low >= max_high { return; }
        let num_bins = ((max_high - min_low) / tick).ceil() as usize;
        if num_bins == 0 { return; }

        let x_coordinates = visible_range.precompute_x_coordinates(layout);
        let half_width = layout.total_candle_width / 2.0; // 2.0 is a factor, not a magic number here
        let x_width = layout.total_candle_width;

        let mut global_max_bin = 0.0;
        let mut all_bins: Vec<Vec<f64>> = Vec::with_capacity(visible_end - visible_start);

        for global_idx in visible_start..visible_end {
            if global_idx >= items.len() { break; }
            let item = items.get(global_idx);
            let mut bins = vec![0.0; num_bins];
            if let Some(volumes) = item.volumes() {
                for i in 0..volumes.len() {
                    let price_volume = volumes.get(i);
                    let price = price_volume.price();
                    let volume = price_volume.volume();
                    if price < min_low || price >= max_high { continue; }
                    let bin_idx = ((price - min_low) / tick).floor() as usize;
                    if bin_idx < bins.len() {
                        bins[bin_idx] += volume;
                        if bins[bin_idx] > global_max_bin { global_max_bin = bins[bin_idx]; }
                    }
                }
            }
            all_bins.push(bins);
        }

        if global_max_bin <= 0.0 { return; }
        let global_max_bin_ln = (global_max_bin + 1.0).ln(); // 1.0 to prevent ln(0)

        for (rel_idx, bins) in all_bins.iter().enumerate() {
            if rel_idx >= x_coordinates.len() { break; }
            let x_center = x_coordinates[rel_idx];
            let x_left = x_center - half_width;

            for (bin_idx, &volume) in bins.iter().enumerate() {
                if volume <= 0.0 { continue; }
                let price_low = min_low + bin_idx as f64 * tick;
                let price_high = price_low + tick;
                let y_high = layout.map_price_to_y(price_high, min_low, max_high);
                let y_low = layout.map_price_to_y(price_low, min_low, max_high);
                let rect_y = y_high.min(y_low);
                let rect_height = (y_low - y_high).abs();

                let norm = (volume + 1.0).ln() / global_max_bin_ln; // 1.0 to prevent ln(0)
                if norm < HEATMAP_MIN_THRESHOLD { continue; } // Use constant

                let color = self.get_cached_color(norm);
                let alpha = HEATMAP_ALPHA_BASE + HEATMAP_ALPHA_FACTOR * norm; // Use constants

                ctx.set_global_alpha(alpha);
                ctx.set_fill_style_str(&color);
                // Use HEATMAP_RECT_BORDER_ADJUST
                ctx.fill_rect(x_left, rect_y, x_width - HEATMAP_RECT_BORDER_ADJUST, rect_height - HEATMAP_RECT_BORDER_ADJUST); 
                ctx.set_global_alpha(1.0); // Restore
            }
        }
    }

    fn get_cached_color(&self, norm: f64) -> String {
        let norm = norm.clamp(0.0, 1.0); // 0.0, 1.0 are standard clamp bounds
        // Use HEATMAP_NORM_DIVISOR_OFFSET for index calculation, matching new()
        let index = (norm * HEATMAP_NORM_DIVISOR_OFFSET).round() as usize; 
        if index < self.color_cache.len() {
            self.color_cache[index].clone()
        } else {
            // Fallback for index potentially being == HEATMAP_COLOR_CACHE_SIZE if norm was exactly 1.0
            // and HEATMAP_NORM_DIVISOR_OFFSET was cache_size - 1.
            // If HEATMAP_NORM_DIVISOR_OFFSET is 99.0 and cache_size is 100, index can be 99.
            // This logic implies color_cache should have HEATMAP_COLOR_CACHE_SIZE elements.
            if index >= HEATMAP_COLOR_CACHE_SIZE && HEATMAP_COLOR_CACHE_SIZE > 0 {
                 self.color_cache[HEATMAP_COLOR_CACHE_SIZE - 1].clone()
            } else { // Covers HEATMAP_COLOR_CACHE_SIZE == 0 and other fallbacks
                 Self::calculate_heat_color_static(norm)
            }
        }
    }

    // calculate_heat_color_static, interpolate_color_static, parse_rgb_static, lerp_static
    // remain the same as they deal with the specific heatmap color gradient logic.
    // The color hex strings and interpolation points are specific to this renderer's visual style.
    fn calculate_heat_color_static(norm: f64) -> String {
        let norm = norm.clamp(0.0, 1.0);
        let color_stops = [
            (0.0, "#f0f9e8"), (0.15, "#ccebc5"), (0.35, "#a8ddb5"), (0.55, "#7bccc4"),
            (0.75, "#43a2ca"), (0.90, "#0868ac"), (0.94, "#fff600"), (0.97, "#ff9900"),
            (0.99, "#ff6a00"), (1.0, "#ff0000"),
        ];
        for i in 0..color_stops.len() - 1 {
            let (start, color1) = color_stops[i];
            let (end, color2) = color_stops[i + 1];
            if norm >= start && norm <= end {
                let t = (norm - start) / (end - start); // 0.0, 1.0 standard for ratio
                return Self::interpolate_color_static(color1, color2, t);
            }
        }
        "#ff0000".to_string() // Default color
    }

    fn interpolate_color_static(color1: &str, color2: &str, ratio: f64) -> String {
        let (r1, g1, b1) = Self::parse_rgb_static(color1);
        let (r2, g2, b2) = Self::parse_rgb_static(color2);
        let r = Self::lerp_static(r1, r2, ratio) as u8;
        let g = Self::lerp_static(g1, g2, ratio) as u8;
        let b = Self::lerp_static(b1, b2, ratio) as u8;
        format!("rgb({}, {}, {})", r, g, b)
    }

    fn parse_rgb_static(color: &str) -> (u8, u8, u8) {
        if color.starts_with('#') && color.len() == 7 {
            let r = u8::from_str_radix(&color[1..3], 16).unwrap_or(0);
            let g = u8::from_str_radix(&color[3..5], 16).unwrap_or(0);
            let b = u8::from_str_radix(&color[5..7], 16).unwrap_or(0);
            (r, g, b)
        } else { (0, 0, 0) }
    }

    fn lerp_static(a: u8, b: u8, t: f64) -> f64 {
        a as f64 * (1.0 - t) + b as f64 * t // 1.0 standard for lerp
    }
}

impl ComprehensiveRenderer for HeatRenderer {
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
