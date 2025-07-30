//! 价格图(K线图)模块 - 专门负责绘制K线图部分

use crate::canvas::CanvasLayerType;
use crate::config::ChartTheme;
use crate::data::DataManager;
use crate::layout::{ChartLayout, CoordinateMapper, PaneId};
use crate::render::chart_renderer::RenderMode;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 价格图(K线图)绘制器
pub struct PriceRenderer;

impl PriceRenderer {
    /// 绘制价格图
    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
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

        let (min_low, max_high, _) = data_manager_ref.get_cached_cal();
        let price_rect = layout.get_rect(&PaneId::HeatmapArea);
        let y_mapper = CoordinateMapper::new_for_y_axis(price_rect, min_low, max_high, 8.0);

        let mut bullish_lines = Vec::new();
        let mut bearish_lines = Vec::new();
        let mut bullish_rects = Vec::new();
        let mut bearish_rects = Vec::new();

        for i in visible_start..visible_end {
            let item = items.get(i);
            let x_center = price_rect.x
                + ((i - visible_start) as f64 * layout.total_candle_width)
                + (layout.total_candle_width / 2.0);

            let high_y = y_mapper.map_y(item.high());
            let low_y = y_mapper.map_y(item.low());
            let open_y = y_mapper.map_y(item.open());
            let close_y = y_mapper.map_y(item.close());

            if item.close() >= item.open() {
                bullish_lines.push((x_center, high_y, x_center, low_y));
                let height = (open_y - close_y).max(1.0);
                bullish_rects.push((
                    x_center - layout.candle_width / 2.0,
                    close_y,
                    layout.candle_width,
                    height,
                ));
            } else {
                bearish_lines.push((x_center, high_y, x_center, low_y));
                let height = (close_y - open_y).max(1.0);
                bearish_rects.push((
                    x_center - layout.candle_width / 2.0,
                    open_y,
                    layout.candle_width,
                    height,
                ));
            }
        }

        self.batch_draw_lines(ctx, &bullish_lines, &theme.bullish);
        self.batch_draw_lines(ctx, &bearish_lines, &theme.bearish);
        self.batch_draw_rects(ctx, &bullish_rects, &theme.bullish);
        self.batch_draw_rects(ctx, &bearish_rects, &theme.bearish);
    }

    fn batch_draw_lines(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        lines: &[(f64, f64, f64, f64)],
        color: &str,
    ) {
        if lines.is_empty() {
            return;
        }
        ctx.begin_path();
        ctx.set_stroke_style_str(color);
        ctx.set_line_width(1.5);
        for (x1, y1, x2, y2) in lines {
            ctx.move_to(*x1, *y1);
            ctx.line_to(*x2, *y2);
        }
        ctx.stroke();
    }

    fn batch_draw_rects(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        rects: &[(f64, f64, f64, f64)],
        color: &str,
    ) {
        if rects.is_empty() {
            return;
        }
        ctx.set_fill_style_str(color);
        ctx.begin_path();
        for (x, y, width, height) in rects {
            ctx.rect(*x, *y, *width, *height);
        }
        ctx.fill();
    }
}

impl RenderStrategy for PriceRenderer {
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError> {
        let canvas_ref = ctx.canvas_manager().borrow();
        let main_ctx = canvas_ref.get_context(CanvasLayerType::Main);
        let layout_ref = ctx.layout().borrow();
        self.draw(main_ctx, &layout_ref, ctx.data_manager(), ctx.theme());
        Ok(())
    }

    fn supports_mode(&self, mode: RenderMode) -> bool {
        mode == RenderMode::Kmap
    }

    fn get_layer_type(&self) -> CanvasLayerType {
        CanvasLayerType::Main
    }

    fn get_priority(&self) -> u32 {
        10
    }
}
