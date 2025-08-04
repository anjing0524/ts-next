//! 坐标轴模块 - 负责绘制X轴和Y轴

use crate::canvas::CanvasLayerType;
use crate::config::ChartTheme;
use crate::layout::{ChartLayout, CoordinateMapper, PaneId};
use crate::render::chart_renderer::RenderMode;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};
use crate::utils::time;
use std::cmp::Ordering;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 坐标轴绘制器
pub struct AxisRenderer;

// ===== 常量定义 =====
const FONT_HEIGHT: f64 = 12.0; // 10px字体+2px间距
const MIN_LABEL_SPACING: f64 = 70.0; // X轴最小标签间距
const MIN_Y_LABEL_DIST: f64 = FONT_HEIGHT * 1.5; // Y轴最小像素间距

impl AxisRenderer {
    /// 绘制交替背景色
    fn draw_alternating_background(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        theme: &ChartTheme,
    ) {
        let price_rect = layout.get_rect(&PaneId::HeatmapArea);

        // 仅在K线区域绘制背景条纹
        let num_y_bands = 5;
        let band_height = price_rect.height / num_y_bands as f64;
        for i in 0..num_y_bands {
            let band_y = price_rect.y + i as f64 * band_height;
            let color = if i % 2 == 0 {
                &theme.background
            } else {
                &theme.grid
            };
            ctx.set_fill_style_str(color);
            ctx.fill_rect(price_rect.x, band_y, price_rect.width, band_height);
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
        if max_high <= min_low || tick <= 0.0 {
            return Vec::new();
        }
        let first_tick = (min_low / tick).ceil() * tick;
        let last_tick = (max_high / tick).floor() * tick;
        let mut tick_vec = Vec::new();
        let mut t = first_tick;
        while t <= last_tick + tick * 0.5 {
            tick_vec.push((t * 1e8).round() / 1e8);
            t += tick;
        }
        let max_labels = (chart_height / FONT_HEIGHT).floor() as usize;
        if tick_vec.len() > max_labels && max_labels > 0 {
            let step = (tick_vec.len() as f64 / max_labels as f64).ceil() as usize;
            tick_vec.into_iter().step_by(step).collect()
        } else {
            tick_vec
        }
    }

    /// 插入极值标签，避免与已有标签重叠
    fn insert_extreme_price_labels(
        &self,
        mut label_points: Vec<(f64, f64)>,
        min_low: f64,
        max_high: f64,
        mapper: &CoordinateMapper,
    ) -> Vec<(f64, f64)> {
        let min_low_y = mapper.map_y(min_low);
        if !label_points
            .iter()
            .any(|&(_, y)| (y - min_low_y).abs() < MIN_Y_LABEL_DIST)
        {
            label_points.push((min_low, min_low_y));
        }
        let max_high_y = mapper.map_y(max_high);
        if !label_points
            .iter()
            .any(|&(_, y)| (y - max_high_y).abs() < MIN_Y_LABEL_DIST)
        {
            label_points.push((max_high, max_high_y));
        }
        label_points.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(Ordering::Equal));
        label_points
    }

    /// 绘制价格Y轴
    fn draw_price_y_axis(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        render_ctx: &RenderContext,
    ) {
        let layout = render_ctx.layout_ref();
        let theme = render_ctx.theme_ref();
        let data_manager = render_ctx.data_manager_ref();
        let (min_low, max_high, _) = data_manager.get_cached_cal();
        let tick = data_manager.get_tick();

        let y_axis_rect = layout.get_rect(&PaneId::YAxis);
        let price_rect = layout.get_rect(&PaneId::HeatmapArea);
        let price_mapper = CoordinateMapper::new_for_y_axis(price_rect, min_low, max_high, 8.0);

        ctx.set_stroke_style_str(&theme.border);
        ctx.set_line_width(1.0);
        ctx.set_fill_style_str(&theme.axis_text);
        ctx.set_font(&theme.font_axis);
        ctx.set_text_align("right");
        ctx.set_text_baseline("middle");

        ctx.begin_path();
        ctx.move_to(y_axis_rect.x + y_axis_rect.width, price_rect.y);
        ctx.line_to(
            y_axis_rect.x + y_axis_rect.width,
            price_rect.y + price_rect.height,
        );
        ctx.stroke();

        let sampled_ticks = self.sample_price_ticks(min_low, max_high, tick, price_rect.height);
        let label_points: Vec<(f64, f64)> = sampled_ticks
            .iter()
            .map(|&price| (price, price_mapper.map_y(price)))
            .collect();

        let final_labels =
            self.insert_extreme_price_labels(label_points, min_low, max_high, &price_mapper);

        for (price, y) in final_labels {
            ctx.begin_path();
            ctx.move_to(y_axis_rect.x + y_axis_rect.width - 3.0, y);
            ctx.line_to(y_axis_rect.x + y_axis_rect.width, y);
            ctx.stroke();

            let label = if price.abs() >= 100.0 {
                format!("{price:.0}")
            } else if price.abs() >= 1.0 {
                format!("{price:.2}")
            } else {
                format!("{price:.4}")
            };
            let _ = ctx.fill_text(&label, y_axis_rect.x + y_axis_rect.width - 5.0, y);
        }
    }

    /// 绘制成交量Y轴
    fn draw_volume_y_axis(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        render_ctx: &RenderContext,
    ) {
        let layout = render_ctx.layout_ref();
        let theme = render_ctx.theme_ref();
        let data_manager = render_ctx.data_manager_ref();
        let (_, _, max_volume) = data_manager.get_cached_cal();

        let y_axis_rect = layout.get_rect(&PaneId::YAxis);
        let volume_rect = layout.get_rect(&PaneId::VolumeChart);
        let volume_mapper = CoordinateMapper::new_for_y_axis(volume_rect, 0.0, max_volume, 2.0);

        // 移除Y轴背景填充，保持透明
        ctx.set_stroke_style_str(&theme.border);
        ctx.set_line_width(1.0);
        ctx.begin_path();
        ctx.move_to(y_axis_rect.x + y_axis_rect.width, volume_rect.y);
        ctx.line_to(
            y_axis_rect.x + y_axis_rect.width,
            volume_rect.y + volume_rect.height,
        );
        ctx.stroke();

        ctx.set_fill_style_str(&theme.axis_text);
        ctx.set_font(&theme.font_axis);
        ctx.set_text_align("right");
        ctx.set_text_baseline("middle");

        let num_y_labels = 2;
        for i in 0..=num_y_labels {
            let volume = max_volume * i as f64 / num_y_labels as f64;
            let y = volume_mapper.map_y(volume);

            ctx.begin_path();
            ctx.move_to(y_axis_rect.x + y_axis_rect.width - 3.0, y);
            ctx.line_to(y_axis_rect.x + y_axis_rect.width, y);
            ctx.stroke();

            let label = time::format_volume(volume, 1);
            let _ = ctx.fill_text(&label, y_axis_rect.x + y_axis_rect.width - 5.0, y);
        }
    }

    /// 绘制标题和图例
    fn draw_header(&self, ctx: &OffscreenCanvasRenderingContext2d, render_ctx: &RenderContext) {
        let layout = render_ctx.layout_ref();
        let theme = render_ctx.theme_ref();
        let config = match render_ctx.config_ref() {
            Some(config) => config,
            None => return, // 如果没有配置，则不绘制标题
        };
        let header_rect = layout.get_rect(&PaneId::Header);

        // 移除头部背景填充，保持透明

        if render_ctx.mode == RenderMode::Kmap {
            ctx.set_stroke_style_str(&theme.border);
            ctx.set_line_width(1.0);
            ctx.begin_path();
            ctx.move_to(header_rect.x, header_rect.y + header_rect.height);
            ctx.line_to(
                header_rect.x + header_rect.width,
                header_rect.y + header_rect.height,
            );
            ctx.stroke();
        }

        ctx.set_fill_style_str(&theme.text);
        ctx.set_font(&theme.font_header);
        ctx.set_text_align("left");
        ctx.set_text_baseline("middle");
        let symbol = config.title.as_ref().unwrap_or(&config.symbol);
        let _ = ctx.fill_text(
            symbol,
            header_rect.x + 8.0,
            header_rect.y + header_rect.height / 2.0,
        );

        let legend_x = header_rect.x + header_rect.width - 120.0;
        let legend_y = header_rect.y + header_rect.height / 2.0;
        ctx.set_fill_style_str(&theme.bullish);
        ctx.fill_rect(legend_x, legend_y - 5.0, 10.0, 10.0);
        ctx.set_fill_style_str(&theme.text);
        ctx.set_font(&theme.font_legend);
        let _ = ctx.fill_text("上涨", legend_x + 15.0, legend_y);
        ctx.set_fill_style_str(&theme.bearish);
        ctx.fill_rect(legend_x + 60.0, legend_y - 5.0, 10.0, 10.0);
        ctx.set_fill_style_str(&theme.text);
        let _ = ctx.fill_text("下跌", legend_x + 75.0, legend_y);
    }

    /// 绘制X轴 (时间轴)
    fn draw_x_axis(&self, ctx: &OffscreenCanvasRenderingContext2d, render_ctx: &RenderContext) {
        let layout = render_ctx.layout_ref();
        let theme = render_ctx.theme_ref();
        let data_manager = render_ctx.data_manager_ref();
        let items = match data_manager.get_items() {
            Some(items) => items,
            None => return,
        };
        let (visible_start, visible_count, visible_end) = data_manager.get_visible();
        if visible_start >= visible_end {
            return;
        }

        let time_axis_rect = layout.get_rect(&PaneId::TimeAxis);
        let main_chart_rect = layout.get_rect(&PaneId::HeatmapArea);

        // 移除时间轴背景填充，保持透明
        ctx.set_stroke_style_str(&theme.border);
        ctx.set_line_width(1.0);
        ctx.begin_path();
        ctx.move_to(time_axis_rect.x, time_axis_rect.y);
        ctx.line_to(time_axis_rect.x + time_axis_rect.width, time_axis_rect.y);
        ctx.stroke();

        let max_labels = (main_chart_rect.width / MIN_LABEL_SPACING).floor() as usize;
        let candle_interval = (visible_count as f64 / max_labels as f64).ceil().max(1.0) as usize;

        ctx.set_fill_style_str(&theme.axis_text);
        ctx.set_font(&theme.font_axis);
        ctx.set_text_align("center");
        ctx.set_text_baseline("top");

        for i in (0..visible_count).step_by(candle_interval) {
            let data_idx = visible_start + i;
            if data_idx >= items.len() {
                break;
            }

            let x = main_chart_rect.x
                + (i as f64 * layout.total_candle_width)
                + layout.candle_width / 2.0;
            if x > main_chart_rect.x + main_chart_rect.width {
                break;
            }

            let item = items.get(data_idx);
            let timestamp_secs = item.timestamp() as i64;
            let time_str = time::format_timestamp(timestamp_secs, "%H:%M");
            let date_str = time::format_timestamp(timestamp_secs, "%y/%m/%d");

            let _ = ctx.fill_text(&date_str, x, time_axis_rect.y + 5.0);
            let _ = ctx.fill_text(&time_str, x, time_axis_rect.y + 17.0);
        }
    }
}

impl RenderStrategy for AxisRenderer {
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError> {
        let canvas_manager = ctx.canvas_manager_ref();
        let base_ctx = canvas_manager.get_context(CanvasLayerType::Base);
        let layout = ctx.layout_ref();
        let theme = ctx.theme_ref();

        if ctx.mode == RenderMode::Kmap {
            self.draw_alternating_background(base_ctx, &layout, theme);
        }
        self.draw_header(base_ctx, ctx);
        self.draw_price_y_axis(base_ctx, ctx);
        self.draw_volume_y_axis(base_ctx, ctx);
        self.draw_x_axis(base_ctx, ctx);

        Ok(())
    }

    fn supports_mode(&self, _mode: RenderMode) -> bool {
        true
    }

    fn get_layer_type(&self) -> CanvasLayerType {
        CanvasLayerType::Base
    }

    fn get_priority(&self) -> u32 {
        5
    }
}
