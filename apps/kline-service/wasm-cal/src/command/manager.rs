//! src/command/manager.rs

use super::event::Event;
use super::result::CommandResult;
use crate::canvas::CanvasLayerType;
use crate::layout::PaneId;
use crate::render::SharedRenderState;
use crate::render::cursor_style::CursorStyle;
use crate::render::datazoom_renderer::DragResult;
use crate::render::render_context::RenderContext;

#[derive(Clone)]
pub struct CommandManager {
    pub shared_state: SharedRenderState,
}

impl CommandManager {
    /// 创建新的命令管理器实例
    ///
    /// 参数：
    /// - shared_state: 包含画布、数据、布局等共享渲染状态
    pub fn new(shared_state: SharedRenderState) -> Self {
        Self { shared_state }
    }

    /// 统一的事件处理入口
    ///
    /// 分发各类事件到对应的处理方法，并维护鼠标状态。
    ///
    /// 参数：
    /// - event: 需要处理的事件（鼠标移动/按下/抬起/离开/滚轮）
    ///
    /// 返回：
    /// - CommandResult: 事件处理结果，指示是否需要重绘或布局变更
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

        // 新增：对滚轮事件也要同步鼠标坐标，保证区域判定使用事件位置
        if let Event::Wheel { x, y, .. } = event {
            let mut mouse_state = self.shared_state.mouse_state.borrow_mut();
            mouse_state.x = x;
            mouse_state.y = y;
        }

        // 2. 事件到指令的转换与处理
        let result = match event {
            Event::MouseMove { x, y } => self.handle_mouse_move(x, y),
            Event::MouseDown { x, y } => self.handle_mouse_down(x, y),
            Event::MouseUp { x, y } => self.handle_mouse_up(x, y),
            Event::MouseLeave => self.handle_mouse_leave(),
            // 仅传入 delta，handle_wheel 内部读取当前鼠标位置
            Event::Wheel { delta, .. } => self.handle_wheel(delta),
        };

        result
    }

    // --- 私有事件处理实现 ---

    /// 处理鼠标移动事件
    ///
    /// 负责更新悬停状态、处理拖拽逻辑、检测光标样式变化并决定是否重绘。
    ///
    /// 参数：
    /// - x, y: 鼠标当前坐标
    ///
    /// 返回：
    /// - CommandResult: 可能的结果包括重绘、光标变化或仅处理
    fn handle_mouse_move(&mut self, x: f64, y: f64) -> CommandResult {
        // 鼠标位置已在 execute 方法中更新

        // 如果正在拖动，则处理拖动逻辑
        let is_dragging = { self.shared_state.mouse_state.borrow().is_dragging };
        if is_dragging {
            let ctx = RenderContext::from_shared(self.shared_state.clone());
            // 在对 strategy_factory 的不可变借用作用域内获取 DataZoomRenderer，避免不必要的克隆
            let need_layout_changed = {
                let strategy_factory = self.shared_state.strategy_factory.borrow();
                if let Some(dz_cell) = strategy_factory.get_datazoom_renderer() {
                    let mut renderer = dz_cell.borrow_mut();
                    matches!(
                        renderer.handle_mouse_drag(x, y, &ctx),
                        DragResult::NeedRedraw
                    )
                } else {
                    false
                }
            };
            if need_layout_changed {
                return CommandResult::LayoutChanged;
            }
            return CommandResult::Handled;
        }

        // 更新悬浮状态前先读取状态快照
        let (old_hover_index, old_is_in_chart) = {
            let mouse_state = self.shared_state.mouse_state.borrow();
            (mouse_state.hover_candle_index, mouse_state.is_in_chart_area)
        };

        self.update_hover_status(x, y); // 更新 is_in_chart_area 和 hover_candle_index

        // 检查状态变化
        let (hover_changed, area_changed, is_in_chart) = {
            let mouse_state = self.shared_state.mouse_state.borrow();
            let hover_changed = old_hover_index != mouse_state.hover_candle_index;
            let area_changed = old_is_in_chart != mouse_state.is_in_chart_area;
            let is_in_chart = mouse_state.is_in_chart_area;
            (hover_changed, area_changed, is_in_chart)
        };

        // 鼠标位置总是变化的，因为我们已经更新了它
        let position_changed = true;

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
            return CommandResult::CursorChanged(cursor_style);
        }

        // 即使没有悬浮状态变化，也需要返回光标样式
        CommandResult::CursorChanged(cursor_style)
    }

    /// 处理鼠标按下事件
    ///
    /// 检测是否在导航器区域内，如果是则启动拖拽操作。
    ///
    /// 参数：
    /// - x, y: 鼠标按下的坐标
    ///
    /// 返回：
    /// - CommandResult: 可能的结果包括重绘或无操作
    fn handle_mouse_down(&mut self, x: f64, y: f64) -> CommandResult {
        let in_navigator = {
            let layout = self.shared_state.layout.borrow();
            let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);
            nav_rect.contains(x, y)
        };

        if in_navigator {
            let ctx = RenderContext::from_shared(self.shared_state.clone());
            // 在对 strategy_factory 的不可变借用作用域内获取 DataZoomRenderer
            let handled = {
                let strategy_factory = self.shared_state.strategy_factory.borrow();
                if let Some(dz_cell) = strategy_factory.get_datazoom_renderer() {
                    let mut renderer = dz_cell.borrow_mut();
                    if let Some(drag_state) = renderer.handle_mouse_down(x, y, &ctx) {
                        let mut mouse_state = self.shared_state.mouse_state.borrow_mut();
                        mouse_state.is_dragging = drag_state.is_dragging;
                        mouse_state.drag_handle_type = drag_state.drag_handle_type;
                        mouse_state.drag_start_x = drag_state.drag_start_x;
                        mouse_state.drag_start_visible_range = drag_state.drag_start_visible_range;
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            };
            if handled {
                return CommandResult::Redraw(CanvasLayerType::Overlay);
            }
        }
        CommandResult::None
    }

    /// 处理鼠标抬起事件
    ///
    /// 结束拖拽操作并同步拖拽状态。
    ///
    /// 参数：
    /// - x, y: 鼠标抬起的坐标
    ///
    /// 返回：
    /// - CommandResult: 可能的结果包括布局变更或无操作
    fn handle_mouse_up(&mut self, x: f64, y: f64) -> CommandResult {
        let was_dragging = { self.shared_state.mouse_state.borrow().is_dragging };
        if was_dragging {
            let ctx = RenderContext::from_shared(self.shared_state.clone());
            // 在对 strategy_factory 的不可变借用作用域内获取 DataZoomRenderer
            let need_layout_changed = {
                let strategy_factory = self.shared_state.strategy_factory.borrow();
                if let Some(dz_cell) = strategy_factory.get_datazoom_renderer() {
                    let mut renderer = dz_cell.borrow_mut();
                    if renderer.handle_mouse_up(x, y, &ctx) {
                        // 从 DataZoomRenderer 内部状态同步到 CommandManager
                        let dz_state = renderer.get_drag_state();
                        let mut mouse_state = self.shared_state.mouse_state.borrow_mut();
                        mouse_state.is_dragging = dz_state.is_dragging;
                        mouse_state.drag_handle_type = dz_state.drag_handle_type;
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            };
            if need_layout_changed {
                return CommandResult::LayoutChanged;
            }
        }
        CommandResult::None
    }

    /// 处理鼠标离开事件
    ///
    /// 清除所有鼠标相关状态并触发重绘以清除十字线等交互元素。
    ///
    /// 返回：
    /// - CommandResult: 根据是否在拖拽决定重绘范围
    fn handle_mouse_leave(&mut self) -> CommandResult {
        let was_dragging: bool;
        {
            let mut mouse_state = self.shared_state.mouse_state.borrow_mut();
            mouse_state.is_in_chart_area = false;
            mouse_state.hover_candle_index = None;
            mouse_state.is_in_navigator = false;
            was_dragging = mouse_state.is_dragging;
            mouse_state.is_dragging = false;
        }

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

    /// 处理滚轮事件
    ///
    /// 根据当前鼠标位置判断是否在导航器区域，如果是则委托给DataZoomRenderer处理，
    /// 否则在主图区域时委托给DataManager处理。
    ///
    /// 参数：
    /// - delta_y: 滚轮滚动的垂直偏移量
    ///
    /// 返回：
    /// - CommandResult: 可能的结果包括重绘、布局变更或无操作
    fn handle_wheel(&mut self, delta_y: f64) -> CommandResult {
        let (x, y) = {
            let mouse_state = self.shared_state.mouse_state.borrow();
            (mouse_state.x, mouse_state.y)
        };

        let (in_navigator, in_main_area, main_rect) = {
            let layout = self.shared_state.layout.borrow();
            let nav_rect = layout.get_rect(&PaneId::NavigatorContainer);
            let main_rect = layout.get_rect(&PaneId::HeatmapArea);
            let in_navigator = nav_rect.contains(x, y);
            let in_main_area = main_rect.contains(x, y);
            (in_navigator, in_main_area, main_rect)
        };

        if in_navigator {
            let ctx = RenderContext::from_shared(self.shared_state.clone());
            // 在对 strategy_factory 的不可变借用作用域内获取 DataZoomRenderer
            let handled = {
                let strategy_factory = self.shared_state.strategy_factory.borrow();
                if let Some(dz_cell) = strategy_factory.get_datazoom_renderer() {
                    let mut renderer = dz_cell.borrow_mut();
                    renderer.handle_wheel(x, y, delta_y, &ctx)
                } else {
                    false
                }
            };
            if handled {
                return CommandResult::Redraw(CanvasLayerType::Overlay);
            }
        } else if in_main_area {
            // 在主图区域，委托给 DataManager 处理
            let mut data_manager = self.shared_state.data_manager.borrow_mut();
            if data_manager.handle_wheel(x, y, delta_y, main_rect.x, main_rect.width, true) {
                return CommandResult::LayoutChanged;
            }
        }
        CommandResult::None
    }

    /// 更新鼠标悬停状态
    ///
    /// 职责：
    /// - 根据 (x, y) 判断鼠标是否位于导航器区域或主图（热力图/成交量）区域；
    /// - 将区域判定结果写入共享的 mouse_state（is_in_chart_area / is_in_navigator）；
    /// - 当鼠标位于主图区域时，计算当前悬停的 K 线索引 hover_candle_index；否则将其置为 None。
    ///
    /// 边界与防护：
    /// - 当 DataManager::get_visible() 返回 count==0 或 end<=start 时，不计算索引，避免对 (end-1) 的下溢访问；
    /// - Heatmap 区域无 right() 方法，这里以 x + width 计算右边界；
    /// - bin_width 以 ceil 计算，避免出现 0 宽导致的除零风险。
    ///
    /// 参数：
    /// - x: 鼠标相对画布的 X 坐标
    /// - y: 鼠标相对画布的 Y 坐标
    pub fn update_hover_status(&self, x: f64, y: f64) {
        let (in_navigator, in_chart_area) = {
            let layout = self.shared_state.layout.borrow();
            let in_navigator = layout.get_rect(&PaneId::NavigatorContainer).contains(x, y);
            let in_chart_area = layout.get_rect(&PaneId::HeatmapArea).contains(x, y)
                || layout.get_rect(&PaneId::VolumeChart).contains(x, y);
            (in_navigator, in_chart_area)
        };

        {
            let mut mouse_state = self.shared_state.mouse_state.borrow_mut();
            mouse_state.is_in_chart_area = in_chart_area;
            mouse_state.is_in_navigator = in_navigator;
        }

        // 只有在主图区域时才计算 hover candle index
        if in_chart_area {
            let (heatmap_x, heatmap_right, heatmap_width) = {
                let layout = self.shared_state.layout.borrow();
                let heatmap_rect = layout.get_rect(&PaneId::HeatmapArea);
                let right = heatmap_rect.x + heatmap_rect.width; // 无 right() 方法，手动计算
                (heatmap_rect.x, right, heatmap_rect.width)
            };
            // 使用 DataManager::get_visible() 获取 (start, count, end)
            let (start, count, end) = {
                let data_manager = self.shared_state.data_manager.borrow();
                data_manager.get_visible()
            };

            // 当没有可见数据时（count==0 或 end<=start），不计算 hover 索引，防止 end-1 下溢
            let hover_index = if x >= heatmap_x && x <= heatmap_right && count > 0 && end > start {
                let bin_width = (heatmap_width / (count as f64)).ceil();
                let offset_x = x - heatmap_x;
                let index = (offset_x / bin_width) as usize + start;
                Some(index.min(end - 1))
            } else {
                None
            };

            let mut mouse_state = self.shared_state.mouse_state.borrow_mut();
            mouse_state.hover_candle_index = hover_index;
        } else {
            let mut mouse_state = self.shared_state.mouse_state.borrow_mut();
            mouse_state.hover_candle_index = None;
        }
    }

    /// 获取当前光标样式
    pub fn get_cursor_style(&self) -> CursorStyle {
        let mouse_state = self.shared_state.mouse_state.borrow();
        self.get_cursor_style_at(mouse_state.x, mouse_state.y)
    }

    /// 获取指定位置的光标样式
    pub fn get_cursor_style_at(&self, x: f64, y: f64) -> CursorStyle {
        let is_in_navigator = {
            let layout = self.shared_state.layout.borrow();
            layout.get_rect(&PaneId::NavigatorContainer).contains(x, y)
        };

        if is_in_navigator {
            let ctx = RenderContext::from_shared(self.shared_state.clone());
            let mode = *ctx.shared.mode.borrow();
            let strategy_factory = self.shared_state.strategy_factory.borrow();
            return strategy_factory.get_cursor_style(x, y, &ctx, mode);
        }

        // 主图区域：返回十字光标
        let in_chart_area = {
            let layout = self.shared_state.layout.borrow();
            layout.get_rect(&PaneId::HeatmapArea).contains(x, y)
                || layout.get_rect(&PaneId::VolumeChart).contains(x, y)
        };
        if in_chart_area {
            return CursorStyle::Crosshair;
        }

        // 图表外区域：返回默认光标
        CursorStyle::Default
    }
}
