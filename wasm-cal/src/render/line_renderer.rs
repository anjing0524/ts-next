//! 线图渲染器 - 负责绘制最新价、买一价、卖一价曲线

use crate::{
    data::DataManager,
    kline_generated::kline::KlineItem,
    layout::{ChartColors, ChartLayout},
    render::{chart_renderer::RenderMode, traits::LayerRenderer},
};
use flatbuffers;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 线图渲染器 - 负责绘制最新价、买一价、卖一价曲线
#[derive(Default)]
pub struct LineRenderer {
    // 是否显示最新价线
    show_last_price: bool,
    // 是否显示买一价线
    show_bid_price: bool,
    // 是否显示卖一价线
    show_ask_price: bool,
}

impl LineRenderer {
    /// 创建新的线图渲染器
    pub fn new() -> Self {
        Self {
            show_last_price: true,
            show_bid_price: true,
            show_ask_price: true,
        }
    }
}

impl LayerRenderer for LineRenderer {
    /// 绘制线图
    fn draw_on_layer(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        _mode: RenderMode, // _mode is unused in this renderer
    ) {
        let data_manager_ref = data_manager.borrow();
        let (visible_start, visible_count, _) = data_manager_ref.get_visible();
        let (min_low, max_high, _) = data_manager_ref.get_cached_cal();
        let items_opt = data_manager_ref.get_items();

        if let Some(items) = items_opt {
            // 确保可见范围有效
            if visible_start >= items.len() || visible_count == 0 {
                return;
            }

            // 计算实际可见的结束索引
            let visible_end = (visible_start + visible_count).min(items.len());

            // 启用抗锯齿
            ctx.set_image_smoothing_enabled(true);

            // 绘制最新价线
            if self.show_last_price {
                self.draw_smooth_price_line(
                    ctx,
                    layout,
                    &items,
                    visible_start,
                    visible_end,
                    min_low,
                    max_high,
                    |item| item.last_price(),
                    ChartColors::LAST_PRICE_LINE,
                    2.0,
                    false, // 实线
                );
            }

            // 绘制买一价线
            if self.show_bid_price {
                self.draw_smooth_price_line(
                    ctx,
                    layout,
                    &items,
                    visible_start,
                    visible_end,
                    min_low,
                    max_high,
                    |item| item.bid_price(),
                    ChartColors::BID_PRICE_LINE,
                    1.0,
                    true, // 虚线
                );
            }

            // 绘制卖一价线
            if self.show_ask_price {
                self.draw_smooth_price_line(
                    ctx,
                    layout,
                    &items,
                    visible_start,
                    visible_end,
                    min_low,
                    max_high,
                    |item| item.ask_price(),
                    ChartColors::ASK_PRICE_LINE,
                    1.0,
                    true, // 虚线
                );
            }
        }
    }

    /// 绘制平滑的价格线
    fn draw_smooth_price_line<F>(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: &flatbuffers::Vector<'_, flatbuffers::ForwardsUOffset<KlineItem<'_>>>,
        visible_start: usize,
        visible_end: usize,
        min_low: f64,
        max_high: f64,
        price_extractor: F,
        color: &str,
        line_width: f64,
        is_dashed: bool,
    ) where
        F: Fn(&KlineItem) -> f64,
    {
        // 设置线条样式
        ctx.set_stroke_style_str(color);
        ctx.set_line_width(line_width);
        ctx.set_line_cap("round");
        ctx.set_line_join("round");

        // 设置虚线样式（如果需要）
        if is_dashed {
            // 创建虚线模式：5像素线段，5像素间隔
            let dash_values = [5.0f64, 5.0f64];
            let dash_pattern = js_sys::Float64Array::from(&dash_values[..]);
            ctx.set_line_dash(&dash_pattern).unwrap();
        } else {
            // 确保使用实线
            let empty_array = js_sys::Float64Array::new_with_length(0);
            ctx.set_line_dash(&empty_array).unwrap();
        }

        // 收集所有点的坐标
        let mut points = Vec::with_capacity(visible_end - visible_start);

        for i in visible_start..visible_end {
            let item = items.get(i);
            let price = price_extractor(&item);
            let x = layout.map_index_to_x(i, visible_start);
            let y = layout.map_price_to_y(price, min_low, max_high);
            points.push((x, y));
        }

        // 如果点数太少，直接绘制直线
        if points.len() <= 2 {
            self.draw_straight_line(ctx, &points);
            return;
        }

        // 使用贝塞尔曲线绘制平滑曲线
        self.draw_bezier_curve(ctx, &points);
    }

    /// 绘制直线（当点数较少时使用）
    fn draw_straight_line(&self, ctx: &OffscreenCanvasRenderingContext2d, points: &[(f64, f64)]) {
        if points.is_empty() {
            return;
        }

        ctx.begin_path();
        ctx.move_to(points[0].0, points[0].1);
        for point in points.iter().skip(1) {
            ctx.line_to(point.0, point.1);
        }
        ctx.stroke();
    }

    /// 使用贝塞尔曲线绘制平滑曲线
    fn draw_bezier_curve(&self, ctx: &OffscreenCanvasRenderingContext2d, points: &[(f64, f64)]) {
        if points.len() < 2 {
            return;
        }

        ctx.begin_path();
        ctx.move_to(points[0].0, points[0].1);

        // 对于每三个点，使用二次贝塞尔曲线
        // 控制点取相邻两点的中点
        for i in 0..points.len() - 1 {
            let current = points[i];
            let next = points[i + 1];

            // 计算控制点（当前点和下一个点的中点）
            let control_x = (current.0 + next.0) / 2.0;
            let control_y = (current.1 + next.1) / 2.0;

            // 使用二次贝塞尔曲线
            ctx.quadratic_curve_to(current.0, current.1, control_x, control_y);
        }

        // 绘制到最后一个点
        if let Some(last) = points.last() {
            ctx.line_to(last.0, last.1);
        }

        ctx.stroke();
    }
}
