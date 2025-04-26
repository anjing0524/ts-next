//! 图表渲染器 - 整合所有模块，提供统一的渲染接口

use super::axis_renderer::AxisRenderer;
use super::datazoom_renderer::DataZoomRenderer;
use super::overlay_renderer::OverlayRenderer;
use super::price_renderer::PriceRenderer;
use super::volume_renderer::VolumeRenderer;
use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::data::DataManager;
use crate::kline_generated::kline::KlineData;
use crate::layout::ChartLayout;
use crate::utils::WasmError;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvas;

/// 图表渲染器 - 整合所有模块，提供统一的渲染接口
pub struct ChartRenderer {
    /// Canvas管理器
    canvas_manager: CanvasManager,
    /// 坐标轴渲染器
    axis_renderer: AxisRenderer,
    /// 价格图(K线图)渲染器
    price_renderer: PriceRenderer,
    /// 成交量图渲染器
    volume_renderer: VolumeRenderer,
    /// 交互元素渲染器
    overlay_renderer: Rc<RefCell<OverlayRenderer>>,
    /// 数据管理器
    data_manager: Rc<RefCell<DataManager>>,
    /// DataZoom渲染器
    datazoom_renderer: Rc<RefCell<DataZoomRenderer>>,
}

impl ChartRenderer {
    /// 创建图表渲染器
    pub fn new(
        base_canvas: &OffscreenCanvas,
        main_canvas: &OffscreenCanvas,
        overlay_canvas: &OffscreenCanvas,
        layout: ChartLayout,
        parsed_data: Option<KlineData<'static>>,
    ) -> Result<Self, WasmError> {
        // 创建Canvas管理器
        let canvas_manager = CanvasManager::new(base_canvas, main_canvas, overlay_canvas, layout)?;
        let data_manager = Rc::new(RefCell::new(DataManager::new()));
        match parsed_data {
            Some(data) => {
                let items = data.items().expect("Data must contain items");
                let mut data_manager_ref = data_manager.borrow_mut();
                data_manager_ref.set_items(items);
                let layout = &canvas_manager.layout.borrow();
                data_manager_ref.initialize_visible_range(layout);
                data_manager_ref.calculate_data_ranges();
            }
            None => {
                return Err(WasmError::DataError("No data provided".to_string()));
            }
        }
        // 创建各个渲染模块
        let axis_renderer = AxisRenderer {};
        let price_renderer = PriceRenderer {};
        let volume_renderer = VolumeRenderer {};
        let overlay_renderer = Rc::new(RefCell::new(OverlayRenderer::new()));
        let datazoom_renderer = Rc::new(RefCell::new(DataZoomRenderer::new()));

        Ok(Self {
            canvas_manager,
            axis_renderer,
            price_renderer,
            volume_renderer,
            overlay_renderer,
            data_manager,
            datazoom_renderer,
        })
    }

    /// 渲染图表 (不包括交互层)
    pub fn render(&self) {
        // 获取可见范围
        let (_, visible_count, _) = self.data_manager.borrow().get_visible();
        // 更新布局以适应当前可见K线数量
        {
            let mut layout = self.canvas_manager.layout.borrow_mut();
            layout.update_for_visible_count(visible_count);
        }

        let layout = &self.canvas_manager.layout.borrow();
        // 渲染K线图
        self.price_renderer.draw(
            &self.canvas_manager.get_context(CanvasLayerType::Main),
            layout,
            &self.data_manager,
        );

        // 渲染成交量图
        self.volume_renderer.draw(
            &self.canvas_manager.get_context(CanvasLayerType::Main),
            layout,
            &self.data_manager,
        );

        // 渲染坐标轴
        self.axis_renderer
            .draw(&self.canvas_manager, &self.data_manager);

        self.datazoom_renderer
            .borrow()
            .draw(&self.canvas_manager, &self.data_manager);
    }

    /// 获取当前鼠标位置的光标样式
    pub fn get_cursor_style(&self, x: f64, y: f64) -> &'static str {
        // 先检查是否在DataZoom上，并获取对应的光标样式
        let datazoom_cursor = self.datazoom_renderer.borrow().get_cursor_style(
            x,
            y,
            &self.canvas_manager,
            &self.data_manager,
        );

        // 如果DataZoom返回了非默认样式，则使用该样式
        if datazoom_cursor != "default" {
            return datazoom_cursor;
        }
        // 默认光标样式
        "default"
    }

    // 处理鼠标移动事件
    pub fn handle_mouse_move(&self, x: f64, y: f64) {
        // 直接交给OverlayRenderer处理鼠标移动
        let mut overlay_renderer = self.overlay_renderer.borrow_mut();
        overlay_renderer.handle_mouse_move(x, y, &self.canvas_manager, &self.data_manager);
    }

    // 处理鼠标按下事件
    pub fn handle_mouse_down(&self, x: f64, y: f64) -> bool {
        let is_on_datazoom = {
            // 检查是否在DataZoom上
            let mut datazoom_renderer = self.datazoom_renderer.borrow_mut();
            datazoom_renderer.handle_mouse_down(x, y, &self.canvas_manager, &self.data_manager)
        };
        // 如果在DataZoom上按下，返回true表示已处理
        if is_on_datazoom {
            return true;
        }
        // 未来可以添加其他区域的鼠标按下处理
        false
    }

    // 处理鼠标释放事件
    pub fn handle_mouse_up(&self, x: f64, y: f64) -> bool {
        let was_dragging = {
            // 检查DataZoom是否处于拖动状态
            let mut datazoom_renderer = self.datazoom_renderer.borrow_mut();
            datazoom_renderer.handle_mouse_up()
        };

        // 如果之前在拖动，重绘图表并返回true表示已处理
        if was_dragging {
            self.render();
            return true;
        }

        // 未来可以添加其他区域的鼠标释放处理
        false
    }

    // 处理鼠标拖动事件
    pub fn handle_mouse_drag(&self, x: f64, y: f64) -> bool {
        // 检查DataZoom是否处于拖动状态
        let need_redraw = {
            let mut datazoom_renderer = self.datazoom_renderer.borrow_mut();
            datazoom_renderer.handle_mouse_drag(x, y, &self.canvas_manager, &self.data_manager)
        };

        // 如果需要重绘，重新绘制所有图表
        if need_redraw {
            self.render();
        }

        need_redraw
    }

    // 处理鼠标离开事件 - 清除所有交互元素并重置拖动状态
    pub fn handle_mouse_leave(&self) -> bool {
        // 处理交互层的鼠标离开
        let mut overlay_renderer = self.overlay_renderer.borrow_mut();
        overlay_renderer.handle_mouse_leave(&self.canvas_manager);

        // 检查DataZoom是否处于拖动状态，如果是则重置并返回需要重绘
        let was_dragging = {
            let mut datazoom_renderer = self.datazoom_renderer.borrow_mut();
            datazoom_renderer.handle_mouse_up()
        };

        // 如果之前在拖动，重绘图表并返回true表示已处理
        if was_dragging {
            self.render();
            return true;
        }

        false
    }

    // 处理鼠标滚轮事件
    pub fn handle_wheel(&self, delta: f64, x: f64, y: f64) {
        // 使用作用域限制引用生命周期
        let need_redraw = {
            // 获取布局信息
            let layout_ref = self.canvas_manager.layout.borrow();
            let mut data_manager_ref = self.data_manager.borrow_mut();
            // 检查是否在图表区域内
            let is_in_chart = layout_ref.is_point_in_chart_area(x, y);
            // 调用数据管理器处理滚轮事件
            data_manager_ref.handle_wheel(
                x,
                y,
                delta,
                layout_ref.chart_area_x,
                layout_ref.chart_area_width,
                is_in_chart,
            )
        };

        // 如果需要重绘，则重绘图表
        if need_redraw {
            self.render();
        }
    }
}
