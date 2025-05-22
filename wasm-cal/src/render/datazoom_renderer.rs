//! DataZoom导航器模块 - 负责绘制和处理数据缩放导航器

use crate::{
    canvas::{CanvasLayerType, CanvasManager},
    data::DataManager,
    kline_generated::kline::KlineItem,
    layout::{ChartColors, ChartLayout, theme::*}, // Added theme
    render::{chart_renderer::RenderMode, cursor_style::CursorStyle, traits::ComprehensiveRenderer},
};
use flatbuffers;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

// Structs for draw_visible_range_indicator arguments
struct NavIndicatorVisualParams {
    nav_x: f64,
    nav_y: f64,
    nav_width: f64,
    nav_height: f64,
}

struct NavIndicatorDataParams<'a> {
    items: flatbuffers::Vector<'a, flatbuffers::ForwardsUOffset<KlineItem<'a>>>,
    data_manager: &'a Rc<RefCell<DataManager>>,
}

/// 导航器拖动手柄类型
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum DragHandleType {
    Left, Right, Middle, None,
}

/// DataZoom导航器绘制器
pub struct DataZoomRenderer {
    is_dragging: bool,
    drag_start_x: f64,
    drag_handle_type: DragHandleType,
}

pub enum DragResult {
    None, NeedRedraw, Released,
}

impl ComprehensiveRenderer for DataZoomRenderer {
    /// 绘制DataZoom导航器
    fn render_component(
        &self,
        canvas_manager: &CanvasManager,
        _layout_param: &ChartLayout, // layout will be obtained from canvas_manager
        data_manager: &Rc<RefCell<DataManager>>,
        _mode: RenderMode, // _mode is unused in this renderer
    ) {
        let ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = canvas_manager.layout.borrow();

        let nav_x = layout.chart_area_x;
        let nav_y = layout.canvas_height - layout.navigator_height; // Uses layout.navigator_height
        let nav_width = layout.main_chart_width;
        let nav_height = layout.navigator_height;

        ctx.clear_rect(
            nav_x - DATAZOOM_CLEAR_PADDING,
            nav_y - DATAZOOM_CLEAR_PADDING,
            nav_width + DATAZOOM_CLEAR_PADDING * 2.0,
            nav_height + DATAZOOM_CLEAR_PADDING * 2.0,
        );

        ctx.set_fill_style_str(ChartColors::NAVIGATOR_BG);
        ctx.fill_rect(nav_x, nav_y, nav_width, nav_height);

        let items_opt = data_manager.borrow().get_items();
        let items = match items_opt {
            Some(items) => items,
            None => return,
        };

        if items.is_empty() {
            return;
        }

        self.draw_volume_area(ctx, &layout, items, nav_x, nav_y, nav_height); // Call helper
        let visual_params = NavIndicatorVisualParams { nav_x, nav_y, nav_width, nav_height };
        let data_params = NavIndicatorDataParams { items, data_manager };
        self.draw_visible_range_indicator(ctx, &layout, visual_params, data_params);
    }
}

// Public API and private helpers moved to impl DataZoomRenderer
impl DataZoomRenderer {
    pub fn new() -> Self {
        Self {
            is_dragging: false,
            drag_start_x: 0.0,
            drag_handle_type: DragHandleType::None,
        }
    }

    pub fn get_handle_at_position(
        &self,
        x: f64,
        y: f64,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
    ) -> DragHandleType {
        let layout = canvas_manager.layout.borrow();
        if !layout.is_point_in_navigator(y) { return DragHandleType::None; }

        let data_manager_ref = data_manager.borrow();
        let items = match data_manager_ref.get_items() {
            Some(items) => items,
            None => return DragHandleType::None,
        };
        if items.is_empty() { return DragHandleType::None; }

        let (_visible_start, _visible_count, _) = data_manager_ref.get_visible_range().get_range();
        // ChartLayout should have a method to get these coordinates based on its state
        // For now, assuming VisibleRange has a method or ChartLayout can compute this
        let (visible_start_x, visible_end_x) = data_manager_ref.get_visible_range().get_screen_coordinates(&layout);

        let handle_clickable_width = layout.navigator_handle_width * DATAZOOM_HANDLE_CLICK_AREA_MULTIPLIER;
        if x >= visible_start_x - handle_clickable_width && x <= visible_start_x + handle_clickable_width {
            return DragHandleType::Left;
        }
        if x >= visible_end_x - handle_clickable_width && x <= visible_end_x + handle_clickable_width {
            return DragHandleType::Right;
        }
        if x > visible_start_x && x < visible_end_x {
            return DragHandleType::Middle;
        }
        DragHandleType::None
    }

    pub fn handle_mouse_down(
        &mut self,
        x: f64,
        y: f64,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
    ) -> bool {
        let handle_type = self.get_handle_at_position(x, y, canvas_manager, data_manager);
        if handle_type == DragHandleType::None { return false; }
        self.is_dragging = true;
        self.drag_start_x = x;
        self.drag_handle_type = handle_type;
        true
    }

    pub fn get_cursor_style(
        &self,
        x: f64,
        y: f64,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
    ) -> CursorStyle {
        if self.is_dragging {
            return match self.drag_handle_type {
                DragHandleType::Left | DragHandleType::Right => CursorStyle::EwResize,
                DragHandleType::Middle => CursorStyle::Grabbing,
                DragHandleType::None => CursorStyle::Default,
            };
        }
        let layout = canvas_manager.layout.borrow();
        if !layout.is_point_in_navigator(y) { return CursorStyle::Default; }
        match self.get_handle_at_position(x, y, canvas_manager, data_manager) {
            DragHandleType::Left | DragHandleType::Right => CursorStyle::EwResize,
            DragHandleType::Middle => CursorStyle::Grab,
            DragHandleType::None => CursorStyle::Default,
        }
    }

    pub fn handle_mouse_up(&mut self, _data_manager: &Rc<RefCell<DataManager>>) -> bool {
        let was_dragging = self.is_dragging;
        self.is_dragging = false;
        self.drag_handle_type = DragHandleType::None;
        was_dragging
    }

    pub fn force_reset_drag_state(&mut self) -> bool {
        let was_dragging = self.is_dragging;
        self.is_dragging = false;
        self.drag_handle_type = DragHandleType::None;
        was_dragging
    }

    pub fn handle_mouse_drag(
        &mut self,
        x: f64,
        _y: f64, // y is not used for horizontal dragging logic
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
    ) -> DragResult {
        if !self.is_dragging { return DragResult::None; }

        let layout = canvas_manager.layout.borrow();
        let is_in_canvas = x >= 0.0 && x <= layout.canvas_width && _y >= 0.0 && _y <= layout.canvas_height;
        if !is_in_canvas { return DragResult::None; }

        let drag_distance = x - self.drag_start_x;
        let mut data_manager_ref = data_manager.borrow_mut();
        let items_len = match data_manager_ref.get_items() {
            Some(items) => items.len(),
            None => return DragResult::None,
        };
        if items_len == 0 { return DragResult::None; }

        let index_change = if layout.main_chart_width > 0.0 { // Use main_chart_width for navigator scale
            (drag_distance / layout.main_chart_width * items_len as f64).round() as isize
        } else { 0 };

        if index_change == 0 && x != self.drag_start_x {
            if (x - self.drag_start_x).abs() > layout.main_chart_width / items_len as f64 * 0.5 {
                 self.drag_start_x = x;
            }
            return DragResult::None;
        }
        if index_change == 0 { return DragResult::None;}


        let (visible_start, visible_count, visible_end) = data_manager_ref.get_visible_range().get_range();
        let (new_start, new_end) = match self.drag_handle_type {
            DragHandleType::Left => {
                let mut new_start = (visible_start as isize + index_change).max(0) as usize;
                if new_start >= items_len { new_start = items_len.saturating_sub(1); }
                
                if new_start >= visible_end.saturating_sub(1) {
                    let temp_new_start = visible_end.saturating_sub(1);
                    if temp_new_start == visible_start && index_change < 0 {
                         self.drag_start_x = x;
                         (visible_start, visible_end)
                    } else {
                        // self.drag_handle_type = DragHandleType::Right; // Avoid swapping here, let next interaction re-evaluate
                        (visible_end.saturating_sub(1), visible_end)
                    }
                } else {
                    (new_start, visible_end)
                }
            }
            DragHandleType::Right => {
                let mut new_end = (visible_end as isize + index_change).max(1) as usize;
                if new_end > items_len { new_end = items_len; }

                if new_end <= visible_start.saturating_add(1) {
                    let temp_new_end = visible_start.saturating_add(1);
                     if temp_new_end == visible_end && index_change > 0 {
                         self.drag_start_x = x;
                        (visible_start, visible_end)
                     } else {
                        // self.drag_handle_type = DragHandleType::Left; // Avoid swapping here
                        (visible_start, visible_start.saturating_add(1))
                     }
                } else {
                    (visible_start, new_end)
                }
            }
            DragHandleType::Middle => {
                let new_start = (visible_start as isize + index_change).max(0).min((items_len.saturating_sub(visible_count)) as isize) as usize;
                (new_start, new_start + visible_count)
            }
            DragHandleType::None => { return DragResult::None; }
        };

        let start_diff = (visible_start as isize - new_start as isize).abs();
        let end_diff = (visible_end as isize - new_end as isize).abs();
        let has_significant_change = start_diff > 0 || end_diff > 0;

        if has_significant_change {
            data_manager_ref.invalidate_cache();
            data_manager_ref.update_visible_range(new_start, new_end.saturating_sub(new_start));
            if start_diff.abs() > DATAZOOM_MIN_INDEX_CHANGE_FOR_DRAG_RESET || end_diff.abs() > DATAZOOM_MIN_INDEX_CHANGE_FOR_DRAG_RESET {
                self.drag_start_x = x;
            }
            data_manager_ref.calculate_data_ranges();
            return DragResult::NeedRedraw;
        }
        DragResult::None
    }

    // Helper: Draw volume area in navigator
    fn draw_volume_area(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        nav_x: f64,
        nav_y: f64,
        nav_height: f64,
    ) {
        let items_len = items.len();
        if items_len == 0 { return; }
        let nav_candle_width = layout.main_chart_width / items_len as f64;
        let mut max_volume: f64 = 0.0;
        let step = (items_len / DATAZOOM_VOLUME_AREA_SAMPLING_DIVISOR.max(1)).max(1); // Ensure step is at least 1
        for i in (0..items_len).step_by(step) {
            max_volume = max_volume.max(items.get(i).b_vol() + items.get(i).s_vol());
        }
        if max_volume <= 0.0 { max_volume = DATAZOOM_VOLUME_AREA_DEFAULT_MAX_VOLUME; }

        ctx.begin_path();
        ctx.set_stroke_style_str(ChartColors::VOLUME_LINE);
        ctx.set_line_width(DATAZOOM_INDICATOR_LINE_WIDTH);
        ctx.set_fill_style_str(ChartColors::VOLUME_AREA);

        let draw_step = if items_len > DATAZOOM_VOLUME_AREA_MAX_SAMPLE_POINTS {
            (items_len as f64 / DATAZOOM_VOLUME_AREA_MAX_SAMPLE_POINTS as f64).ceil() as usize
        } else { 1 };

        let first_volume = items.get(0).b_vol() + items.get(0).s_vol();
        let first_y = nav_y + nav_height - (first_volume / max_volume) * nav_height * DATAZOOM_VOLUME_AREA_HEIGHT_SCALE;
        ctx.move_to(nav_x, first_y);

        for i in (0..items_len).step_by(draw_step) {
            let volume = items.get(i).b_vol() + items.get(i).s_vol();
            let x = nav_x + i as f64 * nav_candle_width;
            let y = nav_y + nav_height - (volume / max_volume) * nav_height * DATAZOOM_VOLUME_AREA_HEIGHT_SCALE;
            ctx.line_to(x, y);
        }
        if items_len > 1 && draw_step > 1 {
            let last_idx = items_len - 1;
            let last_volume = items.get(last_idx).b_vol() + items.get(last_idx).s_vol();
            let last_x = nav_x + last_idx as f64 * nav_candle_width;
            let last_y = nav_y + nav_height - (last_volume / max_volume) * nav_height * DATAZOOM_VOLUME_AREA_HEIGHT_SCALE;
            ctx.line_to(last_x, last_y);
        }
        let last_x_coord = nav_x + (items_len.saturating_sub(1)) as f64 * nav_candle_width;
        ctx.line_to(last_x_coord, nav_y + nav_height);
        ctx.line_to(nav_x, nav_y + nav_height);
        ctx.close_path();
        ctx.fill();
    }

    // Helper: Draw visible range indicator
    fn draw_visible_range_indicator<'a>(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        visual_params: NavIndicatorVisualParams,
        data_params: NavIndicatorDataParams<'a>,
    ) {
        let items_len = data_params.items.len();
        if items_len == 0 { return; }
        let data_manager_ref = data_params.data_manager.borrow();
        let visible_range_obj = data_manager_ref.get_visible_range();
        let (visible_start, visible_count, _) = visible_range_obj.get_range();
        if visible_start == 0 && visible_count >= items_len { return; }

        let (visible_start_x, visible_end_x) = visible_range_obj.get_screen_coordinates(layout);
        let clamped_start_x = visible_start_x.max(visual_params.nav_x).min(visual_params.nav_x + visual_params.nav_width);
        let clamped_end_x = visible_end_x.max(visual_params.nav_x).min(visual_params.nav_x + visual_params.nav_width);

        ctx.save();
        ctx.begin_path();
        ctx.rect(visual_params.nav_x, visual_params.nav_y, visual_params.nav_width, visual_params.nav_height);
        ctx.clip();

        ctx.set_fill_style_str(ChartColors::NAVIGATOR_MASK);
        ctx.fill_rect(visual_params.nav_x, visual_params.nav_y, clamped_start_x - visual_params.nav_x, visual_params.nav_height);
        ctx.fill_rect(clamped_end_x, visual_params.nav_y, visual_params.nav_x + visual_params.nav_width - clamped_end_x, visual_params.nav_height);

        let border_left = clamped_start_x;
        let border_width = (clamped_end_x - clamped_start_x).max(0.0);
        if border_width > 0.0 {
            ctx.set_stroke_style_str(ChartColors::NAVIGATOR_BORDER);
            ctx.set_line_width(DATAZOOM_INDICATOR_LINE_WIDTH);
            ctx.stroke_rect(border_left, visual_params.nav_y, border_width, visual_params.nav_height);
        }

        let handle_color = if self.is_dragging { ChartColors::NAVIGATOR_ACTIVE_HANDLE } else { ChartColors::NAVIGATOR_HANDLE };
        let handle_width = if self.is_dragging { layout.navigator_handle_width * DATAZOOM_DRAGGING_HANDLE_WIDTH_MULTIPLIER } else { layout.navigator_handle_width };
        
        let shadow_blur = if self.is_dragging {
            let left_edge_distance = clamped_start_x - visual_params.nav_x;
            let right_edge_distance = visual_params.nav_x + visual_params.nav_width - clamped_end_x;
            let min_distance = left_edge_distance.min(right_edge_distance);
            if min_distance < DATAZOOM_SHADOW_EDGE_DISTANCE_THRESHOLD {
                DATAZOOM_SHADOW_MAX_BLUR * (min_distance / DATAZOOM_SHADOW_EDGE_DISTANCE_THRESHOLD)
            } else { DATAZOOM_SHADOW_MAX_BLUR }
        } else { 0.0 };
        let shadow_color = if self.is_dragging { ChartColors::NAVIGATOR_ACTIVE_HANDLE_SHADOW } else { ChartColors::TRANSPARENT };

        if clamped_start_x >= visual_params.nav_x && clamped_start_x <= visual_params.nav_x + visual_params.nav_width {
            ctx.set_fill_style_str(handle_color);
            ctx.set_shadow_blur(shadow_blur);
            ctx.set_shadow_color(shadow_color);
            ctx.fill_rect(clamped_start_x - handle_width / 2.0, visual_params.nav_y + visual_params.nav_height / 4.0, handle_width, visual_params.nav_height / 2.0);
        }
        if clamped_end_x >= visual_params.nav_x && clamped_end_x <= visual_params.nav_x + visual_params.nav_width && clamped_end_x > clamped_start_x {
            ctx.set_fill_style_str(handle_color);
            ctx.set_shadow_blur(shadow_blur);
            ctx.set_shadow_color(shadow_color);
            ctx.fill_rect(clamped_end_x - handle_width / 2.0, visual_params.nav_y + visual_params.nav_height / 4.0, handle_width, visual_params.nav_height / 2.0);
        }
        ctx.restore();
    }
}
