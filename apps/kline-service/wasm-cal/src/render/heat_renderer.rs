//! 热图渲染器 - 专门负责绘制类似Bookmap的热度图

use crate::canvas::CanvasLayerType;
use crate::data::{DataManager, KlineItemOwned};
use crate::layout::{ChartLayout, CoordinateMapper, PaneId, Rect};
use crate::render::chart_renderer::RenderMode;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};
use crate::utils::{calculate_optimal_tick, error::WasmCalError};
use std::arch::wasm32::*; // 引入WASM SIMD指令集
use std::cell::RefCell;
use web_sys::OffscreenCanvasRenderingContext2d;

// 热图渲染器常量
const MAX_BINS: usize = 512; // 最大支持的 bin 数量

/// 热图缓存键，用于判断缓存是否有效
#[derive(Debug, PartialEq, Clone)]
struct HeatmapCacheKey {
    visible_start: usize,
    visible_end: usize,
    min_low: u64,       // 使用整数避免浮点误差
    max_high: u64,      // 使用整数避免浮点误差
    adjusted_tick: u64, // 使用整数避免浮点误差
    num_bins: usize,
}

impl HeatmapCacheKey {
    fn new(
        visible_start: usize,
        visible_end: usize,
        min_low: f64,
        max_high: f64,
        adjusted_tick: f64,
        num_bins: usize,
    ) -> Self {
        Self {
            visible_start,
            visible_end,
            min_low: (min_low * 1_000_000.0) as u64,
            max_high: (max_high * 1_000_000.0) as u64,
            adjusted_tick: (adjusted_tick * 1_000_000.0) as u64,
            num_bins,
        }
    }
}

/// 热图缓存数据 - 使用连续内存布局
#[derive(Debug, Clone)]
struct HeatmapCacheData {
    buffer: HeatmapBuffer,
    global_max_bin: f64,
}

/// 连续内存布局的热图缓冲区
#[derive(Debug, Clone)]
struct HeatmapBuffer {
    data: Vec<f64>,
    dimensions: (usize, usize), // (num_items, num_bins)
}

impl HeatmapBuffer {
    fn new(num_items: usize, num_bins: usize) -> Result<Self, WasmCalError> {
        if num_items == 0 || num_bins == 0 {
            return Ok(Self {
                data: Vec::new(),
                dimensions: (0, 0),
            });
        }
        let total_size = num_items
            .checked_mul(num_bins)
            .ok_or_else(|| WasmCalError::buffer("Dimension multiplication overflow"))?;
        Ok(Self {
            data: vec![0.0; total_size],
            dimensions: (num_items, num_bins),
        })
    }

    fn get_item_bins(&self, item_idx: usize) -> Result<&[f64], WasmCalError> {
        if item_idx >= self.dimensions.0 {
            return Err(WasmCalError::buffer(format!(
                "Item index {} out of bounds, max items: {}",
                item_idx, self.dimensions.0
            )));
        }
        let start = item_idx * self.dimensions.1;
        let end = start + self.dimensions.1;
        Ok(&self.data[start..end])
    }

    fn num_items(&self) -> usize {
        self.dimensions.0
    }
}

/// 热图渲染器
pub struct HeatRenderer {
    color_cache: Vec<String>,
    cache_key: RefCell<Option<HeatmapCacheKey>>,
    cache_data: RefCell<Option<HeatmapCacheData>>,
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
        Self {
            color_cache,
            cache_key: RefCell::new(None),
            cache_data: RefCell::new(None),
        }
    }

    /// 主绘制函数，包含动态调度逻辑
    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &DataManager,
    ) -> Result<(), WasmCalError> {
        let (visible_start, _visible_count, visible_end) = data_manager.get_visible();

        if visible_start >= visible_end {
            return Ok(());
        }

        let (min_low, max_high) = data_manager.get_full_data_range();
        let base_tick = data_manager.get_tick();

        let price_rect = layout.get_rect(&PaneId::HeatmapArea);
        let adjusted_tick = calculate_optimal_tick(base_tick, min_low, max_high, price_rect.height);

        if adjusted_tick <= 0.0 || min_low >= max_high {
            return Ok(());
        }

        let num_bins = ((max_high - min_low) / adjusted_tick).ceil() as usize;
        if num_bins == 0 {
            return Ok(());
        }

        let new_cache_key = HeatmapCacheKey::new(
            visible_start,
            visible_end,
            min_low,
            max_high,
            adjusted_tick,
            num_bins,
        );

        let is_cache_valid = self.cache_key.borrow().as_ref() == Some(&new_cache_key);

        if !is_cache_valid {
            const SIMD_THRESHOLD: usize = 64;

            let owned_kline_items: Vec<KlineItemOwned> = (visible_start..visible_end)
                .filter_map(|idx| data_manager.get(idx))
                .map(|item_ref| KlineItemOwned::from(&item_ref))
                .collect();

            let (recalculated_buffer, recalculated_max) =
                if owned_kline_items.len() > SIMD_THRESHOLD {
                    unsafe {
                        self.calculate_heatmap_with_simd(
                            &owned_kline_items,
                            min_low,
                            max_high,
                            adjusted_tick,
                            num_bins,
                        )?
                    }
                } else {
                    self.calculate_heatmap_sequential(
                        &owned_kline_items,
                        min_low,
                        max_high,
                        adjusted_tick,
                        num_bins,
                    )?
                };

            *self.cache_key.borrow_mut() = Some(new_cache_key);
            *self.cache_data.borrow_mut() = Some(HeatmapCacheData {
                buffer: recalculated_buffer,
                global_max_bin: recalculated_max,
            });
        }

        let cache_guard = self.cache_data.borrow();
        if let Some(cached_data) = &*cache_guard {
            if cached_data.global_max_bin <= 0.0 {
                return Ok(());
            }

            let y_mapper = CoordinateMapper::new_for_y_axis(price_rect, min_low, max_high, 0.0);
            Self::draw_batched_rectangles(
                ctx,
                layout,
                &cached_data.buffer,
                &price_rect,
                min_low,
                max_high,
                adjusted_tick,
                &y_mapper,
                &self.color_cache,
                cached_data.global_max_bin,
            )?
        }

        Ok(())
    }

    /// 使用 SIMD 加速的串行计算函数 - 高级优化版本
    ///
    /// 使用现代 SIMD 指令、优化的内存访问模式和完整的错误处理
    /// 符合 Rust 1.88.0 的最佳实践标准
    #[target_feature(enable = "simd128")]
    unsafe fn calculate_heatmap_with_simd(
        &self,
        items: &[KlineItemOwned],
        min_low: f64,
        max_high: f64,
        adjusted_tick: f64,
        num_bins: usize,
    ) -> Result<(HeatmapBuffer, f64), WasmCalError> {
        // 输入验证
        if num_bins == 0 {
            return Err(WasmCalError::buffer("Number of bins cannot be zero"));
        }
        if num_bins > MAX_BINS {
            return Err(WasmCalError::buffer(format!(
                "Number of bins ({}) exceeds maximum supported ({})",
                num_bins, MAX_BINS
            )));
        }
        if min_low >= max_high {
            return Err(WasmCalError::buffer(
                "Invalid price range: min_low >= max_high",
            ));
        }
        if adjusted_tick <= 0.0 {
            return Err(WasmCalError::buffer("Adjusted tick must be positive"));
        }

        let num_items = items.len();
        let mut buffer = HeatmapBuffer::new(num_items, num_bins)?;
        let mut global_max = 0.0f64;

        // 预计算常量 - 避免在循环中重复计算
        let inv_tick = 1.0 / adjusted_tick;
        let simd_min_low = f64x2_splat(min_low);
        let simd_inv_tick = f64x2_splat(inv_tick);

        // 为每个项目处理
        for (rel_idx, item) in items.iter().enumerate() {
            if !item.volumes.is_empty() {
                // 使用栈分配的数组而不是 Vec 来避免堆分配
                let mut local_bins = [0.0; MAX_BINS];
                let local_bins_slice = &mut local_bins[..num_bins];
                let mut local_max: f64 = 0.0;

                // 收集所有价格-成交量对，避免多次迭代
                let pvs: Vec<_> = item.volumes.iter().collect();

                // 处理 SIMD 可向量化的部分 (2个元素一组)
                let mut chunks = pvs.chunks_exact(2);
                for chunk in chunks.by_ref() {
                    let price1 = chunk[0].price;
                    let price2 = chunk[1].price;

                    // 边界检查前置，避免无效的 SIMD 操作
                    // 使用短路评估优化边界检查
                    if !(price1 >= min_low
                        && price1 < max_high
                        && price2 >= min_low
                        && price2 < max_high)
                    {
                        continue;
                    }

                    // 使用 SIMD 计算 bin 索引
                    let prices = f64x2(price1, price2);
                    let relative_prices = f64x2_sub(prices, simd_min_low);
                    let scaled = f64x2_mul(relative_prices, simd_inv_tick);
                    let bin_indices_f = f64x2_floor(scaled);

                    // 提取索引并进行边界检查
                    let bin_idx1 = f64x2_extract_lane::<0>(bin_indices_f) as usize;
                    let bin_idx2 = f64x2_extract_lane::<1>(bin_indices_f) as usize;

                    // 安全地更新 bin 值 - 使用直接访问避免 bounds check
                    if bin_idx1 < num_bins {
                        // 使用 unsafe 块避免边界检查（因为我们已经检查过了）
                        unsafe {
                            *local_bins_slice.get_unchecked_mut(bin_idx1) += chunk[0].volume;
                            local_max = local_max.max(*local_bins_slice.get_unchecked(bin_idx1));
                        }
                    }
                    if bin_idx2 < num_bins {
                        unsafe {
                            *local_bins_slice.get_unchecked_mut(bin_idx2) += chunk[1].volume;
                            local_max = local_max.max(*local_bins_slice.get_unchecked(bin_idx2));
                        }
                    }
                }

                // 处理剩余元素
                for pv in chunks.remainder() {
                    let price = pv.price;
                    if price >= min_low && price < max_high {
                        let bin_idx = ((price - min_low) * inv_tick).floor() as usize;
                        if bin_idx < num_bins {
                            // 使用 unsafe 块避免边界检查
                            unsafe {
                                *local_bins_slice.get_unchecked_mut(bin_idx) += pv.volume;
                                local_max = local_max.max(*local_bins_slice.get_unchecked(bin_idx));
                            }
                        }
                    }
                }

                // 批量复制到输出缓冲区
                let dest_start = rel_idx * num_bins;
                let dest_end = dest_start + num_bins;

                // 确保目标范围有效
                if dest_end > buffer.data.len() {
                    return Err(WasmCalError::buffer("Destination range out of bounds"));
                }

                buffer.data[dest_start..dest_end].copy_from_slice(local_bins_slice);
                global_max = global_max.max(local_max);
            }
        }
        Ok((buffer, global_max))
    }

    /// 顺序计算热图数据
    fn calculate_heatmap_sequential(
        &self,
        items: &[KlineItemOwned],
        min_low: f64,
        max_high: f64,
        adjusted_tick: f64,
        num_bins: usize,
    ) -> Result<(HeatmapBuffer, f64), WasmCalError> {
        let num_items = items.len();
        let mut buffer = HeatmapBuffer::new(num_items, num_bins)?;
        let mut global_max = 0.0f64;

        for (rel_idx, item) in items.iter().enumerate() {
            let mut local_max: f64 = 0.0;
            if !item.volumes.is_empty() {
                let mut local_bins = vec![0.0; num_bins];
                for pv in &item.volumes {
                    if pv.price >= min_low && pv.price < max_high {
                        let bin_idx = ((pv.price - min_low) / adjusted_tick).floor() as usize;
                        if bin_idx < num_bins {
                            local_bins[bin_idx] += pv.volume;
                            local_max = local_max.max(local_bins[bin_idx]);
                        }
                    }
                }
                buffer.data[rel_idx * num_bins..(rel_idx + 1) * num_bins]
                    .copy_from_slice(&local_bins);
            }
            global_max = global_max.max(local_max);
        }
        Ok((buffer, global_max))
    }

    /// 批量绘制实现
    fn draw_batched_rectangles(
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        buffer: &HeatmapBuffer,
        price_rect: &Rect,
        min_low: f64,
        max_high: f64,
        adjusted_tick: f64,
        y_mapper: &CoordinateMapper,
        color_cache: &[String],
        global_max: f64,
    ) -> Result<(), WasmCalError> {
        if global_max <= 0.0 {
            return Ok(());
        }
        let global_max_ln = (global_max + 1.0).ln();
        ctx.set_global_alpha(1.0);
        let candle_width = layout.total_candle_width;
        let x_base = price_rect.x;

        for rel_idx in 0..buffer.num_items() {
            let x = x_base + rel_idx as f64 * candle_width;
            let bins = buffer.get_item_bins(rel_idx)?;
            let mut current_color_index: Option<usize> = None;

            for (bin_idx, &volume) in bins.iter().enumerate() {
                if volume <= 0.0 {
                    continue;
                }
                let norm = (volume + 1.0).ln() / global_max_ln;
                if norm < 0.05 {
                    continue;
                }
                let price_low = min_low + bin_idx as f64 * adjusted_tick;
                let price_high = price_low + adjusted_tick;
                if price_low < min_low || price_high > max_high {
                    continue;
                }
                let y_top = y_mapper.map_y(price_high);
                let y_bottom = y_mapper.map_y(price_low);
                let height = (y_bottom - y_top).max(1.0);

                if height > 0.0 {
                    let color_index = (norm.clamp(0.0, 1.0) * 99.0).round() as usize;
                    if color_index < color_cache.len() {
                        if current_color_index != Some(color_index) {
                            ctx.set_fill_style_str(&color_cache[color_index]);
                            current_color_index = Some(color_index);
                        }
                        ctx.fill_rect(x, y_top, candle_width, height);
                    }
                }
            }
        }
        Ok(())
    }

    pub fn invalidate_cache(&self) {
        *self.cache_key.borrow_mut() = None;
        *self.cache_data.borrow_mut() = None;
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
