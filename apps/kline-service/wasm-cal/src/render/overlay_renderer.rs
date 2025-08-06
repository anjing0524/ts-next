//! 交互层渲染器 - 负责绘制十字光标、提示框等交互元素
use crate::canvas::CanvasLayerType;
use crate::config::ChartTheme;
use crate::kline_generated::kline::KlineItem;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(message: &str);
}
use crate::layout::{ChartLayout, CoordinateMapper, PaneId};
use crate::render::chart_renderer::RenderMode;
use crate::render::cursor_style::CursorStyle;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};
use crate::render::tooltip_renderer::TooltipRenderer;
use crate::utils::time;
use js_sys;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 交互层渲染器 - 只负责十字线绘制和鼠标事件处理
pub struct OverlayRenderer {
    // Tooltip渲染器
    tooltip_renderer: TooltipRenderer,
    dash_array: Option<js_sys::Array>,
    empty_array: Option<js_sys::Array>,
}

impl Default for OverlayRenderer {
    fn default() -> Self {
        Self::new()
    }
}

impl OverlayRenderer {
    /// 创建新的交互层渲染器
    pub fn new() -> Self {
        let dash_array = js_sys::Array::of2(&4.0.into(), &4.0.into());
        let empty_array = js_sys::Array::new();
        Self {
            tooltip_renderer: TooltipRenderer::new(),
            dash_array: Some(dash_array),
            empty_array: Some(empty_array),
        }
    }

    /// 绘制交互层 - 只绘制十字线和tooltip
    pub fn draw(&self, ctx: &OffscreenCanvasRenderingContext2d, render_ctx: &RenderContext) {
        log(&format!(
            "OverlayRenderer::draw - hover_index: {:?}, mouse_x: {}, mouse_y: {}",
            render_ctx.hover_index(),
            render_ctx.mouse_x(),
            render_ctx.mouse_y()
        ));

        // 仅当有有效的悬浮索引时才绘制
        if render_ctx.hover_index().is_some() {
            log("OverlayRenderer::draw - 有hover_index，开始绘制十字线");
            self.draw_crosshair_with_labels(ctx, render_ctx);
            self.draw_tooltip(ctx, render_ctx);
        } else {
            log("OverlayRenderer::draw - 没有hover_index，跳过绘制");
        }
    }

    /// 绘制Tooltip
    fn draw_tooltip(&self, ctx: &OffscreenCanvasRenderingContext2d, render_ctx: &RenderContext) {
        let data_manager = render_ctx.data_manager_ref();
        let (min_low, max_high, _) = data_manager.get_cached_cal();
        let tick = data_manager.get_tick();
        let items = match data_manager.get_items() {
            Some(items) => items,
            None => return,
        };

        let layout = render_ctx.layout_ref();
        let main_chart_rect = layout.get_rect(&PaneId::HeatmapArea);
        let book_rect = layout.get_rect(&PaneId::OrderBook);

        if let Some(hover_index) = render_ctx.hover_index() {
            if hover_index >= items.len() {
                return;
            }

            if main_chart_rect.contains(render_ctx.mouse_x(), render_ctx.mouse_y()) {
                self.tooltip_renderer.draw_main_chart_tooltip(
                    ctx,
                    &layout,
                    items,
                    Some(hover_index),
                    render_ctx.mouse_x(),
                    render_ctx.mouse_y(),
                    render_ctx.mode,
                    min_low,
                    max_high,
                    tick,
                    render_ctx.theme_ref(),
                );
            }

            if book_rect.contains(render_ctx.mouse_x(), render_ctx.mouse_y()) {
                let item = items.get(hover_index);
                let price_mapper =
                    CoordinateMapper::new_for_y_axis(main_chart_rect, min_low, max_high, 0.0);
                let price = price_mapper.unmap_y(render_ctx.mouse_y());
                if let Some(volume) = self.calculate_volume_for_price(&item, price, min_low, tick) {
                    self.tooltip_renderer.draw_book_tooltip(
                        ctx,
                        &layout,
                        item.timestamp().into(),
                        price,
                        volume,
                        render_ctx.mouse_x(),
                        render_ctx.mouse_y(),
                        render_ctx.theme_ref(),
                    );
                }
            }
        }
    }

    /// 计算特定价格的成交量
    fn calculate_volume_for_price(
        &self,
        kline: &KlineItem,
        price: f64,
        min_low: f64,
        tick: f64,
    ) -> Option<f64> {
        if tick <= 0.0 {
            return None;
        }
        let tick_idx = ((price - min_low) / tick).floor() as usize;
        kline.volumes().map(|volumes| {
            volumes
                .iter()
                .filter(|pv| ((pv.price() - min_low) / tick).floor() as usize == tick_idx)
                .map(|pv| pv.volume())
                .sum::<f64>()
        })
    }

    /// 清除交互层 - 此方法现在是可选的，因为清理由 chart_renderer 统一处理
    pub fn clear(&self, _ctx: &OffscreenCanvasRenderingContext2d, _layout: &ChartLayout) {
        // No-op, a central clear is now performed in chart_renderer
    }

    /// 绘制十字光标和坐标轴标签
    fn draw_crosshair_with_labels(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        render_ctx: &RenderContext,
    ) {
        let layout = render_ctx.layout_ref();
        let theme = render_ctx.theme_ref();
        ctx.set_stroke_style_str(&theme.crosshair);
        ctx.set_line_width(1.0);
        if let Some(dash_array) = &self.dash_array {
            let _ = ctx.set_line_dash(dash_array);
        }

        let main_chart_rect = layout.get_rect(&PaneId::HeatmapArea);
        let _volume_rect = layout.get_rect(&PaneId::VolumeChart);
        let y_axis_rect = layout.get_rect(&PaneId::YAxis);
        let time_axis_rect = layout.get_rect(&PaneId::TimeAxis);

        // 水平线
        let mouse_y_constrained = render_ctx
            .mouse_y()
            .max(main_chart_rect.y)
            .min(_volume_rect.y + _volume_rect.height);
        ctx.begin_path();
        ctx.move_to(main_chart_rect.x, mouse_y_constrained);
        ctx.line_to(
            main_chart_rect.x + main_chart_rect.width,
            mouse_y_constrained,
        );
        ctx.stroke();

        // 垂直线
        let mouse_x_constrained = render_ctx
            .mouse_x()
            .max(main_chart_rect.x)
            .min(main_chart_rect.x + main_chart_rect.width);
        ctx.begin_path();
        ctx.move_to(mouse_x_constrained, main_chart_rect.y);
        ctx.line_to(mouse_x_constrained, _volume_rect.y + _volume_rect.height);
        ctx.stroke();

        if let Some(empty_array) = &self.empty_array {
            let _ = ctx.set_line_dash(empty_array);
        }

        // 绘制Y轴标签
        let data_manager = render_ctx.data_manager_ref();
        let (min_low, max_high, max_volume) = data_manager.get_cached_cal();
        let price_mapper =
            CoordinateMapper::new_for_y_axis(main_chart_rect, min_low, max_high, 8.0);
        let price = price_mapper.unmap_y(mouse_y_constrained);
        self.draw_axis_label(
            ctx,
            &format!("{price:.2}"),
            y_axis_rect.x,
            mouse_y_constrained,
            y_axis_rect.width,
            theme,
        );

        // 绘制成交量轴标签
        if _volume_rect.contains(render_ctx.mouse_x(), render_ctx.mouse_y()) {
            let volume_mapper =
                CoordinateMapper::new_for_y_axis(_volume_rect, 0.0, max_volume, 2.0);
            let volume = volume_mapper.unmap_y(mouse_y_constrained);
            self.draw_axis_label(
                ctx,
                &time::format_volume(volume, 2),
                y_axis_rect.x,
                mouse_y_constrained,
                y_axis_rect.width,
                theme,
            );
        }

        // 绘制X轴标签
        if let Some(index) = render_ctx.hover_index() {
            // 使用来自RenderContext的hover_index
            if let Some(items) = data_manager.get_items() {
                if index < items.len() {
                    let item = items.get(index);
                    let time_str =
                        time::format_timestamp(item.timestamp() as i64, "%Y-%m-%d %H:%M");

                    // 计算标签宽度和位置，确保标签居中且不超出边界
                    let label_width = 120.0;
                    let label_x = (mouse_x_constrained - label_width / 2.0)
                        .max(time_axis_rect.x)
                        .min(time_axis_rect.x + time_axis_rect.width - label_width);

                    self.draw_axis_label(
                        ctx,
                        &time_str,
                        label_x,
                        time_axis_rect.y,
                        label_width,
                        theme,
                    );
                }
            }
        }
    }

    /// 绘制坐标轴上的悬浮标签
    fn draw_axis_label(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        text: &str,
        x: f64,
        y: f64,
        width: f64,
        theme: &ChartTheme,
    ) {
        ctx.set_fill_style_str(&theme.tooltip_bg);
        ctx.fill_rect(x, y - 10.0, width, 20.0);
        ctx.set_stroke_style_str(&theme.tooltip_border);
        ctx.stroke_rect(x, y - 10.0, width, 20.0);
        ctx.set_fill_style_str(&theme.tooltip_text);
        ctx.set_font(&theme.font_axis);
        ctx.set_text_align("center");
        ctx.set_text_baseline("middle");
        let _ = ctx.fill_text(text, x + width / 2.0, y);
    }
}

impl RenderStrategy for OverlayRenderer {
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError> {
        log(&format!(
            "OverlayRenderer::render - 被调用，hover_index: {:?}, mouse_x: {}, mouse_y: {}",
            ctx.hover_index(),
            ctx.mouse_x(),
            ctx.mouse_y()
        ));

        let canvas_manager = ctx.canvas_manager_ref();
        let overlay_ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = ctx.layout_ref();

        // 根据用户建议，我们只清理DataZoom导航器上方的区域。
        // 这可以防止重影，同时避免干扰DataZoom本身的渲染。
        let root_rect = layout.get_rect(&crate::layout::PaneId::Root);
        let nav_rect = layout.get_rect(&crate::layout::PaneId::NavigatorContainer);

        // 清理从画布顶部到导航器顶部的所有内容。
        overlay_ctx.clear_rect(root_rect.x, root_rect.y, root_rect.width, nav_rect.y);

        self.draw(overlay_ctx, ctx);
        log("OverlayRenderer::render - 完成");
        Ok(())
    }

    fn supports_mode(&self, _mode: RenderMode) -> bool {
        true
    }

    fn get_layer_type(&self) -> CanvasLayerType {
        CanvasLayerType::Overlay
    }

    fn get_priority(&self) -> u32 {
        90
    }

    fn handle_mouse_move(&mut self, _x: f64, _y: f64, _ctx: &RenderContext) -> bool {
        // 状态管理已移至ChartRenderer，此渲染器仅负责绘制
        // 返回true表示鼠标移动时总是需要检查重绘（由ChartRenderer决定）
        true
    }

    fn handle_mouse_leave(&mut self, _ctx: &RenderContext) -> bool {
        // 状态管理已移至ChartRenderer，此渲染器仅负责绘制
        // 返回true以确保清除十字线
        true
    }

    fn get_cursor_style(&self, x: f64, y: f64, ctx: &RenderContext) -> CursorStyle {
        let layout = ctx.layout_ref();
        if layout.get_rect(&PaneId::DrawingArea).contains(x, y) {
            return CursorStyle::Crosshair;
        }
        CursorStyle::Default
    }
}
