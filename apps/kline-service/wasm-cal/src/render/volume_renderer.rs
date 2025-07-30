//! 成交量图模块 - 专门负责绘制成交量图部分

use crate::canvas::CanvasLayerType;
use crate::config::ChartTheme;
use crate::data::DataManager;
use crate::layout::{ChartLayout, CoordinateMapper, PaneId};
use crate::render::chart_renderer::RenderMode;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 成交量图绘制器
pub struct VolumeRenderer;

impl VolumeRenderer {
    /// 绘制成交量图
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

        let (_, _, max_volume) = data_manager_ref.get_cached_cal();
        let volume_rect = layout.get_rect(&PaneId::VolumeChart);
        let y_mapper = CoordinateMapper::new_for_y_axis(volume_rect, 0.0, max_volume, 2.0);

        let mut bullish_rects = Vec::new();
        let mut bearish_rects = Vec::new();

        for i in visible_start..visible_end {
            let item = items.get(i);
            let x = volume_rect.x + ((i - visible_start) as f64 * layout.total_candle_width);
            let volume = item.b_vol() + item.s_vol();
            let y = y_mapper.map_y(volume);
            let height = volume_rect.y + volume_rect.height - y;

            if item.close() >= item.open() {
                bullish_rects.push((x, y, layout.candle_width, height));
            } else {
                bearish_rects.push((x, y, layout.candle_width, height));
            }
        }

        self.batch_draw_rects(ctx, &bullish_rects, &theme.bullish);
        self.batch_draw_rects(ctx, &bearish_rects, &theme.bearish);
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

impl RenderStrategy for VolumeRenderer {
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
        20
    }
}
