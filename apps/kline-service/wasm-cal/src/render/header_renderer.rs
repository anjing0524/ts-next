//! Header渲染器 - 负责绘制标题和图例

use crate::canvas::CanvasLayerType;
use crate::config::ChartTheme;
use crate::layout::PaneId;
use crate::render::cursor_style::CursorStyle;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};
use web_sys::OffscreenCanvasRenderingContext2d;

/// Header渲染器 - 绘制标题和图例
pub struct HeaderRenderer {
    title: String,
    subtitle: String,
}

impl Default for HeaderRenderer {
    fn default() -> Self {
        Self::new()
    }
}

impl HeaderRenderer {
    pub fn new() -> Self {
        Self {
            title: "K线图表".to_string(),
            subtitle: "实时行情数据".to_string(),
        }
    }

    fn draw_title(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &crate::layout::ChartLayout,
        theme: &ChartTheme,
    ) {
        let header_rect = layout.get_rect(&PaneId::Header);

        // 绘制背景
        ctx.set_fill_style_str(&theme.header_bg);
        ctx.fill_rect(
            header_rect.x,
            header_rect.y,
            header_rect.width,
            header_rect.height,
        );

        // 绘制标题
        ctx.set_font(&theme.font_title);
        ctx.set_fill_style_str(&theme.text_primary);
        ctx.set_text_align("left");
        ctx.set_text_baseline("middle");

        let title_y = header_rect.y + header_rect.height / 2.0 - 5.0;
        let _ = ctx.fill_text(&self.title, header_rect.x + 10.0, title_y);

        // 绘制副标题（如果有）
        if !self.subtitle.is_empty() {
            ctx.set_font(&theme.font_subtitle);
            ctx.set_fill_style_str(&theme.text_secondary);

            if let Ok(title_metrics) = ctx.measure_text(&self.title) {
                let subtitle_x = header_rect.x + 10.0 + title_metrics.width() + 15.0;
                let _ = ctx.fill_text(&self.subtitle, subtitle_x, title_y);
            }
        }
    }

    fn draw_legend(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &crate::layout::ChartLayout,
        theme: &ChartTheme,
    ) {
        let header_rect = layout.get_rect(&PaneId::Header);

        // 图例项
        let legend_items = [
            ("K线", &theme.bullish),
            ("成交量", &theme.volume_area),
            ("热图", &theme.last_price_line),
        ];

        ctx.set_font(&theme.font_legend);
        ctx.set_text_align("right");
        ctx.set_text_baseline("middle");

        let legend_y = header_rect.y + header_rect.height / 2.0 - 5.0;
        let mut legend_x = header_rect.x + header_rect.width - 10.0;

        // 绘制图例
        for (label, color) in legend_items.iter() {
            // 计算文本宽度
            if let Ok(text_metrics) = ctx.measure_text(label) {
                let text_width = text_metrics.width();

                // 绘制颜色方块
                ctx.set_fill_style_str(color);
                let square_size = 10.0;
                ctx.fill_rect(
                    legend_x - text_width - square_size - 5.0,
                    legend_y - square_size / 2.0,
                    square_size,
                    square_size,
                );

                // 绘制文本
                ctx.set_fill_style_str(&theme.text_primary);
                let _ = ctx.fill_text(label, legend_x, legend_y);

                // 调整位置
                legend_x -= text_width + square_size + 15.0;
            }
        }
    }
}

impl RenderStrategy for HeaderRenderer {
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError> {
        let canvas_manager = ctx.canvas_manager_ref();
        let base_ctx = canvas_manager.get_context(CanvasLayerType::Base);
        let layout = ctx.layout_ref();
        let theme = ctx.theme_ref();

        // 绘制标题
        self.draw_title(base_ctx, &layout, theme);

        // 绘制图例
        self.draw_legend(base_ctx, &layout, theme);

        Ok(())
    }

    fn supports_mode(&self, _mode: crate::render::chart_renderer::RenderMode) -> bool {
        true
    }

    fn get_layer_type(&self) -> CanvasLayerType {
        CanvasLayerType::Base
    }

    fn get_priority(&self) -> u32 {
        10 // 高优先级，确保最先渲染
    }

    fn handle_mouse_down(&mut self, _x: f64, _y: f64, _ctx: &RenderContext) -> bool {
        false
    }

    fn handle_mouse_up(&mut self, _x: f64, _y: f64, _ctx: &RenderContext) -> bool {
        false
    }

    fn handle_mouse_drag(
        &mut self,
        _x: f64,
        _y: f64,
        _ctx: &RenderContext,
    ) -> crate::render::datazoom_renderer::DragResult {
        crate::render::datazoom_renderer::DragResult::None
    }

    fn handle_mouse_leave(&mut self, _ctx: &RenderContext) -> bool {
        false
    }

    fn get_cursor_style(&self, _x: f64, _y: f64, _ctx: &RenderContext) -> CursorStyle {
        CursorStyle::Default
    }
}
