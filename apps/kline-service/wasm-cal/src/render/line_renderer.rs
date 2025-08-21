//! 线图渲染器 - 负责绘制最新价、买一价、卖一价曲线

use crate::canvas::CanvasLayerType;
use crate::config::ChartTheme;
use crate::data::{DataManager, model::KlineItemRef};

use crate::layout::{ChartLayout, CoordinateMapper, PaneId};
use crate::render::chart_renderer::RenderMode;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};

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
        data_manager: &DataManager,
        theme: &ChartTheme,
    ) {
        let (visible_start, visible_count, _) = data_manager.get_visible();
        let (min_low, max_high, _) = data_manager.get_cached_cal();

        if visible_start >= data_manager.len() || visible_count == 0 {
            return;
        }
        let visible_end = (visible_start + visible_count).min(data_manager.len());

        ctx.set_image_smoothing_enabled(true);

        let price_rect = layout.get_rect(&PaneId::HeatmapArea);
        let y_mapper = CoordinateMapper::new_for_y_axis(price_rect, min_low, max_high, 8.0);

        if self.show_last_price {
            self.draw_price_line(
                ctx,
                layout,
                data_manager,
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
                data_manager,
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
                data_manager,
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
        data_manager: &DataManager,
        start: usize,
        end: usize,
        y_mapper: &CoordinateMapper,
        price_fn: F,
        color: &str,
        width: f64,
        dashed: bool,
    ) where
        F: Fn(&KlineItemRef) -> f64,
    {
        ctx.set_stroke_style_str(color);
        ctx.set_line_width(width);
        ctx.set_line_cap("round");
        ctx.set_line_join("round");

        if dashed {
            ctx.set_line_dash(&js_sys::Float64Array::from(&[5.0, 5.0][..]))
                .ok();
        } else {
            ctx.set_line_dash(&js_sys::Float64Array::new_with_length(0))
                .ok();
        }

        let points: Vec<(f64, f64)> = (start..end)
            .enumerate()
            .filter_map(|(rel_idx, abs_idx)| {
                data_manager
                    .get(abs_idx)
                    .map(|item_ref| (rel_idx, item_ref))
            })
            .map(|(rel_idx, item_ref)| {
                let x = layout.get_rect(&PaneId::HeatmapArea).x
                    + (rel_idx as f64 * layout.total_candle_width)
                    + (layout.candle_width / 2.0);
                (x, y_mapper.map_y(price_fn(&item_ref)))
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
        if let Some(last_point) = points.last() {
            ctx.line_to(last_point.0, last_point.1);
        }
        ctx.stroke();
    }
}

impl RenderStrategy for LineRenderer {
    /// 执行主图层渲染（绘制价格线）
    ///
    /// 在 Main 层绘制各种价格线（last_price、bid_price、ask_price）。
    /// 不进行任何清理动作，由 ChartRenderer 统一清理 Main 层。
    ///
    /// 返回：
    /// - Ok(()) 正常完成渲染
    /// - Err(RenderError) 当 Canvas 上下文获取失败等
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError> {
        let canvas = ctx.canvas_manager_ref();
        let main_ctx = canvas.get_context(CanvasLayerType::Main)?;
        let layout = ctx.layout_ref();
        let data_manager = ctx.data_manager_ref();
        let theme = ctx.theme_ref();
        self.draw(main_ctx, &layout, &data_manager, theme);
        Ok(())
    }

    /// 声明该渲染器支持的渲染模式
    fn supports_mode(&self, _mode: RenderMode) -> bool {
        true
    }

    /// 指定渲染层为主图层（Main）
    fn get_layer_type(&self) -> CanvasLayerType {
        CanvasLayerType::Main
    }

    /// 指定渲染优先级（数值越小优先级越高）
    fn get_priority(&self) -> u32 {
        25
    }
}
