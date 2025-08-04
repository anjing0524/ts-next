//! 热图渲染器 - 专门负责绘制类似Bookmap的热度图

use crate::canvas::CanvasLayerType;
use crate::data::DataManager;
use crate::layout::{ChartLayout, CoordinateMapper, PaneId};
use crate::render::chart_renderer::RenderMode;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};
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
        let mut color_cache = Vec::with_capacity(100);
        for i in 0..100 {
            color_cache.push(Self::calculate_heat_color_static(i as f64 / 99.0));
        }
        Self { color_cache }
    }

    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &DataManager,
    ) {
        let items = match data_manager.get_items() {
            Some(items) => items,
            None => return,
        };

        let (visible_start, visible_count, _) = data_manager.get_visible();
        let visible_end = visible_start + visible_count;
        if visible_start >= visible_end {
            return;
        }

        let (min_low, max_high, _) = data_manager.get_cached_cal();
        let tick = data_manager.get_tick();
        if tick <= 0.0 || min_low >= max_high {
            return;
        }

        let num_bins = ((max_high - min_low) / tick).ceil() as usize;
        if num_bins == 0 {
            return;
        }

        let price_rect = layout.get_rect(&PaneId::HeatmapArea);
        let y_mapper = CoordinateMapper::new_for_y_axis(price_rect, min_low, max_high, 0.0);

        let mut all_bins: Vec<Vec<f64>> = Vec::with_capacity(visible_end - visible_start);
        let mut global_max_bin: f64 = 0.0;

        for i in visible_start..visible_end {
            let item = items.get(i);
            let mut bins = vec![0.0; num_bins];
            if let Some(volumes) = item.volumes() {
                for j in 0..volumes.len() {
                    let pv = volumes.get(j);
                    if pv.price() >= min_low && pv.price() < max_high {
                        let bin_idx = ((pv.price() - min_low) / tick).floor() as usize;
                        if bin_idx < num_bins {
                            bins[bin_idx] += pv.volume();
                            global_max_bin = global_max_bin.max(bins[bin_idx]);
                        }
                    }
                }
            }
            all_bins.push(bins);
        }

        if global_max_bin <= 0.0 {
            return;
        }

        let global_max_bin_ln = (global_max_bin + 1.0).ln();

        for (rel_idx, bins) in all_bins.iter().enumerate() {
            let x = price_rect.x + rel_idx as f64 * layout.total_candle_width;
            for (bin_idx, &volume) in bins.iter().enumerate() {
                if volume <= 0.0 {
                    continue;
                }

                let norm = (volume + 1.0).ln() / global_max_bin_ln;
                if norm < 0.001 {
                    continue;
                }

                let price_low = min_low + bin_idx as f64 * tick;
                let y = y_mapper.map_y(price_low);
                let rect_height = (y_mapper.map_y(price_low + tick) - y).abs();

                ctx.set_global_alpha(0.25 + 0.75 * norm);
                ctx.set_fill_style_str(self.get_cached_color(norm));
                ctx.fill_rect(x, y - rect_height, layout.total_candle_width, rect_height);
            }
        }
        ctx.set_global_alpha(1.0);
    }

    fn get_cached_color(&self, norm: f64) -> &String {
        let index = (norm.clamp(0.0, 1.0) * 99.0).round() as usize;
        &self.color_cache[index]
    }

    fn calculate_heat_color_static(norm: f64) -> String {
        let stops = [
            (0.0, "#f0f9e8"),
            (0.15, "#ccebc5"),
            (0.35, "#a8ddb5"),
            (0.55, "#7bccc4"),
            (0.75, "#43a2ca"),
            (0.90, "#0868ac"),
            (0.94, "#fff600"),
            (0.97, "#ff9900"),
            (0.99, "#ff6a00"),
            (1.0, "#ff0000"),
        ];
        for i in 0..stops.len() - 1 {
            if norm >= stops[i].0 && norm <= stops[i + 1].0 {
                let t = (norm - stops[i].0) / (stops[i + 1].0 - stops[i].0);
                return Self::interpolate_color_static(stops[i].1, stops[i + 1].1, t);
            }
        }
        stops.last().unwrap().1.to_string()
    }

    fn interpolate_color_static(c1: &str, c2: &str, t: f64) -> String {
        let (r1, g1, b1) = Self::parse_rgb_static(c1);
        let (r2, g2, b2) = Self::parse_rgb_static(c2);
        let r = (r1 as f64 * (1.0 - t) + r2 as f64 * t) as u8;
        let g = (g1 as f64 * (1.0 - t) + g2 as f64 * t) as u8;
        let b = (b1 as f64 * (1.0 - t) + b2 as f64 * t) as u8;
        format!("rgb({r},{g},{b})")
    }

    fn parse_rgb_static(c: &str) -> (u8, u8, u8) {
        (
            u8::from_str_radix(&c[1..3], 16).unwrap_or(0),
            u8::from_str_radix(&c[3..5], 16).unwrap_or(0),
            u8::from_str_radix(&c[5..7], 16).unwrap_or(0),
        )
    }
}

impl RenderStrategy for HeatRenderer {
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError> {
        let canvas_ref = ctx.canvas_manager_ref();
        let main_ctx = canvas_ref.get_context(CanvasLayerType::Main);
        let layout = ctx.layout_ref();
        let data_manager = ctx.data_manager_ref();
        self.draw(main_ctx, &layout, &data_manager);
        Ok(())
    }

    fn supports_mode(&self, mode: RenderMode) -> bool {
        mode == RenderMode::Heatmap
    }

    fn get_layer_type(&self) -> CanvasLayerType {
        CanvasLayerType::Main
    }

    fn get_priority(&self) -> u32 {
        15
    }
}
