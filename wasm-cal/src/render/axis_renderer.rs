//! 坐标轴模块 - 负责绘制X轴和Y轴

use crate::{
    canvas::{CanvasLayerType, CanvasManager},
    data::DataManager,
    kline_generated::kline::KlineItem,
    layout::{ChartColors, ChartFont, ChartLayout, theme::*}, // Added theme::*
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

// Local consts FONT_HEIGHT, MIN_LABEL_SPACING, MIN_Y_LABEL_DIST are removed

/// 简化的Y轴标签参数
// ... (struct YAxisLabelParams remains the same) ...
pub struct YAxisLabelParams<'a> {
    pub ctx: &'a OffscreenCanvasRenderingContext2d,
    pub layout: &'a ChartLayout,
    pub values: &'a [f64],
    pub x_text: f64,
    pub x_tick: f64,
    pub axis_type: AxisType,
}
/// Y轴类型
// ... (enum AxisType remains the same) ...
pub enum AxisType {
    Price { min_low: f64, max_high: f64 },
    Volume { max_volume: f64 },
}

impl ComprehensiveRenderer for AxisRenderer {
    // ... (render_component remains the same structure) ...
    fn render_component(
        &self,
        canvas_manager: &CanvasManager,
        _layout_param: &ChartLayout, // _layout_param is not directly used, layout_ref is from canvas_manager
        data_manager: &Rc<RefCell<DataManager>>,
        mode: RenderMode,
    ) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Base);
        let layout_ref = canvas_manager.layout.borrow(); // layout_ref is used
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
        self.draw_price_y_axis(ctx, &layout_ref, min_low, max_high, tick);
        self.draw_volume_y_axis(ctx, &layout_ref, max_volume);
        self.draw_x_axis(ctx, &layout_ref, items, data_manager); // Pass Rc<RefCell<DataManager>>
    }

    fn draw_alternating_background(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
    ) {
        let num_y_bands = AXIS_Y_BANDS_PRICE_CHART; // Use constant
        let band_height = layout.price_chart_height / num_y_bands as f64;
        // ... (loop remains the same) ...
        for i in 0..num_y_bands {
            let band_y = layout.header_height + i as f64 * band_height;
            let color = if i % 2 == 0 {
                ChartColors::BACKGROUND
            } else {
                ChartColors::GRID 
            };
            ctx.set_fill_style_str(color);
            ctx.fill_rect(
                layout.chart_area_x,
                band_y,
                layout.main_chart_width,
                band_height,
            );
        }

        let vol_num_y_bands = AXIS_Y_BANDS_VOLUME_CHART; // Use constant
        let vol_band_height = layout.volume_chart_height / vol_num_y_bands as f64;
        // ... (loop remains the same) ...
        for i in 0..vol_num_y_bands {
            let band_y = layout.volume_chart_y + i as f64 * vol_band_height;
            let color = if i % 2 == 0 {
                ChartColors::BACKGROUND
            } else {
                ChartColors::GRID
            };
            ctx.set_fill_style_str(color);
            ctx.fill_rect(
                layout.chart_area_x,
                band_y,
                layout.main_chart_width,
                vol_band_height,
            );
        }
    }

    fn sample_price_ticks(
        &self,
        min_low: f64,
        max_high: f64,
        tick: f64,
        chart_height: f64,
    ) -> Vec<f64> {
        if tick <= 0.0 { return Vec::new(); } // Guard against zero or negative tick
        let first_tick = (min_low / tick).ceil() * tick;
        let last_tick = (max_high / tick).floor() * tick;
        let mut tick_vec = Vec::new();
        let mut t = first_tick;
        while t <= last_tick + tick * AXIS_PRICE_TICK_ROUNDING_FACTOR { // Use constant
            tick_vec.push((t * PRECISION_FACTOR_E8).round() / PRECISION_FACTOR_E8); // Use constant
            t += tick;
        }
        let max_labels = (chart_height / AXIS_FONT_HEIGHT).floor() as usize; // Use constant
        // ... (rest of logic remains the same) ...
        let tick_count = tick_vec.len();
        let mut sampled_ticks = Vec::new();
        if tick_count > max_labels && max_labels > 0 {
            let step = (tick_count as f64 / max_labels as f64).ceil() as usize;
            if step == 0 { return tick_vec; } // Avoid infinite loop if step is 0
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

    fn insert_extreme_price_labels(
        &self,
        mut label_points: Vec<(f64, f64)>,
        min_low: f64,
        max_high: f64,
        layout: &ChartLayout,
    ) -> Vec<(f64, f64)> {
        let min_low_tick = (min_low * PRECISION_FACTOR_E8).round() / PRECISION_FACTOR_E8; // Use constant
        let max_high_tick = (max_high * PRECISION_FACTOR_E8).round() / PRECISION_FACTOR_E8; // Use constant
        let min_low_y = layout.map_price_to_y(min_low_tick, min_low, max_high);
        let max_high_y = layout.map_price_to_y(max_high_tick, min_low, max_high);
        let min_y_label_dist = AXIS_FONT_HEIGHT * AXIS_MIN_Y_LABEL_DIST_FACTOR; // Use constants

        if !label_points
            .iter()
            .any(|&(_, y)| (y - min_low_y).abs() < min_y_label_dist)
        {
            label_points.push((min_low_tick, min_low_y));
        }
        if !label_points
            .iter()
            .any(|&(_, y)| (y - max_high_y).abs() < min_y_label_dist)
        {
            label_points.push((max_high_tick, max_high_y));
        }
        label_points.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(Ordering::Equal));
        label_points
    }

    fn draw_y_axis_labels(&self, params: YAxisLabelParams<'_>) {
        for &v in params.values {
            let y = match &params.axis_type {
                AxisType::Price { min_low, max_high } => {
                    params.layout.map_price_to_y(v, *min_low, *max_high)
                }
                AxisType::Volume { max_volume } => {
                    params.layout.map_volume_to_y(v, *max_volume) - if v == 0.0 { AXIS_Y_LABEL_PRICE_ZERO_OFFSET } else { 0.0 } // Use constant
                }
            };
            // ... (drawing logic for tick line) ...
            params.ctx.set_stroke_style_str(ChartColors::BORDER);
            params.ctx.begin_path();
            params.ctx.move_to(params.x_tick, y);
            params.ctx.line_to(params.layout.chart_area_x, y);
            params.ctx.stroke();

            let label = match &params.axis_type {
                AxisType::Price { .. } => {
                    if v.abs() >= 100.0 { // Threshold
                        format!(FORMAT_PRICE_NO_DECIMAL, v) // Use constant
                    } else if v.abs() >= 1.0 { // Threshold
                        format!(FORMAT_PRICE_DEFAULT, v) // Use constant
                    } else {
                        format!(FORMAT_PRICE_HIGH_PRECISION, v) // Use constant
                    }
                }
                AxisType::Volume { .. } => time::format_volume(v, VOLUME_FORMAT_PRECISION_DEFAULT), // Use constant
            };
            // ... (fill_text logic) ...
            if params.ctx.fill_text(&label, params.x_text, y).is_err() {
                // Optionally log error or handle it
            }
        }
    }

    fn draw_price_y_axis(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        min_low: f64,
        max_high: f64,
        tick: f64,
    ) {
        ctx.set_line_width(CL_DEFAULT_CROSSHAIR_WIDTH); // Use constant (assuming axis line width is same as crosshair)
        // ... (other setup) ...
        ctx.set_stroke_style_str(ChartColors::BORDER);
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
        
        // ... (logic for sampled_ticks, label_points) ...
        let price_range = max_high - min_low;
        if price_range <= 0.0 || tick <= 0.0 { // Guard against zero or negative tick
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

        self.draw_y_axis_labels(YAxisLabelParams {
            ctx,
            layout,
            values: &label_points.iter().map(|&(p, _)| p).collect::<Vec<_>>(),
            x_text: layout.chart_area_x - Y_AXIS_LABEL_X_OFFSET, // Use constant
            x_tick: layout.chart_area_x - Y_AXIS_TICK_X_OFFSET, // Use constant
            axis_type: AxisType::Price { min_low, max_high },
        });
    }

    fn draw_volume_y_axis(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        max_volume: f64,
    ) {
        // ... (background fill) ...
        ctx.set_fill_style_str(ChartColors::HEADER_BG);
        ctx.fill_rect(
            0.0,
            layout.volume_chart_y,
            layout.y_axis_width,
            layout.volume_chart_height,
        );
        ctx.set_stroke_style_str(ChartColors::BORDER);
        ctx.set_line_width(CL_DEFAULT_CROSSHAIR_WIDTH); // Use constant
        // ... (axis line) ...
        ctx.begin_path();
        ctx.move_to(layout.y_axis_width, layout.volume_chart_y);
        ctx.line_to(
            layout.y_axis_width,
            layout.volume_chart_y + layout.volume_chart_height,
        );
        ctx.stroke();
        // ... (text setup) ...
        ctx.set_fill_style_str(ChartColors::AXIS_TEXT);
        ctx.set_font(ChartFont::AXIS);
        ctx.set_text_align("right");
        ctx.set_text_baseline("middle");
        let num_y_labels = AXIS_Y_LABELS_VOLUME_CHART; // Use constant
        // ... (values calculation) ...
        let values: Vec<f64> = (0..=num_y_labels)
            .map(|i| max_volume * i as f64 / num_y_labels as f64)
            .filter(|v| v.is_finite()) // Ensure values are finite
            .collect();

        self.draw_y_axis_labels(YAxisLabelParams {
            ctx,
            layout,
            values: &values,
            x_text: layout.y_axis_width - Y_AXIS_LABEL_X_OFFSET, // Use constant
            x_tick: layout.y_axis_width - Y_AXIS_TICK_X_OFFSET, // Use constant
            axis_type: AxisType::Volume { max_volume },
        });
    }

    fn draw_header(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        mode: RenderMode,
    ) {
        // ... (background fill) ...
        ctx.set_fill_style_str(ChartColors::HEADER_BG);
        ctx.fill_rect(0.0, 0.0, layout.canvas_width, layout.header_height);
        if mode == RenderMode::Kmap {
            ctx.set_stroke_style_str(ChartColors::BORDER);
            ctx.set_line_width(CL_DEFAULT_CROSSHAIR_WIDTH); // Use constant
            // ... (line drawing) ...
            ctx.begin_path();
            ctx.move_to(0.0, layout.header_height);
            ctx.line_to(layout.canvas_width, layout.header_height);
            ctx.stroke();
        }
        // ... (title "BTC/USDT") ...
        ctx.set_fill_style_str(ChartColors::TEXT);
        ctx.set_font(ChartFont::HEADER);
        ctx.set_text_align("left");
        ctx.set_text_baseline("middle");
        let _ = ctx.fill_text("BTC/USDT", layout.padding, layout.header_height / 2.0);


        let legend_x = layout.canvas_width - AXIS_LEGEND_AREA_WIDTH; // Use constant
        let legend_y = layout.header_height / 2.0;

        ctx.set_fill_style_str(ChartColors::BULLISH);
        ctx.fill_rect(legend_x, legend_y - AXIS_LEGEND_RECT_Y_OFFSET, AXIS_LEGEND_RECT_SIZE, AXIS_LEGEND_RECT_SIZE); // Use constants
        ctx.set_fill_style_str(ChartColors::TEXT);
        ctx.set_font(ChartFont::LEGEND);
        ctx.set_text_align("left");
        let _ = ctx.fill_text("上涨", legend_x + AXIS_LEGEND_TEXT_X_OFFSET_1, legend_y); // Use constant

        ctx.set_fill_style_str(ChartColors::BEARISH);
        ctx.fill_rect(legend_x + AXIS_LEGEND_TEXT_X_OFFSET_2, legend_y - AXIS_LEGEND_RECT_Y_OFFSET, AXIS_LEGEND_RECT_SIZE, AXIS_LEGEND_RECT_SIZE); // Use constants
        ctx.set_fill_style_str(ChartColors::TEXT);
        let _ = ctx.fill_text("下跌", legend_x + AXIS_LEGEND_TEXT_X_OFFSET_3, legend_y); // Use constant
    }

    fn draw_x_axis(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        data_manager: &Rc<RefCell<DataManager>>, // Changed to Rc<RefCell<DataManager>>
    ) {
        // ... (get visible range) ...
        let data_manager_ref = data_manager.borrow();
        let (visible_start, visible_count, visible_end) = data_manager_ref.get_visible_range().get_range(); // Corrected way to get range
        if visible_start >= visible_end { return; }

        let x_axis_y = layout.header_height + layout.chart_area_height;
        let time_label_y_start = x_axis_y + TIME_AXIS_LABEL_Y_OFFSET; // Use constant
        // ... (background fill) ...
        ctx.set_fill_style_str(ChartColors::HEADER_BG);
        ctx.fill_rect(0.0, x_axis_y, layout.canvas_width, layout.time_axis_height);

        ctx.set_stroke_style_str(ChartColors::BORDER);
        ctx.set_line_width(CL_DEFAULT_CROSSHAIR_WIDTH); // Use constant
        // ... (axis line) ...
        ctx.begin_path();
        ctx.move_to(layout.chart_area_x, x_axis_y);
        ctx.line_to(layout.chart_area_x + layout.main_chart_width, x_axis_y);
        ctx.stroke();

        let max_labels = (layout.main_chart_width / AXIS_MIN_X_LABEL_SPACING).floor() as usize; // Use constant
        if max_labels == 0 { return; } // Avoid division by zero for candle_interval
        let candle_interval = (visible_count as f64 / max_labels as f64).ceil().max(1.0) as usize;
        // ... (text setup) ...
        ctx.set_fill_style_str(ChartColors::AXIS_TEXT);
        ctx.set_font(ChartFont::AXIS);
        ctx.set_text_align("center");
        ctx.set_text_baseline("top");

        for i in (0..visible_count).step_by(candle_interval) {
            // ... (x calculation) ...
            let data_idx = visible_start + i;
            if data_idx >= items.len() { break; }
            // Calculate x using map_index_to_x for consistency
            let x = layout.map_index_to_x(data_idx, visible_start) - layout.total_candle_width / 2.0 + layout.candle_width / 2.0;
            if x > layout.chart_area_x + layout.main_chart_width { break; }

            let item = items.get(data_idx);
            let timestamp_secs = item.timestamp() as i64;
            let time_str = time::format_timestamp(timestamp_secs, FORMAT_STR_TIME_HM); // Use constant
            let date_str = time::format_timestamp(timestamp_secs, FORMAT_STR_DATE_YMD); // Use constant
            
            let _ = ctx.fill_text(&date_str, x, time_label_y_start);
            let _ = ctx.fill_text(&time_str, x, time_label_y_start + TIME_AXIS_SECOND_LINE_Y_OFFSET); // Use constant
        }
    }
}
