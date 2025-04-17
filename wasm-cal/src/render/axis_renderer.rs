//! 坐标轴模块 - 负责绘制X轴和Y轴

use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartColors, ChartLayout};
use chrono::DateTime; // 调整导入，移除 NaiveDateTime 和 TimeZone (如果不再需要)
use flatbuffers;
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
        let layout_ref = canvas_manager.layout.borrow(); // 使用 borrow 获取引用
        // 绘制价格Y轴
        self.draw_price_y_axis(ctx, &layout_ref, min_low, max_high);
        // 绘制成交量Y轴
        self.draw_volume_y_axis(ctx, &layout_ref, max_volume);
        // 绘制X轴
        self.draw_x_axis(ctx, &layout_ref, items);
        // 绘制标题和图例
        self.draw_header(ctx, &layout_ref);
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

        // --- 绘制Y轴背景 (Y轴标签区域) ---
        // 确保只绘制在 Y 轴区域
        ctx.set_fill_style_str(ChartColors::HEADER_BG); // 通常是白色或浅色
        ctx.fill_rect(
            0.0, // 从画布最左侧开始
            layout.header_height,
            layout.y_axis_width,       // 宽度为 Y 轴宽度
            layout.price_chart_height, // 高度为价格图高度
        );

        // --- 绘制价格区域的交替背景色 ---
        // 修正：确保背景色只绘制在 chart_area 内
        let num_y_bands = 5; // 与标签数量一致
        let band_height = layout.price_chart_height / num_y_bands as f64;
        for i in 0..num_y_bands {
            let band_y = layout.header_height + i as f64 * band_height;
            let color = if i % 2 == 0 {
                ChartColors::BACKGROUND // 例如 "#ffffff"
            } else {
                ChartColors::GRID // 例如 "#f0f3fa" (浅蓝灰)
            };
            ctx.set_fill_style_str(color);
            // 修正：X坐标从 chart_area_x 开始，宽度为 chart_area_width
            ctx.fill_rect(
                layout.chart_area_x, // 从图表区域左边界开始
                band_y,
                layout.chart_area_width, // 宽度限制在图表区域
                band_height,
            );
        }

        // --- 绘制Y轴刻度和标签 ---
        // (标签绘制逻辑不变)
        let num_y_labels = 5;
        ctx.set_fill_style_str(ChartColors::TEXT); // 使用更深的文本颜色
        ctx.set_font("10px Arial");
        ctx.set_text_align("right");
        ctx.set_text_baseline("middle");

        // 从高到低绘制Y轴标签
        for i in 0..=num_y_labels {
            let price = max_high - (effective_price_range * i as f64 / num_y_labels as f64);
            // 确保价格不为负无穷或正无穷
            if !price.is_finite() {
                continue;
            }
            let mut y = layout.map_price_to_y(price, min_low, max_high);

            // 调整最低标签的 Y 坐标，防止被截断 (基于 10px 字体大小)
            if i == num_y_labels {
                y -= 5.0; // 向上移动半个字体高度
            }
            // 调整最高标签的 Y 坐标，防止被截断
            if i == 0 {
                y += 5.0; // 向下移动半个字体高度
            }

            // 绘制标签 (位置不变，仍在 Y 轴区域内)
            let _ = ctx.fill_text(&format!("{:.2}", price), layout.y_axis_width - 5.0, y);
        }
    }

    /// 绘制成交量Y轴
    fn draw_volume_y_axis(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        max_volume: f64,
    ) {
        // --- 绘制Y轴背景 (Y轴标签区域) ---
        // 位置和高度不变，因为 layout.volume_chart_y 已包含间距
        ctx.set_fill_style_str(ChartColors::HEADER_BG);
        ctx.fill_rect(
            0.0,
            layout.volume_chart_y,
            layout.y_axis_width,
            layout.volume_chart_height,
        );

        // --- 绘制Y轴刻度和标签 ---
        let num_y_labels = 2; // 成交量图只需要少量标签
        ctx.set_fill_style_str(ChartColors::TEXT); // 使用更深的文本颜色
        ctx.set_font("10px Arial");
        ctx.set_text_align("right");
        ctx.set_text_baseline("middle");

        // 绘制Y轴标签
        for i in 0..=num_y_labels {
            let volume = max_volume * i as f64 / num_y_labels as f64;
            // 确保成交量不为负无穷或正无穷
            if !volume.is_finite() {
                continue;
            }
            let mut y = layout.map_volume_to_y(volume, max_volume);

            // 调整最低标签 (0) 的 Y 坐标，防止被截断 (基于 10px 字体大小)
            if i == 0 {
                y -= 5.0; // 向上移动半个字体高度
            }
            // 调整最高标签的 Y 坐标，防止被截断
            if i == num_y_labels {
                y += 5.0; // 向下移动半个字体高度
            }

            // 格式化成交量显示
            let volume_text = if volume >= 1_000_000.0 {
                format!("{:.1}M", volume / 1_000_000.0)
            } else if volume >= 1_000.0 {
                format!("{:.1}K", volume / 1_000.0)
            } else {
                format!("{:.0}", volume) // 0 值显示为 "0"
            };

            // 绘制标签
            let _ = ctx.fill_text(&volume_text, layout.y_axis_width - 5.0, y);
        }
    }

    /// 绘制X轴
    fn draw_x_axis(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
    ) {
        // X轴位置 (图表区域底部)
        let x_axis_y = layout.header_height + layout.chart_area_height;
        // 时间轴标签绘制的Y坐标起点 (X轴下方)
        let time_label_y_start = x_axis_y + 5.0; // 在X轴下方留出一点空隙

        // 绘制X轴背景 (时间轴区域)
        ctx.set_fill_style_str(ChartColors::HEADER_BG); // 使用与Y轴背景一致的颜色
        ctx.fill_rect(
            0.0, // 从画布左边缘开始
            x_axis_y,
            layout.canvas_width, // 宽度覆盖整个画布
            layout.time_axis_height,
        );

        // 绘制X轴上边界 (图表区域底部的分隔线)
        ctx.set_stroke_style_str(ChartColors::BORDER); // 使用标准边框颜色
        ctx.set_line_width(1.0);
        ctx.begin_path();
        ctx.move_to(layout.chart_area_x, x_axis_y); // 从图表区域左边界开始
        ctx.line_to(layout.chart_area_x + layout.chart_area_width, x_axis_y); // 到图表区域右边界结束
        ctx.stroke();

        // --- X轴标签和垂直网格线绘制逻辑 ---
        // 获取可见区域的起始索引和数量
        let visible_start = layout.navigator_visible_start;
        let visible_count = layout.navigator_visible_count;
        let visible_end = (visible_start + visible_count).min(items.len());

        // 如果没有可见数据，则不绘制标签和网格线
        if visible_start >= visible_end {
            return;
        }

        // 优化：计算第一个和最后一个可见标签的X坐标
        let first_visible_x = layout.chart_area_x;
        let last_visible_x = layout.chart_area_x + layout.chart_area_width;

        // 动态计算标签间距，避免过于密集或稀疏
        let min_label_spacing = 70.0; // 最小标签间距（像素）
        let max_labels = (layout.chart_area_width / min_label_spacing).floor() as usize;
        let total_visible_candles = visible_count;
        let candle_interval = (total_visible_candles as f64 / max_labels as f64)
            .ceil()
            .max(1.0) as usize; // 每隔多少根K线显示一个标签

        ctx.set_fill_style_str(ChartColors::TEXT); // 使用更深的文本颜色
        ctx.set_font("10px Arial");
        ctx.set_text_align("center");
        ctx.set_text_baseline("top");

        // 绘制垂直网格线和时间标签
        for i in (0..visible_count).step_by(candle_interval) {
            let data_idx = visible_start + i;
            if data_idx >= items.len() {
                break; // 超出数据范围
            }

            // 计算当前K线中心点的X坐标 (相对于画布)
            let x = layout.chart_area_x
                + (i as f64 * layout.total_candle_width)
                + layout.candle_width / 2.0;

            // 仅在可见区域内绘制
            if x >= first_visible_x && x <= last_visible_x {
                let item = items.get(data_idx);
                let timestamp_secs = item.timestamp() as i64; // 获取 Unix 时间戳 (秒)

                // --- 使用 chrono::DateTime::from_timestamp 转换和格式化时间戳 ---
                // 直接将 Unix 时间戳（秒）转换为 DateTime<Utc>
                let dt = DateTime::from_timestamp(timestamp_secs, 0)
                    .unwrap_or_else(|| DateTime::from_timestamp(0, 0).unwrap()); // 处理可能的转换失败，提供默认值（纪元开始）

                // 格式化时间字符串
                let time_str = dt.format("%H:%M").to_string(); // 时:分
                let date_str = dt.format("%y/%m/%d").to_string(); // 月/日
                // --- 结束 chrono 处理 ---

                // 绘制时间标签（两行）
                let _ = ctx.fill_text(&date_str, x, time_label_y_start);
                let _ = ctx.fill_text(&time_str, x, time_label_y_start + 12.0); // 第二行标签位置
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
