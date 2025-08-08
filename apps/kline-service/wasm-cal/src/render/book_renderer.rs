//! 订单簿可视化渲染器 - 在main层右侧20%宽度区域绘制订单簿深度

use crate::canvas::CanvasLayerType;
use crate::config::ChartTheme;
use crate::data::DataManager;
use crate::layout::{ChartLayout, CoordinateMapper, PaneId};
use crate::render::chart_renderer::RenderMode;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};
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
        let (visible_start, visible_count, _) = data_manager.get_visible();
        let visible_end = visible_start + visible_count;
        if visible_start >= visible_end {
            return;
        }

        let idx = hover_index.unwrap_or_else(|| visible_end.saturating_sub(1));
        if idx >= data_manager.len() {
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

            let (min_low, max_high, _) = data_manager.get_cached_cal();
            let tick = data_manager.get_tick();
            if tick <= 0.0 || min_low >= max_high {
                return;
            }

            let num_bins = ((max_high - min_low) / tick).ceil() as usize;
            if num_bins == 0 {
                return;
            }

            let mut bins = vec![0.0; num_bins];
            let mut max_volume = 0.0f64;
            for pv in volumes {
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

        let book_rect = layout.get_rect(&PaneId::OrderBook);
        let price_rect = layout.get_rect(&PaneId::HeatmapArea);
        let (min_low, max_high, _) = data_manager.get_cached_cal();
        let tick = data_manager.get_tick();

        let y_mapper = CoordinateMapper::new_for_y_axis(price_rect, min_low, max_high, 0.0);

        self.clear_area(ctx, layout);

        let book_top_price = max_high;
        let book_bottom_price = min_low;

        for (bin_idx, &volume) in bins.iter().enumerate() {
            if volume <= 0.0 {
                continue;
            }

            let price = min_low + bin_idx as f64 * tick;

            if price < book_bottom_price || price > book_top_price {
                continue;
            }

            let item = match data_manager.get(idx) {
                Some(item) => item,
                None => return,
            };
            let last_price = item.last_price();

            let y_in_price_chart = y_mapper.map_y(price);
            let price_rect_height = price_rect.height;
            let book_rect_height = book_rect.height;
            let relative_y = (y_in_price_chart - price_rect.y) / price_rect_height;
            let y_in_book = book_rect.y + relative_y * book_rect_height;

            let next_y_in_price_chart = y_mapper.map_y(price + tick);
            let bar_height_in_price = (next_y_in_price_chart - y_in_price_chart).abs();
            let bar_height = (bar_height_in_price / price_rect_height) * book_rect_height;

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
}

impl RenderStrategy for BookRenderer {
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError> {
        let canvas_manager = ctx.canvas_manager_ref();
        let main_ctx = canvas_manager.get_context(CanvasLayerType::Main);
        let layout = ctx.layout_ref();
        let data_manager = ctx.data_manager_ref();
        let theme = ctx.theme_ref();

        self.draw(main_ctx, &layout, &data_manager, ctx.hover_index(), theme);
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
