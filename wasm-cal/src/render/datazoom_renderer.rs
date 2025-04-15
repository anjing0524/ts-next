//! DataZoom导航器模块 - 负责绘制和处理数据缩放导航器

use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartColors, ChartLayout};
use flatbuffers;
use web_sys::OffscreenCanvasRenderingContext2d;

/// DataZoom导航器绘制器
pub struct DataZoomRenderer;

impl DataZoomRenderer {
    /// 绘制DataZoom导航器
    // 修改 draw 方法，使用 layout_mut 方法
    pub fn draw(
        &self,
        canvas_manager: &CanvasManager,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
    ) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Base);
        let layout = canvas_manager.layout.borrow(); // 不可变借用

        // 计算导航器位置
        let nav_x = layout.chart_area_x;
        let nav_y = layout.canvas_height - layout.navigator_height;
        let nav_width = layout.chart_area_width;
        let nav_height = layout.navigator_height;

        // 绘制导航器背景
        ctx.set_fill_style_str(ChartColors::NAVIGATOR_BG);
        ctx.fill_rect(nav_x, nav_y, nav_width, nav_height);

        // 绘制导航器背景
        ctx.set_fill_style_str(ChartColors::NAVIGATOR_BG);
        ctx.fill_rect(
            layout.chart_area_x,
            layout.navigator_y,
            layout.chart_area_width,
            layout.navigator_height,
        );

        // 如果数据为空，直接返回
        if items.len() == 0 {
            return;
        }
    }
}
