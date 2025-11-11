//! 渲染策略工厂 - 管理和创建渲染策略

use super::render_strategy::{RenderContext, RenderError, RenderStrategy};
use crate::canvas::CanvasLayerType;
use crate::render::chart_renderer::RenderMode;
use crate::render::cursor_style::CursorStyle;
use crate::render::datazoom_renderer::DragResult;
use crate::render::{
    axis_renderer::AxisRenderer, book_renderer::BookRenderer, datazoom_renderer::DataZoomRenderer,
    header_renderer::HeaderRenderer, heat_renderer::HeatRenderer, line_renderer::LineRenderer,
    overlay_renderer::OverlayRenderer, price_renderer::PriceRenderer,
    volume_renderer::VolumeRenderer,
};
use std::cell::RefCell;
use std::collections::HashMap;

/// 策略类型枚举
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum StrategyType {
    Header,
    Price,
    Volume,
    Heatmap,
    Axis,
    Overlay,
    DataZoom,
    Line,
    Book,
    Custom(String), // 支持自定义策略类型
}

/// 渲染策略工厂
pub struct RenderStrategyFactory {
    // 支持同一类型多个策略实例，使用RefCell支持内部可变性
    pub(crate) strategies: HashMap<StrategyType, Vec<RefCell<Box<dyn RenderStrategy>>>>,
}

impl Default for RenderStrategyFactory {
    fn default() -> Self {
        Self::new()
    }
}

impl RenderStrategyFactory {
    /// 创建新的渲染策略工厂（包含默认策略）
    ///
    /// 返回一个包含系统内置默认渲染策略的工厂实例，适用于实际渲染流程。
    /// 在测试中如果需要完全可控、无默认策略的工厂，请使用 `new_empty`。
    pub fn new() -> Self {
        let mut factory = Self {
            strategies: HashMap::new(),
        };

        // 注册默认策略
        factory.register_default_strategies();
        factory
    }

    /// 创建一个不包含任何默认策略的渲染策略工厂（测试友好）
    ///
    /// 该构造函数不会注册任何内置策略，便于在测试中只关注自定义策略，
    /// 避免默认策略在遍历时被访问导致断言混淆或引入外部依赖。
    pub fn new_empty() -> Self {
        Self {
            strategies: HashMap::new(),
        }
    }

    /// 注册默认渲染策略
    fn register_default_strategies(&mut self) {
        self.register_strategy(StrategyType::Header, Box::new(HeaderRenderer::new()));
        self.register_strategy(StrategyType::Axis, Box::new(AxisRenderer {}));
        self.register_strategy(StrategyType::Price, Box::new(PriceRenderer {}));
        self.register_strategy(StrategyType::Volume, Box::new(VolumeRenderer {}));
        self.register_strategy(StrategyType::Heatmap, Box::new(HeatRenderer::default()));
        self.register_strategy(StrategyType::Line, Box::new(LineRenderer::new()));
        self.register_strategy(StrategyType::Book, Box::new(BookRenderer::new()));
        self.register_strategy(StrategyType::Overlay, Box::new(OverlayRenderer::new()));
        self.register_strategy(StrategyType::DataZoom, Box::new(DataZoomRenderer::new()));
    }

    /// 注册自定义渲染策略
    pub fn register_strategy(
        &mut self,
        strategy_type: StrategyType,
        strategy: Box<dyn RenderStrategy>,
    ) {
        self.strategies
            .entry(strategy_type)
            .or_default()
            .push(RefCell::new(strategy));
    }

    /// 获取指定类型的渲染策略
    pub fn get_strategy(
        &self,
        strategy_type: &StrategyType,
        index: usize,
    ) -> Option<&RefCell<Box<dyn RenderStrategy>>> {
        self.strategies
            .get(strategy_type)
            .and_then(|strategies| strategies.get(index))
    }

    /// 获取 DataZoom 渲染器的引用
    pub fn get_datazoom_renderer(&self) -> Option<&RefCell<Box<dyn RenderStrategy>>> {
        self.get_strategy(&StrategyType::DataZoom, 0)
    }

    /// [新API - 阶段C] 使用访问者模式按渲染模式和优先级遍历策略（只读访问）
    /// 返回 ControlFlow：Continue 继续遍历，Break 提前终止
    pub fn visit_strategies<F>(&self, mode: RenderMode, mut visitor: F) -> std::ops::ControlFlow<()>
    where
        F: FnMut(&dyn RenderStrategy) -> std::ops::ControlFlow<()>,
    {
        let mut strategies: Vec<(u32, &RefCell<Box<dyn RenderStrategy>>)> = Vec::new();

        // 收集支持该模式的所有策略
        for strategy_vec in self.strategies.values() {
            for strategy_cell in strategy_vec {
                let strategy = strategy_cell.borrow();
                if strategy.supports_mode(mode) {
                    strategies.push((strategy.get_priority(), strategy_cell));
                }
            }
        }

        // 按优先级排序（数值越小优先级越高）
        strategies.sort_by_key(|(priority, _)| *priority);

        // 使用访问者模式遍历，避免返回借用
        for (_, strategy_cell) in strategies {
            let strategy = strategy_cell.borrow();
            match visitor(&**strategy) {
                std::ops::ControlFlow::Continue(()) => continue,
                std::ops::ControlFlow::Break(()) => return std::ops::ControlFlow::Break(()),
            }
        }

        std::ops::ControlFlow::Continue(())
    }

    /// [新API - 阶段C] 使用访问者模式按图层类型和优先级遍历策略（只读访问）
    pub fn visit_strategies_by_layer<F>(
        &self,
        mode: RenderMode,
        layer: CanvasLayerType,
        mut visitor: F,
    ) -> std::ops::ControlFlow<()>
    where
        F: FnMut(&dyn RenderStrategy) -> std::ops::ControlFlow<()>,
    {
        let mut strategies: Vec<(u32, &RefCell<Box<dyn RenderStrategy>>)> = Vec::new();

        // 收集支持该模式和图层的所有策略
        for strategy_vec in self.strategies.values() {
            for strategy_cell in strategy_vec {
                let strategy = strategy_cell.borrow();
                if strategy.supports_mode(mode) && strategy.get_layer_type() == layer {
                    strategies.push((strategy.get_priority(), strategy_cell));
                }
            }
        }

        // 按优先级排序（数值越小优先级越高）
        strategies.sort_by_key(|(priority, _)| *priority);

        // 使用访问者模式遍历
        for (_, strategy_cell) in strategies {
            let strategy = strategy_cell.borrow();
            match visitor(&**strategy) {
                std::ops::ControlFlow::Continue(()) => continue,
                std::ops::ControlFlow::Break(()) => return std::ops::ControlFlow::Break(()),
            }
        }

        std::ops::ControlFlow::Continue(())
    }

    /// [新API - 阶段C] 使用访问者模式按渲染模式和优先级遍历策略（可变访问）
    pub fn visit_strategies_mut<F>(
        &self,
        mode: RenderMode,
        mut visitor: F,
    ) -> std::ops::ControlFlow<()>
    where
        F: FnMut(&mut dyn RenderStrategy) -> std::ops::ControlFlow<()>,
    {
        let mut strategies: Vec<(u32, &RefCell<Box<dyn RenderStrategy>>)> = Vec::new();

        // 收集支持该模式的所有策略
        for strategy_vec in self.strategies.values() {
            for strategy_cell in strategy_vec {
                let strategy = strategy_cell.borrow();
                if strategy.supports_mode(mode) {
                    strategies.push((strategy.get_priority(), strategy_cell));
                }
            }
        }

        // 按优先级排序（数值越小优先级越高）
        strategies.sort_by_key(|(priority, _)| *priority);

        // 使用访问者模式遍历，支持可变访问
        for (_, strategy_cell) in strategies {
            let mut strategy = strategy_cell.borrow_mut();
            match visitor(&mut **strategy) {
                std::ops::ControlFlow::Continue(()) => continue,
                std::ops::ControlFlow::Break(()) => return std::ops::ControlFlow::Break(()),
            }
        }

        std::ops::ControlFlow::Continue(())
    }

    /// 渲染指定图层的策略
    pub fn render_layers(
        &self,
        ctx: &RenderContext,
        mode: RenderMode,
        layers: &[CanvasLayerType],
    ) -> Result<(), RenderError> {
        for &layer in layers {
            // 使用新的访问者模式API替代返回借用集合
            let mut render_err: Option<RenderError> = None;
            let result = self.visit_strategies_by_layer(mode, layer, |strategy| {
                // 若渲染失败则提前终止遍历，并记录错误
                match strategy.render(ctx) {
                    Ok(()) => std::ops::ControlFlow::Continue(()),
                    Err(e) => {
                        render_err = Some(e);
                        std::ops::ControlFlow::Break(())
                    }
                }
            });

            // 如果访问者提前终止，表示渲染出错，向上传播原始错误
            if let std::ops::ControlFlow::Break(()) = result {
                return Err(render_err.expect("render error must be set on Break"));
            }
        }
        Ok(())
    }

    // === 事件处理方法 ===

    /// 获取鼠标位置的光标样式
    pub fn get_cursor_style(
        &self,
        x: f64,
        y: f64,
        ctx: &RenderContext,
        mode: RenderMode,
    ) -> CursorStyle {
        let mut found = CursorStyle::Default;
        let cf = self.visit_strategies(mode, |strategy| {
            let cursor = strategy.get_cursor_style(x, y, ctx);
            if cursor != CursorStyle::Default {
                found = cursor;
                return std::ops::ControlFlow::Break(());
            }
            std::ops::ControlFlow::Continue(())
        });
        match cf {
            std::ops::ControlFlow::Break(()) => found,
            _ => found,
        }
    }

    /// 处理鼠标移动事件
    pub fn handle_mouse_move(&self, x: f64, y: f64, ctx: &RenderContext, mode: RenderMode) -> bool {
        let mut handled = false;
        let _ = self.visit_strategies_mut(mode, |strategy| {
            if strategy.handle_mouse_move(x, y, ctx) {
                handled = true;
            }
            std::ops::ControlFlow::Continue(())
        });
        handled
    }

    /// 处理鼠标按下事件
    pub fn handle_mouse_down(&self, x: f64, y: f64, ctx: &RenderContext, mode: RenderMode) -> bool {
        let mut result = false;
        let _ = self.visit_strategies_mut(mode, |strategy| {
            if strategy.handle_mouse_down(x, y, ctx) {
                result = true;
                return std::ops::ControlFlow::Break(()); // 第一个处理的策略优先
            }
            std::ops::ControlFlow::Continue(())
        });
        result
    }

    /// 处理鼠标抬起事件
    pub fn handle_mouse_up(&self, x: f64, y: f64, ctx: &RenderContext, mode: RenderMode) -> bool {
        let mut handled = false;
        let _ = self.visit_strategies_mut(mode, |strategy| {
            if strategy.handle_mouse_up(x, y, ctx) {
                handled = true;
            }
            std::ops::ControlFlow::Continue(())
        });
        handled
    }

    /// 处理鼠标拖动事件
    pub fn handle_mouse_drag(
        &self,
        x: f64,
        y: f64,
        ctx: &RenderContext,
        mode: RenderMode,
    ) -> DragResult {
        let mut out = DragResult::None;
        let _ = self.visit_strategies_mut(mode, |strategy| {
            let r = strategy.handle_mouse_drag(x, y, ctx);
            if r != DragResult::None {
                out = r;
                return std::ops::ControlFlow::Break(());
            }
            std::ops::ControlFlow::Continue(())
        });
        out
    }

    /// 处理鼠标离开事件
    pub fn handle_mouse_leave(&self, ctx: &RenderContext, mode: RenderMode) -> bool {
        let mut handled = false;
        let _ = self.visit_strategies_mut(mode, |strategy| {
            if strategy.handle_mouse_leave(ctx) {
                handled = true;
            }
            std::ops::ControlFlow::Continue(())
        });
        handled
    }

    /// 处理鼠标滚轮事件
    pub fn handle_wheel(
        &self,
        x: f64,
        y: f64,
        delta: f64,
        ctx: &RenderContext,
        mode: RenderMode,
    ) -> bool {
        let mut handled = false;
        let _ = self.visit_strategies_mut(mode, |strategy| {
            if strategy.handle_wheel(x, y, delta, ctx) {
                handled = true;
            }
            std::ops::ControlFlow::Continue(())
        });
        handled
    }
}
