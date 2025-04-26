//! DataZoom导航器模块 - 负责绘制和处理数据缩放导航器

use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::data::DataManager;
use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartColors, ChartLayout};
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
    /// 拖动开始时的可见区域起始索引
    drag_start_visible_start: usize,
    /// 拖动开始时的可见区域数量
    drag_start_visible_count: usize,
}

impl DataZoomRenderer {
    /// 创建新的DataZoom导航器渲染器
    pub fn new() -> Self {
        Self {
            is_dragging: false,
            drag_start_x: 0.0,
            drag_handle_type: DragHandleType::None,
            drag_start_visible_start: 0,
            drag_start_visible_count: 0,
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

        // 记录拖动开始时的可见区域
        let data_manager_ref = data_manager.borrow();
        let (visible_start, visible_count, _) = data_manager_ref.get_visible();
        self.drag_start_visible_start = visible_start;
        self.drag_start_visible_count = visible_count;

        true
    }

    /// 获取鼠标在当前位置应该显示的样式
    pub fn get_cursor_style(
        &self,
        x: f64,
        y: f64,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
    ) -> &'static str {
        // 如果正在拖动，根据拖动手柄类型返回对应的鼠标样式
        if self.is_dragging {
            return match self.drag_handle_type {
                DragHandleType::Left | DragHandleType::Right => "ew-resize", // 东西方向调整大小
                DragHandleType::Middle => "grab",                            // 抓取样式
                DragHandleType::None => "default",
            };
        }

        // 如果没有在拖动，检查鼠标位置对应的手柄类型
        let handle_type = self.get_handle_at_position(x, y, canvas_manager, data_manager);
        match handle_type {
            DragHandleType::Left | DragHandleType::Right => "ew-resize", // 东西方向调整大小
            DragHandleType::Middle => "grab",                            // 抓取样式
            DragHandleType::None => "default",
        }
    }

    /// 处理鼠标释放事件
    /// 当用户释放鼠标按钮时调用此函数，结束拖动操作
    /// 返回一个布尔值，表示之前是否处于拖动状态
    pub fn handle_mouse_up(&mut self) -> bool {
        let was_dragging = self.is_dragging;
        if was_dragging {
            // 记录拖动结束状态，用于可能的动画或过渡效果
            // 这里我们简单地重置状态，但可以添加更复杂的逻辑
            // 例如记录最后的拖动速度，实现惯性滚动等
        }
        // 重置拖动状态
        self.is_dragging = false;
        self.drag_handle_type = DragHandleType::None;
        // 返回之前是否在拖动，调用者可以据此决定是否需要重绘
        was_dragging
    }

    /// 处理鼠标拖动事件
    /// 当用户拖动鼠标时调用此函数，更新导航器的位置
    /// 与handle_mouse_move类似，但专门用于拖动状态
    pub fn handle_mouse_drag(
        &mut self,
        x: f64,
        _y: f64,
        canvas_manager: &CanvasManager,
        data_manager: &Rc<RefCell<DataManager>>,
    ) -> bool {
        // 如果没有在拖动，不处理
        if !self.is_dragging {
            return false;
        }
        // 计算拖动距离
        let drag_distance = x - self.drag_start_x;
        // 获取布局和数据
        let layout = canvas_manager.layout.borrow();
        let mut data_manager_ref = data_manager.borrow_mut();

        // 获取数据总量
        let items_len = match data_manager_ref.get_items() {
            Some(items) => items.len(),
            None => return false,
        };

        if items_len == 0 {
            return false;
        }

        // 计算拖动距离对应的索引变化
        let index_change = if layout.chart_area_width > 0.0 {
            (drag_distance / layout.chart_area_width * items_len as f64).round() as isize
        } else {
            0
        };

        // 计算新的可见区域参数
        let (new_start, new_count) = match self.drag_handle_type {
            DragHandleType::Left => {
                // 拖动左侧手柄，改变可见区域起始位置和数量
                let new_start = (self.drag_start_visible_start as isize + index_change)
                    .max(0)
                    .min((items_len - 1) as isize) as usize;

                let new_count = self
                    .drag_start_visible_count
                    .saturating_add(self.drag_start_visible_start.saturating_sub(new_start));

                (new_start, new_count)
            }
            DragHandleType::Right => {
                // 拖动右侧手柄，只改变可见区域数量
                let new_count = ((self.drag_start_visible_count as isize + index_change) as usize)
                    .max(1) // 至少显示1根K线
                    .min(items_len - self.drag_start_visible_start); // 不能超出数据范围

                (self.drag_start_visible_start, new_count)
            }
            DragHandleType::Middle => {
                // 拖动中间区域，平移整个可见区域
                let new_start = (self.drag_start_visible_start as isize + index_change)
                    .max(0)
                    .min((items_len - self.drag_start_visible_count) as isize)
                    as usize;

                (new_start, self.drag_start_visible_count)
            }
            DragHandleType::None => {
                return false;
            }
        };

        // 更新可见区域
        data_manager_ref.update_visible_range(new_start, new_count);
        // 重新计算数据范围
        data_manager_ref.calculate_data_ranges();

        // 更新拖动起始位置为当前位置，以便下次拖动计算
        self.drag_start_x = x;

        // 记录拖动开始时的可见区域（更新为当前值）
        self.drag_start_visible_start = new_start;
        self.drag_start_visible_count = new_count;

        // 返回true表示需要重绘
        true
    }

    /// 绘制DataZoom导航器
    pub fn draw(&self, canvas_manager: &CanvasManager, data_manager: &Rc<RefCell<DataManager>>) {
        // 获取 BASE 上下文和布局
        let ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = canvas_manager.layout.borrow();

        // 计算导航器位置
        let nav_x = layout.chart_area_x;
        let nav_y = layout.canvas_height - layout.navigator_height;
        let nav_width = layout.chart_area_width;
        let nav_height = layout.navigator_height;

        // 绘制导航器背景
        ctx.set_fill_style_str(ChartColors::NAVIGATOR_BG);
        ctx.fill_rect(nav_x, nav_y, nav_width, nav_height);

        let items_opt = data_manager.borrow().get_items();
        let items = match items_opt {
            Some(items) => items,
            None => return,
        };

        // 如果数据为空，直接返回
        if items.len() == 0 {
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

        // 使用ChartLayout中的方法计算导航器中每个K线的宽度
        let nav_candle_width = layout.calculate_navigator_candle_width(items_len);

        // 找出最大成交量，用于缩放
        let mut max_volume: f64 = 0.0;

        // 使用步进采样来减少计算量，对于大数据集特别有效
        let step = (items_len / 100).max(1); // 至少每100个点采样一次

        for i in (0..items_len).step_by(step) {
            let item = items.get(i);
            let volume = item.b_vol() + item.s_vol();
            max_volume = max_volume.max(volume);
        }

        // 检查最大值是否有效
        if max_volume <= 0.0 {
            // 如果采样没有找到有效值，进行完整扫描
            for i in 0..items_len {
                let item = items.get(i);
                let volume = item.b_vol() + item.s_vol();
                max_volume = max_volume.max(volume);
            }

            // 如果仍然没有有效值，返回
            if max_volume <= 0.0 {
                return;
            }
        }

        // 绘制成交量曲线
        ctx.begin_path();
        ctx.set_stroke_style_str(ChartColors::VOLUME_LINE);
        ctx.set_line_width(1.0);
        ctx.set_fill_style_str(ChartColors::VOLUME_AREA);

        // 移动到第一个点
        let first_item = items.get(0);
        let first_volume = first_item.b_vol() + first_item.s_vol();
        let first_y = nav_y + nav_height - (first_volume / max_volume) * nav_height * 0.8;
        ctx.move_to(nav_x, first_y);

        // 对于大数据集，使用采样绘制曲线以提高性能
        let draw_step = if items_len > 1000 {
            items_len / 500 // 对于大数据集，最多绘制500个点
        } else {
            1
        };

        for i in (0..items_len).step_by(draw_step) {
            let item = items.get(i);
            let volume = item.b_vol() + item.s_vol();
            let x = nav_x + i as f64 * nav_candle_width;
            let y = nav_y + nav_height - (volume / max_volume) * nav_height * 0.8;
            ctx.line_to(x, y);
        }

        // 确保最后一个点被绘制
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
        // 描边曲线
        ctx.stroke();
    }

    /// 绘制可见区域指示器
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
        // 根据拖动状态设置不同的样式
        let handle_color = if self.is_dragging {
            // 拖动时使用高亮颜色
            "#4a90e2"
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
        let shadow_blur = if self.is_dragging { 4.0 } else { 0.0 };
        let shadow_color = if self.is_dragging {
            "rgba(74, 144, 226, 0.6)"
        } else {
            "transparent"
        };

        let items_len = items.len();
        if items_len == 0 {
            return;
        }

        // 从DataManager获取可见区域的起始索引和数量
        let data_manager_ref = data_manager.borrow();
        // 获取可见范围
        let (visible_start, visible_count, _) = data_manager_ref.get_visible();

        // 使用ChartLayout中的方法计算可见区域坐标
        let (visible_start_x, visible_end_x) =
            layout.calculate_visible_range_coordinates(items_len, visible_start, visible_count);

        // 绘制半透明遮罩 (左侧不可见区域)
        ctx.set_fill_style_str(ChartColors::NAVIGATOR_MASK);
        ctx.fill_rect(nav_x, nav_y, visible_start_x - nav_x, nav_height);

        // 绘制半透明遮罩 (右侧不可见区域)
        ctx.fill_rect(
            visible_end_x,
            nav_y,
            nav_x + nav_width - visible_end_x,
            nav_height,
        );

        // 绘制可见区域背景，添加轻微的高亮效果
        if self.is_dragging {
            ctx.set_fill_style_str("rgba(255, 255, 255, 0.05)");
            ctx.fill_rect(
                visible_start_x,
                nav_y,
                visible_end_x - visible_start_x,
                nav_height,
            );
        }

        // 设置阴影效果
        ctx.set_shadow_blur(shadow_blur);
        ctx.set_shadow_color(shadow_color);

        // 绘制可见区域边框
        ctx.set_stroke_style_str(handle_color);
        ctx.set_line_width(handle_width);
        ctx.begin_path();

        // 左侧边框
        ctx.move_to(visible_start_x, nav_y);
        ctx.line_to(visible_start_x, nav_y + nav_height);
        // 右侧边框
        ctx.move_to(visible_end_x, nav_y);
        ctx.line_to(visible_end_x, nav_y + nav_height);
        ctx.stroke();

        // 绘制可拖动手柄
        ctx.set_fill_style_str(handle_color);

        // 左侧手柄
        ctx.fill_rect(
            visible_start_x - handle_width / 2.0,
            nav_y,
            handle_width,
            nav_height,
        );

        // 右侧手柄
        ctx.fill_rect(
            visible_end_x - handle_width / 2.0,
            nav_y,
            handle_width,
            nav_height,
        );

        // 重置阴影效果
        ctx.set_shadow_blur(0.0);
        ctx.set_shadow_color("transparent");

        // 如果正在拖动，绘制一个细线连接左右手柄，增强视觉效果
        if self.is_dragging {
            ctx.begin_path();
            ctx.set_stroke_style_str("rgba(74, 144, 226, 0.4)");
            ctx.set_line_width(1.0);

            // 在顶部和底部绘制连接线
            ctx.move_to(visible_start_x, nav_y);
            ctx.line_to(visible_end_x, nav_y);
            ctx.move_to(visible_start_x, nav_y + nav_height);
            ctx.line_to(visible_end_x, nav_y + nav_height);
            ctx.stroke();
        }
    }
}
