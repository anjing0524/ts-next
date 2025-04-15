//! 坐标轴模块 - 负责绘制X轴和Y轴

use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartColors, ChartLayout};
use flatbuffers;
use js_sys;
use wasm_bindgen::JsValue;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 坐标轴绘制器
pub struct AxisRenderer;

impl AxisRenderer {
    /// 绘制所有坐标轴
    pub fn draw(
        &self,
        canvas_manager: &CanvasManager,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        min_low: f64,
        max_high: f64,
        max_volume: f64,
    ) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Base);
        let layout = &canvas_manager.layout;
        // 绘制价格Y轴
        self.draw_price_y_axis(ctx, &layout.borrow(), min_low, max_high);
        // 绘制成交量Y轴
        self.draw_volume_y_axis(ctx, &layout.borrow(), max_volume);
        // 绘制X轴
        self.draw_x_axis(ctx, &layout.borrow(), items);
        // 绘制标题和图例
        self.draw_header(ctx, &layout.borrow());
    }

    /// 绘制价格Y轴
    fn draw_price_y_axis(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        min_low: f64,
        max_high: f64,
    ) {
        let effective_price_range = max_high - min_low;

        // 绘制Y轴背景
        ctx.set_fill_style_str(ChartColors::HEADER_BG);
        ctx.fill_rect(
            0.0,
            layout.header_height,
            layout.y_axis_width,
            layout.price_chart_height,
        );

        // 绘制Y轴刻度和标签
        let num_y_labels = 5;
        ctx.set_fill_style_str(ChartColors::TEXT);
        ctx.set_font("10px Arial");
        ctx.set_text_align("right");
        ctx.set_text_baseline("middle");

        // 从高到低绘制Y轴标签
        for i in 0..=num_y_labels {
            let price = max_high - (effective_price_range * i as f64 / num_y_labels as f64);
            let y = layout.map_price_to_y(price, min_low, max_high);

            // 绘制标签
            let _ = ctx.fill_text(&format!("{:.2}", price), layout.y_axis_width - 5.0, y);

            // 绘制网格线
            ctx.set_stroke_style_str(ChartColors::GRID);
            ctx.set_line_width(0.5);
            ctx.begin_path();
            ctx.move_to(layout.y_axis_width, y);
            ctx.line_to(layout.canvas_width, y);
            ctx.stroke();
        }

        // 绘制Y轴右边界
        ctx.set_stroke_style_str(ChartColors::BORDER);
        ctx.set_line_width(1.0);
        ctx.begin_path();
        ctx.move_to(layout.y_axis_width, layout.header_height);
        ctx.line_to(
            layout.y_axis_width,
            layout.header_height + layout.price_chart_height,
        );
        ctx.stroke();
    }

    /// 绘制成交量Y轴
    fn draw_volume_y_axis(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        max_volume: f64,
    ) {
        // 绘制Y轴背景
        ctx.set_fill_style_str(ChartColors::HEADER_BG);
        ctx.fill_rect(
            0.0,
            layout.volume_chart_y,
            layout.y_axis_width,
            layout.volume_chart_height,
        );

        // 绘制Y轴刻度和标签
        let num_y_labels = 2; // 成交量图只需要少量标签
        ctx.set_fill_style_str(ChartColors::TEXT);
        ctx.set_font("10px Arial");
        ctx.set_text_align("right");
        ctx.set_text_baseline("middle");

        // 绘制Y轴标签
        for i in 0..=num_y_labels {
            let volume = max_volume * i as f64 / num_y_labels as f64;
            let y = layout.map_volume_to_y(volume, max_volume);

            // 格式化成交量显示
            let volume_text = if volume >= 1_000_000.0 {
                format!("{:.1}M", volume / 1_000_000.0)
            } else if volume >= 1_000.0 {
                format!("{:.1}K", volume / 1_000.0)
            } else {
                format!("{:.0}", volume)
            };

            // 绘制标签
            let _ = ctx.fill_text(&volume_text, layout.y_axis_width - 5.0, y);

            // 绘制网格线
            ctx.set_stroke_style_str(ChartColors::GRID);
            ctx.set_line_width(0.5);
            ctx.begin_path();
            ctx.move_to(layout.y_axis_width, y);
            ctx.line_to(layout.canvas_width, y);
            ctx.stroke();
        }

        // 绘制Y轴右边界
        ctx.set_stroke_style_str(ChartColors::BORDER);
        ctx.set_line_width(1.0);
        ctx.begin_path();
        ctx.move_to(layout.y_axis_width, layout.volume_chart_y);
        ctx.line_to(
            layout.y_axis_width,
            layout.volume_chart_y + layout.volume_chart_height,
        );
        ctx.stroke();
    }

    /// 绘制X轴
    fn draw_x_axis(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
    ) {
        // X轴位置
        let x_axis_y = layout.header_height + layout.main_chart_height;

        // 绘制X轴背景
        ctx.set_fill_style_str("#F5F5F5");
        ctx.fill_rect(0.0, x_axis_y, layout.canvas_width, layout.time_axis_height);

        // 绘制X轴上边界
        ctx.set_stroke_style_str("#CCCCCC");
        ctx.set_line_width(1.0);
        ctx.begin_path();
        ctx.move_to(0.0, x_axis_y);
        ctx.line_to(layout.canvas_width, x_axis_y);
        ctx.stroke();

        // 计算可显示的K线数量
        let visible_candles = (layout.chart_area_width / layout.total_candle_width) as usize;
        let start_idx = if items.len() > visible_candles {
            items.len() - visible_candles
        } else {
            0
        };

        // 每100像素显示一个时间标签
        let label_spacing = 100.0;
        let labels_count = (layout.chart_area_width / label_spacing).ceil() as usize;

        ctx.set_fill_style_str("#333333");
        ctx.set_font("10px Arial");
        ctx.set_text_align("center");
        ctx.set_text_baseline("top");

        for i in 0..=labels_count {
            let x = layout.chart_area_x + i as f64 * label_spacing;
            if x >= layout.chart_area_x && x <= layout.canvas_width {
                // 计算对应的数据索引
                let data_idx =
                    start_idx + ((i as f64 * label_spacing) / layout.total_candle_width) as usize;
                if data_idx < items.len() {
                    let item = items.get(data_idx);
                    let timestamp = item.timestamp();

                    // 将时间戳转换为可读格式
                    let date = js_sys::Date::new(&JsValue::from_f64(timestamp as f64 * 1000.0));
                    let time_str = format!("{:02}:{:02}", date.get_hours(), date.get_minutes());
                    let date_str = format!("{:02}/{:02}", date.get_month() + 1, date.get_date());

                    // 绘制时间标签（两行）
                    let _ = ctx.fill_text(&date_str, x, x_axis_y + 5.0);
                    let _ = ctx.fill_text(&time_str, x, x_axis_y + 20.0);

                    // 绘制垂直网格线
                    ctx.set_stroke_style_str("#EEEEEE");
                    ctx.set_line_width(0.5);
                    ctx.begin_path();
                    ctx.move_to(x, layout.header_height);
                    ctx.line_to(x, x_axis_y);
                    ctx.stroke();
                }
            }
        }
    }

    /// 绘制标题和图例
    fn draw_header(&self, ctx: &OffscreenCanvasRenderingContext2d, layout: &ChartLayout) {
        // 绘制标题区域背景
        ctx.set_fill_style_str(ChartColors::HEADER_BG);
        ctx.fill_rect(0.0, 0.0, layout.canvas_width, layout.header_height);
        // 绘制标题
        ctx.set_fill_style_str(ChartColors::TEXT);
        ctx.set_font("bold 14px Arial");
        ctx.set_text_align("left");
        ctx.set_text_baseline("middle");
        let _ = ctx.fill_text("K线图", layout.padding, layout.header_height / 2.0);
        // 绘制图例
        let legend_x = layout.canvas_width - 120.0;
        let legend_y = layout.header_height / 2.0;
        // 绿色上涨
        ctx.set_fill_style_str(ChartColors::BULLISH);
        ctx.fill_rect(legend_x, legend_y - 5.0, 10.0, 10.0);
        ctx.set_fill_style_str(ChartColors::TEXT);
        ctx.set_font("12px Arial");
        ctx.set_text_align("left");
        let _ = ctx.fill_text("上涨", legend_x + 15.0, legend_y);
        // 红色下跌
        ctx.set_fill_style_str(ChartColors::BEARISH);
        ctx.fill_rect(legend_x + 60.0, legend_y - 5.0, 10.0, 10.0);
        ctx.set_fill_style_str(ChartColors::TEXT);
        let _ = ctx.fill_text("下跌", legend_x + 75.0, legend_y);
    }
}
