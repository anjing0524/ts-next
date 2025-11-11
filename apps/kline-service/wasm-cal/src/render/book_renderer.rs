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
        let idx = match hover_index {
            Some(idx) if idx < data_manager.len() => idx,
            _ => return,
        };

        let (visible_start, visible_count, _) = data_manager.get_visible();
        let book_rect = layout.get_rect(&PaneId::OrderBook);
        let price_rect = layout.get_rect(&PaneId::HeatmapArea);
        let (min_low, max_high) = data_manager.get_full_data_range();
        let base_tick = data_manager.get_tick();
        let adjusted_tick = calculate_optimal_tick(base_tick, min_low, max_high, price_rect.height);

        if adjusted_tick <= 0.0 || min_low >= max_high {
            return;
        }

        let needs_recalculation = {
            self.cached_hover_index.get() != hover_index
                || self.last_visible_range.get()
                    != Some((visible_start, visible_start + visible_count))
                || self.last_idx.get() != Some(idx)
                || self.cached_bins.borrow().is_none()
        };

        if needs_recalculation {
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

            if max_volume > 0.0 {
                *self.cached_bins.borrow_mut() = Some(bins);
                self.cached_max_volume.set(Some(max_volume));
            } else {
                *self.cached_bins.borrow_mut() = None;
                self.cached_max_volume.set(None);
            }

            self.cached_hover_index.set(hover_index);
            self.last_visible_range
                .set(Some((visible_start, visible_start + visible_count)));
            self.last_idx.set(Some(idx));
        }

        let bins_guard = self.cached_bins.borrow();
        if let (Some(bins), Some(max_volume)) = (bins_guard.as_ref(), self.cached_max_volume.get())
        {
            if max_volume <= 0.0 {
                return;
            }

            let y_mapper = CoordinateMapper::new_for_y_axis(book_rect, min_low, max_high, 0.0);
            self.clear_area(ctx, layout);

            let item = match data_manager.get(idx) {
                Some(item) => item,
                None => return,
            };
            let last_price = item.last_price();

            for (bin_idx, &volume) in bins.iter().enumerate() {
                if volume <= 0.0 {
                    continue;
                }

                let price_low = min_low + bin_idx as f64 * adjusted_tick;
                let price_high = price_low + adjusted_tick;

                if price_low < min_low || price_high > max_high {
                    continue;
                }

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
        ctx.fill_rect(x, y, bar_width, h);

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

        let last_hover_index = ctx.shared.mouse_state.borrow().last_hover_index;
        let hover_index = ctx.hover_index().or(last_hover_index); // Fallback

        self.draw(main_ctx, &layout, &data_manager, hover_index, theme);
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
