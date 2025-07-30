//! 线图渲染器 - 负责绘制最新价、买一价、卖一价曲线

use crate::canvas::CanvasLayerType;
use crate::config::ChartTheme;
use crate::data::DataManager;
use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartLayout, CoordinateMapper, PaneId};
use crate::render::chart_renderer::RenderMode;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};
use flatbuffers;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

#[derive(Default)]
pub struct LineRenderer {
    show_last_price: bool,
    show_bid_price: bool,
    show_ask_price: bool,
}

impl LineRenderer {
    pub fn new() -> Self {
        Self {
            show_last_price: true,
            show_bid_price: true,
            show_ask_price: true,
        }
    }

    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        theme: &ChartTheme,
    ) {
        let data_manager_ref = data_manager.borrow();
        let (visible_start, visible_count, _) = data_manager_ref.get_visible();
        let (min_low, max_high, _) = data_manager_ref.get_cached_cal();
        let items = match data_manager_ref.get_items() {
            Some(items) => items,
            None => return,
        };

        if visible_start >= items.len() || visible_count == 0 {
            return;
        }
        let visible_end = (visible_start + visible_count).min(items.len());

        ctx.set_image_smoothing_enabled(true);

        let price_rect = layout.get_rect(&PaneId::HeatmapArea);
        let y_mapper = CoordinateMapper::new_for_y_axis(price_rect, min_low, max_high, 8.0);

        if self.show_last_price {
            self.draw_price_line(
                ctx,
                layout,
                &items,
                visible_start,
                visible_end,
                &y_mapper,
                |item| item.last_price(),
                &theme.last_price_line,
                2.0,
                false,
            );
        }
        if self.show_bid_price {
            self.draw_price_line(
                ctx,
                layout,
                &items,
                visible_start,
                visible_end,
                &y_mapper,
                |item| item.bid_price(),
                &theme.bid_price_line,
                1.0,
                true,
            );
        }
        if self.show_ask_price {
            self.draw_price_line(
                ctx,
                layout,
                &items,
                visible_start,
                visible_end,
                &y_mapper,
                |item| item.ask_price(),
                &theme.ask_price_line,
                1.0,
                true,
            );
        }
    }

    fn draw_price_line<F>(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: &flatbuffers::Vector<'_, flatbuffers::ForwardsUOffset<KlineItem<'_>>>,
        start: usize,
        end: usize,
        y_mapper: &CoordinateMapper,
        price_fn: F,
        color: &str,
        width: f64,
        dashed: bool,
    ) where
        F: Fn(&KlineItem) -> f64,
    {
        ctx.set_stroke_style_str(color);
        ctx.set_line_width(width);
        ctx.set_line_cap("round");
        ctx.set_line_join("round");

        if dashed {
            ctx.set_line_dash(&js_sys::Float64Array::from(&[5.0, 5.0][..]))
                .unwrap();
        } else {
            ctx.set_line_dash(&js_sys::Float64Array::new_with_length(0))
                .unwrap();
        }

        let points: Vec<(f64, f64)> = (start..end)
            .map(|i| {
                let item = items.get(i);
                let x = layout.get_rect(&PaneId::HeatmapArea).x
                    + ((i - start) as f64 * layout.total_candle_width)
                    + (layout.candle_width / 2.0);
                (x, y_mapper.map_y(price_fn(&item)))
            })
            .collect();

        if points.len() < 2 {
            return;
        }

        ctx.begin_path();
        ctx.move_to(points[0].0, points[0].1);
        for i in 0..points.len() - 1 {
            let p1 = points[i];
            let p2 = points[i + 1];
            ctx.quadratic_curve_to(p1.0, p1.1, (p1.0 + p2.0) / 2.0, (p1.1 + p2.1) / 2.0);
        }
        ctx.line_to(points.last().unwrap().0, points.last().unwrap().1);
        ctx.stroke();
    }
}

impl RenderStrategy for LineRenderer {
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError> {
        let canvas_ref = ctx.canvas_manager().borrow();
        let main_ctx = canvas_ref.get_context(CanvasLayerType::Main);
        let layout_ref = ctx.layout().borrow();
        self.draw(main_ctx, &layout_ref, ctx.data_manager(), ctx.theme());
        Ok(())
    }

    fn supports_mode(&self, _mode: RenderMode) -> bool {
        true
    }

    fn get_layer_type(&self) -> CanvasLayerType {
        CanvasLayerType::Main
    }

    fn get_priority(&self) -> u32 {
        25
    }
}
