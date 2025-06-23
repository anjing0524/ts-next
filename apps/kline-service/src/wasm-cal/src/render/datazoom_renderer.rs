//! DataZoom导航器模块 - 负责绘制和处理数据缩放导航器

use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::data::DataManager;
use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartColors, ChartLayout};
use crate::render::cursor_style::CursorStyle;
use flatbuffers;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 导航器拖动手柄类型
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum DragHandleType {
    /// 左侧手柄
    Left,
    /// 右侧手柄
    Right,
    /// 中间区域
    Middle,
    /// 非拖动区域
    None,
}

/// DataZoom导航器绘制器
pub struct DataZoomRenderer {
    /// 当前拖动状态
    is_dragging: bool,
    /// 拖动开始的X坐标
    drag_start_x: f64,
    /// 当前拖动的手柄类型
    drag_handle_type: DragHandleType,
}

pub enum DragResult {
    None,
    NeedRedraw,
    Released,
}

impl DataZoomRenderer {
    /// 创建新的DataZoom导航器渲染器
    pub fn new() -> Self {
        Self {
            is_dragging: false,
            drag_start_x: 0.0,
            drag_handle_type: DragHandleType::None,
        }
    }

    /// 判断鼠标是否在导航器手柄上
    pub fn get_handle_at_position(
        &self,
        x: f64,
        y: f64,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
    ) -> DragHandleType {
        let layout = canvas_manager.layout.borrow();

        // 如果不在导航器区域内，直接返回None
        if !layout.is_point_in_navigator(x, y) {
            return DragHandleType::None;
        }

        // 获取数据
        let data_manager_ref = data_manager.borrow();
        let items_opt = data_manager_ref.get_items();
        let items = match items_opt {
            Some(items) => items,
            None => return DragHandleType::None,
        };

        let items_len = items.len();
        if items_len == 0 {
            return DragHandleType::None;
        }

        // 获取可见范围
        let (visible_start, visible_count, _) = data_manager_ref.get_visible();

        // 计算可见区域的坐标
        let (visible_start_x, visible_end_x) =
            layout.calculate_visible_range_coordinates(items_len, visible_start, visible_count);

        // 判断是否在左侧手柄上
        let handle_width = layout.navigator_handle_width * 3.0; // 增加手柄的可点击区域
        if x >= visible_start_x - handle_width && x <= visible_start_x + handle_width {
            return DragHandleType::Left;
        }

        // 判断是否在右侧手柄上
        if x >= visible_end_x - handle_width && x <= visible_end_x + handle_width {
            return DragHandleType::Right;
        }

        // 判断是否在中间区域
        if x > visible_start_x && x < visible_end_x {
            return DragHandleType::Middle;
        }

        DragHandleType::None
    }

    /// 处理鼠标按下事件
    pub fn handle_mouse_down(
        &mut self,
        x: f64,
        y: f64,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
    ) -> bool {
        // 获取当前鼠标位置的手柄类型
        let handle_type = self.get_handle_at_position(x, y, canvas_manager, data_manager);

        // 如果不在任何手柄上，不处理
        if handle_type == DragHandleType::None {
            return false;
        }

        // 记录拖动开始状态
        self.is_dragging = true;
        self.drag_start_x = x;
        self.drag_handle_type = handle_type;

        true
    }

    /// 获取鼠标在当前位置应该显示的样式
    pub fn get_cursor_style(
        &self,
        x: f64,
        y: f64,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
    ) -> CursorStyle {
        // 如果正在拖动，根据拖动手柄类型返回对应的鼠标样式
        if self.is_dragging {
            return match self.drag_handle_type {
                DragHandleType::Left | DragHandleType::Right => CursorStyle::EwResize, // 东西方向调整大小
                DragHandleType::Middle => CursorStyle::Grabbing,                       // 抓取中样式
                DragHandleType::None => CursorStyle::Default, // 不应该发生，但为了安全起见
            };
        }

        // 如果没有在拖动，检查鼠标位置对应的手柄类型
        // 确保鼠标在导航器区域内
        let layout = canvas_manager.layout.borrow();
        if !layout.is_point_in_navigator(x, y) {
            return CursorStyle::Default;
        }

        let handle_type = self.get_handle_at_position(x, y, canvas_manager, data_manager);
        match handle_type {
            DragHandleType::Left | DragHandleType::Right => CursorStyle::EwResize, // 东西方向调整大小
            DragHandleType::Middle => CursorStyle::Grab,                           // 抓取样式
            DragHandleType::None => CursorStyle::Default,
        }
    }

    /// 处理鼠标释放事件
    /// 当用户释放鼠标按钮时调用此函数，结束拖动操作
    /// 返回一个布尔值，表示之前是否处于拖动状态
    pub fn handle_mouse_up(&mut self, _data_manager: &Rc<RefCell<DataManager>>) -> bool {
        let was_dragging = self.is_dragging;

        // 重置拖动状态
        self.is_dragging = false;
        self.drag_handle_type = DragHandleType::None;

        // 返回之前是否在拖动，调用者可以据此决定是否需要重绘
        was_dragging
    }

    /// 强制重置拖动状态
    /// 在特殊情况下（如鼠标离开图表区域）调用此函数，确保拖动状态被正确重置
    pub fn force_reset_drag_state(&mut self) -> bool {
        let was_dragging = self.is_dragging;
        self.is_dragging = false;
        self.drag_handle_type = DragHandleType::None;
        was_dragging
    }

    /// 处理鼠标拖动事件
    /// 当用户拖动鼠标时调用此函数，更新导航器的位置
    /// 与handle_mouse_move类似，但专门用于拖动状态
    /// 允许左侧拖动手柄向右拖动以及交换手柄
    /// 允许右侧拖动手柄向左拖动以及交换手柄
    /// 两侧的手柄均支持 左右两个方向拖动
    /// 拖动中间区域实现平移
    pub fn handle_mouse_drag(
        &mut self,
        x: f64,
        _y: f64,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
    ) -> DragResult {
        // 如果没有在拖动，不处理
        if !self.is_dragging {
            return DragResult::None;
        }

        // 检查鼠标是否在导航器区域内
        let layout = canvas_manager.layout.borrow();
        // 允许鼠标在拖动状态下不一定在导航器区域内，但不能超出canvas范围
        let is_in_canvas =
            x >= 0.0 && x <= layout.canvas_width && _y >= 0.0 && _y <= layout.canvas_height;
        if !is_in_canvas {
            // 如果鼠标不在canvas范围内，不触发重置，但继续处理拖动
            // 允许用户拖动到canvas外部并返回时继续控制
            return DragResult::None;
        }

        // 计算拖动距离
        let drag_distance = x - self.drag_start_x;

        // 获取布局和数据
        let mut data_manager_ref = data_manager.borrow_mut();

        // 获取数据总量
        let items_len = match data_manager_ref.get_items() {
            Some(items) => items.len(),
            None => return DragResult::None,
        };

        if items_len == 0 {
            return DragResult::None;
        }

        // 计算拖动距离对应的索引变化
        let index_change = if layout.chart_area_width > 0.0 {
            (drag_distance / layout.chart_area_width * items_len as f64).round() as isize
        } else {
            0
        };

        // 如果没有明显变化，不需要处理
        if index_change == 0 {
            return DragResult::None;
        }

        // 获取当前可见范围
        let (visible_start, visible_count, visible_end) = data_manager_ref.get_visible();

        // 根据拖动手柄类型计算新的可见范围
        let (new_start, new_end) = match self.drag_handle_type {
            DragHandleType::Left => {
                let new_start = (visible_start as isize + index_change)
                    .max(0)
                    .min((items_len - 1) as isize) as usize;
                if new_start == 0 {
                    // 重置拖动状态，确保光标样式被正确更新
                    self.is_dragging = false;
                    self.drag_handle_type = DragHandleType::None;
                    return DragResult::Released;
                } else if new_start >= visible_end {
                    // 如果左侧手柄超过了右侧手柄，交换手柄类型
                    self.drag_handle_type = DragHandleType::Right;
                    (visible_end, visible_end)
                } else {
                    (new_start, visible_end)
                }
            }
            DragHandleType::Right => {
                let new_end = ((visible_end as isize + index_change) as usize)
                    .max(1)
                    .min(items_len - 1);
                if new_end == items_len - 1 {
                    // 重置拖动状态，确保光标样式被正确更新
                    self.is_dragging = false;
                    self.drag_handle_type = DragHandleType::None;
                    return DragResult::Released;
                } else if new_end <= visible_start {
                    // 如果右侧手柄超过了左侧手柄，交换手柄类型
                    self.drag_handle_type = DragHandleType::Left;
                    (visible_start, visible_start)
                } else {
                    (visible_start, new_end)
                }
            }
            DragHandleType::Middle => {
                let new_start = (visible_start as isize + index_change)
                    .max(0)
                    .min((items_len - visible_count) as isize)
                    as usize;
                (new_start, new_start + visible_count)
            }
            DragHandleType::None => {
                return DragResult::None;
            }
        };

        // 检查是否有显著变化
        let start_diff = (visible_start as isize - new_start as isize).abs();
        let end_diff = (visible_end as isize - new_end as isize).abs();

        let has_significant_change = start_diff > 0 || end_diff > 0;

        // 如果有显著变化，无效化缓存并更新可见范围
        if has_significant_change {
            // 无效化缓存
            data_manager_ref.invalidate_cache();

            // 更新可见范围
            data_manager_ref.update_visible_range(new_start, new_end - new_start);

            // 如果拖动距离较大，更新起始拖动位置以提供更好的用户体验
            if start_diff > 10 || end_diff > 10 {
                self.drag_start_x = x;
            }

            // 重新计算数据范围
            data_manager_ref.calculate_data_ranges();

            return DragResult::NeedRedraw;
        }

        DragResult::None
    }

    /// 绘制DataZoom导航器
    pub fn draw(&self, canvas_manager: &CanvasManager, data_manager: &Rc<RefCell<DataManager>>) {
        // 获取 上下文和布局
        let ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = canvas_manager.layout.borrow();

        // 计算导航器位置
        let nav_x = layout.chart_area_x;
        let nav_y = layout.canvas_height - layout.navigator_height;
        let nav_width = layout.main_chart_width; // 只用主图宽度
        let nav_height = layout.navigator_height;

        // 绘制前清除整个DataZoom区域及周围
        let padding = 10.0; // 额外清除周围区域以防阴影溢出
        ctx.clear_rect(
            nav_x - padding,
            nav_y - padding,
            nav_width + padding * 2.0,
            nav_height + padding * 2.0,
        );

        // 绘制导航器背景
        ctx.set_fill_style_str(ChartColors::NAVIGATOR_BG);
        ctx.fill_rect(nav_x, nav_y, nav_width, nav_height);

        let items_opt = data_manager.borrow().get_items();
        let items = match items_opt {
            Some(items) => items,
            None => return,
        };

        // 如果数据为空，直接返回
        if items.is_empty() {
            return;
        }

        // 绘制成交量曲线作为背景
        self.draw_volume_area(ctx, &layout, items, nav_x, nav_y, nav_height);

        // 绘制当前可见区域指示器
        self.draw_visible_range_indicator(
            ctx,
            &layout,
            items,
            nav_x,
            nav_y,
            nav_width,
            nav_height,
            data_manager,
        );
    }

    /// 在导航器上绘制成交量区域图
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
        if items_len == 0 {
            return;
        }

        // 使用ChartLayout中的方法计算导航器中每个K线的宽度（基于main_chart_width）
        let nav_candle_width = layout.main_chart_width / items_len as f64;

        // 找出最大成交量，用于缩放
        let mut max_volume: f64 = 0.0;
        // 使用步进采样来减少计算量，对于大数据集特别有效
        let step = (items_len / 100).max(1); // 至少每100个点采样一次

        // 对于大数据集，使用稀疏采样提高性能
        for i in (0..items_len).step_by(step) {
            let item = items.get(i);
            let volume = item.b_vol() + item.s_vol();
            max_volume = max_volume.max(volume);
        }

        // 如果采样没有找到有效值，使用默认值
        if max_volume <= 0.0 {
            max_volume = 1.0;
        }

        // 绘制成交量曲线
        ctx.begin_path();
        ctx.set_stroke_style_str(ChartColors::VOLUME_LINE);
        ctx.set_line_width(1.0);
        ctx.set_fill_style_str(ChartColors::VOLUME_AREA);

        // 对于大数据集，使用自适应采样提高性能
        // 最大采样200个点，确保不会有性能问题
        let draw_step = if items_len > 200 {
            (items_len as f64 / 200.0).ceil() as usize
        } else {
            1
        };

        // 移动到第一个点
        let first_item = items.get(0);
        let first_volume = first_item.b_vol() + first_item.s_vol();
        let first_y = nav_y + nav_height - (first_volume / max_volume) * nav_height * 0.8;
        ctx.move_to(nav_x, first_y);

        // 减少绘制的点数量
        for i in (0..items_len).step_by(draw_step) {
            let item = items.get(i);
            let volume = item.b_vol() + item.s_vol();
            let x = nav_x + i as f64 * nav_candle_width;
            let y = nav_y + nav_height - (volume / max_volume) * nav_height * 0.8;
            ctx.line_to(x, y);
        }

        // 确保绘制最后一个点
        if items_len > 1 && draw_step > 1 {
            let last_idx = items_len - 1;
            let last_item = items.get(last_idx);
            let last_volume = last_item.b_vol() + last_item.s_vol();
            let last_x = nav_x + last_idx as f64 * nav_candle_width;
            let last_y = nav_y + nav_height - (last_volume / max_volume) * nav_height * 0.8;
            ctx.line_to(last_x, last_y);
        }

        // 完成路径，回到底部形成闭合区域
        let last_x = nav_x + (items_len - 1) as f64 * nav_candle_width;
        ctx.line_to(last_x, nav_y + nav_height);
        ctx.line_to(nav_x, nav_y + nav_height);
        ctx.close_path();

        // 填充区域
        ctx.fill();
        // 描边曲线 - 省略描边可进一步提高性能
        // ctx.stroke();
    }

    /// 绘制可见范围指示器
    fn draw_visible_range_indicator(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        nav_x: f64,
        nav_y: f64,
        nav_width: f64,
        nav_height: f64,
        data_manager: &Rc<RefCell<DataManager>>,
    ) {
        let items_len = items.len();
        if items_len == 0 {
            return;
        }

        // 获取可见范围对象
        let data_manager_ref = data_manager.borrow();
        let visible_range = data_manager_ref.get_visible_range();

        // 获取当前可见范围
        let (visible_start, visible_count, _) = data_manager_ref.get_visible();

        // 检查是否显示全部数据（缩放到最大）
        let is_showing_all = visible_start == 0 && visible_count >= items_len;

        // 如果是显示全部数据，就不需要绘制任何可见区域指示器
        if is_showing_all {
            return;
        }

        // 使用VisibleRange的get_screen_coordinates方法获取可见区域的坐标
        let (visible_start_x, visible_end_x) = visible_range.get_screen_coordinates(layout);

        // 确保手柄位置在datazoom区域内
        let clamped_start_x = visible_start_x.max(nav_x).min(nav_x + nav_width);
        let clamped_end_x = visible_end_x.max(nav_x).min(nav_x + nav_width);

        // 保存当前渲染状态
        ctx.save();

        // 设置裁剪区域为导航器区域，防止任何绘制超出此区域
        ctx.begin_path();
        ctx.rect(nav_x, nav_y, nav_width, nav_height);
        ctx.clip();

        // 绘制半透明遮罩 (左侧不可见区域)
        ctx.set_fill_style_str(ChartColors::NAVIGATOR_MASK);
        ctx.fill_rect(nav_x, nav_y, clamped_start_x - nav_x, nav_height);

        // 绘制半透明遮罩 (右侧不可见区域)
        ctx.fill_rect(
            clamped_end_x,
            nav_y,
            nav_x + nav_width - clamped_end_x,
            nav_height,
        );

        // 绘制可见区域边框
        let border_left = clamped_start_x;
        let border_width = clamped_end_x - clamped_start_x;

        if border_width > 0.0 {
            ctx.set_stroke_style_str(ChartColors::NAVIGATOR_BORDER);
            ctx.set_line_width(1.0);
            ctx.stroke_rect(border_left, nav_y, border_width, nav_height);
        }

        // 设置手柄样式
        let handle_color = if self.is_dragging {
            // 拖动时使用高亮颜色
            ChartColors::NAVIGATOR_ACTIVE_HANDLE
        } else {
            ChartColors::NAVIGATOR_HANDLE
        };

        let handle_width = if self.is_dragging {
            // 拖动时增加手柄宽度，提供更明显的视觉反馈
            layout.navigator_handle_width * 1.5
        } else {
            layout.navigator_handle_width
        };

        // 设置拖动时的阴影效果
        let shadow_blur = if self.is_dragging {
            // 根据手柄位置调整阴影模糊半径
            // 当手柄靠近边缘时，降低阴影模糊半径
            let left_edge_distance = clamped_start_x - nav_x;
            let right_edge_distance = nav_x + nav_width - clamped_end_x;
            let min_distance = left_edge_distance.min(right_edge_distance);

            // 如果接近边缘，逐渐减小阴影
            if min_distance < 10.0 {
                4.0 * (min_distance / 10.0)
            } else {
                4.0
            }
        } else {
            0.0
        };

        let shadow_color = if self.is_dragging {
            ChartColors::NAVIGATOR_ACTIVE_HANDLE_SHADOW
        } else {
            ChartColors::TRANSPARENT
        };

        // 绘制左侧手柄
        if clamped_start_x >= nav_x && clamped_start_x <= nav_x + nav_width {
            ctx.set_fill_style_str(handle_color);
            ctx.set_shadow_blur(shadow_blur);
            ctx.set_shadow_color(shadow_color);
            ctx.begin_path();
            // 绘制矩形作为左侧手柄
            ctx.fill_rect(
                clamped_start_x - handle_width / 2.0,
                nav_y + nav_height / 4.0,
                handle_width,
                nav_height / 2.0,
            );
        }

        // 绘制右侧手柄
        if clamped_end_x >= nav_x && clamped_end_x <= nav_x + nav_width {
            ctx.set_fill_style_str(handle_color);
            ctx.set_shadow_blur(shadow_blur);
            ctx.set_shadow_color(shadow_color);
            ctx.begin_path();
            // 绘制矩形作为右侧手柄
            ctx.fill_rect(
                clamped_end_x - handle_width / 2.0,
                nav_y + nav_height / 4.0,
                handle_width,
                nav_height / 2.0,
            );
        }

        // 恢复渲染状态，取消裁剪区域
        ctx.restore();
    }
}
