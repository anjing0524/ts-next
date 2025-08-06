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

    /// 获取 DataZoom 渲染器的引用
    pub fn get_datazoom_renderer(&self) -> Option<&RefCell<Box<dyn RenderStrategy>>> {
        self.get_strategy(&StrategyType::DataZoom, 0)
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
        let all_layers = [
            CanvasLayerType::Base,
            CanvasLayerType::Main,
            CanvasLayerType::Overlay,
        ];
        self.render_layers(ctx, mode, &all_layers)
    }

    /// 渲染指定图层的策略
    pub fn render_layers(
        &self,
        ctx: &RenderContext,
        mode: RenderMode,
        layers: &[CanvasLayerType],
    ) -> Result<(), RenderError> {
        for &layer in layers {
            let strategies = self.get_strategies_by_layer(mode, layer);
            for strategy_cell in strategies {
                let strategy = strategy_cell.borrow();
                strategy.render(ctx)?;
            }
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

    /// 处理鼠标移动事件并获取hover索引
    pub fn handle_mouse_move_with_hover(
        &self,
        x: f64,
        y: f64,
        ctx: &RenderContext,
        mode: RenderMode,
    ) -> (bool, Option<usize>) {
        let strategies = self.get_strategies_for_mode(mode);
        let mut handled = false;
        let mut hover_index = None;

        // 计算hover索引基于鼠标位置和当前可见范围
        let layout = ctx.layout_ref();
        let data_manager = ctx.data_manager_ref();
        let (visible_start, visible_count, _) = data_manager.get_visible();

        if visible_count > 0 {
            let main_chart_rect = layout.get_rect(&crate::layout::PaneId::HeatmapArea);
            if main_chart_rect.contains(x, y) {
                let relative_x = x - main_chart_rect.x;
                let idx_in_visible = (relative_x / layout.total_candle_width).floor() as usize;
                let calculated_index = visible_start + idx_in_visible;
                let max_index = data_manager
                    .get_items()
                    .map_or(0, |i| i.len().saturating_sub(1));

                if calculated_index <= max_index {
                    hover_index = Some(calculated_index);
                }
            }
        }

        for strategy_cell in strategies {
            let mut strategy = strategy_cell.borrow_mut();
            if strategy.handle_mouse_move(x, y, ctx) {
                handled = true;
            }
        }

        (handled, hover_index)
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
