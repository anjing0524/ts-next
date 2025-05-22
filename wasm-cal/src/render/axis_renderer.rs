//! 坐标轴模块 - 负责绘制X轴和Y轴

use crate::{
    canvas::{CanvasLayerType, CanvasManager},
    data::DataManager,
    kline_generated::kline::KlineItem,
    layout::{ChartColors, ChartFont, ChartLayout},
    render::{chart_renderer::RenderMode, traits::ComprehensiveRenderer},
    utils::time,
};
use flatbuffers;
use std::cell::RefCell;
use std::cmp::Ordering;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 坐标轴绘制器
pub struct AxisRenderer;

// ===== 常量定义 =====
const FONT_HEIGHT: f64 = 12.0; // 10px字体+2px间距
const MIN_LABEL_SPACING: f64 = 70.0; // X轴最小标签间距
const MIN_Y_LABEL_DIST: f64 = FONT_HEIGHT * 0.8; // Y轴最小像素间距

/// 简化的Y轴标签参数
pub struct YAxisLabelParams<'a> {
    /// 画布上下文
    pub ctx: &'a OffscreenCanvasRenderingContext2d,
    /// 图表布局
    pub layout: &'a ChartLayout,
    /// 要显示的值
    pub values: &'a [f64],
    /// 文本X坐标
    pub x_text: f64,
    /// 刻度线X坐标
    pub x_tick: f64,
    /// 轴类型 (价格或成交量)
    pub axis_type: AxisType,
}

/// Y轴类型
pub enum AxisType {
    /// 价格轴
    Price {
        /// 最低价格
        min_low: f64,
        /// 最高价格
        max_high: f64,
    },
    /// 成交量轴
    Volume {
        /// 最大成交量
        max_volume: f64,
    },
}

impl ComprehensiveRenderer for AxisRenderer {
    /// 绘制所有坐标轴
    fn render_component(
        &self,
        canvas_manager: &CanvasManager,
        _layout_param: &ChartLayout, // layout will be obtained from canvas_manager
        data_manager: &Rc<RefCell<DataManager>>,
        mode: RenderMode,
    ) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Base);
        let layout_ref = canvas_manager.layout.borrow();
        let data_manager_ref = data_manager.borrow();
        let items = match data_manager_ref.get_items() {
            Some(items) => items,
            None => return,
        };
        let (min_low, max_high, max_volume) = data_manager_ref.get_cached_cal();
        let tick = data_manager_ref.get_tick();
        self.draw_header(ctx, &layout_ref, mode);
        if mode == RenderMode::Kmap {
            self.draw_alternating_background(ctx, &layout_ref);
        }
        // 优化：抽象Y轴标签绘制
        self.draw_price_y_axis(ctx, &layout_ref, min_low, max_high, tick);
        self.draw_volume_y_axis(ctx, &layout_ref, max_volume);
        self.draw_x_axis(ctx, &layout_ref, items, data_manager);
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

    /// 采样价格tick节点
    fn sample_price_ticks(
        &self,
        min_low: f64,
        max_high: f64,
        tick: f64,
        chart_height: f64,
    ) -> Vec<f64> {
        let first_tick = (min_low / tick).ceil() * tick;
        let last_tick = (max_high / tick).floor() * tick;
        let mut tick_vec = Vec::new();
        let mut t = first_tick;
        while t <= last_tick + tick * 0.5 {
            tick_vec.push((t * 1e8).round() / 1e8);
            t += tick;
        }
        let max_labels = (chart_height / FONT_HEIGHT).floor() as usize;
        let tick_count = tick_vec.len();
        let mut sampled_ticks = Vec::new();
        if tick_count > max_labels && max_labels > 0 {
            let step = (tick_count as f64 / max_labels as f64).ceil() as usize;
            for (i, &v) in tick_vec.iter().enumerate() {
                if i % step == 0 {
                    sampled_ticks.push(v);
                }
            }
        } else {
            sampled_ticks = tick_vec;
        }
        sampled_ticks
    }

    /// 插入极值标签，避免与已有标签重叠
    fn insert_extreme_price_labels(
        &self,
        mut label_points: Vec<(f64, f64)>,
        min_low: f64,
        max_high: f64,
        layout: &ChartLayout,
    ) -> Vec<(f64, f64)> {
        let min_low_tick = (min_low * 1e8).round() / 1e8;
        let max_high_tick = (max_high * 1e8).round() / 1e8;
        let min_low_y = layout.map_price_to_y(min_low_tick, min_low, max_high);
        let max_high_y = layout.map_price_to_y(max_high_tick, min_low, max_high);
        if !label_points
            .iter()
            .any(|&(_, y)| (y - min_low_y).abs() < MIN_Y_LABEL_DIST)
        {
            label_points.push((min_low_tick, min_low_y));
        }
        if !label_points
            .iter()
            .any(|&(_, y)| (y - max_high_y).abs() < MIN_Y_LABEL_DIST)
        {
            label_points.push((max_high_tick, max_high_y));
        }
        label_points.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(Ordering::Equal));
        label_points
    }

    /// 通用Y轴标签绘制
    fn draw_y_axis_labels(&self, params: YAxisLabelParams<'_>) {
        for &v in params.values {
            // 根据轴类型计算Y坐标
            let y = match &params.axis_type {
                AxisType::Price { min_low, max_high } => {
                    params.layout.map_price_to_y(v, *min_low, *max_high)
                }
                AxisType::Volume { max_volume } => {
                    params.layout.map_volume_to_y(v, *max_volume) - if v == 0.0 { 2.0 } else { 0.0 }
                }
            };

            // 绘制短横线
            params.ctx.set_stroke_style_str(ChartColors::BORDER);
            params.ctx.begin_path();
            params.ctx.move_to(params.x_tick, y);
            params.ctx.line_to(params.layout.chart_area_x, y);
            params.ctx.stroke();

            // 绘制文本
            let label = match &params.axis_type {
                AxisType::Price { .. } => {
                    if v.abs() >= 100.0 {
                        format!("{:.0}", v)
                    } else if v.abs() >= 1.0 {
                        format!("{:.2}", v)
                    } else {
                        format!("{:.4}", v)
                    }
                }
                AxisType::Volume { .. } => time::format_volume(v, 1),
            };

            if params.ctx.fill_text(&label, params.x_text, y).is_err() {
                // 可选：记录日志或忽略
            }
        }
    }

    /// 绘制价格Y轴（重构后）
    fn draw_price_y_axis(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        min_low: f64,
        max_high: f64,
        tick: f64,
    ) {
        ctx.set_stroke_style_str(ChartColors::BORDER);
        ctx.set_line_width(1.0);
        ctx.set_fill_style_str(ChartColors::AXIS_TEXT);
        ctx.set_font(ChartFont::AXIS);
        ctx.set_text_align("right");
        ctx.set_text_baseline("middle");
        ctx.begin_path();
        ctx.move_to(layout.chart_area_x, layout.chart_area_y);
        ctx.line_to(
            layout.chart_area_x,
            layout.chart_area_y + layout.chart_area_height,
        );
        ctx.stroke();
        let price_range = max_high - min_low;
        if price_range <= 0.0 || tick <= 0.0 {
            return;
        }
        let sampled_ticks =
            self.sample_price_ticks(min_low, max_high, tick, layout.price_chart_height);
        let label_points: Vec<(f64, f64)> = sampled_ticks
            .iter()
            .map(|&price| {
                let y = layout.map_price_to_y(price, min_low, max_high);
                (price, y)
            })
            .collect();
        let label_points =
            self.insert_extreme_price_labels(label_points, min_low, max_high, layout);

        // 使用简化的Y轴标签参数
        self.draw_y_axis_labels(YAxisLabelParams {
            ctx,
            layout,
            values: &label_points.iter().map(|&(p, _)| p).collect::<Vec<_>>(),
            x_text: layout.chart_area_x - 5.0,
            x_tick: layout.chart_area_x - 3.0,
            axis_type: AxisType::Price { min_low, max_high },
        });
    }

    /// 绘制成交量Y轴（重构后）
    fn draw_volume_y_axis(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        max_volume: f64,
    ) {
        ctx.set_fill_style_str(ChartColors::HEADER_BG);
        ctx.fill_rect(
            0.0,
            layout.volume_chart_y,
            layout.y_axis_width,
            layout.volume_chart_height,
        );
        ctx.set_stroke_style_str(ChartColors::BORDER);
        ctx.set_line_width(1.0);
        ctx.begin_path();
        ctx.move_to(layout.y_axis_width, layout.volume_chart_y);
        ctx.line_to(
            layout.y_axis_width,
            layout.volume_chart_y + layout.volume_chart_height,
        );
        ctx.stroke();
        ctx.set_fill_style_str(ChartColors::AXIS_TEXT);
        ctx.set_font(ChartFont::AXIS);
        ctx.set_text_align("right");
        ctx.set_text_baseline("middle");
        let num_y_labels = 2;
        let values: Vec<f64> = (0..=num_y_labels)
            .map(|i| max_volume * i as f64 / num_y_labels as f64)
            .filter(|v| v.is_finite())
            .collect();

        // 使用简化的Y轴标签参数
        self.draw_y_axis_labels(YAxisLabelParams {
            ctx,
            layout,
            values: &values,
            x_text: layout.y_axis_width - 5.0,
            x_tick: layout.y_axis_width - 3.0,
            axis_type: AxisType::Volume { max_volume },
        });
    }

    /// 绘制标题和图例
    fn draw_header(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        mode: RenderMode,
    ) {
        // 绘制标题区域背景
        ctx.set_fill_style_str(ChartColors::HEADER_BG);
        ctx.fill_rect(0.0, 0.0, layout.canvas_width, layout.header_height);

        // 只在Kmap模式下绘制标题区域底部边界
        if mode == RenderMode::Kmap {
            ctx.set_stroke_style_str(ChartColors::BORDER);
            ctx.set_line_width(1.0);
            ctx.begin_path();
            ctx.move_to(0.0, layout.header_height);
            ctx.line_to(layout.canvas_width, layout.header_height);
            ctx.stroke();
        }

        // 绘制标题
        ctx.set_fill_style_str(ChartColors::TEXT);
        ctx.set_font(ChartFont::HEADER);
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
        ctx.set_font(ChartFont::LEGEND);
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
        let max_labels = (layout.main_chart_width / MIN_LABEL_SPACING).floor() as usize;
        let candle_interval = (visible_count as f64 / max_labels as f64).ceil().max(1.0) as usize; // 每隔多少根K线显示一个标签

        ctx.set_fill_style_str(ChartColors::AXIS_TEXT); // 使用更深的文本颜色
        ctx.set_font(ChartFont::AXIS);
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
