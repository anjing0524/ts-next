//! 图表渲染器 - 整合所有模块，提供统一的渲染接口

use super::cursor_style::CursorStyle;
use super::render_context::SharedRenderState;
use super::strategy::{RenderContext, RenderStrategyFactory};
use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::config::{ChartConfig, ChartTheme, ConfigManager};
use crate::data::DataManager;

use std::collections::HashMap;
// 移除性能监控导入，ChartRenderer 专注于渲染

use crate::layout::{self, ChartLayout, LayoutEngine, Rect};
use crate::utils::WasmCalError;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvas;

// 定义渲染图形引擎
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum RenderMode {
    Kmap,    // K线图和成交量图
    Heatmap, // 热图和成交量图
}

/// 图表渲染器 - 负责协调各种渲染策略
pub struct ChartRenderer {
    /// 统一的共享状态
    shared_state: SharedRenderState,
    /// 渲染模式
    mode: Rc<RefCell<RenderMode>>,
    /// 画布尺寸
    canvas_size: (f64, f64),
}

impl ChartRenderer {
    /// 创建图表渲染器
    ///
    /// 初始化图表渲染器实例，创建共享状态及各种管理器。
    /// Canvas管理器将在 set_canvases 方法中完成初始化。
    ///
    /// 返回：
    /// - Ok(ChartRenderer) 创建成功的渲染器实例
    /// - Err(WasmCalError) 初始化失败时的错误信息
    pub fn new() -> Result<Self, WasmCalError> {
        let data_manager = DataManager::new();
        let config_manager = ConfigManager::new();
        let strategy_factory = RenderStrategyFactory::new();
        let mouse_state = Rc::new(RefCell::new(crate::command::state::MouseState::default()));
        let mode = Rc::new(RefCell::new(RenderMode::Kmap));

        // 初始布局和Canvas管理器将在 set_canvases 中创建
        let initial_layout = ChartLayout::new(HashMap::new(), 0);

        let shared_state = SharedRenderState::new(
            // CanvasManager 将在 set_canvases 中初始化
            Rc::new(RefCell::new(CanvasManager::new_uninitialized())),
            Rc::new(RefCell::new(data_manager)),
            Rc::new(RefCell::new(initial_layout)),
            Rc::new(config_manager.theme),
            Some(Rc::new(config_manager.config)),
            Rc::new(RefCell::new(strategy_factory)),
            mouse_state.clone(),
            mode.clone(),
        );

        Ok(Self {
            shared_state,
            mode,
            canvas_size: (0.0, 0.0),
        })
    }

    /// 设置初始数据
    ///
    /// 加载初始的K线数据，并触发完整的重新计算流程。
    ///
    /// 参数：
    /// - data: 二进制格式的K线数据
    pub fn set_initial_data(&mut self, data: Vec<u8>) {
        {
            let mut dm = self.shared_state.data_manager.borrow_mut();
            dm.set_initial_data(data);
        } // 释放数据管理器借用
        // 初始化完成后，更新布局和数据范围
        self.full_recalculate();
    }

    /// 设置Canvas并完成初始化
    ///
    /// 设置三个渲染层的Canvas实例，完成渲染器的最终初始化。
    /// 该方法必须在数据加载后调用，以确保布局计算正确。
    ///
    /// 参数：
    /// - base_canvas: 基础层Canvas（背景、网格等静态元素）
    /// - main_canvas: 主图层Canvas（K线、热图等数据驱动元素）
    /// - overlay_canvas: 交互层Canvas（十字光标、工具提示等）
    ///
    /// 返回：
    /// - Ok(()) 设置成功
    /// - Err(WasmCalError) Canvas初始化失败
    pub fn set_canvases(
        &mut self,
        base_canvas: OffscreenCanvas,
        main_canvas: OffscreenCanvas,
        overlay_canvas: OffscreenCanvas,
    ) -> Result<(), WasmCalError> {
        self.canvas_size = (base_canvas.width() as f64, base_canvas.height() as f64);
        let canvas_manager = CanvasManager::new(&base_canvas, &main_canvas, &overlay_canvas)?;
        *self.shared_state.canvas_manager.borrow_mut() = canvas_manager;

        // 现在我们有了canvas尺寸，可以进行完整的重新计算
        self.full_recalculate();
        Ok(())
    }

    /// 重新计算布局和数据范围
    ///
    /// 当Canvas尺寸或数据发生变化时，重新计算布局和可视范围。
    /// 该方法确保布局与数据范围的一致性。
    fn full_recalculate(&mut self) {
        if self.canvas_size.0 > 0.0 && self.canvas_size.1 > 0.0 {
            self.update_layout();

            // 在短作用域内检查数据长度
            let has_data = { self.shared_state.data_manager.borrow().len() > 0 };

            if has_data {
                // 在短作用域内初始化可视范围
                {
                    let layout = self.shared_state.layout.borrow();
                    self.shared_state
                        .data_manager
                        .borrow_mut()
                        .initialize_visible_range(&layout);
                } // 释放 layout 和 data_manager 借用

                // 再次更新布局，以确保candle_width正确
                self.update_layout();

                // 在短作用域内计算数据范围
                {
                    self.shared_state
                        .data_manager
                        .borrow_mut()
                        .calculate_data_ranges();
                } // 释放 data_manager 借用
            }
        }
    }

    /// 获取共享渲染状态
    ///
    /// 返回内部持有的共享状态副本（包含 Canvas/Data/Layout/Theme/Config/策略工厂/鼠标状态）。
    /// 注意：包含 Rc/RefCell 包装的可变共享对象，请在使用时注意借用边界与生命周期。
    pub fn get_shared_state(&self) -> SharedRenderState {
        self.shared_state.clone()
    }

    /// 核心：更新布局的方法
    ///
    /// 根据当前渲染模式和Canvas尺寸重新计算布局。
    /// 布局计算完成后会更新 ChartLayout 实例。
    fn update_layout(&mut self) {
        let layout_template = layout::create_layout_template(*self.mode.borrow());
        let canvas_bounds = Rect {
            x: 0.0,
            y: 0.0,
            width: self.canvas_size.0,
            height: self.canvas_size.1,
        };
        let computed_panes = LayoutEngine::calculate(&layout_template, canvas_bounds);

        // 缩短数据管理器借用作用域
        let visible_count = { self.shared_state.data_manager.borrow().get_visible().1 };

        // 缩短布局借用作用域
        {
            let mut layout = self.shared_state.layout.borrow_mut();
            *layout = ChartLayout::new(computed_panes, visible_count);
        } // 释放布局借用
    }

    /// 处理布局变更
    ///
    /// 当布局配置或数据驱动的可视范围发生变化时：
    /// 1) 重新计算布局
    /// 2) 将所有 Canvas 层标记为脏（需要重绘）
    /// 3) 触发一次渲染，确保 UI 与状态同步
    pub fn handle_layout_change(&mut self) {
        self.update_layout();

        // 在短作用域内标记所有层为脏
        {
            self.shared_state
                .canvas_manager
                .borrow_mut()
                .set_all_dirty();
        } // 释放 canvas_manager 借用

        let _ = self.render();
    }

    /// 处理画布大小改变
    ///
    /// 当浏览器窗口大小改变时调用，重新计算布局并清理可能的重影。
    /// 特别注意：会强制清理整个Overlay层以防止DataZoom等组件出现重影。
    ///
    /// 参数：
    /// - width: 新的Canvas宽度
    /// - height: 新的Canvas高度
    pub fn handle_canvas_resize(&mut self, width: f64, height: f64) {
        // 在resize时强制清理整个Overlay层，防止DataZoom等组件出现重影
        // 这是因为resize时布局可能发生变化，旧的渲染内容可能残留在新布局范围之外
        {
            let canvas_manager = self.shared_state.canvas_manager.borrow();
            if let Ok(overlay_ctx) = canvas_manager.get_context(CanvasLayerType::Overlay) {
                overlay_ctx.clear_rect(0.0, 0.0, self.canvas_size.0, self.canvas_size.1);
            }
        } // 释放 canvas_manager 借用

        self.canvas_size = (width, height);
        self.update_layout();

        // 在短作用域内初始化可视范围
        {
            let layout = self.shared_state.layout.borrow();
            self.shared_state
                .data_manager
                .borrow_mut()
                .initialize_visible_range(&layout);
        } // 释放 layout 和 data_manager 借用

        self.handle_layout_change();
    }

    /// 设置渲染模式
    ///
    /// 切换 K 线/热图等渲染模式，并在模式变化时触发布局更新与重绘。
    pub fn set_mode(&mut self, mode: RenderMode) {
        if *self.mode.borrow() != mode {
            *self.mode.borrow_mut() = mode;
            self.handle_layout_change();
        }
    }

    /// 从JSON字符串加载配置
    pub fn load_config_from_json(&mut self, json: &str) -> Result<(), WasmCalError> {
        let mut config_manager = ConfigManager::new();
        config_manager.load_from_json(json)?;
        self.shared_state.theme = Rc::new(config_manager.theme);
        self.shared_state.config = Some(Rc::new(config_manager.config));

        // 在短作用域内设置脏标记
        {
            self.shared_state
                .canvas_manager
                .borrow_mut()
                .set_all_dirty();
        } // 释放 canvas_manager 借用

        Ok(())
    }

    /// 渲染图表
    ///
    /// 执行图表渲染操作，采用脏标记机制只更新需要重绘的层。
    /// 渲染顺序：先清理画布，再执行各渲染器的渲染逻辑。
    ///
    /// 返回：
    /// - Ok(()) 渲染成功完成
    /// - Err(WasmCalError) Canvas获取失败或其他渲染错误
    pub fn render(&self) -> Result<(), WasmCalError> {
        // 如果canvas未设置，则不执行渲染
        if self.canvas_size.0 == 0.0 || self.canvas_size.1 == 0.0 {
            return Ok(());
        }

        // 在短作用域内检查脏层
        let layers_to_render = {
            let canvas_manager = self.shared_state.canvas_manager.borrow();
            let mut layers = Vec::new();
            if canvas_manager.is_dirty(CanvasLayerType::Base) {
                layers.push(CanvasLayerType::Base);
            }
            if canvas_manager.is_dirty(CanvasLayerType::Main) {
                layers.push(CanvasLayerType::Main);
            }
            if canvas_manager.is_dirty(CanvasLayerType::Overlay) {
                layers.push(CanvasLayerType::Overlay);
            }
            layers
        }; // 释放 canvas_manager 借用

        if layers_to_render.is_empty() {
            return Ok(());
        }

        // 如果需要渲染主图层，在短作用域内计算数据范围
        if layers_to_render.contains(&CanvasLayerType::Main) {
            {
                self.shared_state
                    .data_manager
                    .borrow_mut()
                    .calculate_data_ranges();
            } // 释放 data_manager 借用
        }

        // 在独立作用域中获取上下文并清理各层
        {
            let canvas_manager = self.shared_state.canvas_manager.borrow();
            for &layer_type in &layers_to_render {
                if let Ok(ctx) = canvas_manager.get_context(layer_type) {
                    if layer_type == CanvasLayerType::Base || layer_type == CanvasLayerType::Main {
                        ctx.clear_rect(0.0, 0.0, self.canvas_size.0, self.canvas_size.1);
                    }
                }
            }
        } // 释放 canvas_manager 借用

        // 构建渲染上下文；随后在短作用域中借用策略工厂执行渲染
        let render_context = RenderContext::from_shared(self.shared_state.clone());
        {
            let strategy_factory = self.shared_state.strategy_factory.borrow();
            strategy_factory.render_layers(
                &render_context,
                *self.mode.borrow(),
                &layers_to_render,
            )?;
        } // 释放 strategy_factory 借用

        // 渲染完成后再清理脏标记，使用可变借用，并限制在短作用域内
        {
            let mut canvas_manager = self.shared_state.canvas_manager.borrow_mut();
            canvas_manager.clear_all_dirty_flags();
        } // 释放 canvas_manager 借用

        Ok(())
    }

    /// 更新配置（供 KlineProcess 使用）
    pub fn update_config(&mut self, config: &ChartConfig, theme: &ChartTheme) {
        self.shared_state.theme = Rc::new(theme.clone());
        self.shared_state.config = Some(Rc::new(config.clone()));
    }

    /// 获取光标样式
    ///
    /// 基于当前渲染模式与鼠标坐标，委托策略工厂遍历各层渲染器返回最合适的光标样式。
    /// 例如：在 DataZoom 句柄上返回左右 resize，在可拖拽区域返回 ew-resize，在普通区域返回默认十字或默认指针。
    pub fn get_cursor_style(&self, x: f64, y: f64) -> CursorStyle {
        let render_context =
            RenderContext::new(self.shared_state.clone(), None, *self.mode.borrow());

        // 在短作用域内获取光标样式
        {
            let strategy_factory = self.shared_state.strategy_factory.borrow();
            strategy_factory.get_cursor_style(x, y, &render_context, *self.mode.borrow())
        } // 释放 strategy_factory 借用
    }
}
