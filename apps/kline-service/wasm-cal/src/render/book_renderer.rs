//! 订单簿可视化渲染器 - 在main层右侧20%宽度区域绘制订单簿深度

use crate::canvas::CanvasLayerType;
use crate::config::ChartTheme;
use crate::data::DataManager;
use crate::layout::{ChartLayout, CoordinateMapper, PaneId, Rect};
use crate::render::chart_renderer::RenderMode;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};
use std::cell::Cell;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

pub struct BookRenderer {
    last_idx: Cell<Option<usize>>,
    last_mode: Cell<Option<RenderMode>>,
    last_visible_range: Cell<Option<(usize, usize)>>,
    cached_bins: RefCell<Option<Vec<f64>>>,
    cached_max_volume: Cell<Option<f64>>,
    cached_hover_index: Cell<Option<usize>>,
    cached_data_hash: Cell<u64>,
}

impl BookRenderer {
    pub fn new() -> Self {
        Self {
            last_idx: Cell::new(None),
            last_mode: Cell::new(None),
            last_visible_range: Cell::new(None),
            cached_bins: RefCell::new(None),
            cached_max_volume: Cell::new(None),
            cached_hover_index: Cell::new(None),
            cached_data_hash: Cell::new(0),
        }
    }

    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        hover_index: Option<usize>,
        _mode: RenderMode,
        theme: &ChartTheme,
    ) {
        let data_manager_ref = data_manager.borrow();
        let items = match data_manager_ref.get_items() {
            Some(items) => items,
            None => return,
        };
        let (visible_start, visible_count, _) = data_manager_ref.get_visible();
        let visible_end = visible_start + visible_count;
        if visible_start >= visible_end {
            return;
        }

        let idx = hover_index.unwrap_or_else(|| visible_end.saturating_sub(1));
        if idx >= items.len() {
            return;
        }

        // 检查是否需要重新计算缓存
        let should_recalculate = {
            let current_hover_changed = self.cached_hover_index.get() != Some(idx);
            let visible_range_changed = self.last_visible_range.get()
                != Some((visible_start, visible_start + visible_count));
            let data_changed = self.last_idx.get() != Some(idx);

            current_hover_changed
                || visible_range_changed
                || data_changed
                || self.cached_bins.borrow().is_none()
        };

        let (bins, max_volume) = if should_recalculate {
            // 重新计算
            let item = items.get(idx);
            let last_price = item.last_price();
            let volumes = match item.volumes() {
                Some(v) => v,
                None => return,
            };

            let (min_low, max_high, _) = data_manager_ref.get_cached_cal();
            let tick = data_manager_ref.get_tick();
            if tick <= 0.0 || min_low >= max_high {
                return;
            }

            let num_bins = ((max_high - min_low) / tick).ceil() as usize;
            if num_bins == 0 {
                return;
            }

            let mut bins = vec![0.0; num_bins];
            let mut max_volume = 0.0f64;
            for i in 0..volumes.len() {
                let pv = volumes.get(i);
                if pv.price() >= min_low && pv.price() < max_high {
                    let bin_idx = ((pv.price() - min_low) / tick).floor() as usize;
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
            self.cached_hover_index.set(Some(idx));
            self.last_visible_range
                .set(Some((visible_start, visible_start + visible_count)));
            self.last_idx.set(Some(idx));

            (bins, max_volume)
        } else {
            // 使用缓存
            let bins = self.cached_bins.borrow().as_ref().unwrap().clone();
            let max_volume = self.cached_max_volume.get().unwrap();
            (bins, max_volume)
        };

        let book_rect = layout.get_rect(&PaneId::OrderBook);
        let price_rect = layout.get_rect(&PaneId::HeatmapArea);
        let (min_low, max_high, _) = data_manager_ref.get_cached_cal();
        let tick = data_manager_ref.get_tick();

        // 使用主图区域的价格映射来确保订单簿与主图对齐
        let y_mapper = CoordinateMapper::new_for_y_axis(price_rect, min_low, max_high, 0.0);

        self.clear_area(ctx, layout);

        // 计算订单簿区域对应的价格范围
        let book_top_price = max_high;
        let book_bottom_price = min_low;

        for (bin_idx, &volume) in bins.iter().enumerate() {
            if volume <= 0.0 {
                continue;
            }

            let price = min_low + bin_idx as f64 * tick;

            // 只绘制在订单簿价格范围内的订单
            if price < book_bottom_price || price > book_top_price {
                continue;
            }

            let item = items.get(idx);
            let last_price = item.last_price();

            // 使用主图的坐标映射获取Y位置，然后转换到订单簿区域
            let y_in_price_chart = y_mapper.map_y(price);

            // 将Y坐标从主图区域转换到订单簿区域
            let price_rect_height = price_rect.height;
            let book_rect_height = book_rect.height;
            let relative_y = (y_in_price_chart - price_rect.y) / price_rect_height;
            let y_in_book = book_rect.y + relative_y * book_rect_height;

            // 计算柱状图高度（保持与主图相同的比例）
            let next_y_in_price_chart = y_mapper.map_y(price + tick);
            let bar_height_in_price = (next_y_in_price_chart - y_in_price_chart).abs();
            let bar_height = (bar_height_in_price / price_rect_height) * book_rect_height;

            // 确保在OrderBook区域内绘制
            let draw_y = y_in_book.max(book_rect.y);
            let draw_height = if draw_y + bar_height > book_rect.y + book_rect.height {
                book_rect.y + book_rect.height - draw_y
            } else {
                bar_height
            };

            if draw_height > 0.0 {
                self.draw_level(
                    ctx,
                    book_rect.x,
                    book_rect.width,
                    draw_height,
                    draw_y,
                    volume,
                    max_volume,
                    price > last_price,
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

    /// 检查价格是否在OrderBook可见区域内
    fn is_price_visible_in_book_area(
        &self,
        price: f64,
        book_rect: &Rect,
        price_rect: &Rect,
        min_low: f64,
        max_high: f64,
    ) -> bool {
        // 计算价格在主图中的相对位置（0-1）
        let relative_pos = if max_high > min_low {
            ((price - min_low) / (max_high - min_low)).clamp(0.0, 1.0)
        } else {
            0.5
        };

        // 映射到OrderBook区域的Y坐标
        let y_in_book = book_rect.y + relative_pos * book_rect.height;

        // 检查是否在OrderBook区域内
        y_in_book >= book_rect.y && y_in_book <= book_rect.y + book_rect.height
    }

    pub fn reset_cache(&self) {
        self.last_idx.set(None);
        self.last_mode.set(None);
        self.last_visible_range.set(None);
        self.cached_bins.borrow_mut().take();
        self.cached_max_volume.set(None);
        self.cached_hover_index.set(None);
        self.cached_data_hash.set(0);
    }
}

impl RenderStrategy for BookRenderer {
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError> {
        let canvas_ref = ctx.canvas_manager().borrow();
        let main_ctx = canvas_ref.get_context(CanvasLayerType::Main);
        let layout_ref = ctx.layout().borrow();
        self.draw(
            main_ctx,
            &layout_ref,
            ctx.data_manager(),
            ctx.hover_index,
            ctx.mode,
            ctx.theme(),
        );
        Ok(())
    }

    fn supports_mode(&self, _mode: RenderMode) -> bool {
        true
    }

    fn get_layer_type(&self) -> CanvasLayerType {
        CanvasLayerType::Main
    }

    fn get_priority(&self) -> u32 {
        30
    }
}
