//! 交互层渲染器 - 负责绘制十字光标、提示框等交互元素
use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::data::DataManager;
use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartColors, ChartFont, ChartLayout};
use crate::render::chart_renderer::RenderMode;
use crate::render::cursor_style::CursorStyle;
use crate::utils::time;
use js_sys;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 交互层渲染器
#[derive(Default)]
pub struct OverlayRenderer {
    // 鼠标是否在图表区域内
    mouse_in_chart: bool,
    // 当前鼠标X坐标
    mouse_x: f64,
    // 当前鼠标Y坐标
    mouse_y: f64,
    // 缓存当前悬停的K线索引
    hover_candle_index: Option<usize>,
    dash_array: Option<js_sys::Array>,
    empty_array: Option<js_sys::Array>,
}

impl OverlayRenderer {
    /// 创建新的交互层渲染器
    pub fn new() -> Self {
        let dash_array = js_sys::Array::of2(&4.0.into(), &4.0.into());
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

    /// 处理鼠标移动事件（只在主图区域 main_chart 内响应）
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
            self.hover_candle_index = None;
            self.handle_mouse_leave(canvas_manager, mode);
            return;
        }
        let prev_x = self.mouse_x;
        let prev_y = self.mouse_y;
        self.mouse_x = x;
        self.mouse_y = y;
        self.mouse_in_chart = true;
        let data_manager_ref = data_manager.borrow();
        let (visible_start, visible_count, visible_end) = data_manager_ref.get_visible();
        let relative_x = x - layout.chart_area_x;
        let idx_in_visible =
            ((relative_x / layout.main_chart_width) * visible_count as f64).floor() as usize;
        let global_idx = visible_start + idx_in_visible;
        if global_idx >= visible_start && global_idx < visible_end {
            self.hover_candle_index = Some(global_idx);
        } else {
            self.hover_candle_index = None;
        }
        let distance = ((x - prev_x).powi(2) + (y - prev_y).powi(2)).sqrt();
        if distance < 1.0 {
            return;
        }
        self.draw(canvas_manager, data_manager, mode);
    }

    /// 处理鼠标离开事件
    pub fn handle_mouse_leave(&mut self, canvas_manager: &CanvasManager, mode: RenderMode) {
        // 重置所有鼠标状态
        self.mouse_in_chart = false;
        self.hover_candle_index = None;
        self.mouse_x = 0.0;
        self.mouse_y = 0.0;

        // 清除交互层 - 确保完全清除所有交互元素
        self.clear(canvas_manager);

        // 重新绘制覆盖层，只显示切换按钮
        // 注意：这里不调用draw方法，因为它会检查mouse_in_chart并可能绘制其他元素
        // 我们只需要确保切换按钮被绘制
        let ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = canvas_manager.layout.borrow();

        // 只绘制切换按钮，使用传入的mode参数
        self.draw_switch_button(&ctx, &layout, mode);
    }

    /// 绘制交互层
    pub fn draw(
        &self,
        canvas_manager: &CanvasManager,
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
            None => return,
        };
        // 绘制切换按钮 - 确保使用传入的mode参数
        self.draw_switch_button(&ctx, &layout, mode);
        if !self.mouse_in_chart {
            return;
        }
        // 只在主图区域绘制十字线和坐标轴标签
        if layout.is_point_in_main_chart_area(self.mouse_x, self.mouse_y) {
            self.draw_crosshair(&ctx, &layout);
            self.draw_axis_labels(
                &ctx,
                &layout,
                min_low,
                max_high,
                max_volume,
                items,
                self.hover_candle_index, // 直接传递全局下标
            );
        }
        // 计算热图tooltip数据
        if let Some(global_idx) = self.hover_candle_index {
            if global_idx < items.len() {
                match mode {
                    RenderMode::HEATMAP => {
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
                            self.draw_heatmap_tooltip(&ctx, &layout, timestamp, price, volume);
                        }
                    }
                    _ => {
                        self.draw_tooltip(&ctx, &layout, items.get(global_idx), mode);
                    }
                }
            }
        }
    }

    /// 清除交互层
    pub fn clear(&self, canvas_manager: &CanvasManager) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = canvas_manager.layout.borrow();

        // 只清除非导航器区域，保留DataZoom部分
        ctx.clear_rect(0.0, 0.0, layout.canvas_width, layout.navigator_y);
    }

    /// 绘制十字光标
    fn draw_crosshair(&self, ctx: &OffscreenCanvasRenderingContext2d, layout: &ChartLayout) {
        // 设置十字光标样式
        ctx.set_stroke_style_str(ChartColors::CROSSHAIR);
        ctx.set_line_width(layout.crosshair_width);

        // 设置虚线样式 - 使用set_line_dash替代set_dash_array
        if let Some(dash_array) = &self.dash_array {
            let _ = ctx.set_line_dash(dash_array);
        }

        // 绘制水平线 - 横跨整个图表区域
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

        // 绘制垂直线 - 横跨整个图表区域
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

        // 重置虚线设置
        if let Some(empty_array) = &self.empty_array {
            let _ = ctx.set_line_dash(empty_array);
        }
    }

    /// 绘制坐标轴标签 - 重构后不再需要data_manager参数
    fn draw_axis_labels(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        min_low: f64,
        max_high: f64,
        max_volume: f64,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        hover_candle_index: Option<usize>,
    ) {
        // --- Y轴标签 (价格/成交量) ---
        let mouse_y_constrained = self
            .mouse_y
            .max(layout.header_height)
            .min(layout.header_height + layout.chart_area_height);
        let y_label_width = layout.y_axis_width - layout.padding; // Adjust width to fit axis area
        let y_label_height = 20.0;
        let y_label_x = layout.padding / 2.0; // Position within the Y axis area
        let y_label_y = mouse_y_constrained - y_label_height / 2.0;

        // 确保标签不超出画布垂直范围
        let adjusted_y_label_y = y_label_y
            .max(layout.header_height)
            .min(layout.header_height + layout.chart_area_height - y_label_height);

        // 绘制Y轴标签背景
        ctx.set_fill_style_str(ChartColors::TOOLTIP_BG);
        ctx.fill_rect(y_label_x, adjusted_y_label_y, y_label_width, y_label_height);

        ctx.set_stroke_style_str(ChartColors::TOOLTIP_BORDER);
        ctx.set_line_width(1.0);
        ctx.stroke_rect(y_label_x, adjusted_y_label_y, y_label_width, y_label_height);

        // 绘制Y轴标签文本
        ctx.set_fill_style_str(ChartColors::TOOLTIP_TEXT);
        ctx.set_font(ChartFont::AXIS);
        ctx.set_text_align("right"); // Align to the right within the axis area
        ctx.set_text_baseline("middle");

        // 根据鼠标位置判断是显示价格还是成交量
        let y_value: f64;
        let y_label_text: String;
        if self.mouse_y >= layout.header_height
            && self.mouse_y <= layout.header_height + layout.price_chart_height
        {
            // 在价格图区域内
            y_value = layout.map_y_to_price(mouse_y_constrained, min_low, max_high);
            if y_value.abs() < 0.001 {
                y_label_text = "0".to_string();
            } else {
                y_label_text = format!("{:.2}", y_value);
            }
        } else if self.mouse_y >= layout.volume_chart_y
            && self.mouse_y <= layout.volume_chart_y + layout.volume_chart_height
        {
            // 在成交量区域内
            y_value = layout.map_y_to_volume(mouse_y_constrained, max_volume);
            y_label_text = time::format_volume(y_value, 1);
        } else {
            return; // Outside relevant chart areas
        }

        let _ = ctx.fill_text(
            &y_label_text,
            y_label_x + y_label_width - 5.0,
            adjusted_y_label_y + y_label_height / 2.0,
        );

        // --- X轴标签 (时间) ---
        let x_label_width = 80.0;
        let x_label_height = 20.0;
        // Position below the chart area, within the time axis height
        let x_axis_y = layout.header_height + layout.chart_area_height;
        let x_label_y = x_axis_y + (layout.time_axis_height - x_label_height) / 2.0; // Center vertically in time axis area
        let mouse_x_constrained = self
            .mouse_x
            .max(layout.chart_area_x)
            .min(layout.chart_area_x + layout.chart_area_width);
        let x_label_x = mouse_x_constrained - x_label_width / 2.0;

        // 确保标签不超出画布水平范围
        let adjusted_x_label_x = x_label_x
            .max(layout.chart_area_x)
            .min(layout.chart_area_x + layout.chart_area_width - x_label_width);

        // 绘制X轴标签背景
        ctx.set_fill_style_str(ChartColors::TOOLTIP_BG);
        ctx.fill_rect(adjusted_x_label_x, x_label_y, x_label_width, x_label_height);

        ctx.set_stroke_style_str(ChartColors::TOOLTIP_BORDER);
        ctx.set_line_width(1.0);
        ctx.stroke_rect(adjusted_x_label_x, x_label_y, x_label_width, x_label_height);

        // 绘制X轴标签文本（如果有悬停的K线，显示其时间）
        if let Some(hover_idx) = hover_candle_index {
            if hover_idx < items.len() {
                let item = items.get(hover_idx);
                let timestamp = item.timestamp() as i64;
                let date_str = time::format_timestamp(timestamp, "%y/%m/%d");
                let time_str = time::format_timestamp(timestamp, "%H:%M:%S");

                ctx.set_fill_style_str(ChartColors::TOOLTIP_TEXT);
                ctx.set_font(ChartFont::AXIS);
                ctx.set_text_align("center");
                ctx.set_text_baseline("middle"); // Center text vertically
                let _ = ctx.fill_text(
                    &format!("{} {}", date_str, time_str),
                    adjusted_x_label_x + x_label_width / 2.0,
                    x_label_y + x_label_height / 2.0,
                );
            }
        }
    }

    /// 绘制提示框
    fn draw_tooltip(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        item: KlineItem,
        mode: RenderMode,
    ) {
        let timestamp = item.timestamp() as i64;
        let datetime_str = time::format_timestamp(timestamp, "%Y-%m-%d %H:%M");
        let price = item.close();
        let volume = item.b_vol() + item.s_vol();
        let tooltip_width = 150.0;
        let line_height = 20.0;
        let padding = 10.0;
        let (num_lines, content_drawer): (
            usize,
            Box<dyn Fn(f64, f64, f64, &OffscreenCanvasRenderingContext2d, f64, f64)>,
        ) = match mode {
            RenderMode::HEATMAP => (
                3,
                Box::new(|price, volume, current_y, ctx, text_x, label_x| {
                    let _ = ctx.fill_text("价格:", text_x, current_y);
                    let _ = ctx.fill_text(&format!("{:.2}", price), label_x, current_y);
                    let _ = ctx.fill_text("数量:", text_x, current_y + 20.0);
                    let formatted_volume = time::format_volume(volume, 2);
                    let _ = ctx.fill_text(&formatted_volume, label_x, current_y + 20.0);
                }),
            ),
            _ => (
                6,
                Box::new(|_, volume, mut current_y, ctx, text_x, label_x| {
                    let draw_line = |label: &str, value: String, y: f64| {
                        let _ = ctx.fill_text(label, text_x, y);
                        let _ = ctx.fill_text(&value, label_x, y);
                    };
                    draw_line("开盘:", format!("{:.2}", item.open()), current_y);
                    current_y += 20.0;
                    draw_line("最高:", format!("{:.2}", item.high()), current_y);
                    current_y += 20.0;
                    draw_line("最低:", format!("{:.2}", item.low()), current_y);
                    current_y += 20.0;
                    draw_line("收盘:", format!("{:.2}", item.close()), current_y);
                    current_y += 20.0;
                    let formatted_volume = time::format_volume(volume, 2);
                    draw_line("成交量:", formatted_volume, current_y);
                }),
            ),
        };
        let tooltip_height = (num_lines as f64 * line_height) + padding * 2.0;
        let mouse_offset = 15.0;
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
        let corner_radius = 4.0;
        ctx.set_shadow_color(ChartColors::SHADOW);
        ctx.set_shadow_blur(10.0);
        ctx.set_shadow_offset_x(3.0);
        ctx.set_shadow_offset_y(3.0);
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
        ctx.set_shadow_color("transparent");
        ctx.set_shadow_blur(0.0);
        ctx.set_shadow_offset_x(0.0);
        ctx.set_shadow_offset_y(0.0);
        ctx.set_fill_style_str(ChartColors::TOOLTIP_TEXT);
        ctx.set_font(ChartFont::LEGEND);
        ctx.set_text_align("left");
        ctx.set_text_baseline("top");
        let text_x = tooltip_x + padding;
        let label_x = tooltip_x + 60.0;
        let mut current_y = tooltip_y + padding;
        let _ = ctx.fill_text(&datetime_str, text_x, current_y);
        current_y += line_height;
        content_drawer(price, volume, current_y, ctx, text_x, label_x);
    }

    /// 绘制切换按钮
    fn draw_switch_button(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        mode: RenderMode,
    ) {
        // 使用布局参数计算按钮位置和尺寸
        let button_width = layout.switch_btn_width * 2.0;
        let button_height = layout.switch_btn_height;
        let button_x = (layout.canvas_width - button_width) / 2.0;
        let button_y = layout.padding;

        // 绘制按钮背景
        ctx.set_fill_style_str(ChartColors::SWITCH_BG);
        ctx.fill_rect(button_x, button_y, button_width, button_height);

        // 绘制按钮边框
        ctx.set_stroke_style_str(ChartColors::SWITCH_BORDER);
        ctx.set_line_width(1.0);
        ctx.stroke_rect(button_x, button_y, button_width, button_height);

        // 绘制按钮分隔线
        ctx.begin_path();
        ctx.move_to(button_x + layout.switch_btn_width, button_y);
        ctx.line_to(button_x + layout.switch_btn_width, button_y + button_height);
        ctx.set_stroke_style_str(ChartColors::SWITCH_BORDER);
        ctx.stroke();

        // 设置文本样式
        ctx.set_font(ChartFont::SWITCH);
        ctx.set_text_align("center");
        ctx.set_text_baseline("middle");

        // K线按钮区域
        let kline_x = button_x + layout.switch_btn_width / 2.0;
        let kline_y = button_y + button_height / 2.0;
        // 热力图按钮区域
        let heatmap_x = button_x + layout.switch_btn_width + layout.switch_btn_width / 2.0;
        let heatmap_y = button_y + button_height / 2.0;

        // K线按钮样式
        if mode == RenderMode::KMAP {
            ctx.set_fill_style_str(ChartColors::SWITCH_ACTIVE_BG);
            ctx.fill_rect(button_x, button_y, layout.switch_btn_width, button_height);
            ctx.set_fill_style_str(ChartColors::SWITCH_ACTIVE_TEXT);
        } else {
            ctx.set_fill_style_str(ChartColors::SWITCH_TEXT);
        }
        ctx.fill_text("K线", kline_x, kline_y).unwrap();

        // 热力图按钮样式
        if mode == RenderMode::HEATMAP {
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
        ctx.fill_text("热力图", heatmap_x, heatmap_y).unwrap();
    }

    /// 检查点击是否在切换按钮区域内，如果是，返回选中的模式
    pub fn check_switch_button_click(&self, x: f64, y: f64, layout: &ChartLayout) -> Option<bool> {
        // 计算切换按钮的位置
        let button_width = layout.switch_btn_width * 2.0;
        let button_height = layout.switch_btn_height;
        let button_x = (layout.canvas_width - button_width) / 2.0;
        let button_y = layout.padding;

        // 检查点击是否在按钮区域内
        if x >= button_x
            && x <= button_x + button_width
            && y >= button_y
            && y <= button_y + button_height
        {
            // 确定点击的是哪个选项
            let kline_button_x = button_x;
            let heatmap_button_x = button_x + layout.switch_btn_width;

            if x >= kline_button_x && x < heatmap_button_x {
                // 点击了K线选项
                return Some(true);
            } else {
                // 点击了热图选项
                return Some(false);
            }
        }

        // 移除不必要的日志
        None
    }

    /// 热图模式下tooltip：时间、价格、tick区间合并数量
    fn draw_heatmap_tooltip(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        timestamp: i64,
        price: f64,
        volume: f64,
    ) {
        let datetime_str = time::format_timestamp(timestamp, "%Y-%m-%d %H:%M");
        let tooltip_width = 150.0;
        let line_height = 20.0;
        let padding = 10.0;
        let tooltip_height = 3.0 * line_height + padding * 2.0;
        let mouse_offset = 15.0;
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
        let corner_radius = 4.0;
        ctx.set_shadow_color(ChartColors::SHADOW);
        ctx.set_shadow_blur(10.0);
        ctx.set_shadow_offset_x(3.0);
        ctx.set_shadow_offset_y(3.0);
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
        ctx.set_shadow_color("transparent");
        ctx.set_shadow_blur(0.0);
        ctx.set_shadow_offset_x(0.0);
        ctx.set_shadow_offset_y(0.0);
        ctx.set_fill_style_str(ChartColors::TOOLTIP_TEXT);
        ctx.set_font(ChartFont::LEGEND);
        ctx.set_text_align("left");
        ctx.set_text_baseline("top");
        let text_x = tooltip_x + padding;
        let label_x = tooltip_x + 60.0;
        let mut current_y = tooltip_y + padding;
        let _ = ctx.fill_text(&datetime_str, text_x, current_y);
        current_y += line_height;
        let _ = ctx.fill_text("价格:", text_x, current_y);
        let _ = ctx.fill_text(&format!("{:.2}", price), label_x, current_y);
        current_y += line_height;
        let _ = ctx.fill_text("数量:", text_x, current_y);
        let formatted_volume = time::format_volume(volume, 2);
        let _ = ctx.fill_text(&formatted_volume, label_x, current_y);
    }

    /// 处理鼠标点击事件 (特别用于切换图表模式)
    pub fn handle_click(&self, x: f64, y: f64, layout: &ChartLayout) -> Option<RenderMode> {
        // 检查是否点击了切换按钮
        if let Some(is_kmap) = self.check_switch_button_click(x, y, layout) {
            // 根据点击的按钮返回对应的渲染模式
            if is_kmap {
                return Some(RenderMode::KMAP);
            } else {
                return Some(RenderMode::HEATMAP);
            }
        }
        None
    }

    /// 处理鼠标拖动事件（只在主图区域 main_chart 内响应）
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

    /// 处理鼠标滚轮事件（只在主图区域 main_chart 内响应）
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

    /// 获取当前鼠标位置的光标样式
    pub fn get_cursor_style(&self, x: f64, y: f64, layout: &ChartLayout) -> CursorStyle {
        // 检查是否在图表区域内
        if layout.is_point_in_chart_area(x, y) {
            return CursorStyle::Default;
        }

        // 默认光标样式
        CursorStyle::Default
    }

    /// 清除并重绘交互层
    pub fn redraw(
        &self,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
        mode: RenderMode,
    ) {
        // 清除交互层
        self.clear(canvas_manager);
        // 重新绘制交互层
        self.draw(canvas_manager, data_manager, mode);
    }

    /// 获取当前悬停的K线索引
    pub fn get_hover_candle_index(&self) -> Option<usize> {
        self.hover_candle_index
    }
}
