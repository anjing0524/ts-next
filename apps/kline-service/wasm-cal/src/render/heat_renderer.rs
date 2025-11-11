//! 热图渲染器 - 专门负责绘制类似Bookmap的热度图

use crate::canvas::CanvasLayerType;
use crate::data::DataManager;
use crate::layout::{ChartLayout, CoordinateMapper, PaneId, Rect};
use crate::render::chart_renderer::RenderMode;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};
use crate::utils::{calculate_optimal_tick, error::WasmCalError};
use web_sys::OffscreenCanvasRenderingContext2d;

/// 热图渲染器
/// 新版本为无状态渲染器，所有计算和缓存逻辑已移至DataManager。
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

    /// 主绘制函数，从DataManager获取预计算的全局索引并渲染可见部分。
    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &DataManager,
    ) -> Result<(), WasmCalError> {
        let (_visible_start, visible_count, _visible_end) = data_manager.get_visible();

        // 如果没有可见数据或没有全局索引，则不渲染
        let heatmap_index = match data_manager.get_global_heatmap_index() {
            Some(index) if visible_count > 0 => index,
            _ => return Ok(()),
        };

        let price_rect = layout.get_rect(&PaneId::HeatmapArea);
        let adjusted_tick = calculate_optimal_tick(
            heatmap_index.tick_size,
            heatmap_index.global_min_price,
            heatmap_index.global_max_price,
            price_rect.height,
        );

        if adjusted_tick <= 0.0 {
            return Ok(());
        }

        // 计算显示时需要聚合的原始tick数量
        let aggregation_factor = (adjusted_tick / heatmap_index.tick_size).round() as usize;

        let y_mapper = CoordinateMapper::new_for_y_axis(
            price_rect,
            heatmap_index.global_min_price,
            heatmap_index.global_max_price,
            0.0,
        );

        self.draw_aggregated_heatmap(
            ctx,
            layout,
            data_manager,
            &y_mapper,
            &price_rect,
            aggregation_factor,
        )?;

        Ok(())
    }

    /// 绘制聚合后的热图
    fn draw_aggregated_heatmap(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &DataManager,
        y_mapper: &CoordinateMapper,
        price_rect: &Rect,
        aggregation_factor: usize,
    ) -> Result<(), WasmCalError> {
        let (visible_start, _, visible_end) = data_manager.get_visible();
        let heatmap_index = data_manager.get_global_heatmap_index().unwrap(); // 已在上层检查

        if heatmap_index.global_max_volume_in_bin <= 0.0 {
            return Ok(());
        }
        let global_max_ln = (heatmap_index.global_max_volume_in_bin + 1.0).ln();
        ctx.set_global_alpha(1.0);
        let candle_width = layout.total_candle_width;
        let x_base = price_rect.x;

        // 遍历可见的每个时间点 (K线)
        for time_idx in visible_start..visible_end {
            let x = x_base + (time_idx - visible_start) as f64 * candle_width;
            let mut current_color_index: Option<usize> = None;

            // 遍历价格桶 (Y轴)
            let mut raw_bucket_idx = 0;
            while raw_bucket_idx < heatmap_index.price_buckets_len {
                let mut aggregated_volume = 0.0;
                let end_agg_bucket =
                    (raw_bucket_idx + aggregation_factor).min(heatmap_index.price_buckets_len);

                // 聚合原始桶的数据
                for i in raw_bucket_idx..end_agg_bucket {
                    let linear_idx = time_idx * heatmap_index.price_buckets_len + i;
                    aggregated_volume += heatmap_index.heatmap_bins[linear_idx];
                }

                if aggregated_volume > 0.0 {
                    let norm = (aggregated_volume + 1.0).ln() / global_max_ln;
                    if norm >= 0.05 {
                        // 过滤掉非常小的值
                        let price_low = heatmap_index.global_min_price
                            + raw_bucket_idx as f64 * heatmap_index.tick_size;
                        let price_high = heatmap_index.global_min_price
                            + end_agg_bucket as f64 * heatmap_index.tick_size;

                        let y_top = y_mapper.map_y(price_high);
                        let y_bottom = y_mapper.map_y(price_low);
                        let height = (y_bottom - y_top).max(1.0);

                        if height > 0.0 {
                            let color_index = (norm.clamp(0.0, 1.0) * 99.0).round() as usize;
                            if color_index < self.color_cache.len() {
                                if current_color_index != Some(color_index) {
                                    ctx.set_fill_style_str(&self.color_cache[color_index]);
                                    current_color_index = Some(color_index);
                                }
                                ctx.fill_rect(x, y_top, candle_width, height);
                            }
                        }
                    }
                }
                raw_bucket_idx += aggregation_factor;
            }
        }
        Ok(())
    }

    fn calculate_heat_color_static(norm: f64) -> String {
        let stops = [
            (0.0, "#f8f8f8"),
            (0.1, "#e8e8f0"),
            (0.2, "#d0d0f0"),
            (0.35, "#a0a0ff"),
            (0.5, "#6666ff"),
            (0.65, "#00aaff"),
            (0.75, "#00ffaa"),
            (0.85, "#aaff00"),
            (0.92, "#ffaa00"),
            (0.97, "#ff6600"),
            (1.0, "#ff0000"),
        ];
        for i in 0..stops.len() - 1 {
            if norm >= stops[i].0 && norm <= stops[i + 1].0 {
                let t = (norm - stops[i].0) / (stops[i + 1].0 - stops[i].0);
                return Self::interpolate_color_static(stops[i].1, stops[i + 1].1, t);
            }
        }
        stops
            .last()
            .map(|(_, color)| color.to_string())
            .unwrap_or_else(|| "#ff0000".to_string())
    }

    fn interpolate_color_static(c1: &str, c2: &str, t: f64) -> String {
        let (r1, g1, b1) = Self::parse_rgb_static(c1);
        let (r2, g2, b2) = Self::parse_rgb_static(c2);
        let r = (r1 as f64 * (1.0 - t) + r2 as f64 * t) as u8;
        let g = (g1 as f64 * (1.0 - t) + g2 as f64 * t) as u8;
        let b = (b1 as f64 * (1.0 - t) + b2 as f64 * t) as u8;
        format!("rgb({},{},{})", r, g, b)
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
        let main_ctx = canvas_ref.get_context(CanvasLayerType::Main)?;
        let layout = ctx.layout_ref();
        let data_manager = ctx.data_manager_ref();
        self.draw(main_ctx, &layout, &data_manager)
            .map_err(|e| WasmCalError::Other {
                message: e.to_string(),
                source: None,
            })?;
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
