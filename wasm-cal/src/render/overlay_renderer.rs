//! 交互层渲染器 - 负责绘制十字光标、提示框等交互元素
use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartColors, ChartLayout};
use chrono::DateTime;
use flatbuffers;
use wasm_bindgen::JsValue;
use web_sys::OffscreenCanvasRenderingContext2d;

use super::DataZoomRenderer;

/// 交互层渲染器
#[derive(Default)]
pub struct OverlayRenderer {
    // 鼠标是否在图表区域内
    mouse_in_chart: bool,
    // 缓存最近一次计算的价格范围
    cached_price_range: Option<(f64, f64)>,
    // 缓存最近一次计算的最大成交量
    cached_max_volume: Option<f64>,
    // DataZoom渲染器引用
    datazoom_renderer: Option<DataZoomRenderer>,
}

impl OverlayRenderer {
    /// 创建新的交互层渲染器
    pub fn new() -> Self {
        Self {
            mouse_in_chart: false,
            cached_price_range: None,
            cached_max_volume: None,
            datazoom_renderer: Some(DataZoomRenderer {}),
        }
    }

    pub fn set_cached(&mut self, min_low: f64, max_high: f64, max_volume: f64) {
        self.cached_price_range = Some((min_low, max_high));
        self.cached_max_volume = Some(max_volume);
    }

    /// 处理鼠标移动事件
    pub fn handle_mouse_move(
        &mut self,
        canvas_manager: &CanvasManager,
        x: f64,
        y: f64,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
    ) {
        // 更新缓存
        let mut layout = canvas_manager.layout.borrow_mut();

        // 获取之前的悬停位置，用于判断是否需要重绘
        let prev_hover_position = layout.hover_position;
        let prev_hover_index = layout.hover_candle_index;

        // 更新鼠标位置
        layout.hover_position = Some((x, y));

        // 判断鼠标是否在图表区域内
        self.mouse_in_chart = x >= layout.chart_area_x
            && x <= layout.chart_area_x + layout.chart_area_width
            && y >= layout.chart_area_y
            && y <= layout.chart_area_y + layout.chart_area_height;

        // 更新悬停的K线索引
        if self.mouse_in_chart && items.len() > 0 {
            let relative_x = x - layout.chart_area_x;
            let candle_idx = (relative_x / layout.total_candle_width).floor() as usize;
            let data_idx = layout.navigator_visible_start + candle_idx;
            if data_idx < items.len() {
                layout.hover_candle_index = Some(data_idx);
            } else {
                layout.hover_candle_index = None;
            }
        } else {
            layout.hover_candle_index = None;
        }

        // 仅当位置或索引发生变化时才清除和重绘
        if prev_hover_position != layout.hover_position
            || prev_hover_index != layout.hover_candle_index
        {
            // 释放layout的可变借用，以便后续操作
            drop(layout);
            // 清除覆盖层
            self.clear_overlay(canvas_manager);
            // 如果鼠标在图表区域内，重新绘制交互元素
            if self.mouse_in_chart {
                // 直接使用传入的价格范围和最大成交量，避免重复计算
                self.draw(canvas_manager, items);
            }
        }
    }

    /// 处理鼠标离开事件
    pub fn handle_mouse_leave(&mut self, canvas_manager: &CanvasManager) {
        let mut layout = canvas_manager.layout.borrow_mut();
        layout.hover_position = None;
        layout.hover_candle_index = None;
        self.mouse_in_chart = false;

        // 清除画布
        let ctx: &OffscreenCanvasRenderingContext2d =
            canvas_manager.get_context(CanvasLayerType::Overlay);
        ctx.clear_rect(0.0, 0.0, layout.chart_area_width, layout.chart_area_height);
    }

    /// 绘制交互层元素
    pub fn draw(
        &self,
        canvas_manager: &CanvasManager,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
    ) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = canvas_manager.layout.borrow();

        // 如果没有悬停位置，不绘制十字光标
        if layout.hover_position.is_none() {
            return;
        }

        // 获取悬停位置
        let (mouse_x, mouse_y) = layout.hover_position.unwrap();

        // 判断鼠标是否在图表区域内
        if mouse_x < layout.chart_area_x
            || mouse_x > layout.chart_area_x + layout.chart_area_width
            || mouse_y < layout.chart_area_y
            || mouse_y > layout.chart_area_y + layout.chart_area_height
        {
            return;
        }

        // 绘制十字光标
        self.draw_crosshair(ctx, &layout, mouse_x, mouse_y);

        // 如果有悬停的K线索引，绘制对应的数据标签
        if let Some(hover_idx) = layout.hover_candle_index {
            if hover_idx < items.len() {
                let item = items.get(hover_idx);
                if let Some((min_low, max_high)) = self.cached_price_range {
                    self.draw_axis_labels(
                        ctx,
                        &layout,
                        mouse_x,
                        mouse_y,
                        item,
                        min_low,
                        max_high,
                        // 直接使用缓存的最大成交量
                        self.cached_max_volume.unwrap(),
                    );
                    // 绘制详细数据提示框
                    self.draw_data_tooltip(ctx, &layout, mouse_x, mouse_y, item);
                }
            }
        }
    }

    /// 绘制十字光标
    fn draw_crosshair(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        mouse_x: f64,
        mouse_y: f64,
    ) {
        // 设置十字光标样式
        ctx.set_stroke_style_str(ChartColors::CROSSHAIR);
        ctx.set_line_width(layout.crosshair_width);

        // 绘制垂直线 (虚线)
        ctx.set_line_dash(&js_sys::Array::of2(
            &JsValue::from_f64(4.0),
            &JsValue::from_f64(4.0),
        ))
        .unwrap_or_default(); // 虚线样式

        ctx.begin_path();
        ctx.move_to(mouse_x, layout.chart_area_y);
        ctx.line_to(mouse_x, layout.chart_area_y + layout.chart_area_height);
        ctx.stroke();

        // 绘制水平线 (实线) - 重置虚线样式
        ctx.set_line_dash(&js_sys::Array::new()).unwrap_or_default();

        ctx.begin_path();
        if mouse_y <= layout.volume_chart_y {
            // 在价格区域
            ctx.move_to(layout.chart_area_x, mouse_y);
            ctx.line_to(layout.chart_area_x + layout.chart_area_width, mouse_y);
        } else {
            // 在成交量区域
            ctx.move_to(layout.chart_area_x, mouse_y);
            ctx.line_to(layout.chart_area_x + layout.chart_area_width, mouse_y);
        }
        ctx.stroke();
    }

    /// 绘制坐标轴标签
    fn draw_axis_labels(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        mouse_x: f64,
        mouse_y: f64,
        item: KlineItem,
        min_low: f64,
        max_high: f64,
        max_volume: f64,
    ) {
        // 设置标签样式
        ctx.set_font("12px Arial");
        ctx.set_text_align("center");
        ctx.set_text_baseline("middle");

        // 1. 绘制Y轴价格标签
        if mouse_y <= layout.volume_chart_y {
            // 在价格区域
            let price = layout.map_y_to_price(mouse_y, min_low, max_high);
            self.draw_price_label(ctx, layout, price, min_low, max_high); // 传递价格范围
        } else {
            // 在成交量区域
            let volume = layout.map_y_to_volume(mouse_y, max_volume);
            self.draw_volume_label(ctx, layout, volume, max_volume); // 传递最大成交量
        }
        // 2. 绘制X轴时间标签
        self.draw_time_label(ctx, layout, mouse_x, item);
    }

    /// 绘制价格标签
    fn draw_price_label(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        price: f64,
        min_low: f64,
        max_high: f64,
    ) {
        // 绘制价格标签背景
        ctx.set_fill_style_str(ChartColors::TOOLTIP_BG);
        ctx.set_stroke_style_str(ChartColors::TOOLTIP_BORDER);
        ctx.set_line_width(1.0);

        let label_width = 60.0;
        let label_height = 20.0;

        // 修正标签位置 - 将标签放在Y轴左侧，与Y轴对齐
        let label_x = layout.chart_area_x - label_width - 5.0; // 左侧偏移5像素

        // 使用正确的价格范围计算Y坐标
        let label_y = layout.map_price_to_y(price, min_low, max_high) - label_height / 2.0;

        // 绘制标签背景
        ctx.begin_path();
        ctx.rect(label_x, label_y, label_width, label_height);
        ctx.fill();
        ctx.stroke();

        // 绘制价格文本 - 修改文本对齐方式为右对齐
        ctx.set_fill_style_str(ChartColors::TOOLTIP_TEXT);
        ctx.set_text_align("right"); // 改为右对齐
        let price_text = format!("{:.2}", price);

        // 文本位置调整为标签右侧边缘减去内边距
        let text_x = label_x + label_width - 5.0; // 右侧边缘减去5像素内边距
        let _ = ctx.fill_text(&price_text, text_x, label_y + label_height / 2.0);
    }

    fn draw_volume_label(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        volume: f64,
        max_volume: f64,
    ) {
        // 绘制成交量标签背景
        ctx.set_fill_style_str(ChartColors::TOOLTIP_BG);
        ctx.set_stroke_style_str(ChartColors::TOOLTIP_BORDER);
        ctx.set_line_width(1.0);

        let label_width = 80.0;
        let label_height = 20.0;

        // 修正标签位置 - 将标签放在Y轴左侧，与Y轴对齐
        let label_x = layout.chart_area_x - label_width - 5.0; // 左侧偏移5像素

        // 使用正确的最大成交量计算Y坐标
        let label_y = layout.map_volume_to_y(volume, max_volume) - label_height / 2.0;

        // 绘制标签背景
        ctx.begin_path();
        ctx.rect(label_x, label_y, label_width, label_height);
        ctx.fill();
        ctx.stroke();

        // 绘制成交量文本 (格式化大数字) - 修改文本对齐方式为右对齐
        ctx.set_fill_style_str(ChartColors::TOOLTIP_TEXT);
        ctx.set_text_align("right"); // 改为右对齐

        // 使用ChartLayout的方法格式化成交量
        let volume_text = layout.format_volume(volume, 2);

        // 文本位置调整为标签右侧边缘减去内边距
        let text_x = label_x + label_width - 5.0; // 右侧边缘减去5像素内边距
        let _ = ctx.fill_text(&volume_text, text_x, label_y + label_height / 2.0);
    }

    /// 绘制时间标签
    fn draw_time_label(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        mouse_x: f64,
        item: KlineItem,
    ) {
        // 绘制时间标签背景
        ctx.set_fill_style_str(ChartColors::TOOLTIP_BG);
        ctx.set_stroke_style_str(ChartColors::TOOLTIP_BORDER);
        ctx.set_line_width(1.0);

        let label_width = 100.0;
        let label_height = 20.0;
        let label_x = mouse_x - label_width / 2.0;
        let label_y = layout.chart_area_y + layout.chart_area_height;

        // 绘制标签背景
        ctx.begin_path();
        ctx.rect(label_x, label_y, label_width, label_height);
        ctx.fill();
        ctx.stroke();

        // 绘制时间文本
        ctx.set_fill_style_str(ChartColors::TOOLTIP_TEXT);
        ctx.set_text_align("center");

        // 使用ChartLayout的方法格式化时间戳
        let timestamp_secs = item.timestamp() as i64;
        let time_str = layout.format_timestamp(timestamp_secs, "%y/%m/%d %H:%M");

        let _ = ctx.fill_text(&time_str, mouse_x, label_y + label_height / 2.0);
    }

    /// 绘制详细数据提示框
    fn draw_data_tooltip(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        mouse_x: f64,
        mouse_y: f64,
        item: KlineItem,
    ) {
        // 设置提示框样式
        ctx.set_fill_style_str(ChartColors::TOOLTIP_BG);
        ctx.set_stroke_style_str(ChartColors::TOOLTIP_BORDER);
        ctx.set_line_width(1.0);

        // 提示框尺寸和位置
        let tooltip_width = 160.0;
        let tooltip_height = 120.0;
        let padding = 8.0;

        // 根据鼠标位置调整提示框位置，避免超出画布边界
        let mut tooltip_x = mouse_x + 15.0; // 默认在鼠标右侧
        let mut tooltip_y = mouse_y - 10.0; // 默认在鼠标上方

        // 如果提示框会超出右边界，则放在鼠标左侧
        if tooltip_x + tooltip_width > layout.chart_area_x + layout.chart_area_width {
            tooltip_x = mouse_x - tooltip_width - 15.0;
        }

        // 确保提示框不超出图表区域左边界
        if tooltip_x < layout.chart_area_x {
            tooltip_x = layout.chart_area_x + 5.0;
        }

        // 如果提示框会超出上边界，则放在鼠标下方
        if tooltip_y < layout.chart_area_y {
            tooltip_y = layout.chart_area_y + 5.0;
        }

        // 如果提示框会超出下边界，则向上调整，确保不与datazoom重叠
        // 使用 volume_chart_y + volume_chart_height 作为下边界，而不是 canvas_height
        if tooltip_y + tooltip_height > layout.volume_chart_y + layout.volume_chart_height {
            tooltip_y = layout.volume_chart_y + layout.volume_chart_height - tooltip_height - 5.0;
        }

        // 绘制提示框背景
        ctx.begin_path();
        ctx.rect(tooltip_x, tooltip_y, tooltip_width, tooltip_height);
        ctx.fill();
        ctx.stroke();

        // 设置文本样式
        ctx.set_font("12px Arial");
        ctx.set_fill_style_str(ChartColors::TOOLTIP_TEXT);
        ctx.set_text_align("left");
        ctx.set_text_baseline("top");

        // 使用ChartLayout的方法格式化时间戳
        let timestamp_secs = item.timestamp() as i64;
        let time_str = layout.format_timestamp(timestamp_secs, "%Y/%m/%d %H:%M");

        // 绘制时间
        let _ = ctx.fill_text(
            &format!("时间: {}", time_str),
            tooltip_x + padding,
            tooltip_y + padding,
        );

        // 绘制价格信息
        let _ = ctx.fill_text(
            &format!("开盘: {:.2}", item.open()),
            tooltip_x + padding,
            tooltip_y + padding + 20.0,
        );
        let _ = ctx.fill_text(
            &format!("最高: {:.2}", item.high()),
            tooltip_x + padding,
            tooltip_y + padding + 40.0,
        );
        let _ = ctx.fill_text(
            &format!("最低: {:.2}", item.low()),
            tooltip_x + padding,
            tooltip_y + padding + 60.0,
        );
        let _ = ctx.fill_text(
            &format!("收盘: {:.2}", item.close()),
            tooltip_x + padding,
            tooltip_y + padding + 80.0,
        );

        // 绘制成交量
        let volume = item.b_vol() + item.s_vol();
        // 使用ChartLayout的方法格式化成交量
        let volume_text = format!("成交量: {}", layout.format_volume(volume, 2));
        let _ = ctx.fill_text(
            &volume_text,
            tooltip_x + padding,
            tooltip_y + padding + 100.0,
        );
    }

    // 清除覆盖层
    pub fn clear_overlay(&mut self, canvas_manager: &CanvasManager) {
        // 获取覆盖层上下文
        let ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = canvas_manager.layout.borrow();
        // 只清除图表区域，保留datazoom区域
        ctx.clear_rect(
            0.0,
            0.0,
            layout.canvas_width,
            layout.canvas_height - layout.navigator_height,
        );
    }

    /// 渲染 DataZoom 导航器
    pub fn render_datazoom(
        &self,
        canvas_manager: &CanvasManager,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
    ) {
        if let Some(datazoom_renderer) = &self.datazoom_renderer {
            datazoom_renderer.draw(canvas_manager, items);
        }
    }
}
