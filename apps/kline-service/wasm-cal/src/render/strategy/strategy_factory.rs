//! 渲染策略工厂 - 管理和创建渲染策略

use super::render_strategy::{RenderContext, RenderError, RenderStrategy};
use crate::canvas::CanvasLayerType;
use crate::render::chart_renderer::RenderMode;
use crate::render::cursor_style::CursorStyle;
use crate::render::datazoom_renderer::DragResult;
use crate::render::{
    axis_renderer::AxisRenderer, book_renderer::BookRenderer, datazoom_renderer::DataZoomRenderer,
    heat_renderer::HeatRenderer, line_renderer::LineRenderer, overlay_renderer::OverlayRenderer,
    price_renderer::PriceRenderer, volume_renderer::VolumeRenderer,
};
use std::cell::RefCell;
use std::collections::HashMap;

/// 策略类型枚举
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum StrategyType {
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
    strategies: HashMap<StrategyType, Vec<RefCell<Box<dyn RenderStrategy>>>>,
}

impl RenderStrategyFactory {
    /// 创建新的渲染策略工厂
    pub fn new() -> Self {
        let mut factory = Self {
            strategies: HashMap::new(),
        };

        // 注册默认策略
        factory.register_default_strategies();
        factory
    }

    /// 注册默认渲染策略
    fn register_default_strategies(&mut self) {
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
            .or_insert_with(Vec::new)
            .push(RefCell::new(strategy));
    }

    /// 注销渲染策略
    pub fn unregister_strategy(
        &mut self,
        strategy_type: &StrategyType,
        index: usize,
    ) -> Option<RefCell<Box<dyn RenderStrategy>>> {
        if let Some(strategies) = self.strategies.get_mut(strategy_type) {
            if index < strategies.len() {
                return Some(strategies.remove(index));
            }
        }
        None
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

    /// 获取指定类型的所有渲染策略
    pub fn get_strategies_by_type(
        &self,
        strategy_type: &StrategyType,
    ) -> Option<&Vec<RefCell<Box<dyn RenderStrategy>>>> {
        self.strategies.get(strategy_type)
    }

    /// 根据渲染模式获取所有支持的策略并按优先级排序
    pub fn get_strategies_for_mode(
        &self,
        mode: RenderMode,
    ) -> Vec<&RefCell<Box<dyn RenderStrategy>>> {
        let mut strategies: Vec<(u32, &RefCell<Box<dyn RenderStrategy>>)> = Vec::new();

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

        strategies
            .into_iter()
            .map(|(_, strategy)| strategy)
            .collect()
    }

    /// 根据渲染模式和图层类型获取所有支持的策略并按优先级排序
    pub fn get_strategies_by_layer(
        &self,
        mode: RenderMode,
        layer: CanvasLayerType,
    ) -> Vec<&RefCell<Box<dyn RenderStrategy>>> {
        let mut strategies: Vec<(u32, &RefCell<Box<dyn RenderStrategy>>)> = Vec::new();

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

        strategies
            .into_iter()
            .map(|(_, strategy)| strategy)
            .collect()
    }

    /// 执行渲染操作（按图层分别渲染）
    pub fn render_all(&self, ctx: &RenderContext, mode: RenderMode) -> Result<(), RenderError> {
        // 按图层顺序渲染：Base -> Main -> Overlay
        let layers = [
            CanvasLayerType::Base,
            CanvasLayerType::Main,
            CanvasLayerType::Overlay,
        ];

        for layer in &layers {
            self.render_layer(ctx, mode, *layer)?;
        }

        Ok(())
    }

    /// 渲染指定图层的策略
    pub fn render_layer(
        &self,
        ctx: &RenderContext,
        mode: RenderMode,
        layer: CanvasLayerType,
    ) -> Result<(), RenderError> {
        let strategies = self.get_strategies_by_layer(mode, layer);

        for strategy_cell in strategies {
            let strategy = strategy_cell.borrow();
            strategy.render(ctx)?;
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
        let strategies = self.get_strategies_for_mode(mode);

        for strategy_cell in strategies {
            let strategy = strategy_cell.borrow();
            let cursor = strategy.get_cursor_style(x, y, ctx);
            if cursor != CursorStyle::Default {
                return cursor;
            }
        }

        CursorStyle::Default
    }

    /// 处理鼠标移动事件
    pub fn handle_mouse_move(&self, x: f64, y: f64, ctx: &RenderContext, mode: RenderMode) -> bool {
        let strategies = self.get_strategies_for_mode(mode);
        let mut handled = false;

        for strategy_cell in strategies {
            let mut strategy = strategy_cell.borrow_mut();
            if strategy.handle_mouse_move(x, y, ctx) {
                handled = true;
            }
        }

        handled
    }

    /// 处理鼠标按下事件
    pub fn handle_mouse_down(&self, x: f64, y: f64, ctx: &RenderContext, mode: RenderMode) -> bool {
        let strategies = self.get_strategies_for_mode(mode);

        for strategy_cell in strategies {
            let mut strategy = strategy_cell.borrow_mut();
            if strategy.handle_mouse_down(x, y, ctx) {
                return true; // 第一个处理的策略优先
            }
        }

        false
    }

    /// 处理鼠标抬起事件
    pub fn handle_mouse_up(&self, x: f64, y: f64, ctx: &RenderContext, mode: RenderMode) -> bool {
        let strategies = self.get_strategies_for_mode(mode);
        let mut handled = false;

        for strategy_cell in strategies {
            let mut strategy = strategy_cell.borrow_mut();
            if strategy.handle_mouse_up(x, y, ctx) {
                handled = true;
            }
        }

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
        let strategies = self.get_strategies_for_mode(mode);

        for strategy_cell in strategies {
            let mut strategy = strategy_cell.borrow_mut();
            let result = strategy.handle_mouse_drag(x, y, ctx);
            if result != DragResult::None {
                return result; // 第一个处理的策略优先
            }
        }

        DragResult::None
    }

    /// 处理鼠标离开事件
    pub fn handle_mouse_leave(&self, ctx: &RenderContext, mode: RenderMode) -> bool {
        let strategies = self.get_strategies_for_mode(mode);
        let mut handled = false;

        for strategy_cell in strategies {
            let mut strategy = strategy_cell.borrow_mut();
            if strategy.handle_mouse_leave(ctx) {
                handled = true;
            }
        }

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
        let strategies = self.get_strategies_for_mode(mode);
        let mut handled = false;

        for strategy_cell in strategies {
            let mut strategy = strategy_cell.borrow_mut();
            if strategy.handle_wheel(x, y, delta, ctx) {
                handled = true;
            }
        }

        handled
    }

    /// 强制重置所有策略的拖动状态
    pub fn force_reset_drag_state(&self, mode: RenderMode) -> bool {
        let strategies = self.get_strategies_for_mode(mode);
        let mut handled = false;

        for strategy_cell in strategies {
            let mut strategy = strategy_cell.borrow_mut();
            if strategy.force_reset_drag_state() {
                handled = true;
            }
        }

        handled
    }
}
