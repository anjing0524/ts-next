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
#[derive(Debug, PartialEq, Clone, Copy, Default)]
pub enum DragHandleType {
    Left,
    Right,
    Middle,
    #[default]
    None,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct DragState {
    pub is_dragging: bool,
    pub drag_start_x: f64,
    pub drag_handle_type: DragHandleType,
    pub drag_start_visible_range: (usize, usize),
}

/// DataZoom导航器绘制器
pub struct DataZoomRenderer {
    drag_state: DragState,
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
            drag_state: DragState::default(),
        }
    }

    pub fn get_drag_state(&self) -> DragState {
        self.drag_state
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

        let handle_width: f64 = 10.0;
        let min_distance = handle_width.min(nav_rect.width * 0.05);

        let left_dist = (x - start_x).abs();
        let right_dist = (x - end_x).abs();

        if left_dist < min_distance && right_dist < min_distance {
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

        self.drag_state.is_dragging = true;
        self.drag_state.drag_start_x = x;
        self.drag_state.drag_handle_type = handle_type;
        let (start, count, _) = data_manager.get_visible();
        self.drag_state.drag_start_visible_range = (start, count);

        true
    }

    pub fn handle_mouse_up(&mut self, _x: f64, _y: f64, _ctx: &RenderContext) -> bool {
        let was_dragging = self.drag_state.is_dragging;
        self.drag_state.is_dragging = false;
        self.drag_state.drag_handle_type = DragHandleType::None;
        was_dragging
    }

    pub fn handle_mouse_drag(&mut self, x: f64, ctx: &RenderContext) -> DragResult {
        if !self.drag_state.is_dragging {
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

        let dx = x - self.drag_state.drag_start_x;
        let index_change = (dx / nav_rect.width * items_len as f64).round() as isize;

        let (initial_start, initial_count) = self.drag_state.drag_start_visible_range;
        const MIN_VISIBLE_COUNT: usize = 5;

        let (new_start, new_count, _new_handle_type) = match self.drag_state.drag_handle_type {
            DragHandleType::Left => {
                let new_start = (initial_start as isize + index_change)
                    .max(0)
                    .min((initial_start + initial_count - MIN_VISIBLE_COUNT) as isize)
                    as usize;
                let new_count = (initial_start + initial_count) - new_start;
                (new_start, new_count, DragHandleType::Left)
            }
            DragHandleType::Right => {
                let new_end = (initial_start as isize + initial_count as isize + index_change)
                    .max((initial_start + MIN_VISIBLE_COUNT) as isize)
                    .min(items_len as isize) as usize;
                let new_count = new_end - initial_start;
                (initial_start, new_count, DragHandleType::Right)
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

        let final_start = new_start.min(items_len.saturating_sub(MIN_VISIBLE_COUNT));
        let final_count = new_count
            .min(items_len - final_start)
            .max(MIN_VISIBLE_COUNT);

        let (current_start, current_count, _) = data_manager.get_visible();
        if current_start != final_start || current_count != final_count {
            data_manager.update_visible_range(final_start, final_count);
            return DragResult::NeedRedraw;
        }

        DragResult::NeedRedraw
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

        let items_len = items.len();
        let target_points = (nav_width as usize).min(400);
        let _step = (items_len as f64 / target_points as f64).max(1.0) as usize;

        let mut max_volume: f64 = 0.0;
        let volume_sample_step = (items_len / 100).max(1);
        for i in (0..items_len).step_by(volume_sample_step) {
            let item = items.get(i);
            max_volume = max_volume.max(item.b_vol() + item.s_vol());
        }
        if max_volume <= 0.0 {
            max_volume = 1.0;
        }

        ctx.begin_path();
        ctx.set_fill_style_str(&theme.volume_area);
        ctx.set_global_alpha(0.6);

        let mut points = Vec::with_capacity(target_points + 2);
        points.push((nav_rect.x, nav_rect.y + nav_height));

        for i in 0..=target_points {
            let data_idx = (i as f64 / target_points as f64 * (items_len - 1) as f64) as usize;
            let item = items.get(data_idx);
            let volume = item.b_vol() + item.s_vol();
            let x = nav_rect.x + (i as f64 / target_points as f64) * nav_width;
            let y = nav_rect.y + nav_height * (1.0 - (volume / max_volume).min(0.9));
            points.push((x, y));
        }
        points.push((nav_rect.x + nav_width, nav_rect.y + nav_height));

        ctx.move_to(points[0].0, points[0].1);
        for p in points.iter().skip(1) {
            ctx.line_to(p.0, p.1);
        }
        ctx.close_path();
        ctx.fill();

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

        ctx.set_fill_style_str("rgba(180, 180, 180, 0.3)");
        ctx.fill_rect(
            nav_rect.x,
            nav_rect.y,
            start_x - nav_rect.x,
            nav_rect.height,
        );
        ctx.fill_rect(
            end_x,
            nav_rect.y,
            nav_rect.x + nav_rect.width - end_x,
            nav_rect.height,
        );

        ctx.set_stroke_style_str(&theme.navigator_border);
        ctx.set_line_width(2.0);
        ctx.stroke_rect(start_x, nav_rect.y, end_x - start_x, nav_rect.height);

        let handle_width = 8.0;
        let handle_height = nav_rect.height - 8.0;
        let handle_y = nav_rect.y + 4.0;

        let handle_color = if self.drag_state.is_dragging {
            &theme.navigator_active_handle
        } else {
            &theme.navigator_handle
        };
        ctx.set_fill_style_str(handle_color);

        self.draw_rounded_rect(
            ctx,
            start_x - handle_width / 2.0,
            handle_y,
            handle_width,
            handle_height,
            2.0,
        );
        ctx.fill();
        self.draw_rounded_rect(
            ctx,
            end_x - handle_width / 2.0,
            handle_y,
            handle_width,
            handle_height,
            2.0,
        );
        ctx.fill();
    }

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
        // 确认渲染器被调用

        let canvas_manager = ctx.canvas_manager_ref();
        let overlay_ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = ctx.layout_ref();
        let data_manager = ctx.data_manager_ref();
        let theme = ctx.theme_ref();
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);

        // 调试输出：打印NavigatorContainer和HeatmapArea的矩形坐标
        let _heatmap_rect = layout.get_rect(&PaneId::HeatmapArea);

        let clear_padding = 20.0;
        overlay_ctx.clear_rect(
            nav_rect.x - clear_padding,
            nav_rect.y - clear_padding,
            nav_rect.width + clear_padding * 2.0,
            nav_rect.height + clear_padding * 2.0,
        );

        overlay_ctx.set_fill_style_str(&theme.navigator_bg);
        overlay_ctx.fill_rect(nav_rect.x, nav_rect.y, nav_rect.width, nav_rect.height);

        if data_manager.get_items().map_or(0, |i| i.len()) > 0 {
            self.draw_volume_area(overlay_ctx, &layout, &data_manager, theme);
            self.draw_visible_range_indicator(overlay_ctx, &layout, &data_manager, theme);
        }

        Ok(())
    }

    fn supports_mode(&self, _mode: RenderMode) -> bool {
        true
    }
    fn get_layer_type(&self) -> CanvasLayerType {
        CanvasLayerType::Overlay
    }
    fn get_priority(&self) -> u32 {
        100
    }

    fn handle_mouse_down(&mut self, x: f64, y: f64, ctx: &RenderContext) -> bool {
        self.handle_mouse_down(x, y, ctx)
    }

    fn handle_mouse_up(&mut self, x: f64, y: f64, ctx: &RenderContext) -> bool {
        self.handle_mouse_up(x, y, ctx)
    }

    fn handle_mouse_drag(&mut self, x: f64, _y: f64, ctx: &RenderContext) -> DragResult {
        self.handle_mouse_drag(x, ctx)
    }

    fn handle_mouse_leave(&mut self, _ctx: &RenderContext) -> bool {
        self.drag_state.is_dragging = false;
        self.drag_state.drag_handle_type = DragHandleType::None;
        true
    }

    fn handle_wheel(&mut self, x: f64, y: f64, delta: f64, ctx: &RenderContext) -> bool {
        let layout = ctx.layout_ref();
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);
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
        let relative_position = if nav_rect.width > 0.0 {
            ((x - nav_rect.x) / nav_rect.width).clamp(0.0, 1.0)
        } else {
            0.5
        };

        const WHEEL_ZOOM_FACTOR: f64 = 1.2;
        let zoom_factor = if delta > 0.0 {
            WHEEL_ZOOM_FACTOR
        } else {
            1.0 / WHEEL_ZOOM_FACTOR
        };

        let visible_center_idx = current_start as f64 + (current_count as f64 * relative_position);
        const MIN_VISIBLE_COUNT: usize = 5;
        const MAX_VISIBLE_RATIO: f64 = 0.8;
        let max_visible_count =
            ((items_len as f64 * MAX_VISIBLE_RATIO) as usize).max(MIN_VISIBLE_COUNT);
        let new_visible_count = ((current_count as f64 * zoom_factor).round() as usize)
            .max(MIN_VISIBLE_COUNT)
            .min(max_visible_count)
            .min(items_len);

        let new_start = ((visible_center_idx - (new_visible_count as f64 * relative_position))
            .round() as isize)
            .max(0)
            .min((items_len - new_visible_count) as isize) as usize;

        data_manager.update_visible_range(new_start, new_visible_count);
        true
    }

    fn get_cursor_style(&self, x: f64, y: f64, ctx: &RenderContext) -> CursorStyle {
        if self.drag_state.is_dragging {
            return match self.drag_state.drag_handle_type {
                DragHandleType::Left | DragHandleType::Right => CursorStyle::EwResize,
                DragHandleType::Middle => CursorStyle::Grabbing,
                _ => CursorStyle::Default,
            };
        }

        let layout = ctx.layout_ref();
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);
        if !nav_rect.contains(x, y) {
            return CursorStyle::Default;
        }

        let handle_type = self.get_handle_at_position(x, y, &layout, &ctx.data_manager_ref());
        match handle_type {
            DragHandleType::Left | DragHandleType::Right => CursorStyle::EwResize,
            DragHandleType::Middle => CursorStyle::Grab,
            DragHandleType::None => CursorStyle::Pointer,
        }
    }

    fn get_drag_state(&self) -> DragState {
        self.drag_state
    }
}
