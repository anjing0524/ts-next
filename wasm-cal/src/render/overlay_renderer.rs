//! 交互层渲染器 - 负责绘制十字光标、提示框等交互元素
use crate::{
    canvas::{CanvasLayerType, CanvasManager},
    data::DataManager,
    kline_generated::kline::KlineItem,
    layout::{ChartColors, ChartFont, ChartLayout, theme::*}, // theme::* should already be here
    render::{
        chart_renderer::RenderMode, cursor_style::CursorStyle, traits::ComprehensiveRenderer,
    },
    utils::{self, time}, // Ensure utils is imported
};
use js_sys;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

struct AxisLabelData<'a> {
    min_low: f64,
    max_high: f64,
    max_volume: f64,
    items: flatbuffers::Vector<'a, flatbuffers::ForwardsUOffset<KlineItem<'a>>>,
    hover_candle_index: Option<usize>,
}

// ... (OverlayRenderer struct and impl ComprehensiveRenderer block remain the same) ...
#[derive(Default)]
pub struct OverlayRenderer {
    mouse_in_chart: bool,
    mouse_x: f64,
    mouse_y: f64,
    hover_candle_index: Option<usize>,
    dash_array: Option<js_sys::Array>,
    empty_array: Option<js_sys::Array>,
}

impl ComprehensiveRenderer for OverlayRenderer {
    fn render_component(
        &self,
        canvas_manager: &CanvasManager,
        _layout_param: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        mode: RenderMode,
    ) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout: std::cell::Ref<'_, ChartLayout> = canvas_manager.layout.borrow();

        self.clear(canvas_manager);

        let data_manager_ref = data_manager.borrow();
        let (min_low, max_high, max_volume) = data_manager_ref.get_cached_cal();
        let tick = data_manager_ref.get_tick();
        let items_opt = data_manager_ref.get_items();
        let items = match items_opt {
            Some(items) => items,
            None => {
                self.draw_switch_button(ctx, &layout, mode);
                return;
            }
        };

        self.draw_switch_button(ctx, &layout, mode);

        if !self.mouse_in_chart {
            return;
        }

        if layout.is_point_in_main_chart_area(self.mouse_x, self.mouse_y) {
            self.draw_crosshair(ctx, &layout);
            let axis_data = AxisLabelData {
                min_low,
                max_high,
                max_volume,
                items,
                hover_candle_index: self.hover_candle_index,
            };
            self.draw_axis_labels(ctx, &layout, axis_data);
        }

        if let Some(global_idx) = self.hover_candle_index {
            if global_idx < items.len() {
                match mode {
                    RenderMode::Heatmap => {
                        let kline = items.get(global_idx);
                        let timestamp = kline.timestamp() as i64;
                        let price = layout.map_y_to_price(self.mouse_y, min_low, max_high);
                        let tick_idx = if tick > 0.0 && price >= min_low && price < max_high {
                            Some(((price - min_low) / tick).floor() as usize)
                        } else {
                            None
                        };
                        let volume = if let (Some(vols), Some(bin)) = (kline.volumes(), tick_idx) {
                            vols.iter()
                                .filter(|pv| {
                                    ((pv.price() - min_low) / tick).floor() as usize == bin
                                })
                                .map(|pv| pv.volume())
                                .sum::<f64>()
                        } else {
                            0.0
                        };
                        if volume > 0.0 {
                            // Only draw tooltip if there's volume in the hovered tick
                            self.draw_heatmap_tooltip(ctx, &layout, timestamp, price, volume);
                        }
                    }
                    _ => {
                        // For Kmap mode
                        self.draw_tooltip(ctx, &layout, items.get(global_idx), mode);
                    }
                }
            }
        }
    }
}

impl OverlayRenderer {
    pub fn new() -> Self {
        let dash_array = js_sys::Array::of2(
            &OVERLAY_CROSSHAIR_DASH_VALUE.into(),
            &OVERLAY_CROSSHAIR_DASH_VALUE.into(),
        );
        let empty_array = js_sys::Array::new();
        Self {
            mouse_in_chart: false,
            mouse_x: 0.0,
            mouse_y: 0.0,
            hover_candle_index: None,
            dash_array: Some(dash_array),
            empty_array: Some(empty_array),
        }
    }

    pub fn handle_mouse_move(
        &mut self,
        x: f64,
        y: f64,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
        mode: RenderMode,
    ) {
        let layout = canvas_manager.layout.borrow();
        if !layout.is_point_in_chart_area(x, y) {
            if self.mouse_in_chart {
                self.hover_candle_index = None;
                self.handle_mouse_leave(canvas_manager, mode);
            }
            return;
        }

        let prev_mouse_in_chart = self.mouse_in_chart;
        self.mouse_in_chart = true;

        let prev_x = self.mouse_x;
        let prev_y = self.mouse_y;
        self.mouse_x = x;
        self.mouse_y = y;

        let data_manager_ref = data_manager.borrow();
        let (visible_start, visible_count, visible_end) =
            data_manager_ref.get_visible_range().get_range();
        let relative_x = x - layout.chart_area_x;

        let idx_in_visible = if layout.main_chart_width > 0.0 {
            ((relative_x / layout.main_chart_width) * visible_count as f64).floor() as usize
        } else {
            0
        };

        let global_idx = visible_start + idx_in_visible;

        let prev_hover_candle_index = self.hover_candle_index;
        if global_idx < visible_end {
            self.hover_candle_index = Some(global_idx);
        } else {
            self.hover_candle_index = None;
        }

        let distance = ((x - prev_x).powi(2) + (y - prev_y).powi(2)).sqrt();

        if distance >= OVERLAY_MOUSE_MOVE_REDRAW_THRESHOLD
            || self.hover_candle_index != prev_hover_candle_index
            || !prev_mouse_in_chart
        {
            self.render_component(canvas_manager, &layout, data_manager, mode);
        }
    }

    pub fn handle_mouse_leave(&mut self, canvas_manager: &CanvasManager, mode: RenderMode) {
        let layout = canvas_manager.layout.borrow();
        if self.mouse_in_chart {
            self.mouse_in_chart = false;
            self.hover_candle_index = None;
            self.clear(canvas_manager);
            let ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
            self.draw_switch_button(ctx, &layout, mode);
        }
    }

    fn clear(&self, canvas_manager: &CanvasManager) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = canvas_manager.layout.borrow();
        ctx.clear_rect(0.0, 0.0, layout.canvas_width, layout.navigator_y);
    }

    fn draw_crosshair(&self, ctx: &OffscreenCanvasRenderingContext2d, layout: &ChartLayout) {
        ctx.set_stroke_style_str(ChartColors::CROSSHAIR);
        ctx.set_line_width(layout.crosshair_width);
        if let Some(dash_array) = &self.dash_array {
            let _ = ctx.set_line_dash(dash_array);
        }
        let mouse_y_constrained = self
            .mouse_y
            .max(layout.header_height)
            .min(layout.header_height + layout.chart_area_height);
        ctx.begin_path();
        ctx.move_to(layout.chart_area_x, mouse_y_constrained);
        ctx.line_to(
            layout.chart_area_x + layout.chart_area_width,
            mouse_y_constrained,
        );
        ctx.stroke();
        let mouse_x_constrained = self
            .mouse_x
            .max(layout.chart_area_x)
            .min(layout.chart_area_x + layout.chart_area_width);
        ctx.begin_path();
        ctx.move_to(mouse_x_constrained, layout.header_height);
        ctx.line_to(
            mouse_x_constrained,
            layout.header_height + layout.chart_area_height,
        );
        ctx.stroke();
        if let Some(empty_array) = &self.empty_array {
            let _ = ctx.set_line_dash(empty_array);
        }
    }
    fn draw_axis_labels<'a>(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data: AxisLabelData<'a>,
    ) {
        let mouse_y_constrained = self
            .mouse_y
            .max(layout.header_height)
            .min(layout.header_height + layout.chart_area_height);
        let y_label_width = layout.y_axis_width - layout.padding;
        let y_label_height = OVERLAY_Y_AXIS_LABEL_HEIGHT;
        let y_label_x = layout.padding / 2.0;
        let y_label_y = mouse_y_constrained - y_label_height / 2.0;
        let adjusted_y_label_y = y_label_y
            .max(layout.header_height)
            .min(layout.header_height + layout.chart_area_height - y_label_height);

        ctx.set_fill_style_str(ChartColors::TOOLTIP_BG);
        ctx.fill_rect(y_label_x, adjusted_y_label_y, y_label_width, y_label_height);
        ctx.set_stroke_style_str(ChartColors::TOOLTIP_BORDER);
        ctx.set_line_width(OVERLAY_BORDER_LINE_WIDTH);
        ctx.stroke_rect(y_label_x, adjusted_y_label_y, y_label_width, y_label_height);
        ctx.set_fill_style_str(ChartColors::TOOLTIP_TEXT);
        ctx.set_font(ChartFont::AXIS);
        ctx.set_text_align("right");
        ctx.set_text_baseline("middle");

        let y_label_text: String;
        if self.mouse_y >= layout.header_height
            && self.mouse_y <= layout.header_height + layout.price_chart_height
        {
            let y_value = layout.map_y_to_price(mouse_y_constrained, data.min_low, data.max_high);
            // Use new formatter with specific threshold for "0" display
            y_label_text = utils::format_price_with_zero_threshold(
                y_value,
                OVERLAY_MIN_PRICE_DISPLAY_THRESHOLD,
            );
        } else if self.mouse_y >= layout.volume_chart_y
            && self.mouse_y <= layout.volume_chart_y + layout.volume_chart_height
        {
            let y_value = layout.map_y_to_volume(mouse_y_constrained, data.max_volume);
            y_label_text = time::format_volume(y_value, VOLUME_FORMAT_PRECISION_DEFAULT);
        } else {
            return;
        }
        let _ = ctx.fill_text(
            &y_label_text,
            y_label_x + y_label_width - Y_AXIS_LABEL_X_OFFSET,
            adjusted_y_label_y + y_label_height / 2.0,
        );

        let x_label_width = OVERLAY_X_AXIS_LABEL_WIDTH;
        let x_label_height = OVERLAY_X_AXIS_LABEL_HEIGHT;
        let x_axis_y = layout.header_height + layout.chart_area_height;
        let x_label_y = x_axis_y + (layout.time_axis_height - x_label_height) / 2.0;
        let mouse_x_constrained = self
            .mouse_x
            .max(layout.chart_area_x)
            .min(layout.chart_area_x + layout.chart_area_width);
        let x_label_x = mouse_x_constrained - x_label_width / 2.0;
        let adjusted_x_label_x = x_label_x
            .max(layout.chart_area_x)
            .min(layout.chart_area_x + layout.chart_area_width - x_label_width);

        ctx.set_fill_style_str(ChartColors::TOOLTIP_BG);
        ctx.fill_rect(adjusted_x_label_x, x_label_y, x_label_width, x_label_height);
        ctx.set_stroke_style_str(ChartColors::TOOLTIP_BORDER);
        ctx.set_line_width(OVERLAY_BORDER_LINE_WIDTH);
        ctx.stroke_rect(adjusted_x_label_x, x_label_y, x_label_width, x_label_height);

        if let Some(hover_idx) = data.hover_candle_index {
            if hover_idx < data.items.len() {
                let item = data.items.get(hover_idx);
                let timestamp = item.timestamp() as i64;
                let tooltip_time = time::format_timestamp(timestamp, FORMAT_STR_DATETIME_YMDHMS);
                ctx.set_fill_style_str(ChartColors::TOOLTIP_TEXT);
                ctx.set_font(ChartFont::AXIS);
                ctx.set_text_align("center");
                ctx.set_text_baseline("middle");
                let _ = ctx.fill_text(
                    &tooltip_time,
                    adjusted_x_label_x + x_label_width / 2.0,
                    x_label_y + x_label_height / 2.0,
                );
            }
        }
    }

    fn draw_tooltip(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        item: KlineItem,
        mode: RenderMode,
    ) {
        let timestamp = item.timestamp() as i64;
        let datetime_str = time::format_timestamp(timestamp, FORMAT_STR_DATETIME_YMDHM);
        let price = item.close();
        let volume = item.b_vol() + item.s_vol();
        let tooltip_width = OVERLAY_TOOLTIP_WIDTH;
        let line_height = OVERLAY_TOOLTIP_LINE_HEIGHT;
        let padding = OVERLAY_TOOLTIP_PADDING;

        let (num_lines, content_drawer): (
            usize,
            Box<dyn Fn(f64, f64, f64, &OffscreenCanvasRenderingContext2d, f64, f64)>,
        ) = match mode {
            RenderMode::Heatmap => (
                3,
                Box::new(
                    move |price_arg, volume_arg, current_y, ctx_arg, text_x_arg, label_x_arg| {
                        let _ = ctx_arg.fill_text(TEXT_TOOLTIP_PRICE, text_x_arg, current_y);
                        let _ = ctx_arg.fill_text(
                            &utils::format_price_dynamic(price_arg),
                            label_x_arg,
                            current_y,
                        ); // Use new formatter
                        let _ = ctx_arg.fill_text(
                            TEXT_TOOLTIP_VOLUME,
                            text_x_arg,
                            current_y + line_height,
                        );
                        let formatted_volume =
                            time::format_volume(volume_arg, VOLUME_FORMAT_PRECISION_TOOLTIP);
                        let _ = ctx_arg.fill_text(
                            &formatted_volume,
                            label_x_arg,
                            current_y + line_height,
                        );
                    },
                ),
            ),
            _ => (
                6,
                Box::new(
                    move |_price_arg,
                          volume_arg,
                          mut current_y,
                          ctx_arg,
                          text_x_arg,
                          label_x_arg| {
                        let item_open = item.open(); // Capture by value (Copy)
                        let item_high = item.high();
                        let item_low = item.low();
                        let item_close = item.close();

                        let draw_line = |label: &str, value: String, y: f64| {
                            let _ = ctx_arg.fill_text(label, text_x_arg, y);
                            let _ = ctx_arg.fill_text(&value, label_x_arg, y);
                        };
                        draw_line(
                            TEXT_TOOLTIP_OPEN,
                            utils::format_price_dynamic(item_open),
                            current_y,
                        );
                        current_y += line_height;
                        draw_line(
                            TEXT_TOOLTIP_HIGH,
                            utils::format_price_dynamic(item_high),
                            current_y,
                        );
                        current_y += line_height;
                        draw_line(
                            TEXT_TOOLTIP_LOW,
                            utils::format_price_dynamic(item_low),
                            current_y,
                        );
                        current_y += line_height;
                        draw_line(
                            TEXT_TOOLTIP_CLOSE,
                            utils::format_price_dynamic(item_close),
                            current_y,
                        );
                        current_y += line_height;
                        let formatted_volume =
                            time::format_volume(volume_arg, VOLUME_FORMAT_PRECISION_TOOLTIP);
                        draw_line(TEXT_TOOLTIP_TOTAL_VOLUME, formatted_volume, current_y);
                    },
                ),
            ),
        };

        let tooltip_height = (num_lines as f64 * line_height) + padding * 2.0;
        let mouse_offset = OVERLAY_TOOLTIP_MOUSE_OFFSET;
        let mut tooltip_x = self.mouse_x + mouse_offset;
        let mut tooltip_y = self.mouse_y - mouse_offset - tooltip_height;
        let chart_right_edge = layout.chart_area_x + layout.chart_area_width;
        let chart_bottom_edge = layout.header_height + layout.chart_area_height;
        if tooltip_x + tooltip_width > chart_right_edge {
            tooltip_x = self.mouse_x - mouse_offset - tooltip_width;
        }
        if tooltip_x < layout.chart_area_x {
            tooltip_x = layout.chart_area_x;
        }
        if tooltip_y < layout.header_height {
            tooltip_y = self.mouse_y + mouse_offset;
        }
        if tooltip_y + tooltip_height > chart_bottom_edge {
            tooltip_y = chart_bottom_edge - tooltip_height;
        }
        tooltip_y = tooltip_y.max(layout.header_height);
        let corner_radius = OVERLAY_TOOLTIP_CORNER_RADIUS;

        ctx.set_shadow_color(ChartColors::SHADOW);
        ctx.set_shadow_blur(OVERLAY_TOOLTIP_SHADOW_BLUR);
        ctx.set_shadow_offset_x(OVERLAY_TOOLTIP_SHADOW_OFFSET_X);
        ctx.set_shadow_offset_y(OVERLAY_TOOLTIP_SHADOW_OFFSET_Y);
        ctx.set_fill_style_str(ChartColors::TOOLTIP_BG);
        ctx.begin_path();
        ctx.move_to(tooltip_x + corner_radius, tooltip_y);
        ctx.line_to(tooltip_x + tooltip_width - corner_radius, tooltip_y);
        ctx.quadratic_curve_to(
            tooltip_x + tooltip_width,
            tooltip_y,
            tooltip_x + tooltip_width,
            tooltip_y + corner_radius,
        );
        ctx.line_to(
            tooltip_x + tooltip_width,
            tooltip_y + tooltip_height - corner_radius,
        );
        ctx.quadratic_curve_to(
            tooltip_x + tooltip_width,
            tooltip_y + tooltip_height,
            tooltip_x + tooltip_width - corner_radius,
            tooltip_y + tooltip_height,
        );
        ctx.line_to(tooltip_x + corner_radius, tooltip_y + tooltip_height);
        ctx.quadratic_curve_to(
            tooltip_x,
            tooltip_y + tooltip_height,
            tooltip_x,
            tooltip_y + tooltip_height - corner_radius,
        );
        ctx.line_to(tooltip_x, tooltip_y + corner_radius);
        ctx.quadratic_curve_to(tooltip_x, tooltip_y, tooltip_x + corner_radius, tooltip_y);
        ctx.close_path();
        ctx.fill();
        ctx.set_shadow_color(ChartColors::TRANSPARENT);
        ctx.set_shadow_blur(0.0);
        ctx.set_shadow_offset_x(0.0);
        ctx.set_shadow_offset_y(0.0);

        ctx.set_fill_style_str(ChartColors::TOOLTIP_TEXT);
        ctx.set_font(ChartFont::LEGEND);
        ctx.set_text_align("left");
        ctx.set_text_baseline("top");
        let text_x = tooltip_x + padding;
        let label_x = tooltip_x + OVERLAY_TOOLTIP_LABEL_X_OFFSET;
        let mut current_y = tooltip_y + padding;
        let _ = ctx.fill_text(&datetime_str, text_x, current_y);
        current_y += line_height;
        content_drawer(price, volume, current_y, ctx, text_x, label_x);
    }

    fn draw_switch_button(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        mode: RenderMode,
    ) {
        let button_width = layout.switch_btn_width * 2.0;
        let button_height = layout.switch_btn_height;
        let button_x = (layout.canvas_width - button_width) / 2.0;
        let button_y = layout.padding;

        ctx.set_fill_style_str(ChartColors::SWITCH_BG);
        ctx.fill_rect(button_x, button_y, button_width, button_height);
        ctx.set_stroke_style_str(ChartColors::SWITCH_BORDER);
        ctx.set_line_width(OVERLAY_SWITCH_BUTTON_LINE_WIDTH);
        ctx.stroke_rect(button_x, button_y, button_width, button_height);

        ctx.begin_path();
        ctx.move_to(button_x + layout.switch_btn_width, button_y);
        ctx.line_to(button_x + layout.switch_btn_width, button_y + button_height);
        ctx.set_stroke_style_str(ChartColors::SWITCH_BORDER);
        ctx.stroke();

        ctx.set_font(ChartFont::SWITCH);
        ctx.set_text_align("center");
        ctx.set_text_baseline("middle");
        let kline_x = button_x + layout.switch_btn_width / 2.0;
        let kline_y = button_y + button_height / 2.0;
        let heatmap_x = button_x + layout.switch_btn_width + layout.switch_btn_width / 2.0;
        let heatmap_y = button_y + button_height / 2.0;

        if mode == RenderMode::Kmap {
            ctx.set_fill_style_str(ChartColors::SWITCH_ACTIVE_BG);
            ctx.fill_rect(button_x, button_y, layout.switch_btn_width, button_height);
            ctx.set_fill_style_str(ChartColors::SWITCH_ACTIVE_TEXT);
        } else {
            ctx.set_fill_style_str(ChartColors::SWITCH_TEXT);
        }
        let _ = ctx.fill_text(TEXT_SWITCH_KLINE, kline_x, kline_y);

        if mode == RenderMode::Heatmap {
            ctx.set_fill_style_str(ChartColors::SWITCH_ACTIVE_BG);
            ctx.fill_rect(
                button_x + layout.switch_btn_width,
                button_y,
                layout.switch_btn_width,
                button_height,
            );
            ctx.set_fill_style_str(ChartColors::SWITCH_ACTIVE_TEXT);
        } else {
            ctx.set_fill_style_str(ChartColors::SWITCH_TEXT);
        }
        let _ = ctx.fill_text(TEXT_SWITCH_HEATMAP, heatmap_x, heatmap_y);
    }

    pub fn check_switch_button_click(
        &self,
        x: f64,
        y: f64,
        layout: &ChartLayout,
    ) -> Option<RenderMode> {
        let button_width = layout.switch_btn_width * 2.0;
        let button_height = layout.switch_btn_height;
        let button_x = (layout.canvas_width - button_width) / 2.0;
        let button_y = layout.padding;
        if x >= button_x
            && x <= button_x + button_width
            && y >= button_y
            && y <= button_y + button_height
        {
            if x < button_x + layout.switch_btn_width {
                return Some(RenderMode::Kmap);
            } else {
                return Some(RenderMode::Heatmap);
            }
        }
        None
    }

    fn draw_heatmap_tooltip(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        timestamp: i64,
        price: f64,
        volume: f64,
    ) {
        let datetime_str = time::format_timestamp(timestamp, FORMAT_STR_DATETIME_YMDHM);
        let tooltip_width = OVERLAY_TOOLTIP_WIDTH;
        let line_height = OVERLAY_TOOLTIP_LINE_HEIGHT;
        let padding = OVERLAY_TOOLTIP_PADDING;
        let tooltip_height = 3.0 * line_height + padding * 2.0;
        let mouse_offset = OVERLAY_TOOLTIP_MOUSE_OFFSET;

        let mut tooltip_x = self.mouse_x + mouse_offset;
        let mut tooltip_y = self.mouse_y - mouse_offset - tooltip_height;
        let chart_right_edge = layout.chart_area_x + layout.chart_area_width;
        let chart_bottom_edge = layout.header_height + layout.chart_area_height;
        if tooltip_x + tooltip_width > chart_right_edge {
            tooltip_x = self.mouse_x - mouse_offset - tooltip_width;
        }
        if tooltip_x < layout.chart_area_x {
            tooltip_x = layout.chart_area_x;
        }
        if tooltip_y < layout.header_height {
            tooltip_y = self.mouse_y + mouse_offset;
        }
        if tooltip_y + tooltip_height > chart_bottom_edge {
            tooltip_y = chart_bottom_edge - tooltip_height;
        }
        tooltip_y = tooltip_y.max(layout.header_height);
        let corner_radius = OVERLAY_TOOLTIP_CORNER_RADIUS;

        ctx.set_shadow_color(ChartColors::SHADOW);
        ctx.set_shadow_blur(OVERLAY_TOOLTIP_SHADOW_BLUR);
        ctx.set_shadow_offset_x(OVERLAY_TOOLTIP_SHADOW_OFFSET_X);
        ctx.set_shadow_offset_y(OVERLAY_TOOLTIP_SHADOW_OFFSET_Y);
        ctx.set_fill_style_str(ChartColors::TOOLTIP_BG);
        ctx.begin_path();
        ctx.move_to(tooltip_x + corner_radius, tooltip_y);
        ctx.line_to(tooltip_x + tooltip_width - corner_radius, tooltip_y);
        ctx.quadratic_curve_to(
            tooltip_x + tooltip_width,
            tooltip_y,
            tooltip_x + tooltip_width,
            tooltip_y + corner_radius,
        );
        ctx.line_to(
            tooltip_x + tooltip_width,
            tooltip_y + tooltip_height - corner_radius,
        );
        ctx.quadratic_curve_to(
            tooltip_x + tooltip_width,
            tooltip_y + tooltip_height,
            tooltip_x + tooltip_width - corner_radius,
            tooltip_y + tooltip_height,
        );
        ctx.line_to(tooltip_x + corner_radius, tooltip_y + tooltip_height);
        ctx.quadratic_curve_to(
            tooltip_x,
            tooltip_y + tooltip_height,
            tooltip_x,
            tooltip_y + tooltip_height - corner_radius,
        );
        ctx.line_to(tooltip_x, tooltip_y + corner_radius);
        ctx.quadratic_curve_to(tooltip_x, tooltip_y, tooltip_x + corner_radius, tooltip_y);
        ctx.close_path();
        ctx.fill();
        ctx.set_shadow_color(ChartColors::TRANSPARENT);
        ctx.set_shadow_blur(0.0);
        ctx.set_shadow_offset_x(0.0);
        ctx.set_shadow_offset_y(0.0);

        ctx.set_fill_style_str(ChartColors::TOOLTIP_TEXT);
        ctx.set_font(ChartFont::LEGEND);
        ctx.set_text_align("left");
        ctx.set_text_baseline("top");
        let text_x = tooltip_x + padding;
        let label_x = tooltip_x + OVERLAY_TOOLTIP_LABEL_X_OFFSET;
        let mut current_y = tooltip_y + padding;
        let _ = ctx.fill_text(&datetime_str, text_x, current_y);
        current_y += line_height;
        let _ = ctx.fill_text(TEXT_TOOLTIP_PRICE, text_x, current_y);
        let _ = ctx.fill_text(&utils::format_price_dynamic(price), label_x, current_y); // Use format_price_dynamic
        current_y += line_height;
        let _ = ctx.fill_text(TEXT_TOOLTIP_VOLUME, text_x, current_y);
        let formatted_volume = time::format_volume(volume, VOLUME_FORMAT_PRECISION_TOOLTIP);
        let _ = ctx.fill_text(&formatted_volume, label_x, current_y);
    }

    pub fn handle_click(&self, x: f64, y: f64, layout: &ChartLayout) -> Option<RenderMode> {
        self.check_switch_button_click(x, y, layout)
    }

    pub fn handle_mouse_drag(
        &mut self,
        x: f64,
        y: f64,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
        mode: RenderMode,
    ) {
        self.handle_mouse_move(x, y, canvas_manager, data_manager, mode);
    }

    pub fn handle_wheel(
        &mut self,
        x: f64,
        y: f64,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
        mode: RenderMode,
    ) {
        self.handle_mouse_move(x, y, canvas_manager, data_manager, mode);
    }

    pub fn get_cursor_style(&self, x: f64, y: f64, layout: &ChartLayout) -> CursorStyle {
        let button_width = layout.switch_btn_width * 2.0;
        let button_height = layout.switch_btn_height;
        let button_x = (layout.canvas_width - button_width) / 2.0;
        let button_y = layout.padding;
        if x >= button_x
            && x <= button_x + button_width
            && y >= button_y
            && y <= button_y + button_height
        {
            return CursorStyle::Pointer;
        }
        if layout.is_point_in_chart_area(x, y) {
            return CursorStyle::Crosshair;
        }
        CursorStyle::Default
    }

    pub fn redraw(
        &self,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
        mode: RenderMode,
    ) {
        self.render_component(
            canvas_manager,
            &canvas_manager.layout.borrow(),
            data_manager,
            mode,
        );
    }

    pub fn get_hover_candle_index(&self) -> Option<usize> {
        self.hover_candle_index
    }
}
