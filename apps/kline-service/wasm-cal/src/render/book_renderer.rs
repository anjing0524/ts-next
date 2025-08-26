//! 订单簿可视化渲染器 - 在main层右侧20%宽度区域绘制订单簿深度

use crate::canvas::CanvasLayerType;
use crate::config::ChartTheme;
use crate::data::DataManager;
use crate::layout::{ChartLayout, CoordinateMapper, PaneId};
use crate::render::chart_renderer::RenderMode;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};
use crate::utils::calculate_optimal_tick;
use std::cell::Cell;
use std::cell::RefCell;
use web_sys::OffscreenCanvasRenderingContext2d;

pub struct BookRenderer {
    last_idx: Cell<Option<usize>>,
    last_visible_range: Cell<Option<(usize, usize)>>,
    cached_bins: RefCell<Option<Vec<f64>>>,
    cached_max_volume: Cell<Option<f64>>,
    cached_hover_index: Cell<Option<usize>>,
}

impl Default for BookRenderer {
    fn default() -> Self {
        Self::new()
    }
}

impl BookRenderer {
    pub fn new() -> Self {
        Self {
            last_idx: Cell::new(None),
            last_visible_range: Cell::new(None),
            cached_bins: RefCell::new(None),
            cached_max_volume: Cell::new(None),
            cached_hover_index: Cell::new(None),
        }
    }

    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &DataManager,
        hover_index: Option<usize>,
        theme: &ChartTheme,
    ) {
        let data_manager = &data_manager;
        // 只有当有hover_index时才显示订单簿，确保与工具提示框一致
        let idx = match hover_index {
            Some(idx) => idx,
            None => return, // 没有hover_index时不显示订单簿
        };

        if idx >= data_manager.len() {
            return;
        }

        // 获取可见范围信息用于缓存检查
        let (visible_start, visible_count, _) = data_manager.get_visible();

        // 先获取布局信息和 tick 计算，这样缓存计算和渲染都使用相同的参数
        // 使用与工具提示框相同的可见范围数据，确保数据一致性
        let book_rect = layout.get_rect(&PaneId::OrderBook);
        let (min_low, max_high, _) = data_manager.get_cached_cal();
        let base_tick = data_manager.get_tick();
        let adjusted_tick = calculate_optimal_tick(base_tick, min_low, max_high, book_rect.height);

        if adjusted_tick <= 0.0 || min_low >= max_high {
            return;
        }

        // 检查是否需要重新计算缓存
        let needs_recalculation = {
            let hover_changed = self.cached_hover_index.get() != hover_index;
            let visible_range_changed = self.last_visible_range.get()
                != Some((visible_start, visible_start + visible_count));
            let data_changed = self.last_idx.get() != Some(idx);

            hover_changed
                || visible_range_changed
                || data_changed
                || self.cached_bins.borrow().is_none()
        };

        let (bins, max_volume) = if needs_recalculation {
            // 重新计算
            let item = match data_manager.get(idx) {
                Some(item) => item,
                None => return,
            };
            let volumes = match item.volumes() {
                Some(v) => v,
                None => return,
            };

            let num_bins = ((max_high - min_low) / adjusted_tick).ceil() as usize;
            if num_bins == 0 {
                return;
            }

            let mut bins = vec![0.0; num_bins];
            let mut max_volume = 0.0f64;
            for pv in volumes {
                if pv.price() >= min_low && pv.price() < max_high {
                    let bin_idx = ((pv.price() - min_low) / adjusted_tick).floor() as usize;
                    if bin_idx < num_bins {
                        bins[bin_idx] += pv.volume();
                        max_volume = max_volume.max(bins[bin_idx]);
                    }
                }
            }

            if max_volume <= 0.0 {
                return;
            }

            // 更新缓存
            *self.cached_bins.borrow_mut() = Some(bins.clone());
            self.cached_max_volume.set(Some(max_volume));
            self.cached_hover_index.set(hover_index);
            self.last_visible_range
                .set(Some((visible_start, visible_start + visible_count)));
            self.last_idx.set(Some(idx));

            (bins, max_volume)
        } else {
            // 尝试从缓存安全地获取数据
            let cached_bins_ref = self.cached_bins.borrow();
            if let (Some(bins), Some(max_volume)) =
                (cached_bins_ref.as_ref(), self.cached_max_volume.get())
            {
                (bins.clone(), max_volume)
            } else {
                // 如果缓存无效，则不进行渲染
                return;
            }
        };

        let y_mapper = CoordinateMapper::new_for_y_axis(book_rect, min_low, max_high, 0.0);

        self.clear_area(ctx, layout);

        for (bin_idx, &volume) in bins.iter().enumerate() {
            if volume <= 0.0 {
                continue;
            }

            let price_low = min_low + bin_idx as f64 * adjusted_tick;
            let price_high = price_low + adjusted_tick;

            if price_low < min_low || price_high > max_high {
                continue;
            }

            let item = match data_manager.get(idx) {
                Some(item) => item,
                None => return,
            };
            let last_price = item.last_price();

            let y_top = y_mapper.map_y(price_high);
            let y_bottom = y_mapper.map_y(price_low);
            let bar_height = (y_bottom - y_top).max(1.0);

            if bar_height > 0.0 {
                self.draw_level(
                    ctx,
                    book_rect.x,
                    book_rect.width,
                    bar_height,
                    y_top,
                    volume,
                    max_volume,
                    (price_low + price_high) / 2.0 >= last_price,
                    theme,
                );
            }
        }
    }

    fn draw_level(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        x: f64,
        w: f64,
        h: f64,
        y: f64,
        vol: f64,
        max_vol: f64,
        is_ask: bool,
        theme: &ChartTheme,
    ) {
        let norm = (vol / max_vol).min(1.0);
        let bar_width = (w - 40.0) * norm;
        ctx.set_fill_style_str(if is_ask {
            &theme.bearish
        } else {
            &theme.bullish
        });
        ctx.fill_rect(x, y, bar_width, h - 1.0);

        if vol > 0.0 {
            ctx.set_fill_style_str(&theme.text);
            ctx.set_font(&theme.font_legend);
            ctx.set_text_align("left");
            ctx.set_text_baseline("middle");
            ctx.fill_text(&format!("{}", vol as u64), x + bar_width + 4.0, y + h / 2.0)
                .ok();
        }
    }

    pub fn clear_area(&self, ctx: &OffscreenCanvasRenderingContext2d, layout: &ChartLayout) {
        let rect = layout.get_rect(&PaneId::OrderBook);
        ctx.clear_rect(rect.x, rect.y, rect.width, rect.height);
    }
}

impl RenderStrategy for BookRenderer {
    /// 执行订单簿渲染
    ///
    /// 参数：
    /// - ctx: 统一渲染上下文，提供 Canvas、主题、布局与数据访问
    ///
    /// 返回：
    /// - Ok(()) 正常完成渲染
    /// - Err(RenderError) 当 Canvas 上下文获取失败或其他渲染错误
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError> {
        let canvas_manager = ctx.canvas_manager_ref();
        let main_ctx = canvas_manager.get_context(CanvasLayerType::Main)?;
        let layout = ctx.layout_ref();
        let data_manager = ctx.data_manager_ref();
        let theme = ctx.theme_ref();

        self.draw(main_ctx, &layout, &data_manager, ctx.hover_index(), theme);
        Ok(())
    }

    /// 声明该渲染器支持的渲染模式
    fn supports_mode(&self, _mode: RenderMode) -> bool {
        true
    }

    /// 指定渲染层为主图层
    fn get_layer_type(&self) -> CanvasLayerType {
        CanvasLayerType::Main
    }

    /// 指定渲染优先级（数值越小优先级越高）
    fn get_priority(&self) -> u32 {
        30
    }
}
