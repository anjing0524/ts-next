//! 渲染器架构重构 - 工厂模式+策略模式

use crate::config::ChartTheme;
use crate::data::DataManager;
use crate::layout::ChartLayout;
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 渲染器接口 - 定义所有渲染器必须实现的接口
pub trait Renderer {
    /// 渲染器名称
    fn name(&self) -> &'static str;
    
    /// 执行渲染
    fn render(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        theme: &ChartTheme,
    ) -> Result<(), String>;
    
    /// 检查是否需要渲染
    fn needs_render(&self) -> bool { true }
    
    /// 获取渲染优先级
    fn priority(&self) -> RenderPriority { RenderPriority::Normal }
    
    /// 清理资源
    fn cleanup(&mut self) {}
}

/// 交互式渲染器接口
pub trait InteractiveRenderer: Renderer {
    /// 处理鼠标移动
    fn handle_mouse_move(&mut self, x: f64, y: f64, layout: &ChartLayout) -> bool { false }
    
    /// 处理点击事件
    fn handle_click(&mut self, x: f64, y: f64, layout: &ChartLayout) -> bool { false }
    
    /// 处理滚轮事件
    fn handle_wheel(&mut self, delta: f64, x: f64, y: f64, layout: &ChartLayout) -> bool { false }
    
    /// 获取光标样式
    fn get_cursor_style(&self, x: f64, y: f64, layout: &ChartLayout) -> Option<CursorStyle> { None }
}

/// 缓存感知渲染器接口
pub trait CacheAwareRenderer: Renderer {
    /// 无效化缓存
    fn invalidate_cache(&mut self);
    
    /// 更新缓存
    fn update_cache(&mut self, data_manager: &Rc<RefCell<DataManager>>, layout: &ChartLayout);
    
    /// 缓存是否有效
    fn is_cache_valid(&self) -> bool;
}

/// 渲染策略接口 - 策略模式核心
pub trait RenderStrategy {
    /// 策略名称
    fn name(&self) -> &'static str;
    
    /// 执行渲染策略
    fn execute(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        theme: &ChartTheme,
        renderers: &[Box<dyn Renderer>],
    ) -> Result<(), String>;
    
    /// 获取该策略需要的渲染器列表
    fn required_renderers(&self) -> Vec<&'static str>;
    
    /// 验证渲染器是否兼容
    fn validate_renderers(&self, available_renderers: &[Box<dyn Renderer>]) -> bool;
}

/// 渲染优先级枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum RenderPriority {
    Critical = 0,
    High = 1,
    Normal = 2,
    Low = 3,
}

/// 光标样式枚举
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CursorStyle {
    Default,
    Pointer,
    Crosshair,
    Move,
    ResizeHorizontal,
    ResizeVertical,
    Grab,
    Grabbing,
}

/// 渲染器工厂 - 工厂模式核心
pub struct RendererFactory {
    /// 已注册的渲染器创建函数
    registry: HashMap<&'static str, Box<dyn Fn() -> Box<dyn Renderer>>>,
    
    /// 渲染器实例池
    instances: HashMap<String, Box<dyn Renderer>>,
    
    /// 渲染策略注册表
    strategies: HashMap<&'static str, Box<dyn RenderStrategy>>,
}

impl RendererFactory {
    /// 创建新的工厂
    pub fn new() -> Self {
        Self {
            registry: HashMap::new(),
            instances: HashMap::new(),
            strategies: HashMap::new(),
        }
    }
    
    /// 注册渲染器类型
    pub fn register_renderer<T: Renderer + 'static>(
        &mut self,
        name: &'static str,
        constructor: fn() -> T,
    ) {
        self.registry.insert(name, Box::new(move || {
            Box::new(constructor()) as Box<dyn Renderer>
        }));
    }
    
    /// 创建渲染器实例
    pub fn create_renderer(&mut self, name: &str) -> Result<Box<dyn Renderer>, String> {
        if let Some(constructor) = self.registry.get(name) {
            Ok(constructor())
        } else {
            Err(format!("Renderer '{}' not found", name))
        }
    }
    
    /// 注册渲染策略
    pub fn register_strategy<T: RenderStrategy + 'static>(
        &mut self,
        name: &'static str,
        strategy: T,
    ) {
        self.strategies.insert(name, Box::new(strategy));
    }
    
    /// 获取渲染策略
    pub fn get_strategy(&self, name: &str) -> Option<&Box<dyn RenderStrategy>> {
        self.strategies.get(name)
    }
    
    /// 批量创建渲染器
    pub fn create_renderers(
        &mut self,
        renderer_names: &[&'static str],
    ) -> Result<Vec<Box<dyn Renderer>>, String> {
        let mut renderers = Vec::new();
        for name in renderer_names {
            let renderer = self.create_renderer(name)?;
            renderers.push(renderer);
        }
        Ok(renderers)
    }
}

/// K线图渲染策略
pub struct KlineRenderStrategy;

impl RenderStrategy for KlineRenderStrategy {
    fn name(&self) -> &'static str {
        "kline"
    }
    
    fn execute(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        theme: &ChartTheme,
        renderers: &[Box<dyn Renderer>],
    ) -> Result<(), String> {
        // 按优先级排序渲染器
        let mut sorted_renderers: Vec<&Box<dyn Renderer>> = renderers.iter().collect();
        sorted_renderers.sort_by_key(|r| r.priority());
        
        // 执行渲染
        for renderer in sorted_renderers {
            if renderer.needs_render() {
                renderer.render(ctx, layout, data_manager, theme)?;
            }
        }
        
        Ok(())
    }
    
    fn required_renderers(&self) -> Vec<&'static str> {
        vec!["axis", "price", "volume", "line", "book"]
    }
    
    fn validate_renderers(&self, available_renderers: &[Box<dyn Renderer>]) -> bool {
        let available_names: Vec<_> = available_renderers.iter()
            .map(|r| r.name())
            .collect();
        
        self.required_renderers().iter()
            .all(|required| available_names.contains(required))
    }
}

/// 热图渲染策略
pub struct HeatmapRenderStrategy;

impl RenderStrategy for HeatmapRenderStrategy {
    fn name(&self) -> &'static str {
        "heatmap"
    }
    
    fn execute(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        theme: &ChartTheme,
        renderers: &[Box<dyn Renderer>],
    ) -> Result<(), String> {
        let mut sorted_renderers: Vec<&Box<dyn Renderer>> = renderers.iter().collect();
        sorted_renderers.sort_by_key(|r| r.priority());
        
        for renderer in sorted_renderers {
            if renderer.name() == "heat" || renderer.name() == "volume" || renderer.name() == "line" {
                if renderer.needs_render() {
                    renderer.render(ctx, layout, data_manager, theme)?;
                }
            }
        }
        
        Ok(())
    }
    
    fn required_renderers(&self) -> Vec<&'static str> {
        vec!["axis", "heat", "volume", "line", "book"]
    }
    
    fn validate_renderers(&self, available_renderers: &[Box<dyn Renderer>]) -> bool {
        let available_names: Vec<_> = available_renderers.iter()
            .map(|r| r.name())
            .collect();
        
        self.required_renderers().iter()
            .all(|required| available_names.contains(required))
    }
}

/// 渲染器管理器 - 整合工厂和策略
pub struct RendererManager {
    factory: RendererFactory,
    active_strategy: Option<String>,
    cached_renderers: HashMap<String, Vec<Box<dyn Renderer>>>,
}

impl RendererManager {
    pub fn new() -> Self {
        let mut manager = Self {
            factory: RendererFactory::new(),
            active_strategy: None,
            cached_renderers: HashMap::new(),
        };
        
        // 注册标准渲染器
        manager.register_standard_renderers();
        manager.register_standard_strategies();
        
        manager
    }
    
    /// 注册标准渲染器
    fn register_standard_renderers(&mut self) {
        // 注意：这些是注册函数，实际实现会适配现有渲染器
        self.factory.register_renderer("axis", || {
            Box::new(AdaptedAxisRenderer::new())
        });
        
        self.factory.register_renderer("price", || {
            Box::new(AdaptedPriceRenderer::new())
        });
        
        self.factory.register_renderer("volume", || {
            Box::new(AdaptedVolumeRenderer::new())
        });
        
        self.factory.register_renderer("heat", || {
            Box::new(AdaptedHeatRenderer::new())
        });
        
        self.factory.register_renderer("line", || {
            Box::new(AdaptedLineRenderer::new())
        });
        
        self.factory.register_renderer("book", || {
            Box::new(AdaptedBookRenderer::new())
        });
        
        self.factory.register_renderer("overlay", || {
            Box::new(AdaptedOverlayRenderer::new())
        });
        
        self.factory.register_renderer("datazoom", || {
            Box::new(AdaptedDataZoomRenderer::new())
        });
    }
    
    /// 注册标准渲染策略
    fn register_standard_strategies(&mut self) {
        self.factory.register_strategy("kline", KlineRenderStrategy);
        self.factory.register_strategy("heatmap", HeatmapRenderStrategy);
    }
    
    /// 设置渲染策略
    pub fn set_strategy(&mut self, strategy_name: &str) -> Result<(), String> {
        if self.factory.get_strategy(strategy_name).is_some() {
            self.active_strategy = Some(strategy_name.to_string());
            Ok(())
        } else {
            Err(format!("Strategy '{}' not found", strategy_name))
        }
    }
    
    /// 执行当前策略的渲染
    pub fn render(
        &mut self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        theme: &ChartTheme,
    ) -> Result<(), String> {
        let strategy_name = self.active_strategy.as_ref()
            .ok_or("No active strategy")?;
        
        let strategy = self.factory.get_strategy(strategy_name)
            .ok_or("Strategy not found")?;
        
        // 获取或创建渲染器
        let renderers = self.get_renderers_for_strategy(strategy_name)?;
        
        // 验证渲染器
        if !strategy.validate_renderers(&renderers) {
            return Err("Required renderers not available".to_string());
        }
        
        // 执行渲染策略
        strategy.execute(ctx, layout, data_manager, theme, &renderers)
    }
    
    /// 获取策略所需的渲染器
    fn get_renderers_for_strategy(
        &mut self,
        strategy_name: &str,
    ) -> Result<Vec<Box<dyn Renderer>>, String> {
        if let Some(cached) = self.cached_renderers.get(strategy_name) {
            return Ok(cached.clone());
        }
        
        let strategy = self.factory.get_strategy(strategy_name)
            .ok_or("Strategy not found")?;
        
        let required = strategy.required_renderers();
        let renderers = self.factory.create_renderers(&required)?;
        
        // 缓存渲染器
        self.cached_renderers.insert(strategy_name.to_string(), renderers.clone());
        
        Ok(renderers)
    }
}

// 适配器模式 - 将现有渲染器适配到新接口
// 这些适配器将在实际实现时基于现有代码创建
struct AdaptedAxisRenderer;
struct AdaptedPriceRenderer;
struct AdaptedVolumeRenderer;
struct AdaptedHeatRenderer;
struct AdaptedLineRenderer;
struct AdaptedBookRenderer;
struct AdaptedOverlayRenderer;
struct AdaptedDataZoomRenderer;

impl AdaptedAxisRenderer {
    fn new() -> Self { Self }
}

impl AdaptedPriceRenderer {
    fn new() -> Self { Self }
}

impl AdaptedVolumeRenderer {
    fn new() -> Self { Self }
}

impl AdaptedHeatRenderer {
    fn new() -> Self { Self }
}

impl AdaptedLineRenderer {
    fn new() -> Self { Self }
}

impl AdaptedBookRenderer {
    fn new() -> Self { Self }
}

impl AdaptedOverlayRenderer {
    fn new() -> Self { Self }
}

impl AdaptedDataZoomRenderer {
    fn new() -> Self { Self }
}