//! 热图渲染器 - 专门负责绘制类似Bookmap的热度图

use crate::{
    canvas::{CanvasLayerType, CanvasManager}, // Added
    data::DataManager,
    layout::ChartLayout,
    render::{chart_renderer::RenderMode, traits::ComprehensiveRenderer}, // Added
};
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d; // Ensure this is present

/// 热图渲染器
pub struct HeatRenderer {
    // 缓存颜色插值结果，避免重复计算
    color_cache: Vec<String>,
}

impl Default for HeatRenderer {
    fn default() -> Self {
        Self::new()
    }
}

impl HeatRenderer {
    /// 创建新的热图渲染器
    pub fn new() -> Self {
        // ... (new method remains unchanged)
        // 预计算100个颜色值，对应0.0-1.0的归一化值
        let mut color_cache = Vec::with_capacity(100);
        for i in 0..100 {
            let norm = i as f64 / 99.0;
            color_cache.push(Self::calculate_heat_color_static(norm));
        }

        Self { color_cache }
    }

    /// 绘制热图 - 按 tick 区间绘制色块
    // Ensure this draw method is the one being called by render_component
    // and its signature matches: ctx, layout, data_manager
    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d, // Signature for draw
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        // mode: RenderMode, // Optional: if HeatRenderer's draw needs mode
    ) {
        // ... (draw method logic remains unchanged)
        let data_manager_ref = data_manager.borrow();
        let items = match data_manager_ref.get_items() {
            Some(items) => items,
            None => return,
        };

        let visible_range = data_manager_ref.get_visible_range();
        // Corrected to use get_range() for consistency if get_visible() has issues
        let (visible_start, _visible_count, visible_end) = visible_range.get_range(); 
        if visible_start >= visible_end {
            return;
        }

        let (min_low, max_high, _) = data_manager_ref.get_cached_cal();
        let tick = data_manager_ref.get_tick();
        if tick <= 0.0 || min_low >= max_high {
            return;
        }
        let num_bins = ((max_high - min_low) / tick).ceil() as usize;
        if num_bins == 0 {
            return;
        }

        // 计算所有可见K线的X坐标
        let x_coordinates = visible_range.precompute_x_coordinates(layout);
        let half_width = layout.total_candle_width / 2.0;
        let x_width = layout.total_candle_width;

        // 先找全局最大tick区间成交量（用于归一化）
        let mut global_max_bin = 0.0;
        let mut all_bins: Vec<Vec<f64>> = Vec::with_capacity(visible_end - visible_start);

        // 预分配bin数组，避免重复分配
        for global_idx in visible_start..visible_end {
            if global_idx >= items.len() {
                break;
            }
            let item = items.get(global_idx);
            let mut bins = vec![0.0; num_bins];
            if let Some(volumes) = item.volumes() {
                for i in 0..volumes.len() {
                    let price_volume = volumes.get(i);
                    let price = price_volume.price();
                    let volume = price_volume.volume();
                    if price < min_low || price >= max_high {
                        continue;
                    }
                    let bin_idx = ((price - min_low) / tick).floor() as usize;
                    if bin_idx < bins.len() {
                        bins[bin_idx] += volume;
                        if bins[bin_idx] > global_max_bin {
                            global_max_bin = bins[bin_idx];
                        }
                    }
                }
            }
            all_bins.push(bins);
        }

        if global_max_bin <= 0.0 {
            return;
        }

        // 计算全局最大值的对数，避免在循环中重复计算
        let global_max_bin_ln = (global_max_bin + 1.0).ln();
        let min_heat_threshold = 0.001; // 最小热度阈值，调低以显示更多小 volume

        // 绘制每根K线的tick区间色块
        for (rel_idx, bins) in all_bins.iter().enumerate() {
            if rel_idx >= x_coordinates.len() {
                break;
            }
            let x_center = x_coordinates[rel_idx];
            let x_left = x_center - half_width;

            for (bin_idx, &volume) in bins.iter().enumerate() {
                if volume <= 0.0 {
                    continue;
                }

                let price_low = min_low + bin_idx as f64 * tick;
                let price_high = price_low + tick;
                let y_high = layout.map_price_to_y(price_high, min_low, max_high);
                let y_low = layout.map_price_to_y(price_low, min_low, max_high);
                let rect_y = y_high.min(y_low);
                let rect_height = (y_low - y_high).abs();

                // 使用对数归一化（加1防止小volume不可见）
                let norm = (volume + 1.0).ln() / global_max_bin_ln;
                if norm < min_heat_threshold {
                    continue; // 跳过极小热度
                }

                let color = self.get_cached_color(norm);

                // 只用透明度渐变，最低0.25，线性变化
                let alpha = 0.25 + 0.75 * norm;

                ctx.set_global_alpha(alpha);
                ctx.set_fill_style_str(&color);
                ctx.fill_rect(x_left, rect_y, x_width - 1.0, rect_height - 1.0);
                ctx.set_global_alpha(1.0); // 恢复
            }
        }
    }

    // ... (other helper methods like get_cached_color, calculate_heat_color_static, etc. remain unchanged)
    /// 从缓存获取颜色，如果缓存中没有则计算
    fn get_cached_color(&self, norm: f64) -> String {
        let norm = norm.clamp(0.0, 1.0);
        let index = (norm * 99.0).round() as usize;
        if index < self.color_cache.len() {
            self.color_cache[index].clone()
        } else {
            Self::calculate_heat_color_static(norm)
        }
    }

    /// 基于成交量计算热度颜色 (静态方法，用于初始化缓存)
    /// 使用更接近Bookmap的配色方案
    fn calculate_heat_color_static(norm: f64) -> String {
        let norm = norm.clamp(0.0, 1.0);
        // 更平滑的色带节点，参考Bookmap
        let color_stops = [
            (0.0, "#f0f9e8"),  // 极淡绿
            (0.15, "#ccebc5"), // 淡绿
            (0.35, "#a8ddb5"), // 浅绿
            (0.55, "#7bccc4"), // 青绿
            (0.75, "#43a2ca"), // 蓝绿
            (0.90, "#0868ac"), // 深蓝
            (0.94, "#fff600"), // 明亮黄
            (0.97, "#ff9900"), // 鲜橙
            (0.99, "#ff6a00"), // 深橙
            (1.0, "#ff0000"),  // 鲜红
        ];
        // 找到norm所在的区间
        for i in 0..color_stops.len() - 1 {
            let (start, color1) = color_stops[i];
            let (end, color2) = color_stops[i + 1];
            if norm >= start && norm <= end {
                let t = (norm - start) / (end - start);
                return Self::interpolate_color_static(color1, color2, t);
            }
        }
        // 超出范围默认红色
        "#ff0000".to_string()
    }

    /// 颜色插值 (静态方法)
    fn interpolate_color_static(color1: &str, color2: &str, ratio: f64) -> String {
        // 解析颜色
        let (r1, g1, b1) = Self::parse_rgb_static(color1);
        let (r2, g2, b2) = Self::parse_rgb_static(color2);

        // 线性插值
        let r = Self::lerp_static(r1, r2, ratio) as u8;
        let g = Self::lerp_static(g1, g2, ratio) as u8;
        let b = Self::lerp_static(b1, b2, ratio) as u8;

        format!("rgb({}, {}, {})", r, g, b)
    }

    /// 解析RGB颜色 (静态方法)
    fn parse_rgb_static(color: &str) -> (u8, u8, u8) {
        if color.starts_with("#") && color.len() == 7 {
            // 十六进制颜色格式 #RRGGBB
            let r = u8::from_str_radix(&color[1..3], 16).unwrap_or(0);
            let g = u8::from_str_radix(&color[3..5], 16).unwrap_or(0);
            let b = u8::from_str_radix(&color[5..7], 16).unwrap_or(0);
            (r, g, b)
        } else {
            // 默认为黑色
            (0, 0, 0)
        }
    }

    /// 线性插值 (静态方法)
    fn lerp_static(a: u8, b: u8, t: f64) -> f64 {
        a as f64 * (1.0 - t) + b as f64 * t
    }
}

impl ComprehensiveRenderer for HeatRenderer {
    fn render_component(
        &self,
        canvas_manager: &CanvasManager,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        _mode: RenderMode, // _mode is unused by current HeatRenderer::draw
    ) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Main);
        self.draw(ctx, layout, data_manager /*, mode */); // Pass mode if draw is updated
    }
}
