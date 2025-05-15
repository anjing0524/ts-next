//! 坐标轴模块 - 负责绘制X轴和Y轴

use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::data::DataManager;
use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartColors, ChartLayout};
use crate::utils::time;
use crate::render::chart_renderer::RenderMode;
use flatbuffers;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 坐标轴绘制器
pub struct AxisRenderer;

impl AxisRenderer {
    /// 绘制所有坐标轴
    pub fn draw(&self, canvas_manager: &CanvasManager, data_manager: &Rc<RefCell<DataManager>>, mode: RenderMode) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Base);
        let layout_ref = canvas_manager.layout.borrow(); // 使用 borrow 获取引用
        let data_manager_ref = data_manager.borrow(); // 使用 borrow 获取引用
        let items = match data_manager_ref.get_items() {
            Some(items) => items,
            None => return,
        };
        let (min_low, max_high, max_volume) = data_manager_ref.get_cached_cal();
        
        // 优先绘制标题和图例以确保头部区域被正确清空和绘制
        self.draw_header(&ctx, &layout_ref, mode);
        
        // 只在K线图模式下绘制交替背景色
        if mode == RenderMode::KMAP {
            self.draw_alternating_background(&ctx, &layout_ref);
        } else {
            // 热图模式下，使用热图配色方案中最深的颜色作为背景
            // self.draw_heatmap_background(&ctx, &layout_ref);
        }
        
        // 绘制价格Y轴
        self.draw_price_y_axis(&ctx, &layout_ref, min_low, max_high);
        
        // 绘制成交量Y轴
        self.draw_volume_y_axis(&ctx, &layout_ref, max_volume);
        
        // 绘制X轴
        self.draw_x_axis(&ctx, &layout_ref, items, data_manager);
    }

    /// 绘制交替背景色
    fn draw_alternating_background(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
    ) {
        // 绘制主要价格图区域的交替背景色
        let num_y_bands = 5; // 与标签数量一致
        let band_height = layout.price_chart_height / num_y_bands as f64;

        for i in 0..num_y_bands {
            let band_y = layout.header_height + i as f64 * band_height;
            let color = if i % 2 == 0 {
                ChartColors::BACKGROUND // 主要背景色
            } else {
                ChartColors::GRID // 交替背景色 (浅灰色)
            };

            ctx.set_fill_style_str(color);
            ctx.fill_rect(
                layout.chart_area_x, // 从图表区域左边界开始
                band_y,
                layout.main_chart_width, // 只绘制主图区域宽度
                band_height,
            );
        }

        // 绘制成交量图区域的交替背景色
        let vol_num_y_bands = 2; // 成交量区域通常只需要2个区域
        let vol_band_height = layout.volume_chart_height / vol_num_y_bands as f64;

        for i in 0..vol_num_y_bands {
            let band_y = layout.volume_chart_y + i as f64 * vol_band_height;
            let color = if i % 2 == 0 {
                ChartColors::BACKGROUND // 主要背景色
            } else {
                ChartColors::GRID // 交替背景色 (浅灰色)
            };

            ctx.set_fill_style_str(color);
            ctx.fill_rect(
                layout.chart_area_x, // 从图表区域左边界开始
                band_y,
                layout.main_chart_width, // 只绘制主图区域宽度
                vol_band_height,
            );
        }
    }

    /// 绘制价格Y轴
    fn draw_price_y_axis(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        min_low: f64,
        max_high: f64,
    ) {
        // 设置轴线和标签样式
        ctx.set_stroke_style_str(ChartColors::BORDER);  // 使用 BORDER 颜色替代 AXIS
        ctx.set_line_width(1.0);
        ctx.set_fill_style_str(ChartColors::AXIS_TEXT);
        ctx.set_font("10px Arial");
        ctx.set_text_align("right");
        ctx.set_text_baseline("middle");
        
        // 绘制Y轴
        ctx.begin_path();
        ctx.move_to(layout.chart_area_x, layout.chart_area_y);
        ctx.line_to(layout.chart_area_x, layout.chart_area_y + layout.chart_area_height);
        ctx.stroke();
        
        // 计算价格区间，创建等距网格线
        let price_range = max_high - min_low;
        if price_range <= 0.0 {
            return;
        }
        
        // 决定网格线数量 - 使用图表布局中的值
        let grid_count = layout.grid_line_count;
        let step = price_range / grid_count as f64;
        
        // 绘制价格标签
        for i in 0..=grid_count {
            let price = min_low + step * i as f64;
            let y = layout.map_price_to_y(price, min_low, max_high);
            
            let price_text = if price_range > 100.0 {
                format!("{:.0}", price)
            } else {
                format!("{:.2}", price)
            };
            
            ctx.fill_text(
                &price_text,
                layout.chart_area_x - 5.0,
                y,
            ).unwrap_or_default();
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
        ctx.set_fill_style_str(ChartColors::HEADER_BG);
        ctx.fill_rect(
            0.0,
            layout.volume_chart_y,
            layout.y_axis_width,
            layout.volume_chart_height,
        );

        // --- 绘制Y轴右侧边界线 ---
        ctx.set_stroke_style_str(ChartColors::BORDER);
        ctx.set_line_width(1.0);
        ctx.begin_path();
        ctx.move_to(layout.y_axis_width, layout.volume_chart_y);
        ctx.line_to(
            layout.y_axis_width,
            layout.volume_chart_y + layout.volume_chart_height,
        );
        ctx.stroke();

        // --- 绘制Y轴刻度和标签 ---
        let num_y_labels = 2; // 成交量图只需要少量标签
        ctx.set_fill_style_str(ChartColors::AXIS_TEXT);
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

            // Map volume to Y coordinate
            let mut y = layout.map_volume_to_y(volume, max_volume);

            // If this is the zero line (i == 0), shift it up slightly to prevent overlap with the bottom border
            if i == 0 {
                y -= 2.0; // Shift up by 1 pixel
            }

            // 使用ChartLayout的方法格式化成交量 - 改为使用 render::utils::format_volume
            let volume_text = time::format_volume(volume, 1);

            // 绘制标签
            let _ = ctx.fill_text(&volume_text, layout.y_axis_width - 5.0, y);

            // 绘制小刻度线
            ctx.set_stroke_style_str(ChartColors::BORDER);
            ctx.begin_path();
            ctx.move_to(layout.y_axis_width - 3.0, y);
            ctx.line_to(layout.y_axis_width, y);
            ctx.stroke();
        }
    }

    /// 绘制标题和图例
    fn draw_header(&self, ctx: &OffscreenCanvasRenderingContext2d, layout: &ChartLayout, mode: RenderMode) {
        // 绘制标题区域背景
        ctx.set_fill_style_str(ChartColors::HEADER_BG);
        ctx.fill_rect(0.0, 0.0, layout.canvas_width, layout.header_height);

        // 只在KMAP模式下绘制标题区域底部边界
        if mode == RenderMode::KMAP {
            ctx.set_stroke_style_str(ChartColors::BORDER);
            ctx.set_line_width(1.0);
            ctx.begin_path();
            ctx.move_to(0.0, layout.header_height);
            ctx.line_to(layout.canvas_width, layout.header_height);
            ctx.stroke();
        }

        // 绘制标题
        ctx.set_fill_style_str(ChartColors::TEXT);
        ctx.set_font("bold 14px Arial");
        ctx.set_text_align("left");
        ctx.set_text_baseline("middle");
        let _ = ctx.fill_text("BTC/USDT", layout.padding, layout.header_height / 2.0);

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

    /// 绘制X轴 (时间轴)
    fn draw_x_axis(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        data_manager: &Rc<RefCell<DataManager>>,
    ) {
        let data_manager_ref = data_manager.borrow();
        // 获取可见范围
        let (visible_start, visible_count, visible_end) = data_manager_ref.get_visible();

        if visible_start >= visible_end {
            return;
        }

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
        ctx.line_to(layout.chart_area_x + layout.main_chart_width, x_axis_y); // 只到主图区域右边界
        ctx.stroke();

        // 动态计算标签间距，避免过于密集或稀疏
        let min_label_spacing = 70.0; // 最小标签间距（像素）
        let max_labels = (layout.main_chart_width / min_label_spacing).floor() as usize;
        let candle_interval = (visible_count as f64 / max_labels as f64)
            .ceil()
            .max(1.0) as usize; // 每隔多少根K线显示一个标签

        ctx.set_fill_style_str(ChartColors::AXIS_TEXT); // 使用更深的文本颜色
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
            if x > layout.chart_area_x + layout.main_chart_width {
                break; // 不绘制到订单簿区域
            }

            let item = items.get(data_idx);
            let timestamp_secs = item.timestamp() as i64; // 获取 Unix 时间戳 (秒)

            // 使用ChartLayout的方法格式化时间戳 - 改为使用 render::utils::format_timestamp
            let time_str = time::format_timestamp(timestamp_secs, "%H:%M");
            let date_str = time::format_timestamp(timestamp_secs, "%y/%m/%d");

            // 绘制时间标签（两行）
            let _ = ctx.fill_text(&date_str, x, time_label_y_start);
            let _ = ctx.fill_text(&time_str, x, time_label_y_start + 12.0); // 第二行标签位置
        }
    }
}
