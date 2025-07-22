//! 交互层渲染器 - 负责绘制十字光标、提示框等交互元素
use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::config::ChartTheme;
use crate::data::DataManager;
use crate::kline_generated::kline::KlineItem;
use crate::layout::ChartLayout;
use crate::render::chart_renderer::RenderMode;
use crate::render::cursor_style::CursorStyle;
use crate::utils::time;
use js_sys;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// Tooltip配置结构体
struct TooltipConfig<'a> {
    width: f64,
    height: f64,
    content_type: TooltipContentType<'a>,
}

enum TooltipContentType<'a> {
    Heatmap { price: f64, volume: f64 },
    Kline { item: KlineItem<'a>, volume: f64 },
}

impl<'a> TooltipConfig<'a> {
    fn new(mode: RenderMode, item: KlineItem<'a>, volume: f64) -> Self {
        let width = 150.0;
        let line_height = 20.0;
        let padding = 10.0;

        let (num_lines, content_type) = match mode {
            RenderMode::Heatmap => (
                3,
                TooltipContentType::Heatmap {
                    price: item.close(),
                    volume,
                },
            ),
            _ => (6, TooltipContentType::Kline { item, volume }),
        };

        let height = (num_lines as f64 * line_height) + padding * 2.0;

        Self {
            width,
            height,
            content_type,
        }
    }
}

struct TooltipPosition {
    x: f64,
    y: f64,
}

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
        theme: &ChartTheme,
    ) {
        let layout = canvas_manager.layout.borrow();

        // 检查是否在整个图表区域内（包括主图和订单簿区域）
        if !layout.is_point_in_chart_area(x, y) {
            self.hover_candle_index = None;
            self.handle_mouse_leave(canvas_manager, mode, theme);
            return;
        }

        let prev_x = self.mouse_x;
        let prev_y = self.mouse_y;
        self.mouse_x = x;
        self.mouse_y = y;
        self.mouse_in_chart = true;

        // 计算K线索引 - 无论在主图还是订单簿区域都需要计算，因为订单簿依赖于选中的K线
        let data_manager_ref = data_manager.borrow();
        let (_visible_start, _visible_count, visible_end) = data_manager_ref.get_visible();

        // 如果在主图区域，根据X坐标计算hover_index
        if layout.is_point_in_main_chart_area(x, y) {
            let relative_x = x - layout.chart_area_x;
            let idx_in_visible =
                ((relative_x / layout.main_chart_width) * _visible_count as f64).floor() as usize;
            let global_idx = _visible_start + idx_in_visible;
            if global_idx >= _visible_start && global_idx < visible_end {
                self.hover_candle_index = Some(global_idx);
            } else {
                self.hover_candle_index = None;
            }
        } else if layout.is_point_in_book_area(x, y) {
            // 如果在订单簿区域，保持当前的hover_index或使用最新的K线
            if self.hover_candle_index.is_none() {
                self.hover_candle_index = Some(visible_end.saturating_sub(1));
            }
        }

        let distance = ((x - prev_x).powi(2) + (y - prev_y).powi(2)).sqrt();
        if distance < 1.0 {
            return;
        }
        self.draw(canvas_manager, data_manager, mode, theme);
    }

    /// 处理鼠标离开事件
    pub fn handle_mouse_leave(
        &mut self,
        canvas_manager: &CanvasManager,
        mode: RenderMode,
        theme: &ChartTheme,
    ) {
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
        self.draw_switch_button(ctx, &*layout, mode, theme);
    }

    /// 绘制交互层
    pub fn draw(
        &self,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
        mode: RenderMode,
        theme: &ChartTheme,
    ) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = canvas_manager.layout.borrow();
        self.clear(canvas_manager);

        let data_manager_ref = data_manager.borrow();
        let (min_low, max_high, max_volume) = data_manager_ref.get_cached_cal();
        let tick = data_manager_ref.get_tick();
        let items = match data_manager_ref.get_items() {
            Some(items) => items,
            None => return,
        };

        // 绘制切换按钮 - 确保使用传入的mode参数
        self.draw_switch_button(ctx, &*layout, mode, theme);

        // 如果鼠标不在图表区域内，只显示切换按钮
        if !self.mouse_in_chart {
            return;
        }

        // 使用枚举来表示鼠标位置状态
        #[derive(Debug)]
        enum MousePosition {
            MainChart,
            BookArea,
            Outside,
        }

        let mouse_position = match (
            layout.is_point_in_main_chart_area(self.mouse_x, self.mouse_y),
            layout.is_point_in_book_area(self.mouse_x, self.mouse_y),
        ) {
            (true, false) => MousePosition::MainChart,
            (false, true) => MousePosition::BookArea,
            _ => MousePosition::Outside,
        };

        // 根据鼠标位置执行相应的绘制逻辑
        match mouse_position {
            MousePosition::MainChart => {
                self.draw_main_chart_elements(
                    ctx, &layout, min_low, max_high, max_volume, items, theme,
                );
                self.draw_main_chart_tooltip(
                    ctx, &layout, items, mode, min_low, max_high, tick, theme,
                );
            }
            MousePosition::BookArea => {
                self.draw_book_area_elements(
                    ctx,
                    &*layout,
                    &data_manager_ref,
                    items,
                    min_low,
                    max_high,
                    tick,
                    theme,
                );
            }
            MousePosition::Outside => {
                // 鼠标在其他区域，不绘制额外元素
            }
        }
    }

    /// 绘制主图区域的交互元素
    fn draw_main_chart_elements(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        min_low: f64,
        max_high: f64,
        max_volume: f64,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        theme: &ChartTheme,
    ) {
        self.draw_crosshair(ctx, layout, theme);
        self.draw_axis_labels(
            ctx,
            layout,
            min_low,
            max_high,
            max_volume,
            items,
            self.hover_candle_index,
            theme,
        );
    }

    /// 绘制主图区域的tooltip
    fn draw_main_chart_tooltip(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        mode: RenderMode,
        min_low: f64,
        max_high: f64,
        tick: f64,
        theme: &ChartTheme,
    ) {
        let global_idx = match self.hover_candle_index {
            Some(idx) if idx < items.len() => idx,
            _ => return,
        };

        match mode {
            RenderMode::Heatmap => {
                self.draw_heatmap_tooltip_for_item(
                    ctx,
                    layout,
                    items.get(global_idx),
                    min_low,
                    max_high,
                    tick,
                    theme,
                );
            }
            _ => {
                self.draw_tooltip(ctx, layout, items.get(global_idx), mode, theme);
            }
        }
    }

    /// 为特定K线项绘制热力图tooltip
    fn draw_heatmap_tooltip_for_item(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        kline: KlineItem,
        min_low: f64,
        max_high: f64,
        tick: f64,
        theme: &ChartTheme,
    ) {
        let timestamp = kline.timestamp() as i64;
        let price = layout.map_y_to_price(self.mouse_y, min_low, max_high);

        let volume = self
            .calculate_volume_for_price(kline, price, min_low, tick)
            .unwrap_or(0.0);

        if volume > 0.0 {
            self.draw_heatmap_tooltip(ctx, layout, timestamp, price, volume, theme);
        }
    }

    /// 绘制订单簿区域的交互元素
    fn draw_book_area_elements(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager_ref: &std::cell::Ref<DataManager>,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        min_low: f64,
        max_high: f64,
        tick: f64,
        theme: &ChartTheme,
    ) {
        let (_visible_start, _visible_count, visible_end) = data_manager_ref.get_visible();
        let latest_idx = self
            .hover_candle_index
            .unwrap_or_else(|| visible_end.saturating_sub(1));

        if latest_idx >= items.len() {
            return;
        }

        let kline = items.get(latest_idx);
        let timestamp = kline.timestamp() as i64;
        let price = layout.map_y_to_price(self.mouse_y, min_low, max_high);

        // 使用Option链式调用来简化逻辑
        kline
            .volumes()
            .and_then(|_volumes| self.calculate_tick_index(price, min_low, max_high, tick))
            .and_then(|tick_idx| {
                let volume =
                    self.calculate_volume_for_tick_index(kline, tick_idx, min_low, tick)?;

                // 绘制悬浮选中效果
                self.draw_book_hover_effect(ctx, layout, tick_idx, min_low, max_high, tick, theme);

                // 绘制tooltip（如果有成交量）
                if volume > 0.0 {
                    self.draw_book_tooltip(ctx, layout, timestamp, price, volume, theme);
                }

                Some(())
            });
    }

    /// 计算价格对应的tick索引
    fn calculate_tick_index(
        &self,
        price: f64,
        min_low: f64,
        max_high: f64,
        tick: f64,
    ) -> Option<usize> {
        if tick > 0.0 && price >= min_low && price < max_high {
            Some(((price - min_low) / tick).floor() as usize)
        } else {
            None
        }
    }

    /// 计算特定价格的成交量
    fn calculate_volume_for_price(
        &self,
        kline: KlineItem,
        price: f64,
        min_low: f64,
        tick: f64,
    ) -> Option<f64> {
        let tick_idx = self.calculate_tick_index(price, min_low, price + tick, tick)?;
        self.calculate_volume_for_tick_index(kline, tick_idx, min_low, tick)
    }

    /// 计算特定tick索引的成交量
    fn calculate_volume_for_tick_index(
        &self,
        kline: KlineItem,
        tick_idx: usize,
        min_low: f64,
        tick: f64,
    ) -> Option<f64> {
        kline.volumes().map(|volumes| {
            volumes
                .iter()
                .filter(|pv| ((pv.price() - min_low) / tick).floor() as usize == tick_idx)
                .map(|pv| pv.volume())
                .sum::<f64>()
        })
    }

    /// 清除交互层
    pub fn clear(&self, canvas_manager: &CanvasManager) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = canvas_manager.layout.borrow();

        // 只清除非导航器区域，保留DataZoom部分
        ctx.clear_rect(0.0, 0.0, layout.canvas_width, layout.navigator_y);
    }

    /// 绘制十字光标
    fn draw_crosshair(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        theme: &ChartTheme,
    ) {
        // 设置十字光标样式
        ctx.set_stroke_style_str(&theme.crosshair);
        ctx.set_line_width(layout.crosshair_width);

        // 设置虚线样式 - 使用set_line_dash替代set_dash_array
        if let Some(dash_array) = &self.dash_array {
            let _ = ctx.set_line_dash(dash_array);
        }

        // 绘制水平线 - 只在main区域显示，不超过main_chart_width
        let mouse_y_constrained = self
            .mouse_y
            .max(layout.header_height)
            .min(layout.header_height + layout.chart_area_height);
        ctx.begin_path();
        ctx.move_to(layout.chart_area_x, mouse_y_constrained);
        ctx.line_to(
            layout.chart_area_x + layout.main_chart_width,
            mouse_y_constrained,
        );
        ctx.stroke();

        // 绘制垂直线 - 只在main区域显示，不超过main_chart_width
        let mouse_x_constrained = self
            .mouse_x
            .max(layout.chart_area_x)
            .min(layout.chart_area_x + layout.main_chart_width);
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
        theme: &ChartTheme,
    ) {
        // 绘制Y轴标签
        self.draw_y_axis_label(ctx, layout, min_low, max_high, max_volume, theme);

        // 绘制X轴标签
        self.draw_x_axis_label(ctx, layout, items, hover_candle_index, theme);
    }

    /// 绘制Y轴标签（价格/成交量）
    fn draw_y_axis_label(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        min_low: f64,
        max_high: f64,
        max_volume: f64,
        theme: &ChartTheme,
    ) {
        let mouse_y_constrained = self
            .mouse_y
            .max(layout.header_height)
            .min(layout.header_height + layout.chart_area_height);

        let y_label_width = layout.y_axis_width - layout.padding;
        let y_label_height = 20.0;
        let y_label_x = layout.padding / 2.0;
        let y_label_y = mouse_y_constrained - y_label_height / 2.0;

        let adjusted_y_label_y = y_label_y
            .max(layout.header_height)
            .min(layout.header_height + layout.chart_area_height - y_label_height);

        // 绘制背景和边框
        self.draw_label_background(
            ctx,
            y_label_x,
            adjusted_y_label_y,
            y_label_width,
            y_label_height,
            theme,
        );

        // 根据鼠标位置确定显示内容
        #[derive(Debug)]
        enum YAxisContent {
            Price(f64),
            Volume(f64),
            None,
        }

        let content = match self.mouse_y {
            y if y >= layout.header_height
                && y <= layout.header_height + layout.price_chart_height =>
            {
                let price = layout.map_y_to_price(mouse_y_constrained, min_low, max_high);
                YAxisContent::Price(price)
            }
            y if y >= layout.volume_chart_y
                && y <= layout.volume_chart_y + layout.volume_chart_height =>
            {
                let volume = layout.map_y_to_volume(mouse_y_constrained, max_volume);
                YAxisContent::Volume(volume)
            }
            _ => YAxisContent::None,
        };

        // 绘制文本内容
        let text = match content {
            YAxisContent::Price(price) => {
                if price.abs() < 0.001 {
                    "0".to_string()
                } else {
                    format!("{:.2}", price)
                }
            }
            YAxisContent::Volume(volume) => time::format_volume(volume, 1),
            YAxisContent::None => return,
        };

        self.draw_label_text(
            ctx,
            &text,
            y_label_x + y_label_width - 5.0,
            adjusted_y_label_y + y_label_height / 2.0,
            "right",
            theme,
        );
    }

    /// 绘制X轴标签（时间）
    fn draw_x_axis_label(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        hover_candle_index: Option<usize>,
        theme: &ChartTheme,
    ) {
        let x_label_width = 80.0;
        let x_label_height = 20.0;
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

        // 绘制背景和边框
        self.draw_label_background(
            ctx,
            adjusted_x_label_x,
            x_label_y,
            x_label_width,
            x_label_height,
            theme,
        );

        // 绘制时间文本（如果有悬停的K线）
        if let Some(hover_idx) = hover_candle_index.filter(|&idx| idx < items.len()) {
            let item = items.get(hover_idx);
            let timestamp = item.timestamp() as i64;
            let date_str = time::format_timestamp(timestamp, "%y/%m/%d");
            let time_str = time::format_timestamp(timestamp, "%H:%M:%S");
            let text = format!("{} {}", date_str, time_str);

            self.draw_label_text(
                ctx,
                &text,
                adjusted_x_label_x + x_label_width / 2.0,
                x_label_y + x_label_height / 2.0,
                "center",
                theme,
            );
        }
    }

    /// 绘制标签背景
    fn draw_label_background(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        theme: &ChartTheme,
    ) {
        ctx.set_fill_style_str(&theme.tooltip_bg);
        ctx.fill_rect(x, y, width, height);

        ctx.set_stroke_style_str(&theme.tooltip_border);
        ctx.set_line_width(1.0);
        ctx.stroke_rect(x, y, width, height);
    }

    /// 绘制标签文本
    fn draw_label_text(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        text: &str,
        x: f64,
        y: f64,
        align: &str,
        theme: &ChartTheme,
    ) {
        ctx.set_fill_style_str(&theme.tooltip_text);
        ctx.set_font(&theme.font_axis);
        ctx.set_text_align(align);
        ctx.set_text_baseline("middle");
        let _ = ctx.fill_text(text, x, y);
    }

    /// 绘制提示框
    fn draw_tooltip(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        item: KlineItem,
        mode: RenderMode,
        theme: &ChartTheme,
    ) {
        let timestamp = item.timestamp() as i64;
        let datetime_str = time::format_timestamp(timestamp, "%Y-%m-%d %H:%M");
        let volume = item.b_vol() + item.s_vol();

        let tooltip_config = TooltipConfig::new(mode, item, volume);
        let position =
            self.calculate_tooltip_position(layout, tooltip_config.width, tooltip_config.height);

        self.draw_tooltip_background(
            ctx,
            &position,
            tooltip_config.width,
            tooltip_config.height,
            theme,
        );
        self.draw_tooltip_content(ctx, &position, &datetime_str, &tooltip_config, theme);
    }

    /// 计算tooltip位置
    fn calculate_tooltip_position(
        &self,
        layout: &ChartLayout,
        width: f64,
        height: f64,
    ) -> TooltipPosition {
        let mouse_offset = 15.0;
        let mut x = self.mouse_x + mouse_offset;
        let mut y = self.mouse_y - mouse_offset - height;

        let chart_right_edge = layout.chart_area_x + layout.chart_area_width;
        let chart_bottom_edge = layout.header_height + layout.chart_area_height;

        // 调整X位置
        if x + width > chart_right_edge {
            x = self.mouse_x - mouse_offset - width;
        }
        x = x.max(layout.chart_area_x);

        // 调整Y位置
        if y < layout.header_height {
            y = self.mouse_y + mouse_offset;
        }
        if y + height > chart_bottom_edge {
            y = chart_bottom_edge - height;
        }
        y = y.max(layout.header_height);

        TooltipPosition { x, y }
    }

    /// 绘制tooltip背景
    fn draw_tooltip_background(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        position: &TooltipPosition,
        width: f64,
        height: f64,
        theme: &ChartTheme,
    ) {
        let corner_radius = 4.0;

        // 设置阴影
        ctx.set_shadow_color(&theme.shadow);
        ctx.set_shadow_blur(10.0);
        ctx.set_shadow_offset_x(3.0);
        ctx.set_shadow_offset_y(3.0);

        // 绘制圆角矩形背景
        ctx.set_fill_style_str(&theme.tooltip_bg);
        self.draw_rounded_rect(ctx, position.x, position.y, width, height, corner_radius);
        ctx.fill();

        // 重置阴影
        ctx.set_shadow_color("transparent");
        ctx.set_shadow_blur(0.0);
        ctx.set_shadow_offset_x(0.0);
        ctx.set_shadow_offset_y(0.0);
    }

    /// 绘制圆角矩形
    fn draw_rounded_rect(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        radius: f64,
    ) {
        ctx.begin_path();
        ctx.move_to(x + radius, y);
        ctx.line_to(x + width - radius, y);
        ctx.quadratic_curve_to(x + width, y, x + width, y + radius);
        ctx.line_to(x + width, y + height - radius);
        ctx.quadratic_curve_to(x + width, y + height, x + width - radius, y + height);
        ctx.line_to(x + radius, y + height);
        ctx.quadratic_curve_to(x, y + height, x, y + height - radius);
        ctx.line_to(x, y + radius);
        ctx.quadratic_curve_to(x, y, x + radius, y);
        ctx.close_path();
    }

    /// 绘制tooltip内容
    fn draw_tooltip_content(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        position: &TooltipPosition,
        datetime_str: &str,
        config: &TooltipConfig,
        theme: &ChartTheme,
    ) {
        ctx.set_fill_style_str(&theme.tooltip_text);
        ctx.set_font(&theme.font_legend);
        ctx.set_text_align("left");
        ctx.set_text_baseline("top");

        let padding = 10.0;
        let line_height = 20.0;
        let text_x = position.x + padding;
        let label_x = position.x + 60.0;
        let mut current_y = position.y + padding;

        // 绘制时间
        let _ = ctx.fill_text(datetime_str, text_x, current_y);
        current_y += line_height;

        // 根据内容类型绘制具体内容
        match &config.content_type {
            TooltipContentType::Heatmap { price, volume } => {
                self.draw_heatmap_content(ctx, text_x, label_x, current_y, *price, *volume);
            }
            TooltipContentType::Kline { item, volume } => {
                self.draw_kline_content(ctx, text_x, label_x, current_y, *item, *volume);
            }
        }
    }

    /// 绘制热力图tooltip内容
    fn draw_heatmap_content(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        text_x: f64,
        label_x: f64,
        mut current_y: f64,
        price: f64,
        volume: f64,
    ) {
        let _ = ctx.fill_text("价格:", text_x, current_y);
        let _ = ctx.fill_text(&format!("{:.2}", price), label_x, current_y);
        current_y += 20.0;

        let _ = ctx.fill_text("数量:", text_x, current_y);
        let formatted_volume = time::format_volume(volume, 2);
        let _ = ctx.fill_text(&formatted_volume, label_x, current_y);
    }

    /// 绘制K线tooltip内容
    fn draw_kline_content(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        text_x: f64,
        label_x: f64,
        mut current_y: f64,
        item: KlineItem,
        volume: f64,
    ) {
        let draw_line =
            |ctx: &OffscreenCanvasRenderingContext2d, label: &str, value: String, y: f64| {
                let _ = ctx.fill_text(label, text_x, y);
                let _ = ctx.fill_text(&value, label_x, y);
            };

        draw_line(ctx, "开盘:", format!("{:.2}", item.open()), current_y);
        current_y += 20.0;
        draw_line(ctx, "最高:", format!("{:.2}", item.high()), current_y);
        current_y += 20.0;
        draw_line(ctx, "最低:", format!("{:.2}", item.low()), current_y);
        current_y += 20.0;
        draw_line(ctx, "收盘:", format!("{:.2}", item.close()), current_y);
        current_y += 20.0;
        let formatted_volume = time::format_volume(volume, 2);
        draw_line(ctx, "成交量:", formatted_volume, current_y);
    }

    /// 绘制切换按钮
    fn draw_switch_button(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        mode: RenderMode,
        theme: &ChartTheme,
    ) {
        // 使用布局参数计算按钮位置和尺寸
        let button_width = layout.switch_btn_width * 2.0;
        let button_height = layout.switch_btn_height;
        let button_x = (layout.canvas_width - button_width) / 2.0;
        let button_y = layout.padding;

        // 绘制按钮背景
        ctx.set_fill_style_str(&theme.switch_bg);
        ctx.fill_rect(button_x, button_y, button_width, button_height);

        // 绘制按钮边框
        ctx.set_stroke_style_str(&theme.switch_border);
        ctx.set_line_width(1.0);
        ctx.stroke_rect(button_x, button_y, button_width, button_height);

        // 绘制按钮分隔线
        ctx.begin_path();
        ctx.move_to(button_x + layout.switch_btn_width, button_y);
        ctx.line_to(button_x + layout.switch_btn_width, button_y + button_height);
        ctx.set_stroke_style_str(&theme.switch_border);
        ctx.stroke();

        // 设置文本样式
        ctx.set_font(&theme.font_switch);
        ctx.set_text_align("center");
        ctx.set_text_baseline("middle");

        // K线按钮区域
        let kline_x = button_x + layout.switch_btn_width / 2.0;
        let kline_y = button_y + button_height / 2.0;
        // 热力图按钮区域
        let heatmap_x = button_x + layout.switch_btn_width + layout.switch_btn_width / 2.0;
        let heatmap_y = button_y + button_height / 2.0;

        // K线按钮样式
        if mode == RenderMode::Kmap {
            ctx.set_fill_style_str(&theme.switch_active_bg);
            ctx.fill_rect(button_x, button_y, layout.switch_btn_width, button_height);
            ctx.set_fill_style_str(&theme.switch_active_text);
        } else {
            ctx.set_fill_style_str(&theme.switch_text);
        }
        ctx.fill_text("K线", kline_x, kline_y).unwrap();

        // 热力图按钮样式
        if mode == RenderMode::Heatmap {
            ctx.set_fill_style_str(&theme.switch_active_bg);
            ctx.fill_rect(
                button_x + layout.switch_btn_width,
                button_y,
                layout.switch_btn_width,
                button_height,
            );
            ctx.set_fill_style_str(&theme.switch_active_text);
        } else {
            ctx.set_fill_style_str(&theme.switch_text);
        }
        ctx.fill_text("热力图", heatmap_x, heatmap_y).unwrap();
    }

    /// 热图模式下tooltip：时间、价格、tick区间合并数量
    fn draw_heatmap_tooltip(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        timestamp: i64,
        price: f64,
        volume: f64,
        theme: &ChartTheme,
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
        ctx.set_shadow_color(&theme.shadow);
        ctx.set_shadow_blur(10.0);
        ctx.set_shadow_offset_x(3.0);
        ctx.set_shadow_offset_y(3.0);
        ctx.set_fill_style_str(&theme.tooltip_bg);
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
        ctx.set_fill_style_str(&theme.tooltip_text);
        ctx.set_font(&theme.font_legend);
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

    /// 处理鼠标拖动事件（只在主图区域 main_chart 内响应）
    pub fn handle_mouse_drag(
        &mut self,
        x: f64,
        y: f64,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
        mode: RenderMode,
        theme: &ChartTheme,
    ) {
        self.handle_mouse_move(x, y, canvas_manager, data_manager, mode, theme);
    }

    /// 处理鼠标滚轮事件（只在主图区域 main_chart 内响应）
    pub fn handle_wheel(
        &mut self,
        x: f64,
        y: f64,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
        mode: RenderMode,
        theme: &ChartTheme,
    ) {
        self.handle_mouse_move(x, y, canvas_manager, data_manager, mode, theme);
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

    /// 获取当前悬停的K线索引
    pub fn get_hover_candle_index(&self) -> Option<usize> {
        self.hover_candle_index
    }

    /// 绘制订单簿tooltip：时间、价格、数量
    fn draw_book_tooltip(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        timestamp: i64,
        price: f64,
        volume: f64,
        theme: &ChartTheme,
    ) {
        let datetime_str = time::format_timestamp(timestamp, "%Y-%m-%d %H:%M");
        let tooltip_width = 150.0;
        let line_height = 20.0;
        let padding = 10.0;
        let tooltip_height = 3.0 * line_height + padding * 2.0;
        let mouse_offset = 15.0;

        // 计算tooltip位置，优先显示在鼠标左侧（因为在订单簿区域，右侧空间有限）
        let mut tooltip_x = self.mouse_x - mouse_offset - tooltip_width;
        let mut tooltip_y = self.mouse_y - mouse_offset - tooltip_height;

        let chart_left_edge = layout.chart_area_x;
        let chart_bottom_edge = layout.header_height + layout.chart_area_height;

        // 如果左侧空间不够，显示在右侧
        if tooltip_x < chart_left_edge {
            tooltip_x = self.mouse_x + mouse_offset;
        }

        // 确保不超出图表区域
        if tooltip_y < layout.header_height {
            tooltip_y = self.mouse_y + mouse_offset;
        }
        if tooltip_y + tooltip_height > chart_bottom_edge {
            tooltip_y = chart_bottom_edge - tooltip_height;
        }
        tooltip_y = tooltip_y.max(layout.header_height);

        let corner_radius = 4.0;

        // 绘制阴影
        ctx.set_shadow_color(&theme.shadow);
        ctx.set_shadow_blur(10.0);
        ctx.set_shadow_offset_x(3.0);
        ctx.set_shadow_offset_y(3.0);

        // 绘制tooltip背景
        ctx.set_fill_style_str(&theme.tooltip_bg);
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

        // 重置阴影
        ctx.set_shadow_color("transparent");
        ctx.set_shadow_blur(0.0);
        ctx.set_shadow_offset_x(0.0);
        ctx.set_shadow_offset_y(0.0);

        // 绘制文本
        ctx.set_fill_style_str(&theme.tooltip_text);
        ctx.set_font(&theme.font_legend);
        ctx.set_text_align("left");
        ctx.set_text_baseline("top");

        let text_x = tooltip_x + padding;
        let label_x = tooltip_x + 60.0;
        let mut current_y = tooltip_y + padding;

        // 时间
        let _ = ctx.fill_text(&datetime_str, text_x, current_y);
        current_y += line_height;

        // 价格
        let _ = ctx.fill_text("价格:", text_x, current_y);
        let _ = ctx.fill_text(&format!("{:.2}", price), label_x, current_y);
        current_y += line_height;

        // 数量
        let _ = ctx.fill_text("数量:", text_x, current_y);
        let formatted_volume = time::format_volume(volume, 2);
        let _ = ctx.fill_text(&formatted_volume, label_x, current_y);
    }

    /// 绘制订单簿悬浮选中效果
    fn draw_book_hover_effect(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        bin_idx: usize,
        min_low: f64,
        max_high: f64,
        tick: f64,
        theme: &ChartTheme,
    ) {
        // 计算订单簿区域
        let book_area_x = layout.chart_area_x + layout.main_chart_width;
        let book_area_width = layout.book_area_width;

        // 计算当前bin对应的价格范围
        let price_low = min_low + bin_idx as f64 * tick;
        let price_high = price_low + tick;

        // 将价格映射到Y坐标
        let y_high = layout.map_price_to_y(price_high, min_low, max_high);
        let y_low = layout.map_price_to_y(price_low, min_low, max_high);
        let bar_y = y_high.min(y_low);
        let bar_height = (y_low - y_high).abs().max(1.0);

        // 绘制半透明的选中背景
        ctx.set_fill_style_str(&theme.book_hover_bg);
        ctx.fill_rect(book_area_x, bar_y, book_area_width, bar_height);

        // 绘制选中边框，增加边框宽度使效果更明显
        ctx.set_stroke_style_str(&theme.book_hover_border);
        ctx.set_line_width(2.0); // 增加边框宽度从1.0到2.0
        ctx.stroke_rect(book_area_x, bar_y, book_area_width, bar_height);
    }
}
