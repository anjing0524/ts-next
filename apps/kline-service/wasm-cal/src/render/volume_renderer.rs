//! 成交量图模块 - 专门负责绘制成交量图部分

use crate::canvas::CanvasLayerType;
use crate::config::ChartTheme;
use crate::data::DataManager;
use crate::layout::{ChartLayout, CoordinateMapper, PaneId};
use crate::render::chart_renderer::RenderMode;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};
use web_sys::OffscreenCanvasRenderingContext2d;

/// 成交量图绘制器
pub struct VolumeRenderer;

impl VolumeRenderer {
    /// 绘制成交量图
    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &DataManager,
        theme: &ChartTheme,
    ) {
        let (visible_start, visible_count, _) = data_manager.get_visible();
        let visible_end = visible_start + visible_count;
        if visible_start >= visible_end {
            return;
        }

        let (_, _, max_volume) = data_manager.get_cached_cal();
        let volume_rect = layout.get_rect(&PaneId::VolumeChart);
        let y_mapper = CoordinateMapper::new_for_y_axis(volume_rect, 0.0, max_volume, 2.0);

        let mut bullish_rects = Vec::new();
        let mut bearish_rects = Vec::new();

        for i in visible_start..visible_end {
            if let Some(item) = data_manager.get(i) {
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
    /// 渲染成交量柱状图到 Main 画布层
    ///
    /// # 参数
    /// * `ctx` - 渲染上下文，包含画布管理器、布局、数据等信息
    ///
    /// # 返回值
    /// * `Ok(())` - 渲染成功
    /// * `Err(RenderError)` - 渲染失败时返回错误信息
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError> {
        let canvas_manager = ctx.canvas_manager_ref();
        let main_ctx = canvas_manager.get_context(CanvasLayerType::Main)?;
        let layout = ctx.layout_ref();
        let data_manager = ctx.data_manager_ref();
        let theme = ctx.theme_ref();

        self.draw(main_ctx, &layout, &data_manager, theme);
        Ok(())
    }

    /// 检查是否支持指定的渲染模式
    ///
    /// # 参数
    /// * `_mode` - 渲染模式（当前所有模式都支持）
    ///
    /// # 返回值
    /// * `true` - 支持所有渲染模式
    fn supports_mode(&self, _mode: RenderMode) -> bool {
        true
    }

    /// 获取渲染器对应的画布层类型
    ///
    /// # 返回值
    /// * `CanvasLayerType::Main` - 成交量渲染器使用主画布层
    fn get_layer_type(&self) -> CanvasLayerType {
        CanvasLayerType::Main
    }

    /// 获取渲染器的优先级（数值越小优先级越高）
    ///
    /// # 返回值
    /// * `20` - 成交量渲染器的渲染优先级
    fn get_priority(&self) -> u32 {
        20
    }
}
