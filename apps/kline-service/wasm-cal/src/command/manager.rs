//! src/command/manager.rs

use super::event::Event;
use super::result::CommandResult;
use crate::canvas::CanvasLayerType;
use crate::layout::PaneId;
use crate::render::SharedRenderState;
use crate::render::cursor_style::CursorStyle;
use crate::render::datazoom_renderer::{DragHandleType, DragResult};
use crate::render::render_context::RenderContext;

#[derive(Clone)]
pub struct CommandManager {
    pub shared_state: SharedRenderState,
}

impl CommandManager {
    pub fn new(shared_state: SharedRenderState) -> Self {
        Self { shared_state }
    }

    /// 统一的事件处理入口
    pub fn execute(&mut self, event: Event) -> CommandResult {
        // 对于鼠标移动事件，始终更新位置状态
        if let Event::MouseMove { x, y } = event {
            // 更新鼠标位置，无论是否被节流
            {
                let mut mouse_state = self.shared_state.mouse_state.borrow_mut();
                mouse_state.x = x;
                mouse_state.y = y;
            }

            // 直接处理事件，不进行节流检查
        }

        // 2. 事件到指令的转换与处理
        let result = match event {
            Event::MouseMove { x, y } => self.handle_mouse_move(x, y),
            Event::MouseDown { x, y } => self.handle_mouse_down(x, y),
            Event::MouseUp { x, y } => self.handle_mouse_up(x, y),
            Event::MouseLeave => self.handle_mouse_leave(),
            Event::Wheel { delta, x, y } => self.handle_wheel(delta, x, y),
        };

        result
    }

    // --- 私有事件处理实现 ---

    fn handle_mouse_move(&mut self, x: f64, y: f64) -> CommandResult {
        // 鼠标位置已在 execute 方法中更新

        // 如果正在拖动，则处理拖动逻辑
        let is_dragging = self.shared_state.mouse_state.borrow().is_dragging;
        if is_dragging {
            let ctx = RenderContext::from_shared(self.shared_state.clone());
            // 直接调用 DataZoomRenderer 的拖动逻辑
            if let Some(dz_renderer) = self
                .shared_state
                .strategy_factory
                .borrow()
                .get_datazoom_renderer()
            {
                let mut renderer = dz_renderer.borrow_mut();
                if let DragResult::NeedRedraw = renderer.handle_mouse_drag(x, y, &ctx) {
                    return CommandResult::LayoutChanged;
                }
            }
            return CommandResult::Handled;
        }

        // 更新悬浮状态
        let mouse_state_before = self.shared_state.mouse_state.borrow();
        let old_hover_index = mouse_state_before.hover_candle_index;
        let old_is_in_chart = mouse_state_before.is_in_chart_area;
        drop(mouse_state_before); // 释放借用

        self.update_hover_status(x, y); // 更新 is_in_chart_area 和 hover_candle_index

        // 检查状态变化
        let mouse_state_after = self.shared_state.mouse_state.borrow();
        let hover_changed = old_hover_index != mouse_state_after.hover_candle_index;
        let area_changed = old_is_in_chart != mouse_state_after.is_in_chart_area;
        let is_in_chart = mouse_state_after.is_in_chart_area;

        // 鼠标位置总是变化的，因为我们已经更新了它
        let position_changed = true;

        drop(mouse_state_after); // 释放借用

        // 检查光标样式变化
        let cursor_style = self.get_cursor_style();

        if hover_changed || area_changed || (position_changed && is_in_chart) {
            // 悬浮状态或位置改变，需要重绘覆盖层（十字线、Tooltip）和主图层（订单簿）
            self.shared_state
                .canvas_manager
                .borrow_mut()
                .set_dirty(CanvasLayerType::Overlay, true);
            self.shared_state
                .canvas_manager
                .borrow_mut()
                .set_dirty(CanvasLayerType::Main, true); // 因为BookRenderer在Main层

            // 如果光标样式也改变了，返回复合结果
            if let Some(style) = cursor_style {
                return CommandResult::CursorChanged(style);
            }
            return CommandResult::Redraw(CanvasLayerType::Overlay);
        }

        // 即使没有悬浮状态变化，也需要返回光标样式
        if let Some(style) = cursor_style {
            return CommandResult::CursorChanged(style);
        }

        CommandResult::Handled
    }

    fn handle_mouse_down(&mut self, x: f64, y: f64) -> CommandResult {
        let layout = self.shared_state.layout.borrow();
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);

        if nav_rect.contains(x, y) {
            let ctx = RenderContext::from_shared(self.shared_state.clone());
            if let Some(dz_renderer) = self
                .shared_state
                .strategy_factory
                .borrow()
                .get_datazoom_renderer()
            {
                let mut renderer = dz_renderer.borrow_mut();
                if renderer.handle_mouse_down(x, y, &ctx) {
                    // 从 DataZoomRenderer 内部状态同步到 CommandManager
                    let dz_state = renderer.get_drag_state();
                    let mut mouse_state = self.shared_state.mouse_state.borrow_mut();
                    mouse_state.is_dragging = dz_state.is_dragging;
                    mouse_state.drag_handle_type = dz_state.drag_handle_type;
                    mouse_state.drag_start_x = dz_state.drag_start_x;
                    mouse_state.drag_start_visible_range = dz_state.drag_start_visible_range;
                    drop(mouse_state);
                    return CommandResult::Redraw(CanvasLayerType::Overlay);
                }
            }
        }
        CommandResult::None
    }

    fn handle_mouse_up(&mut self, x: f64, y: f64) -> CommandResult {
        let mut mouse_state = self.shared_state.mouse_state.borrow_mut();
        if mouse_state.is_dragging {
            mouse_state.is_dragging = false;
            drop(mouse_state); // 释放借用
            let ctx = RenderContext::from_shared(self.shared_state.clone());
            if let Some(dz_renderer) = self
                .shared_state
                .strategy_factory
                .borrow()
                .get_datazoom_renderer()
            {
                let mut renderer = dz_renderer.borrow_mut();
                renderer.handle_mouse_up(x, y, &ctx);
                return CommandResult::Redraw(CanvasLayerType::Overlay);
            }
        }
        CommandResult::None
    }

    fn handle_mouse_leave(&mut self) -> CommandResult {
        let mut mouse_state = self.shared_state.mouse_state.borrow_mut();
        mouse_state.is_in_chart_area = false;
        mouse_state.hover_candle_index = None;
        mouse_state.is_in_navigator = false;
        let was_dragging = mouse_state.is_dragging;
        mouse_state.is_dragging = false;
        drop(mouse_state);

        // 触发重绘以清除十字线等
        self.shared_state
            .canvas_manager
            .borrow_mut()
            .set_dirty(CanvasLayerType::Overlay, true);
        self.shared_state
            .canvas_manager
            .borrow_mut()
            .set_dirty(CanvasLayerType::Main, true);

        if was_dragging {
            CommandResult::RedrawAll
        } else {
            CommandResult::Redraw(CanvasLayerType::Overlay)
        }
    }

    fn handle_wheel(&mut self, delta: f64, x: f64, y: f64) -> CommandResult {
        let layout = self.shared_state.layout.borrow();
        let main_chart_rect = layout.get_rect(&PaneId::HeatmapArea);
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);

        let mut handled = false;

        if main_chart_rect.contains(x, y) {
            let mut data_manager = self.shared_state.data_manager.borrow_mut();
            handled = data_manager.handle_wheel(
                x,
                y,
                delta, // 使用实际的delta值而不是0.0
                main_chart_rect.x,
                main_chart_rect.width,
                true,
            );
        } else if nav_rect.contains(x, y) {
            let ctx = RenderContext::from_shared(self.shared_state.clone());
            if let Some(dz_renderer) = self
                .shared_state
                .strategy_factory
                .borrow()
                .get_datazoom_renderer()
            {
                let mut renderer = dz_renderer.borrow_mut();
                handled = renderer.handle_wheel(x, y, delta, &ctx); // 使用实际的delta值
            }
        }

        if handled {
            CommandResult::LayoutChanged
        } else {
            CommandResult::None
        }
    }

    pub fn update_hover_status(&mut self, x: f64, y: f64) {
        let layout = self.shared_state.layout.borrow();
        let heatmap_area_rect = layout.get_rect(&PaneId::HeatmapArea);
        let volume_chart_rect = layout.get_rect(&PaneId::VolumeChart);

        let mut mouse_state = self.shared_state.mouse_state.borrow_mut();
        mouse_state.is_in_chart_area =
            heatmap_area_rect.contains(x, y) || volume_chart_rect.contains(x, y);

        if mouse_state.is_in_chart_area {
            let data_manager = self.shared_state.data_manager.borrow();
            let (visible_start, _, _) = data_manager.get_visible();
            if layout.total_candle_width > 0.0 {
                let relative_x = x - heatmap_area_rect.x;
                let idx_in_visible = (relative_x / layout.total_candle_width).floor() as usize;
                let max_index = data_manager.len().saturating_sub(1);
                let hover_index = (visible_start + idx_in_visible).min(max_index);
                mouse_state.hover_candle_index = Some(hover_index);
            } else {
                mouse_state.hover_candle_index = None;
            }
        } else {
            mouse_state.hover_candle_index = None;
        }
    }

    /// 获取当前光标样式
    pub fn get_cursor_style(&self) -> Option<CursorStyle> {
        let mouse_state = self.shared_state.mouse_state.borrow();
        self.get_cursor_style_at(mouse_state.x, mouse_state.y)
    }

    /// 获取指定位置的光标样式
    pub fn get_cursor_style_at(&self, x: f64, y: f64) -> Option<CursorStyle> {
        let layout = self.shared_state.layout.borrow();
        let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);

        // 检查是否在导航器区域
        if nav_rect.contains(x, y) {
            if let Some(dz_renderer) = self
                .shared_state
                .strategy_factory
                .borrow()
                .get_datazoom_renderer()
            {
                let _renderer = dz_renderer.borrow();
                // 使用 dyn RenderStrategy 的 trait 方法，如果需要具体方法，需要修改 trait
                // 暂时返回默认值，后续可以扩展 trait 或使用其他方法
                let handle_type = DragHandleType::None;

                match handle_type {
                    DragHandleType::Left | DragHandleType::Right => Some(CursorStyle::EwResize),
                    DragHandleType::Middle => Some(CursorStyle::Move),
                    DragHandleType::None => Some(CursorStyle::Default),
                }
            } else {
                Some(CursorStyle::Default)
            }
        }
        // 检查是否在图表区域
        else {
            let heatmap_area_rect = layout.get_rect(&PaneId::HeatmapArea);
            let volume_chart_rect = layout.get_rect(&PaneId::VolumeChart);
            let is_in_chart_area =
                heatmap_area_rect.contains(x, y) || volume_chart_rect.contains(x, y);

            if is_in_chart_area {
                Some(CursorStyle::Crosshair)
            } else {
                Some(CursorStyle::Default)
            }
        }
    }
}
