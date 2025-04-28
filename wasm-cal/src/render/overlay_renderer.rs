//! 交互层渲染器 - 负责绘制十字光标、提示框等交互元素
use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::data::DataManager;
use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartColors, ChartLayout};
use js_sys;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;
use crate::render::chart_renderer::RenderMode;

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

    /// 处理鼠标移动事件
    pub fn handle_mouse_move(
        &mut self,
        x: f64,
        y: f64,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
    ) {
        let prev_x = self.mouse_x;
        let prev_y = self.mouse_y;

        // 更新鼠标坐标
        self.mouse_x = x;
        self.mouse_y = y;

        // 计算移动距离
        let distance = ((x - prev_x).powi(2) + (y - prev_y).powi(2)).sqrt();
        if distance < 1.0 {
            return;
        }

        // 判断鼠标是否在图表区域内
        let layout = canvas_manager.layout.borrow();
        self.mouse_in_chart = layout.is_point_in_chart_area(x, y);

        let data_manager_ref = data_manager.borrow();
        // 获取可见范围
        let (visible_start, visible_count, _) = data_manager_ref.get_visible();

        // 如果鼠标在图表区域内，计算当前悬停的K线索引
        if self.mouse_in_chart {
            // 计算鼠标X坐标对应的K线索引
            let relative_x = x - layout.chart_area_x;
            let candle_idx = (relative_x / layout.total_candle_width).floor() as usize;

            // 判断索引是否在可见范围内
            if candle_idx < visible_count {
                self.hover_candle_index = Some(visible_start + candle_idx);
            } else {
                self.hover_candle_index = None;
            }
        } else {
            self.hover_candle_index = None;
        }

        // 绘制交互层 - 默认使用KMAP模式
        self.draw(canvas_manager, data_manager, RenderMode::KMAP);
    }

    /// 处理鼠标离开事件
    pub fn handle_mouse_leave(&mut self, canvas_manager: &CanvasManager) {
        self.mouse_in_chart = false;
        self.hover_candle_index = None;

        // 清除交互层
        self.clear(canvas_manager);
    }

    /// 绘制交互层
    pub fn draw(&self, canvas_manager: &CanvasManager, data_manager: &Rc<RefCell<DataManager>>, mode: RenderMode) {
        // 获取交互层上下文
        let ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout: std::cell::Ref<'_, ChartLayout> = canvas_manager.layout.borrow();

        // 清除交互层
        self.clear(canvas_manager);
        let data_manager_ref = data_manager.borrow(); // 使用 borrow 获取引用
        // 提前获取所有需要的数据，避免多次借用
        // 获取价格范围和最大成交量 (使用可变借用)
        let (min_low, max_high, max_volume) = data_manager_ref.get_cached_cal();
        // 获取数据集
        let items_opt = data_manager_ref.get_items();
        let items = match items_opt {
            Some(items) => items,
            None => return,
        };
        
        // 绘制切换按钮
        self.draw_switch_button(&ctx, &layout, mode);
        
        // 如果是热图模式，不显示十字光标等交互元素
        if mode == RenderMode::HEATMAP {
            return;
        }

        // 如果鼠标不在图表区域内，则不绘制光标和提示
        if !self.mouse_in_chart {
            return;
        }

        // 绘制十字光标
        self.draw_crosshair(&ctx, &layout);

        // 绘制坐标轴标签 - 传递已获取的数据，避免再次借用data_manager
        self.draw_axis_labels(
            &ctx,
            &layout,
            min_low,
            max_high,
            max_volume,
            items,
            self.hover_candle_index,
        );

        // 绘制提示框
        if let Some(hover_idx) = self.hover_candle_index {
            if hover_idx < items.len() {
                self.draw_tooltip(&ctx, &layout, items.get(hover_idx));
            }
        }
    }

    /// 清除交互层
    pub fn clear(&self, canvas_manager: &CanvasManager) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = canvas_manager.layout.borrow();
        
        // 只清除非导航器区域，保留DataZoom部分
        ctx.clear_rect(
            0.0,
            0.0,
            layout.canvas_width,
            layout.navigator_y
        );
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
        ctx.set_font("10px Arial"); // Match axis font
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
            y_label_text = layout.format_volume(y_value, 1);
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
                // Use layout's formatting for consistency
                let date_str = layout.format_timestamp(timestamp, "%y/%m/%d");
                let time_str = layout.format_timestamp(timestamp, "%H:%M:%S");

                ctx.set_fill_style_str(ChartColors::TOOLTIP_TEXT);
                ctx.set_font("10px Arial"); // Match axis font
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
    ) {
        // 获取K线时间戳
        let timestamp = item.timestamp() as i64;
        // 使用 layout 的格式化方法
        let datetime_str = layout.format_timestamp(timestamp, "%Y-%m-%d %H:%M");

        // 获取K线价格数据
        let open_price = item.open();
        let high_price = item.high();
        let low_price = item.low();
        let close_price = item.close();
        let volume = item.b_vol() + item.s_vol();

        // 定义提示框尺寸和内容行高
        let tooltip_width = 150.0;
        let line_height = 20.0;
        let padding = 10.0;
        let num_lines = 6; // Datetime, Open, High, Low, Close, Volume
        let tooltip_height = (num_lines as f64 * line_height) + padding * 2.0; // Calculate height based on content
        let mouse_offset = 15.0; // Distance from mouse cursor

        // --- 计算提示框位置 ---
        // Initial position (prefer top-right of cursor)
        let mut tooltip_x = self.mouse_x + mouse_offset;
        let mut tooltip_y = self.mouse_y - mouse_offset - tooltip_height; // Place above cursor initially

        // --- Boundary Checks ---
        // Chart area boundaries
        let chart_right_edge = layout.chart_area_x + layout.chart_area_width;
        let chart_bottom_edge = layout.header_height + layout.chart_area_height; // Bottom of price+volume area

        // Adjust X if goes off right edge
        if tooltip_x + tooltip_width > chart_right_edge {
            tooltip_x = self.mouse_x - mouse_offset - tooltip_width; // Move to left of cursor
        }
        // Adjust X if goes off left edge (after potentially moving left)
        if tooltip_x < layout.chart_area_x {
            tooltip_x = layout.chart_area_x; // Clamp to left edge
        }

        // Adjust Y if goes off top edge
        if tooltip_y < layout.header_height {
            tooltip_y = self.mouse_y + mouse_offset; // Move below cursor
        }
        // Adjust Y if goes off bottom edge (after potentially moving below)
        if tooltip_y + tooltip_height > chart_bottom_edge {
            tooltip_y = chart_bottom_edge - tooltip_height; // Clamp to bottom edge
        }
        // Ensure Y doesn't go below header if clamped low
        tooltip_y = tooltip_y.max(layout.header_height);

        // 绘制提示框背景 - 添加圆角和阴影
        let corner_radius = 4.0; // 圆角半径

        // 设置阴影
        ctx.set_shadow_color("rgba(0, 0, 0, 0.5)");
        ctx.set_shadow_blur(10.0);
        ctx.set_shadow_offset_x(3.0);
        ctx.set_shadow_offset_y(3.0);

        ctx.set_fill_style_str(ChartColors::TOOLTIP_BG);
        ctx.begin_path();

        // 绘制圆角矩形
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

        // 重置阴影，避免影响文本
        ctx.set_shadow_color("transparent");
        ctx.set_shadow_blur(0.0);
        ctx.set_shadow_offset_x(0.0);
        ctx.set_shadow_offset_y(0.0);

        // 绘制提示框内容
        ctx.set_fill_style_str(ChartColors::TOOLTIP_TEXT);
        ctx.set_font("12px Arial");
        ctx.set_text_align("left");
        ctx.set_text_baseline("top"); // Align text from the top

        let text_x = tooltip_x + padding;
        let label_x = tooltip_x + 60.0; // X position for values
        let mut current_y = tooltip_y + padding;

        // 绘制日期和时间 (one line)
        let _ = ctx.fill_text(&datetime_str, text_x, current_y);
        current_y += line_height;

        // Helper function to draw a line item (label + value)
        let draw_line =
            |ctx: &OffscreenCanvasRenderingContext2d, label: &str, value: &str, y: f64| {
                let _ = ctx.fill_text(label, text_x, y);
                let _ = ctx.fill_text(value, label_x, y);
            };

        // 绘制价格和成交量信息
        draw_line(ctx, "开盘:", &format!("{:.2}", open_price), current_y);
        current_y += line_height;
        draw_line(ctx, "最高:", &format!("{:.2}", high_price), current_y);
        current_y += line_height;
        draw_line(ctx, "最低:", &format!("{:.2}", low_price), current_y);
        current_y += line_height;
        draw_line(ctx, "收盘:", &format!("{:.2}", close_price), current_y);
        current_y += line_height;

        // Format volume using layout's method
        let formatted_volume = layout.format_volume(volume, 2);
        draw_line(ctx, "成交量:", &formatted_volume, current_y);
    }

    /// 绘制模式切换按钮 (K线/热图)
    fn draw_switch_button(&self, ctx: &OffscreenCanvasRenderingContext2d, layout: &ChartLayout, mode: RenderMode) {
        // 计算切换按钮的位置 - 在标题区域中间顶部
        let button_width = layout.switch_btn_width * 2.0; // 总宽度 (两个选项)
        let button_height = layout.switch_btn_height;
        let button_x = (layout.canvas_width - button_width) / 2.0;
        let button_y = layout.padding;

        // 绘制边框
        ctx.set_stroke_style_str(ChartColors::SWITCH_BORDER);
        ctx.set_line_width(1.0);
        ctx.stroke_rect(button_x, button_y, button_width, button_height);

        // 根据当前模式确定哪个选项是激活的
        let is_kmap_active = mode == RenderMode::KMAP;

        // 绘制K线选项
        let kline_button_x = button_x;
        self.draw_switch_option(ctx, "K线", kline_button_x, button_y, layout.switch_btn_width, button_height, is_kmap_active);

        // 绘制热图选项
        let heatmap_button_x = button_x + layout.switch_btn_width;
        self.draw_switch_option(ctx, "热图", heatmap_button_x, button_y, layout.switch_btn_width, button_height, !is_kmap_active);
    }

    /// 绘制单个切换选项
    fn draw_switch_option(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        text: &str,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        is_active: bool,
    ) {
        // 设置选项样式
        if is_active {
            ctx.set_fill_style_str(ChartColors::SWITCH_ACTIVE_BG);
        } else {
            ctx.set_fill_style_str(ChartColors::SWITCH_BG);
        }

        // 绘制选项背景
        ctx.fill_rect(x, y, width, height);

        // 设置文本样式
        if is_active {
            ctx.set_fill_style_str(ChartColors::SWITCH_ACTIVE_TEXT);
        } else {
            ctx.set_fill_style_str(ChartColors::SWITCH_TEXT);
        }
        ctx.set_text_align("center");
        ctx.set_text_baseline("middle");
        ctx.set_font("12px Arial");

        // 绘制文本
        let text_x = x + width / 2.0;
        let text_y = y + height / 2.0;
        ctx.fill_text(text, text_x, text_y).unwrap();
    }
    
    /// 检查点击是否在切换按钮区域内，如果是，返回选中的模式
    pub fn check_switch_button_click(&self, x: f64, y: f64, layout: &ChartLayout) -> Option<bool> {
        // 计算切换按钮的位置
        let button_width = layout.switch_btn_width * 2.0;
        let button_height = layout.switch_btn_height;
        let button_x = (layout.canvas_width - button_width) / 2.0;
        let button_y = layout.padding;
        
        // 检查点击是否在按钮区域内
        if x >= button_x && x <= button_x + button_width && y >= button_y && y <= button_y + button_height {
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
        
        None
    }
}
