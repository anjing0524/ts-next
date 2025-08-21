//! DataZoom/CommandManager 光标样式决策单元测试

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use wasm_bindgen_test::*;

use kline_processor::canvas::CanvasManager;
use kline_processor::command::manager::CommandManager;
use kline_processor::command::state::MouseState;
use kline_processor::config::{ChartConfig, ChartTheme};
use kline_processor::data::DataManager;
use kline_processor::layout::{ChartLayout, PaneId, Rect};
use kline_processor::render::chart_renderer::RenderMode;
use kline_processor::render::cursor_style::CursorStyle;
use kline_processor::render::datazoom_renderer::{DataZoomRenderer, DragHandleType};
use kline_processor::render::render_context::{RenderContext, SharedRenderState};
use kline_processor::render::strategy::RenderStrategy;
use kline_processor::render::strategy::strategy_factory::RenderStrategyFactory;

// 浏览器端运行配置：使用 wasm-bindgen-test 在浏览器环境执行，用于配合 `wasm-pack test --headless --chrome`
wasm_bindgen_test_configure!(run_in_browser);

/// 创建测试用的共享渲染状态
fn create_test_shared_state() -> SharedRenderState {
    // 使用 Rc<RefCell<...>> 按 SharedRenderState::new 的签名构造
    let canvas_manager = Rc::new(RefCell::new(CanvasManager::new_uninitialized()));
    let data_manager = Rc::new(RefCell::new(DataManager::new()));
    let layout = Rc::new(RefCell::new(create_test_chart_layout()));
    let theme = Rc::new(ChartTheme::default());
    let config = None::<Rc<ChartConfig>>; // SharedRenderState 接受 Option<Rc<ChartConfig>>
    let strategy_factory = Rc::new(RefCell::new(RenderStrategyFactory::default()));
    let mouse_state = Rc::new(RefCell::new(MouseState::default()));
    let mode = Rc::new(RefCell::new(RenderMode::Kmap));

    SharedRenderState::new(
        canvas_manager,
        data_manager,
        layout,
        theme,
        config,
        strategy_factory,
        mouse_state,
        mode,
    )
}

/// 创建测试用的图表布局，包含导航器区域和主图区域
fn create_test_chart_layout() -> ChartLayout {
    // 使用 HashMap<PaneId, Rect> 构造最终布局
    // 包含 NavigatorContainer、HeatmapArea、VolumeChart 三个关键区域
    let mut panes: HashMap<PaneId, Rect> = HashMap::new();
    // 导航器区域：x: 50-650, y: 400-450
    panes.insert(
        PaneId::NavigatorContainer,
        Rect {
            x: 50.0,
            y: 400.0,
            width: 600.0,
            height: 50.0,
        },
    );
    // 主图（热图）区域：x: 50-650, y: 50-350
    panes.insert(
        PaneId::HeatmapArea,
        Rect {
            x: 50.0,
            y: 50.0,
            width: 600.0,
            height: 300.0,
        },
    );
    // 成交量区域：x: 50-650, y: 350-400
    panes.insert(
        PaneId::VolumeChart,
        Rect {
            x: 50.0,
            y: 350.0,
            width: 600.0,
            height: 50.0,
        },
    );

    // 假设显示100根K线
    ChartLayout::new(panes, 100)
}

#[wasm_bindgen_test]
fn test_command_manager_cursor_in_navigator_area() {
    // 测试导航器区域内的光标样式决策
    let shared_state = create_test_shared_state();
    let command_manager = CommandManager::new(shared_state);

    // 在导航器区域内的点 (300, 425)
    let cursor_style = command_manager.get_cursor_style_at(300.0, 425.0);

    // 应该返回某种有效的光标样式（不是None）
    assert_ne!(cursor_style, CursorStyle::Default);

    // 具体样式取决于DataZoomRenderer的内部状态，这里先验证非None
    println!("Navigator area cursor style: {:?}", cursor_style);
}

#[wasm_bindgen_test]
fn test_command_manager_cursor_in_chart_area() {
    // 测试主图区域的十字光标
    let shared_state = create_test_shared_state();
    let command_manager = CommandManager::new(shared_state);

    // 在主图区域内的点 (300, 200)
    let cursor_style = command_manager.get_cursor_style_at(300.0, 200.0);
    assert_eq!(cursor_style, CursorStyle::Crosshair);

    // 在成交量区域内的点 (300, 375)
    let cursor_style = command_manager.get_cursor_style_at(300.0, 375.0);
    assert_eq!(cursor_style, CursorStyle::Crosshair);
}

#[wasm_bindgen_test]
fn test_command_manager_cursor_outside_chart() {
    // 测试图表区域外的默认光标
    let shared_state = create_test_shared_state();
    let command_manager = CommandManager::new(shared_state);

    // 在所有区域外的点 (10, 10)
    let cursor_style = command_manager.get_cursor_style_at(10.0, 10.0);
    assert_eq!(cursor_style, CursorStyle::Default);

    // 在右侧外的点 (700, 200)
    let cursor_style = command_manager.get_cursor_style_at(700.0, 200.0);
    assert_eq!(cursor_style, CursorStyle::Default);
}

#[wasm_bindgen_test]
fn test_datazoom_renderer_cursor_not_in_navigator() {
    // 测试DataZoomRenderer在非导航器区域返回默认光标
    let datazoom_renderer = DataZoomRenderer::new();
    let shared_state = create_test_shared_state();
    let ctx = RenderContext::from_shared(shared_state);

    // 在导航器外的点 (300, 200)
    let cursor_style = datazoom_renderer.get_cursor_style(300.0, 200.0, &ctx);
    assert_eq!(cursor_style, CursorStyle::Default);
}

#[wasm_bindgen_test]
fn test_datazoom_renderer_cursor_in_navigator_no_handle() {
    // 测试导航器区域内但不在拖拽手柄上的光标样式
    let datazoom_renderer = DataZoomRenderer::new();
    let shared_state = create_test_shared_state();
    let ctx = RenderContext::from_shared(shared_state);

    // 在导航器中央区域 (300, 425)，不在手柄上
    let cursor_style = datazoom_renderer.get_cursor_style(300.0, 425.0, &ctx);
    assert_eq!(cursor_style, CursorStyle::Pointer);
}

#[wasm_bindgen_test]
fn test_datazoom_renderer_cursor_during_drag() {
    // 测试拖拽过程中的光标样式
    let mut datazoom_renderer = DataZoomRenderer::new();
    let shared_state = create_test_shared_state();
    let ctx = RenderContext::from_shared(shared_state);

    // 模拟开始拖拽（设置拖拽状态）
    // 注意：这里需要通过公共API设置拖拽状态，而不是直接修改内部字段

    // 先测试鼠标按下开始拖拽
    let handled = datazoom_renderer.handle_mouse_down(300.0, 425.0, &ctx);

    // 如果处理了鼠标按下事件，检查拖拽中的光标样式
    if handled {
        // 在拖拽过程中检查光标样式
        let cursor_style = datazoom_renderer.get_cursor_style(350.0, 425.0, &ctx);

        // 拖拽中的光标样式应该根据拖拽类型而定
        match cursor_style {
            CursorStyle::EwResize | CursorStyle::Grabbing | CursorStyle::Default => {
                // 这些都是有效的拖拽中光标样式
            }
            _ => panic!("Unexpected cursor style during drag: {:?}", cursor_style),
        }
    }
}

/// 测试 DataZoomRenderer 的手柄检测逻辑
///
/// 该测试验证在空数据状态下，`get_handle_at_position` 函数对不同位置的鼠标坐标
/// 能否正确返回 `DragHandleType::None`，确保在没有数据时不会误检测到拖拽手柄。
///
/// 测试覆盖场景：
/// - 导航器区域左边缘附近：应返回 None（因无数据无可见范围）
/// - 导航器区域右边缘附近：应返回 None（因无数据无可见范围）
/// - 导航器区域中央：应返回 None（因无数据无可见范围）
/// - 导航器区域外部：应返回 None（超出导航器边界）
#[wasm_bindgen_test]
fn test_datazoom_handle_detection() {
    // 测试拖拽手柄检测逻辑
    let datazoom_renderer = DataZoomRenderer::new();
    let shared_state = create_test_shared_state();
    let layout = shared_state.layout.borrow();
    let data_manager = shared_state.data_manager.borrow();

    // 在当前测试构造中 DataManager 为空，因此所有检测都应为 None
    // 左边缘附近
    let left_handle = datazoom_renderer.get_handle_at_position(55.0, 425.0, &layout, &data_manager);
    assert_eq!(left_handle, DragHandleType::None);

    // 右边缘附近
    let right_handle =
        datazoom_renderer.get_handle_at_position(645.0, 425.0, &layout, &data_manager);
    assert_eq!(right_handle, DragHandleType::None);

    // 中央区域
    let middle_handle =
        datazoom_renderer.get_handle_at_position(300.0, 425.0, &layout, &data_manager);
    assert_eq!(middle_handle, DragHandleType::None);

    // 导航器外部
    let outside_handle =
        datazoom_renderer.get_handle_at_position(300.0, 200.0, &layout, &data_manager);
    assert_eq!(outside_handle, DragHandleType::None);
}

/// 测试 CommandManager 的鼠标状态更新机制
///
/// 该测试验证 `CommandManager::update_hover_status` 函数能否正确更新共享状态中的
/// 鼠标位置信息，确保交互系统能准确跟踪鼠标位置以支持悬浮效果和交互响应。
///
/// 测试覆盖场景：
/// - 调用 `update_hover_status` 更新鼠标坐标
/// - 验证 `MouseState` 中的 `is_in_chart_area` 标志被正确设置
#[wasm_bindgen_test]
fn test_mouse_state_update() {
    // 测试鼠标状态更新逻辑
    let shared_state = create_test_shared_state();
    let command_manager = CommandManager::new(shared_state);

    // 更新鼠标悬停状态
    command_manager.update_hover_status(300.0, 200.0);

    // 检查鼠标状态是否正确更新
    let mouse_state = command_manager.shared_state.mouse_state.borrow();
    assert!(mouse_state.is_in_chart_area);

    // 在图表外更新状态
    drop(mouse_state);
    command_manager.update_hover_status(10.0, 10.0);
    let mouse_state = command_manager.shared_state.mouse_state.borrow();
    assert!(!mouse_state.is_in_chart_area);
}
