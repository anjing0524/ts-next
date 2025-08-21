//! 热图渲染器 - 专门负责绘制类似Bookmap的热度图

use crate::canvas::CanvasLayerType;
use crate::data::DataManager;
use crate::layout::{ChartLayout, CoordinateMapper, PaneId};
use crate::render::chart_renderer::RenderMode;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};
use crate::utils::calculate_optimal_tick;
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
        let (visible_start, visible_count, _) = data_manager.get_visible();
        let visible_end = visible_start + visible_count;
        if visible_start >= visible_end {
            return;
        }

        let (min_low, max_high) = data_manager.get_full_data_range();
        let base_tick = data_manager.get_tick();
        let price_rect = layout.get_rect(&PaneId::HeatmapArea);
        // 使用工具函数计算最优 tick 大小
        let adjusted_tick = calculate_optimal_tick(base_tick, min_low, max_high, price_rect.height);

        if adjusted_tick <= 0.0 || min_low >= max_high {
            return;
        }

        let y_mapper = CoordinateMapper::new_for_y_axis(price_rect, min_low, max_high, 0.0);

        let num_bins = ((max_high - min_low) / adjusted_tick).ceil() as usize;
        if num_bins == 0 {
            return;
        }

        let mut all_bins: Vec<Vec<f64>> = Vec::with_capacity(visible_end - visible_start);
        let mut global_max_bin: f64 = 0.0;

        for i in visible_start..visible_end {
            let mut bins = vec![0.0; num_bins];
            if let Some(item) = data_manager.get(i) {
                if let Some(volumes) = item.volumes() {
                    for pv in volumes {
                        if pv.price() >= min_low && pv.price() < max_high {
                            let bin_idx = ((pv.price() - min_low) / adjusted_tick).floor() as usize;
                            if bin_idx < num_bins {
                                bins[bin_idx] += pv.volume();
                                global_max_bin = global_max_bin.max(bins[bin_idx]);
                            }
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

                // 对于极小的流动性，跳过不绘制
                if norm < 0.05 {
                    continue;
                }

                let price_low = min_low + bin_idx as f64 * adjusted_tick;
                let price_high = price_low + adjusted_tick;

                let y_top = y_mapper.map_y(price_high);
                let y_bottom = y_mapper.map_y(price_low);
                let height = (y_bottom - y_top).max(1.0);

                if height > 0.0 {
                    // 白色背景下的透明度设计：使用颜色本身的对比度，减少透明度依赖
                    let alpha = if norm < 0.15 {
                        0.3 + 0.4 * (norm - 0.05) / 0.1 // 极低流动性：30%-70%透明度
                    } else if norm < 0.5 {
                        0.7 + 0.2 * (norm - 0.15) / 0.35 // 中等流动性：70%-90%透明度
                    } else {
                        0.9 + 0.1 * (norm - 0.5) / 0.5 // 高流动性：90%-100%透明度
                    };
                    ctx.set_global_alpha(alpha);
                    ctx.set_fill_style_str(self.get_cached_color(norm));
                    ctx.fill_rect(x, y_top, layout.total_candle_width, height);
                }
            }
        }
        ctx.set_global_alpha(1.0);
    }

    fn get_cached_color(&self, norm: f64) -> &String {
        let index = (norm.clamp(0.0, 1.0) * 99.0).round() as usize;
        &self.color_cache[index]
    }

    fn calculate_heat_color_static(norm: f64) -> String {
        // 白色背景的Bookmap风格配色：从接近白色到鲜艳色的渐变
        // 低流动性区域几乎不可见，高流动性区域突出显示
        let stops = [
            (0.0, "#f8f8f8"),  // 接近白色 - 最低流动性，几乎不可见
            (0.1, "#e8e8f0"),  // 极淡蓝色
            (0.2, "#d0d0f0"),  // 淡蓝色
            (0.35, "#a0a0ff"), // 浅蓝色
            (0.5, "#6666ff"),  // 蓝色
            (0.65, "#00aaff"), // 亮蓝色
            (0.75, "#00ffaa"), // 青绿色
            (0.85, "#aaff00"), // 黄绿色
            (0.92, "#ffaa00"), // 橙色
            (0.97, "#ff6600"), // 橙红色
            (1.0, "#ff0000"),  // 纯红色 - 最高流动性
        ];
        for i in 0..stops.len() - 1 {
            if norm >= stops[i].0 && norm <= stops[i + 1].0 {
                let t = (norm - stops[i].0) / (stops[i + 1].0 - stops[i].0);
                return Self::interpolate_color_static(stops[i].1, stops[i + 1].1, t);
            }
        }
        // 使用安全回退：当未匹配到区间时，回退为最后一个颜色，避免 unwrap()
        stops
            .last()
            .map(|(_, color)| color.to_string())
            .unwrap_or_else(|| "#ff0000".to_string())
    }

    fn interpolate_color_static(c1: &str, c2: &str, t: f64) -> String {
        // 说明：对两个十六进制颜色值进行线性插值，返回插值得到的 RGB 字符串
        let (r1, g1, b1) = Self::parse_rgb_static(c1);
        let (r2, g2, b2) = Self::parse_rgb_static(c2);
        let r = (r1 as f64 * (1.0 - t) + r2 as f64 * t) as u8;
        let g = (g1 as f64 * (1.0 - t) + g2 as f64 * t) as u8;
        let b = (b1 as f64 * (1.0 - t) + b2 as f64 * t) as u8;
        format!("rgb({r},{g},{b})")
    }

    fn parse_rgb_static(c: &str) -> (u8, u8, u8) {
        // 说明：解析形如 "#RRGGBB" 的十六进制颜色字符串；解析失败时回退为 0
        (
            u8::from_str_radix(&c[1..3], 16).unwrap_or(0),
            u8::from_str_radix(&c[3..5], 16).unwrap_or(0),
            u8::from_str_radix(&c[5..7], 16).unwrap_or(0),
        )
    }
}

impl RenderStrategy for HeatRenderer {
    /// 执行主图层渲染（绘制热图）
    ///
    /// 在 Main 层根据数据计算颜色并绘制热度矩阵。
    /// 不进行任何清理动作，由 ChartRenderer 统一清理 Main 层。
    ///
    /// 返回：
    /// - Ok(()) 正常完成渲染
    /// - Err(RenderError) 当 Canvas 上下文获取失败等
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError> {
        let canvas_ref = ctx.canvas_manager_ref();
        let main_ctx = canvas_ref.get_context(CanvasLayerType::Main)?;
        let layout = ctx.layout_ref();
        let data_manager = ctx.data_manager_ref();
        self.draw(main_ctx, &layout, &data_manager);
        Ok(())
    }

    /// 声明该渲染器支持的渲染模式
    fn supports_mode(&self, mode: RenderMode) -> bool {
        mode == RenderMode::Heatmap
    }
    /// 指定渲染层为 Main 主图层
    fn get_layer_type(&self) -> CanvasLayerType {
        CanvasLayerType::Main
    }

    /// 指定渲染优先级（数值越小优先级越高）
    fn get_priority(&self) -> u32 {
        15
    }
}
