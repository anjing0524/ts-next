//! DataZoom导航器模块 - 负责绘制和处理数据缩放导航器
//!
//! 导航器显示成交量面积图作为背景，帮助用户快速识别成交量密集区域。

use crate::canvas::CanvasLayerType;
use crate::config::ChartTheme;
use crate::data::DataManager;

use crate::layout::{ChartLayout, PaneId};
use crate::render::chart_renderer::RenderMode;
use crate::render::cursor_style::CursorStyle;
use crate::render::strategy::render_strategy::{RenderContext, RenderError, RenderStrategy};
use web_sys::OffscreenCanvasRenderingContext2d;

/// 导航器拖动手柄类型
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum DragHandleType {
    Left,
    Right,
    Middle,
    None,
}

/// DataZoom导航器绘制器
pub struct DataZoomRenderer {
    is_dragging: bool,
    drag_start_x: f64,
    drag_handle_type: DragHandleType,
    drag_start_visible_range: (usize, usize),
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DragResult {
    None,
    NeedRedraw,
    Released,
}

impl DataZoomRenderer {
    pub fn new() -> Self {
        Self {
            is_dragging: false,
            drag_start_x: 0.0,
            drag_handle_type: DragHandleType::None,
            drag_start_visible_range: (0, 0),
        }
    }

    pub fn get_handle_at_position(
        &self,
        x: f64,
        y: f64,
        layout: &ChartLayout,
        data_manager: &DataManager,
    ) -> DragHandleType {
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);
        if !nav_rect.contains(x, y) {
            return DragHandleType::None;
        }

        let items_len = match data_manager.get_items() {
            Some(items) => items.len(),
            None => return DragHandleType::None,
        };
        if items_len == 0 {
            return DragHandleType::None;
        }

        let (visible_start, visible_count, _) = data_manager.get_visible();
        let (start_x, end_x) =
            self.calculate_visible_range_coords(layout, items_len, visible_start, visible_count);

        let handle_width = 10.0; // 增加手柄的可点击区域
        if (x - start_x).abs() < handle_width {
            DragHandleType::Left
        } else if (x - end_x).abs() < handle_width {
            DragHandleType::Right
        } else if x > start_x && x < end_x {
            DragHandleType::Middle
        } else {
            DragHandleType::None
        }
    }

    pub fn handle_mouse_down(&mut self, x: f64, y: f64, ctx: &RenderContext) -> bool {
        let layout = ctx.layout().borrow();
        let data_manager = ctx.data_manager().borrow();
        let handle_type = self.get_handle_at_position(x, y, &layout, &data_manager);

        if handle_type == DragHandleType::None {
            return false;
        }

        self.is_dragging = true;
        self.drag_start_x = x;
        self.drag_handle_type = handle_type;
        let (start, count, _) = data_manager.get_visible();
        self.drag_start_visible_range = (start, count); // 记录拖动开始时的可见范围

        true
    }

    pub fn handle_mouse_up(&mut self) -> bool {
        let was_dragging = self.is_dragging;
        self.is_dragging = false;
        self.drag_handle_type = DragHandleType::None;
        was_dragging
    }

    pub fn handle_mouse_drag(&mut self, x: f64, ctx: &RenderContext) -> DragResult {
        if !self.is_dragging {
            return DragResult::None;
        }

        let layout = ctx.layout().borrow();
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);
        let mut data_manager = ctx.data_manager().borrow_mut();
        let items_len = match data_manager.get_items() {
            Some(items) => items.len(),
            None => return DragResult::None,
        };
        if items_len == 0 {
            return DragResult::None;
        }

        let dx = x - self.drag_start_x;
        let index_change = (dx / nav_rect.width * items_len as f64).round() as isize;

        let (initial_start, initial_count) = self.drag_start_visible_range;
        const MIN_VISIBLE_COUNT: usize = 5;

        let (new_start, new_count) = match self.drag_handle_type {
            DragHandleType::Left => {
                // 允许左移手柄越过右边界，但保持最小可见数量
                let new_start = (initial_start as isize + index_change)
                    .max(0)
                    .min((initial_start + initial_count - MIN_VISIBLE_COUNT) as isize)
                    as usize;
                let new_count = (initial_start + initial_count) - new_start;
                (new_start, new_count)
            }
            DragHandleType::Right => {
                // 允许右移手柄越过左边界，但保持最小可见数量
                let new_end = (initial_start as isize + initial_count as isize + index_change)
                    .max((initial_start + MIN_VISIBLE_COUNT) as isize)
                    .min(items_len as isize) as usize;
                (initial_start, new_end - initial_start)
            }
            DragHandleType::Middle => {
                let new_start = (initial_start as isize + index_change)
                    .max(0)
                    .min((items_len - initial_count) as isize)
                    as usize;
                (new_start, initial_count)
            }
            DragHandleType::None => return DragResult::None,
        };

        let final_start = new_start.min(items_len.saturating_sub(MIN_VISIBLE_COUNT));
        let final_count = new_count
            .min(items_len - final_start)
            .max(MIN_VISIBLE_COUNT);

        let (current_start, current_count, _) = data_manager.get_visible();
        if current_start != final_start || current_count != final_count {
            data_manager.update_visible_range(final_start, final_count);
            return DragResult::NeedRedraw;
        }

        DragResult::None
    }

    fn draw_volume_area(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &DataManager,
        theme: &ChartTheme,
    ) {
        let items = match data_manager.get_items() {
            Some(i) => i,
            None => return,
        };
        if items.is_empty() {
            return;
        }

        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);

        // 使用成交量数据创建渐变面积图
        let volumes: Vec<f64> = items
            .iter()
            .map(|item| item.b_vol() + item.s_vol())
            .collect();
        let max_volume = volumes.iter().fold(f64::MIN, |max, &v| f64::max(max, v));

        if max_volume <= 0.0 {
            return;
        }

        let num_points = nav_rect.width.floor() as usize;
        if num_points == 0 {
            return;
        }

        // 使用纯色填充
        ctx.begin_path();
        ctx.set_fill_style_str(&theme.volume_area);
        ctx.set_global_alpha(0.6); // 增加不透明度使背景更明显

        let mut points: Vec<(f64, f64)> = Vec::with_capacity(num_points);

        // 采样点并计算平滑曲线
        for i in 0..num_points {
            let start_idx = (i as f64 / num_points as f64 * items.len() as f64).floor() as usize;
            let end_idx =
                ((i + 1) as f64 / num_points as f64 * items.len() as f64).floor() as usize;
            let sub_slice = &volumes[start_idx..end_idx.min(volumes.len())];

            let avg_volume = if sub_slice.is_empty() {
                volumes[0]
            } else {
                sub_slice.iter().sum::<f64>() / sub_slice.len() as f64
            };

            let x = nav_rect.x + i as f64;
            // 成交量高度标准化（0到1之间）
            let normalized_volume = avg_volume / max_volume;
            // 成交量越大，Y坐标越小（越靠近顶部）
            let y = nav_rect.y + nav_rect.height * (1.0 - normalized_volume);
            points.push((x, y));
        }

        if points.is_empty() {
            return;
        }

        // 绘制平滑的贝塞尔曲线面积图
        ctx.move_to(nav_rect.x, nav_rect.y + nav_rect.height);
        ctx.line_to(points[0].0, points[0].1);

        // 使用二次贝塞尔曲线创建平滑过渡
        for i in 1..points.len() {
            let prev = points[i - 1];
            let curr = points[i];
            let ctrl_x = (prev.0 + curr.0) / 2.0;
            let ctrl_y = (prev.1 + curr.1) / 2.0;
            ctx.quadratic_curve_to(ctrl_x, ctrl_y, curr.0, curr.1);
        }

        ctx.line_to(nav_rect.x + nav_rect.width, points.last().unwrap().1);
        ctx.line_to(nav_rect.x + nav_rect.width, nav_rect.y + nav_rect.height);
        ctx.close_path();
        ctx.fill();

        // 绘制顶部线条
        ctx.begin_path();
        ctx.set_stroke_style_str(&theme.volume_line);
        ctx.set_line_width(1.0);
        ctx.set_global_alpha(0.8);
        ctx.move_to(points[0].0, points[0].1);
        for i in 1..points.len() {
            let prev = points[i - 1];
            let curr = points[i];
            let ctrl_x = (prev.0 + curr.0) / 2.0;
            let ctrl_y = (prev.1 + curr.1) / 2.0;
            ctx.quadratic_curve_to(ctrl_x, ctrl_y, curr.0, curr.1);
        }
        ctx.stroke();

        // 重置透明度
        ctx.set_global_alpha(1.0);
    }

    fn calculate_visible_range_coords(
        &self,
        layout: &ChartLayout,
        items_len: usize,
        start: usize,
        count: usize,
    ) -> (f64, f64) {
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);
        let start_x = nav_rect.x + (start as f64 / items_len as f64) * nav_rect.width;
        let end_x = nav_rect.x + ((start + count) as f64 / items_len as f64) * nav_rect.width;
        (start_x, end_x)
    }

    fn draw_visible_range_indicator(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &DataManager,
        theme: &ChartTheme,
    ) {
        let items_len = match data_manager.get_items() {
            Some(i) => i.len(),
            None => return,
        };
        if items_len == 0 {
            return;
        }

        let (start, count, _) = data_manager.get_visible();
        let (start_x, end_x) = self.calculate_visible_range_coords(layout, items_len, start, count);
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);

        // 绘制半透明遮罩，使用纯色
        ctx.set_fill_style_str("rgba(180, 180, 180, 0.3)");
        ctx.fill_rect(
            nav_rect.x,
            nav_rect.y,
            start_x - nav_rect.x,
            nav_rect.height,
        );

        ctx.set_fill_style_str("rgba(180, 180, 180, 0.3)");
        ctx.fill_rect(
            end_x,
            nav_rect.y,
            nav_rect.x + nav_rect.width - end_x,
            nav_rect.height,
        );

        // 绘制选中区域的边框
        ctx.set_stroke_style_str(&theme.navigator_border);
        ctx.set_line_width(2.0);
        ctx.stroke_rect(start_x, nav_rect.y, end_x - start_x, nav_rect.height);

        // 绘制拖拽手柄，使用纯色
        let handle_width = 8.0;
        let handle_height = nav_rect.height - 8.0;
        let handle_y = nav_rect.y + 4.0;

        let handle_color = if self.is_dragging {
            &theme.navigator_active_handle
        } else {
            &theme.navigator_handle
        };

        ctx.set_fill_style_str(handle_color);

        // 左侧手柄（圆角矩形）
        self.draw_rounded_rect(
            ctx,
            start_x - handle_width / 2.0,
            handle_y,
            handle_width,
            handle_height,
            2.0,
        );
        ctx.fill();

        // 右侧手柄（圆角矩形）
        self.draw_rounded_rect(
            ctx,
            end_x - handle_width / 2.0,
            handle_y,
            handle_width,
            handle_height,
            2.0,
        );
        ctx.fill();

        // 绘制选中区域的高亮背景，使用纯色
        ctx.set_fill_style_str("rgba(92, 124, 250, 0.1)");
        ctx.set_global_alpha(0.8);
        ctx.fill_rect(start_x, nav_rect.y, end_x - start_x, nav_rect.height);
        ctx.set_global_alpha(1.0);

        // 绘制手柄边框
        ctx.set_stroke_style_str(&theme.navigator_border);
        ctx.set_line_width(1.0);
        self.draw_rounded_rect(
            ctx,
            start_x - handle_width / 2.0,
            handle_y,
            handle_width,
            handle_height,
            2.0,
        );
        ctx.stroke();
        self.draw_rounded_rect(
            ctx,
            end_x - handle_width / 2.0,
            handle_y,
            handle_width,
            handle_height,
            2.0,
        );
        ctx.stroke();
    }

    /// 绘制圆角矩形的辅助函数
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
}

impl RenderStrategy for DataZoomRenderer {
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError> {
        let canvas_manager = ctx.canvas_manager().borrow();
        let overlay_ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = ctx.layout().borrow();
        let data_manager = ctx.data_manager().borrow();
        let theme = ctx.theme();
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);

        // 清理datazoom区域，扩大清理范围以确保手柄完全清除
        let clear_padding = 20.0; // 增加清理边距，确保手柄完全清除
        overlay_ctx.clear_rect(
            nav_rect.x - clear_padding,
            nav_rect.y - clear_padding,
            nav_rect.width + clear_padding * 2.0,
            nav_rect.height + clear_padding * 2.0,
        );

        overlay_ctx.set_fill_style_str(&theme.navigator_bg);
        overlay_ctx.fill_rect(nav_rect.x, nav_rect.y, nav_rect.width, nav_rect.height);

        let items_len = data_manager.get_items().map_or(0, |items| items.len());

        if items_len > 0 {
            self.draw_volume_area(overlay_ctx, &layout, &data_manager, theme);
            self.draw_visible_range_indicator(overlay_ctx, &layout, &data_manager, theme);
        } else {
        }

        Ok(())
    }

    fn supports_mode(&self, _mode: RenderMode) -> bool {
        true
    }
    fn get_layer_type(&self) -> CanvasLayerType {
        CanvasLayerType::Overlay // 使用overlay层，支持交互
    }
    fn get_priority(&self) -> u32 {
        100 // 高优先级，确保在其他overlay元素之上
    }

    fn handle_mouse_down(&mut self, x: f64, y: f64, ctx: &RenderContext) -> bool {
        self.handle_mouse_down(x, y, ctx)
    }

    fn handle_mouse_up(&mut self, _x: f64, _y: f64, _ctx: &RenderContext) -> bool {
        self.handle_mouse_up()
    }

    fn handle_mouse_drag(&mut self, x: f64, _y: f64, ctx: &RenderContext) -> DragResult {
        self.handle_mouse_drag(x, ctx)
    }

    fn handle_mouse_leave(&mut self, _ctx: &RenderContext) -> bool {
        self.is_dragging = false;
        self.drag_handle_type = DragHandleType::None;
        true
    }

    /// 处理鼠标滚轮事件 - 在导航器区域进行缩放
    fn handle_wheel(&mut self, x: f64, y: f64, delta: f64, ctx: &RenderContext) -> bool {
        let layout = ctx.layout().borrow();
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);

        // 只有在导航器区域内才处理滚轮事件
        if !nav_rect.contains(x, y) {
            return false;
        }

        let mut data_manager = ctx.data_manager().borrow_mut();
        let items_len = match data_manager.get_items() {
            Some(items) => items.len(),
            None => return false,
        };

        if items_len == 0 {
            return false;
        }

        let (current_start, current_count, _) = data_manager.get_visible();

        // 计算相对位置（鼠标在导航器中的相对位置）
        let relative_position = if nav_rect.width > 0.0 {
            ((x - nav_rect.x) / nav_rect.width).clamp(0.0, 1.0)
        } else {
            0.5
        };

        // 计算缩放因子
        const WHEEL_ZOOM_FACTOR: f64 = 1.2; // 滚轮缩放灵敏度
        let zoom_factor = if delta > 0.0 {
            WHEEL_ZOOM_FACTOR // 放大
        } else {
            1.0 / WHEEL_ZOOM_FACTOR // 缩小
        };

        // 计算新的可见范围
        let visible_center_idx = current_start as f64 + (current_count as f64 * relative_position);
        const MIN_VISIBLE_COUNT: usize = 5;
        const MAX_VISIBLE_RATIO: f64 = 0.8;

        let max_visible_count =
            ((items_len as f64 * MAX_VISIBLE_RATIO) as usize).max(MIN_VISIBLE_COUNT);
        let new_visible_count = ((current_count as f64 * zoom_factor).round() as usize)
            .max(MIN_VISIBLE_COUNT)
            .min(max_visible_count)
            .min(items_len);

        // 计算新的起始位置，保持相对位置点不变
        let new_start = ((visible_center_idx - (new_visible_count as f64 * relative_position))
            .round() as isize)
            .max(0)
            .min((items_len - new_visible_count) as isize) as usize;

        // 更新可见范围
        data_manager.update_visible_range(new_start, new_visible_count);

        true
    }

    fn get_cursor_style(&self, x: f64, y: f64, ctx: &RenderContext) -> CursorStyle {
        if self.is_dragging {
            return match self.drag_handle_type {
                DragHandleType::Left | DragHandleType::Right => CursorStyle::EwResize,
                DragHandleType::Middle => CursorStyle::Grabbing,
                _ => CursorStyle::Default,
            };
        }

        // 检查是否在导航器区域内
        let layout = ctx.layout().borrow();
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);
        if !nav_rect.contains(x, y) {
            return CursorStyle::Default;
        }

        match self.get_handle_at_position(
            x,
            y,
            &ctx.layout().borrow(),
            &ctx.data_manager().borrow(),
        ) {
            DragHandleType::Left | DragHandleType::Right => CursorStyle::EwResize,
            DragHandleType::Middle => CursorStyle::Grab,
            _ => CursorStyle::Default,
        }
    }
}
