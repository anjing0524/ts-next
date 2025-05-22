//! 线图渲染器 - 负责绘制最新价、买一价、卖一价曲线

use crate::{
    canvas::{CanvasLayerType, CanvasManager},
    data::DataManager,
    kline_generated::kline::KlineItem,
    layout::{ChartColors, ChartLayout, theme::*}, // Ensure theme is imported
    render::{chart_renderer::RenderMode, traits::ComprehensiveRenderer},
};
use flatbuffers;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d; // Keep for ctx type in helpers

// Structs for draw_smooth_price_line arguments
struct SmoothPriceLineDataParams<'a, F>
where
    F: Fn(&KlineItem) -> f64,
{
    items: &'a flatbuffers::Vector<'a, flatbuffers::ForwardsUOffset<KlineItem<'a>>>,
    visible_start: usize,
    visible_end: usize,
    min_low: f64,
    max_high: f64,
    price_extractor: F,
}

struct SmoothPriceLineStyleParams<'a> {
    color: &'a str,
    line_width: f64,
    is_dashed: bool,
}

/// 线图渲染器 - 负责绘制最新价、买一价、卖一价曲线
#[derive(Default)]
pub struct LineRenderer {
    show_last_price: bool,
    show_bid_price: bool,
    show_ask_price: bool,
}

impl ComprehensiveRenderer for LineRenderer {
    /// 绘制线图
    fn render_component(
        &self,
        canvas_manager: &CanvasManager,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        _mode: RenderMode,
    ) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Main);
        let data_manager_ref = data_manager.borrow();
        let visible_range = data_manager_ref.get_visible_range();
        let (visible_start, visible_count, _) = visible_range.get_range();

        let (min_low, max_high, _) = data_manager_ref.get_cached_cal();
        let items_opt = data_manager_ref.get_items();

        if let Some(items) = items_opt {
            if visible_start >= items.len() || visible_count == 0 {
                return;
            }
            let visible_end = (visible_start + visible_count).min(items.len());

            // ctx.set_image_smoothing_enabled(true); // Original was commented out

            if self.show_last_price {
                let data_params = SmoothPriceLineDataParams {
                    items: &items, visible_start, visible_end, min_low, max_high,
                    price_extractor: |item| item.last_price(),
                };
                let style_params = SmoothPriceLineStyleParams {
                    color: ChartColors::LAST_PRICE_LINE, line_width: LINE_LAST_PRICE_WIDTH, is_dashed: false,
                };
                self.draw_smooth_price_line(ctx, layout, data_params, style_params);
            }
            if self.show_bid_price {
                let data_params = SmoothPriceLineDataParams {
                    items: &items, visible_start, visible_end, min_low, max_high,
                    price_extractor: |item| item.bid_price(),
                };
                let style_params = SmoothPriceLineStyleParams {
                    color: ChartColors::BID_PRICE_LINE, line_width: LINE_DEFAULT_WIDTH, is_dashed: true,
                };
                self.draw_smooth_price_line(ctx, layout, data_params, style_params);
            }
            if self.show_ask_price {
                let data_params = SmoothPriceLineDataParams {
                    items: &items, visible_start, visible_end, min_low, max_high,
                    price_extractor: |item| item.ask_price(),
                };
                let style_params = SmoothPriceLineStyleParams {
                    color: ChartColors::ASK_PRICE_LINE, line_width: LINE_DEFAULT_WIDTH, is_dashed: true,
                };
                self.draw_smooth_price_line(ctx, layout, data_params, style_params);
                );
            }
        }
    }
}

impl LineRenderer {
    pub fn new() -> Self {
        Self {
            show_last_price: true,
            show_bid_price: true,
            show_ask_price: true,
        }
    }

    fn draw_smooth_price_line<'a, F>(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_params: SmoothPriceLineDataParams<'a, F>,
        style_params: SmoothPriceLineStyleParams<'a>,
    ) where
        F: Fn(&KlineItem) -> f64,
    {
        ctx.set_stroke_style_str(style_params.color);
        ctx.set_line_width(style_params.line_width);
        ctx.set_line_cap("round"); // Keep as string literals, less critical for theming
        ctx.set_line_join("round"); // Keep as string literals

        if style_params.is_dashed {
            // Use LINE_DASH_PATTERN_VALUE for dash pattern
            let dash_values = [LINE_DASH_PATTERN_VALUE, LINE_DASH_PATTERN_VALUE];
            let dash_pattern = js_sys::Float64Array::from(&dash_values[..]);
            let _ = ctx.set_line_dash(&dash_pattern);
        } else {
            let empty_array = js_sys::Float64Array::new_with_length(0);
            let _ = ctx.set_line_dash(&empty_array);
        }

        let mut points = Vec::with_capacity(data_params.visible_end - data_params.visible_start);
        for i in data_params.visible_start..data_params.visible_end {
            let item = data_params.items.get(i);
            let price = (data_params.price_extractor)(&item);
            let x = layout.map_index_to_x(i, data_params.visible_start);
            let y = layout.map_price_to_y(price, data_params.min_low, data_params.max_high);
            points.push((x, y));
        }

        if points.len() <= 2 {
            self.draw_straight_line(ctx, &points);
            return;
        }
        self.draw_bezier_curve(ctx, &points);
    }

    fn draw_straight_line(&self, ctx: &OffscreenCanvasRenderingContext2d, points: &[(f64, f64)]) {
        if points.is_empty() { return; }
        ctx.begin_path();
        ctx.move_to(points[0].0, points[0].1);
        for point in points.iter().skip(1) {
            ctx.line_to(point.0, point.1);
        }
        ctx.stroke();
    }

    fn draw_bezier_curve(&self, ctx: &OffscreenCanvasRenderingContext2d, points: &[(f64, f64)]) {
        if points.len() < 2 { return; }
        ctx.begin_path();
        ctx.move_to(points[0].0, points[0].1);
        for i in 0..points.len() - 1 {
            let current = points[i];
            let next = points[i + 1];
            let control_x = (current.0 + next.0) / 2.0;
            let control_y = (current.1 + next.1) / 2.0;
            ctx.quadratic_curve_to(current.0, current.1, control_x, control_y);
        }
        if let Some(last) = points.last() {
            ctx.line_to(last.0, last.1);
        }
        ctx.stroke();
    }
}
