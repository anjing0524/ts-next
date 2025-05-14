//! 图表渲染器 - 整合所有模块，提供统一的渲染接口

use super::axis_renderer::AxisRenderer;
use super::cursor_style::CursorStyle;
use super::datazoom_renderer::DataZoomRenderer;
use super::heat_renderer::HeatRenderer;
use super::line_renderer::LineRenderer;
use super::overlay_renderer::OverlayRenderer;
use super::price_renderer::PriceRenderer;
use super::volume_renderer::VolumeRenderer;
use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::data::DataManager;
use crate::kline_generated::kline::KlineData;
use crate::layout::ChartLayout;
use crate::utils::WasmError;
use std::cell::{Cell, RefCell};
use std::rc::Rc;
use web_sys::{OffscreenCanvas};
use super::datazoom_renderer::DragResult;
use wasm_bindgen::prelude::*;

// 添加私有日志函数
#[wasm_bindgen]
unsafe extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(message: &str);
}

// 添加安全的日志包装函数
fn log_message(message: &str) {
    unsafe {
        log(message);
    }
}

// 定义每次重绘的间隔计数
thread_local! {
    static DRAG_THROTTLE_COUNTER: Cell<u8> = Cell::new(0);
}

// 定义渲染图形引擎
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum RenderMode {
    KMAP,    // K线图和成交量图
    HEATMAP, // 热图和成交量图
}

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
    /// 热图渲染器
    heat_renderer: HeatRenderer,
    /// 线图渲染器
    line_renderer: LineRenderer,
    /// 交互元素渲染器
    overlay_renderer: Rc<RefCell<OverlayRenderer>>,
    /// 数据管理器
    data_manager: Rc<RefCell<DataManager>>,
    /// DataZoom渲染器
    datazoom_renderer: Rc<RefCell<DataZoomRenderer>>,

    // 采用哪种渲染引擎
    mode: RenderMode,
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
                let tick = data.tick();
                let mut data_manager_ref = data_manager.borrow_mut();
                data_manager_ref.set_items(items,tick);
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
        let heat_renderer = HeatRenderer::default();
        let line_renderer = LineRenderer::new();
        let overlay_renderer = Rc::new(RefCell::new(OverlayRenderer::new()));
        let datazoom_renderer = Rc::new(RefCell::new(DataZoomRenderer::new()));

        Ok(Self {
            canvas_manager,
            axis_renderer,
            price_renderer,
            volume_renderer,
            heat_renderer,
            line_renderer,
            overlay_renderer,
            data_manager,
            datazoom_renderer,
            mode: RenderMode::KMAP,
        })
    }

    /// 获取当前渲染模式
    pub fn get_mode(&self) -> RenderMode {
        self.mode
    }

    /// 设置渲染模式
    pub fn set_mode(&mut self, mode: RenderMode) {
        self.mode = mode;
    }

    /// 渲染图表 (不包括交互层)
    pub fn render(&self) {
        // 1. 获取可见范围 - 使用作用域限制借用生命周期
        let visible_count = {
            let data_manager_ref = self.data_manager.borrow();
            let (_, visible_count, _) = data_manager_ref.get_visible();
            visible_count
        };

        // 2. 更新布局以适应当前可见K线数量和渲染模式
        {
            let mut layout = self.canvas_manager.layout.borrow_mut();
            // 先更新基本布局
            layout.update_for_visible_count(visible_count);
            
            // 根据当前模式应用相应的布局
            match self.mode {
                RenderMode::KMAP => layout.apply_kline_layout(),
                RenderMode::HEATMAP => layout.apply_heatmap_layout(),
            }
        } // 在这里释放 layout 的可变借用

        // 3. 在渲染前先计算数据范围，确保所有渲染器使用相同的比例
        {
            let mut data_manager_ref = self.data_manager.borrow_mut();
            data_manager_ref.calculate_data_ranges();
        } // 在这里释放 data_manager 的可变借用

        // 4. 获取布局信息用于后续渲染
        let layout = self.canvas_manager.layout.borrow();
        
        // 5. 获取上下文
        let base_ctx = self.canvas_manager.get_context(CanvasLayerType::Base);
        let main_ctx = self.canvas_manager.get_context(CanvasLayerType::Main);
        let overlay_ctx = self.canvas_manager.get_context(CanvasLayerType::Overlay);

        // 6. 清除所有画布内容
        base_ctx.clear_rect(0.0, 0.0, layout.canvas_width, layout.canvas_height);
        main_ctx.clear_rect(0.0, 0.0, layout.canvas_width, layout.canvas_height);
        // 只清除非导航器区域，以避免清除DataZoom
        overlay_ctx.clear_rect(0.0, 0.0, layout.canvas_width, layout.navigator_y);

        // 7. 首先通过AxisRenderer渲染背景和坐标轴
        // 这会先绘制Header, Y轴背景等
        self.axis_renderer
            .draw(&self.canvas_manager, &self.data_manager, self.mode);

        // 8. 根据模式渲染不同的图表
        match self.mode {
            RenderMode::KMAP => {
                // 渲染K线图
                self.price_renderer.draw(
                    &self.canvas_manager.get_context(CanvasLayerType::Main),
                    &layout,
                    &self.data_manager,
                );
                
                // 渲染价格线
                self.line_renderer.draw(
                    &self.canvas_manager.get_context(CanvasLayerType::Main),
                    &layout,
                    &self.data_manager,
                );
                
                // 渲染成交量图 
                self.volume_renderer.draw(
                    &self.canvas_manager.get_context(CanvasLayerType::Main),
                    &layout,
                    &self.data_manager,
                );
            }
            RenderMode::HEATMAP => {
                // 热图模式下，热图占据整个区域
                self.heat_renderer.draw(
                    &self.canvas_manager.get_context(CanvasLayerType::Main),
                    &layout,
                    &self.data_manager,
                ); 
                // 渲染价格线
                self.line_renderer.draw(
                    &self.canvas_manager.get_context(CanvasLayerType::Main),
                    &layout,
                    &self.data_manager,
                );
                // 渲染成交量图 
                self.volume_renderer.draw(
                    &self.canvas_manager.get_context(CanvasLayerType::Main),
                    &layout,
                    &self.data_manager,
                );
            }
        }

        // 9. 渲染DataZoom - 确保它在任何情况下都被渲染
        {
            let datazoom_renderer = self.datazoom_renderer.borrow();
            datazoom_renderer.draw(&self.canvas_manager, &self.data_manager);
        } // 在这里释放 datazoom_renderer 的借用
        
        // 10. 最后渲染交互层的静态元素（如模式切换按钮）
        {
            let overlay_renderer = self.overlay_renderer.borrow();
            overlay_renderer.draw(&self.canvas_manager, &self.data_manager, self.mode);
        } // 在这里释放 overlay_renderer 的借用
    }

    /// 获取当前鼠标位置的光标样式
    pub fn get_cursor_style(&self, x: f64, y: f64) -> CursorStyle {
        // 先检查是否在DataZoom上，并获取对应的光标样式
        let datazoom_cursor = self.datazoom_renderer.borrow().get_cursor_style(
            x,
            y,
            &self.canvas_manager,
            &self.data_manager,
        );

        // 如果DataZoom返回了非默认样式，则使用该样式
        if datazoom_cursor != CursorStyle::Default {
            return datazoom_cursor;
        }
        
        // 如果DataZoom没有返回特定样式，则检查交互层
        let layout = self.canvas_manager.layout.borrow();
        let overlay_cursor = self.overlay_renderer.borrow().get_cursor_style(x, y, &layout);
        
        // 返回交互层的光标样式
        overlay_cursor
    }

    /// 处理鼠标移动事件
    pub fn handle_mouse_move(&self, x: f64, y: f64) {
        // 直接交给OverlayRenderer处理鼠标移动，传递当前模式
        let mut overlay_renderer = self.overlay_renderer.borrow_mut();
        overlay_renderer.handle_mouse_move(x, y, &self.canvas_manager, &self.data_manager, self.mode);
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

    /// 处理鼠标抬起事件
    pub fn handle_mouse_up(&self, _x: f64, _y: f64) -> bool {
        let was_dragging = {
            // 检查DataZoom是否处于拖动状态
            let mut datazoom_renderer = self.datazoom_renderer.borrow_mut();
            datazoom_renderer.handle_mouse_up(&self.data_manager)
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
        // 1. 处理DataZoom拖动
        let drag_result = {
            let mut datazoom_renderer = self.datazoom_renderer.borrow_mut();
            datazoom_renderer.handle_mouse_drag(x, y, &self.canvas_manager, &self.data_manager)
        };

        // 2. 处理交互层的拖动
        {
            let mut overlay_renderer = self.overlay_renderer.borrow_mut();
            overlay_renderer.handle_mouse_drag(x, y, &self.canvas_manager, &self.data_manager, self.mode);
        } // 在这里释放 overlay_renderer 的可变借用

        match drag_result {
            DragResult::Released => {
                // 由于DataZoomRenderer已经重置了拖动状态，我们只需要重新渲染
                // 确保所有借用都已释放后再调用render
                self.render();
                true
            },
            DragResult::NeedRedraw => {
                let should_render = DRAG_THROTTLE_COUNTER.with(|counter| {
                    let current = counter.get();
                    let next = (current + 1) % 3;
                    counter.set(next);
                    next == 0
                });
                
                if should_render {
                    // 确保所有借用都已释放后再调用render
                    self.render();
                }
                true
            },
            DragResult::None => {
                false
            },
        }
    }

    // 处理鼠标离开事件 - 清除所有交互元素并重置拖动状态
    pub fn handle_mouse_leave(&self) -> bool {
        // 1. 首先处理DataZoom的拖动状态，获取是否需要重绘
        let was_dragging = {
            let mut datazoom_renderer = self.datazoom_renderer.borrow_mut();
            // 使用强制重置方法确保拖动状态被正确重置
            datazoom_renderer.force_reset_drag_state()
        };

        // 2. 处理交互层的鼠标离开，传递当前模式
        {
            let mut overlay_renderer = self.overlay_renderer.borrow_mut();
            overlay_renderer.handle_mouse_leave(&self.canvas_manager, self.mode);
        } // 在这里释放 overlay_renderer 的可变借用
        
        // 3. 如果之前在拖动，重绘图表并返回true表示已处理
        if was_dragging {
            // 确保所有借用都已释放后再调用render
            self.render();
            return true;
        }
        
        false
    }

    // 处理鼠标滚轮事件
    pub fn handle_wheel(&self, delta: f64, x: f64, y: f64) {
        // 1. 处理数据缩放
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

        // 2. 处理交互层的滚轮事件
        {
            let mut overlay_renderer = self.overlay_renderer.borrow_mut();
            overlay_renderer.handle_wheel(x, y, &self.canvas_manager, &self.data_manager, self.mode);
        } // 在这里释放 overlay_renderer 的可变借用

        // 3. 如果需要重绘，则重绘图表
        if need_redraw {
            // 确保所有借用都已释放后再调用render
            self.render();
        }
    }

    /// 处理鼠标点击事件 (特别用于切换图表模式)
    pub fn handle_click(&mut self, x: f64, y: f64) -> bool {
        // 添加调试日志，记录当前模式
        log_message(&format!("ChartRenderer::handle_click: current mode = {:?}", self.mode));
        
        // 检查是否点击了切换按钮
        let new_mode = {
            let layout = self.canvas_manager.layout.borrow();
            let overlay_renderer = self.overlay_renderer.borrow();
            overlay_renderer.handle_click(x, y, &layout)
        };

        if let Some(new_mode) = new_mode {
            // 添加调试日志，记录模式变化
            log_message(&format!("ChartRenderer::handle_click: mode changing from {:?} to {:?}", self.mode, new_mode));
            
            // 根据点击的按钮设置渲染模式
            self.mode = new_mode;
            
            // 重新渲染图表
            // 确保所有借用都已释放后再调用render
            self.render();
            
            // 重新绘制交互元素
            {
                let overlay_renderer = self.overlay_renderer.borrow();
                overlay_renderer.redraw(&self.canvas_manager, &self.data_manager, self.mode);
            } // 在这里释放 overlay_renderer 的借用
            
            // 添加调试日志，确认模式已更新
            log_message(&format!("ChartRenderer::handle_click: mode updated to {:?}", self.mode));
            return true;
        }
        
        // 添加调试日志，表示没有模式变化
        log_message("ChartRenderer::handle_click: no mode change");
        false
    }

    /// 获取线图渲染器
    pub fn get_line_renderer(&self) -> &LineRenderer {
        &self.line_renderer
    }

    /// 获取线图渲染器的可变引用
    pub fn get_line_renderer_mut(&mut self) -> &mut LineRenderer {
        &mut self.line_renderer
    }
}
