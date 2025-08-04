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

impl Default for DataZoomRenderer {
    fn default() -> Self {
        Self::new()
    }
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

        // 优化手柄检测 - 考虑边界情况
        let handle_width: f64 = 10.0;
        let min_distance = handle_width.min(nav_rect.width * 0.05); // 相对手柄大小

        // 处理手柄重叠或接近的情况
        let left_dist = (x - start_x).abs();
        let right_dist = (x - end_x).abs();

        if left_dist < min_distance && right_dist < min_distance {
            // 手柄重叠，根据鼠标位置决定优先级
            if x - start_x < end_x - x {
                DragHandleType::Left
            } else {
                DragHandleType::Right
            }
        } else if left_dist < min_distance {
            DragHandleType::Left
        } else if right_dist < min_distance {
            DragHandleType::Right
        } else if x > start_x && x < end_x {
            DragHandleType::Middle
        } else {
            DragHandleType::None
        }
    }

    pub fn handle_mouse_down(&mut self, x: f64, y: f64, ctx: &RenderContext) -> bool {
        let layout = ctx.layout_ref();
        let data_manager = ctx.data_manager_ref();
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

        let layout = ctx.layout_ref();
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);
        let mut data_manager = ctx.data_manager_mut_ref();
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

        let (new_start, new_count, new_handle_type) = match self.drag_handle_type {
            DragHandleType::Left => {
                let new_start = (initial_start as isize + index_change)
                    .max(0)
                    .min((initial_start + initial_count - MIN_VISIBLE_COUNT) as isize)
                    as usize;

                // 检查是否需要交换手柄
                if new_start >= (initial_start + initial_count) {
                    // 左手柄超过右手柄，交换为右手柄
                    let new_end = new_start;
                    let new_count = new_end - initial_start;
                    (initial_start, new_count, DragHandleType::Right)
                } else {
                    let new_count = (initial_start + initial_count) - new_start;
                    (new_start, new_count, DragHandleType::Left)
                }
            }
            DragHandleType::Right => {
                let new_end = (initial_start as isize + initial_count as isize + index_change)
                    .max((initial_start + MIN_VISIBLE_COUNT) as isize)
                    .min(items_len as isize) as usize;

                // 检查是否需要交换手柄
                if new_end <= initial_start {
                    // 右手柄超过左手柄，交换为左手柄
                    let new_start = new_end;
                    let new_count = (initial_start + initial_count) - new_start;
                    (new_start, new_count, DragHandleType::Left)
                } else {
                    let new_count = new_end - initial_start;
                    (initial_start, new_count, DragHandleType::Right)
                }
            }
            DragHandleType::Middle => {
                let new_start = (initial_start as isize + index_change)
                    .max(0)
                    .min((items_len - initial_count) as isize)
                    as usize;
                (new_start, initial_count, DragHandleType::Middle)
            }
            DragHandleType::None => return DragResult::None,
        };

        // 更新手柄类型（如果发生交换）
        self.drag_handle_type = new_handle_type;

        // 更新拖动起始位置和范围，以支持连续拖动
        if new_handle_type != self.drag_handle_type {
            // 手柄类型发生交换，更新拖动起始位置
            self.drag_start_x = x;
            self.drag_start_visible_range = (new_start, new_count);
        }

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
        let nav_width = nav_rect.width;
        let nav_height = nav_rect.height;

        // 智能采样算法：根据像素密度动态调整采样点
        let items_len = items.len();
        let max_pixels = nav_width as usize;

        // 确保采样点不超过像素数量，同时保持数据特征
        let target_points = max_pixels.min(400); // 限制最大采样点以提高性能
        let step = (items_len as f64 / target_points as f64).max(1.0) as usize;

        // 快速找到最大成交量 - 使用稀疏采样
        let mut max_volume: f64 = 0.0;
        let volume_sample_step = (items_len / 100).max(1);
        for i in (0..items_len).step_by(volume_sample_step) {
            let item = items.get(i);
            max_volume = max_volume.max(item.b_vol() + item.s_vol());
        }

        if max_volume <= 0.0 {
            max_volume = 1.0;
        }

        // 使用高效的面积图算法
        ctx.begin_path();
        ctx.set_fill_style_str(&theme.volume_area);
        ctx.set_global_alpha(0.6);

        // 预计算采样点坐标
        let mut sampled_heights = Vec::with_capacity(target_points + 2);

        // 起点
        sampled_heights.push(nav_rect.y + nav_height);

        // 采样并计算平均成交量
        let _pixel_step = nav_width / target_points as f64;

        for pixel_idx in 0..=target_points {
            let data_start =
                ((pixel_idx as f64 / target_points as f64) * items_len as f64) as usize;
            let data_end =
                (((pixel_idx + 1) as f64 / target_points as f64) * items_len as f64) as usize;

            let mut volume_sum = 0.0;
            let mut count = 0;

            // 在数据范围内采样
            for data_idx in (data_start..data_end.min(items_len)).step_by(step) {
                let item = items.get(data_idx);
                volume_sum += item.b_vol() + item.s_vol();
                count += 1;
            }

            let avg_volume = if count > 0 {
                volume_sum / count as f64
            } else {
                0.0
            };
            let normalized_height = (avg_volume / max_volume).min(0.9); // 顶部留10%边距
            let y = nav_rect.y + nav_height * (1.0 - normalized_height);

            sampled_heights.push(y);
        }

        // 终点
        sampled_heights.push(nav_rect.y + nav_height);

        // 高效绘制面积图 - 使用直线连接
        let x_step = nav_width / target_points as f64;
        ctx.move_to(nav_rect.x, sampled_heights[0]);

        for i in 0..=target_points {
            let x = nav_rect.x + i as f64 * x_step;
            ctx.line_to(x, sampled_heights[i + 1]);
        }

        if let Some(last_height) = sampled_heights.last() {
            ctx.line_to(nav_rect.x + nav_width, *last_height);
        }
        ctx.line_to(nav_rect.x + nav_width, nav_rect.y + nav_height);
        ctx.close_path();
        ctx.fill();

        // 仅在采样点较少时绘制顶部线条
        if target_points <= 200 {
            ctx.begin_path();
            ctx.set_stroke_style_str(&theme.volume_line);
            ctx.set_line_width(1.0);
            ctx.set_global_alpha(0.8);

            for i in 0..=target_points {
                let x = nav_rect.x + i as f64 * x_step;
                if i == 0 {
                    ctx.move_to(x, sampled_heights[i + 1]);
                } else {
                    ctx.line_to(x, sampled_heights[i + 1]);
                }
            }
            ctx.stroke();
        }

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
        let canvas_manager = ctx.canvas_manager_ref();
        let overlay_ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = ctx.layout_ref();
        let data_manager = ctx.data_manager_ref();
        let theme = ctx.theme_ref();
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
        let layout = ctx.layout_ref();
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);

        // 只有在导航器区域内才处理滚轮事件
        if !nav_rect.contains(x, y) {
            return false;
        }

        let mut data_manager = ctx.data_manager_mut_ref();
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
        let layout = ctx.layout_ref();
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);
        if !nav_rect.contains(x, y) {
            return CursorStyle::Default;
        }

        // 优化鼠标样式检测，使用缓存布局避免重复计算
        let handle_type = self.get_handle_at_position(x, y, &layout, &ctx.data_manager_ref());

        // 根据手柄位置和状态提供清晰的视觉反馈
        match handle_type {
            DragHandleType::Left | DragHandleType::Right => CursorStyle::EwResize,
            DragHandleType::Middle => CursorStyle::Grab,
            DragHandleType::None => {
                // 当鼠标在导航器区域但不在任何手柄上时，检查是否在可点击区域
                let items_len = ctx
                    .data_manager_ref()
                    .get_items()
                    .map_or(0, |items| items.len());
                if items_len > 0 {
                    // 提供点击提示光标
                    CursorStyle::Pointer
                } else {
                    CursorStyle::Default
                }
            }
        }
    }
}
