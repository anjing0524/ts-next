//! 渲染策略访问者模式 API 测试
//!
//! 测试 RenderStrategyFactory 的 visit_strategies 和 visit_strategies_by_layer 方法，
//! 验证其优先级排序和层过滤的正确性。

use kline_processor::canvas::CanvasLayerType;
use kline_processor::render::chart_renderer::RenderMode;
use kline_processor::render::strategy::render_strategy::{
    RenderContext, RenderError, RenderStrategy,
};
use kline_processor::render::strategy::strategy_factory::{RenderStrategyFactory, StrategyType};
// 移除未使用的导入
// use std::cell::RefCell;
// use std::collections::HashMap;
use std::sync::Mutex;
use wasm_bindgen_test::*;

// 浏览器端运行配置：使用 wasm-bindgen-test 在浏览器环境执行
wasm_bindgen_test_configure!(run_in_browser);

/// 记录访问顺序的全局变量（测试用）
static VISIT_LOG: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// 清空访问日志
fn clear_visit_log() {
    VISIT_LOG.lock().unwrap().clear();
}

/// 获取访问日志
fn get_visit_log() -> Vec<String> {
    VISIT_LOG.lock().unwrap().clone()
}

/// 记录访问
fn log_visit(id: &str) {
    VISIT_LOG.lock().unwrap().push(id.to_string());
}

/// 测试用渲染策略，用于验证访问者模式的排序和过滤
struct TestRenderStrategy {
    id: String,
    priority: u32,
    layer: CanvasLayerType,
    mode: RenderMode,
}

impl TestRenderStrategy {
    fn new(id: &str, priority: u32, layer: CanvasLayerType, mode: RenderMode) -> Box<Self> {
        Box::new(Self {
            id: id.to_string(),
            priority,
            layer,
            mode,
        })
    }
}

impl RenderStrategy for TestRenderStrategy {
    fn render(&self, _ctx: &RenderContext) -> Result<(), RenderError> {
        log_visit(&self.id);
        Ok(())
    }

    /// 仅当传入的渲染模式与策略自身模式完全一致时才返回 true
    /// 这样可以在测试中严格验证基于渲染模式的过滤逻辑
    fn supports_mode(&self, mode: RenderMode) -> bool {
        mode == self.mode
    }

    fn get_layer_type(&self) -> CanvasLayerType {
        self.layer
    }

    fn get_priority(&self) -> u32 {
        self.priority
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ops::ControlFlow;
    // 移除重复导入，文件顶部已导入 wasm_bindgen_test
    // use wasm_bindgen_test::*;

    /// 验证 visit_strategies 会依据渲染模式过滤策略
    #[wasm_bindgen_test]
    fn test_visit_strategies_mode_filtering() {
        // 创建策略工厂（不包含默认策略），避免默认策略干扰
        let mut factory = RenderStrategyFactory::new_empty();

        // 注册支持不同模式的策略
        factory.register_strategy(
            StrategyType::Custom("kmap_only".to_string()),
            TestRenderStrategy::new("kmap_strategy", 10, CanvasLayerType::Main, RenderMode::Kmap),
        );
        factory.register_strategy(
            StrategyType::Custom("heatmap_only".to_string()),
            TestRenderStrategy::new(
                "heatmap_strategy",
                15,
                CanvasLayerType::Main,
                RenderMode::Heatmap,
            ),
        );

        // 测试 Kmap 模式，应仅访问支持 Kmap 的策略
        clear_visit_log();
        let ctx = RenderContext::default();
        let _ = factory.visit_strategies(RenderMode::Kmap, |strategy| {
            let _ = strategy.render(&ctx);
            ControlFlow::Continue(())
        });
        assert_eq!(get_visit_log(), vec!["kmap_strategy"]);

        // 测试 Heatmap 模式，应仅访问支持 Heatmap 的策略
        clear_visit_log();
        let _ = factory.visit_strategies(RenderMode::Heatmap, |strategy| {
            let _ = strategy.render(&ctx);
            ControlFlow::Continue(())
        });
        assert_eq!(get_visit_log(), vec!["heatmap_strategy"]);
    }

    #[wasm_bindgen_test]
    fn test_visit_strategies_by_layer_filtering() {
        // 创建策略工厂（不包含默认策略），避免默认策略干扰
        let mut factory = RenderStrategyFactory::new_empty();

        // 注册到不同层的策略，优先级：base(5) < main(10) < overlay(20)
        factory.register_strategy(
            StrategyType::Custom("base".to_string()),
            TestRenderStrategy::new("base_strategy", 5, CanvasLayerType::Base, RenderMode::Kmap),
        );
        factory.register_strategy(
            StrategyType::Custom("main".to_string()),
            TestRenderStrategy::new("main_strategy", 10, CanvasLayerType::Main, RenderMode::Kmap),
        );
        factory.register_strategy(
            StrategyType::Custom("overlay".to_string()),
            TestRenderStrategy::new(
                "overlay_strategy",
                20,
                CanvasLayerType::Overlay,
                RenderMode::Kmap,
            ),
        );

        // 测试仅访问 Base 层策略
        clear_visit_log();
        let ctx = RenderContext::default();
        let _ = factory.visit_strategies_by_layer(
            RenderMode::Kmap,
            CanvasLayerType::Base,
            |strategy| {
                let _ = strategy.render(&ctx);
                ControlFlow::Continue(())
            },
        );
        assert_eq!(get_visit_log(), vec!["base_strategy"]);

        // 测试仅访问 Main 层策略
        clear_visit_log();
        let _ = factory.visit_strategies_by_layer(
            RenderMode::Kmap,
            CanvasLayerType::Main,
            |strategy| {
                let _ = strategy.render(&ctx);
                ControlFlow::Continue(())
            },
        );
        assert_eq!(get_visit_log(), vec!["main_strategy"]);

        // 测试仅访问 Overlay 层策略
        clear_visit_log();
        let _ = factory.visit_strategies_by_layer(
            RenderMode::Kmap,
            CanvasLayerType::Overlay,
            |strategy| {
                let _ = strategy.render(&ctx);
                ControlFlow::Continue(())
            },
        );
        assert_eq!(get_visit_log(), vec!["overlay_strategy"]);
    }

    #[wasm_bindgen_test]
    fn test_visit_strategies_by_layer_priority_ordering() {
        // 创建策略工厂（不包含默认策略），避免默认策略干扰
        let mut factory = RenderStrategyFactory::new_empty();

        // 在同一层注册多个策略，验证优先级排序
        factory.register_strategy(
            StrategyType::Custom("main_high".to_string()),
            TestRenderStrategy::new(
                "main_high_priority",
                3,
                CanvasLayerType::Main,
                RenderMode::Kmap,
            ),
        );
        factory.register_strategy(
            StrategyType::Custom("main_low".to_string()),
            TestRenderStrategy::new(
                "main_low_priority",
                8,
                CanvasLayerType::Main,
                RenderMode::Kmap,
            ),
        );
        factory.register_strategy(
            StrategyType::Custom("main_mid".to_string()),
            TestRenderStrategy::new(
                "main_mid_priority",
                5,
                CanvasLayerType::Main,
                RenderMode::Kmap,
            ),
        );

        // 验证 Main 层策略按优先级排序：3 < 5 < 8
        clear_visit_log();
        let ctx = RenderContext::default();
        let _ = factory.visit_strategies_by_layer(
            RenderMode::Kmap,
            CanvasLayerType::Main,
            |strategy| {
                let _ = strategy.render(&ctx);
                ControlFlow::Continue(())
            },
        );
        assert_eq!(
            get_visit_log(),
            vec![
                "main_high_priority",
                "main_mid_priority",
                "main_low_priority"
            ]
        );
    }

    #[wasm_bindgen_test]
    fn test_visitor_early_termination() {
        // 创建策略工厂（不包含默认策略），本用例只关注访问者提前终止语义
        let mut factory = RenderStrategyFactory::new_empty();

        // 注册三个策略
        factory.register_strategy(
            StrategyType::Custom("first".to_string()),
            TestRenderStrategy::new("first_strategy", 1, CanvasLayerType::Main, RenderMode::Kmap),
        );
        factory.register_strategy(
            StrategyType::Custom("second".to_string()),
            TestRenderStrategy::new(
                "second_strategy",
                2,
                CanvasLayerType::Main,
                RenderMode::Kmap,
            ),
        );
        factory.register_strategy(
            StrategyType::Custom("third".to_string()),
            TestRenderStrategy::new("third_strategy", 3, CanvasLayerType::Main, RenderMode::Kmap),
        );

        // 验证访问者可以在访问第二个策略后提前终止遍历（无需不安全 downcast）
        clear_visit_log();
        let ctx = RenderContext::default();
        let mut count = 0usize;
        let result = factory.visit_strategies(RenderMode::Kmap, |strategy| {
            // 调用 render 以记录访问顺序
            let _ = strategy.render(&ctx);
            count += 1;

            // 在访问第二个策略后提前终止
            if count == 2 {
                ControlFlow::Break(())
            } else {
                ControlFlow::Continue(())
            }
        });

        // 验证提前终止结果
        assert_eq!(result, ControlFlow::Break(()));
        // 验证仅前两个策略被访问，且顺序遵循优先级（1 -> 2）
        assert_eq!(get_visit_log(), vec!["first_strategy", "second_strategy"]);
    }
}
