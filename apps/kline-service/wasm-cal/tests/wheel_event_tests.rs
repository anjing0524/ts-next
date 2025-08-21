//! 滚轮事件处理单元测试
//!
//! 测试主图与导航器区域的滚轮缩放功能，包括：
//! - 边界检测和区域判定
//! - 缩放中心计算
//! - 平滑因子和缩放限制
//! - 事件路由和CommandResult返回值

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use wasm_bindgen_test::*;

use kline_processor::canvas::CanvasLayerType;
use kline_processor::canvas::CanvasManager;
use kline_processor::command::event::Event;
use kline_processor::command::manager::CommandManager;
use kline_processor::command::result::CommandResult;
use kline_processor::command::state::MouseState;
use kline_processor::config::{ChartConfig, ChartTheme};
use kline_processor::data::DataManager;
use kline_processor::kline_generated::kline::KlineDataArgs;
use kline_processor::kline_generated::kline::{KlineData, KlineItem, KlineItemArgs};
use kline_processor::layout::{ChartLayout, PaneId, Rect};
use kline_processor::render::chart_renderer::RenderMode;
use kline_processor::render::render_context::SharedRenderState;
use kline_processor::render::strategy::strategy_factory::RenderStrategyFactory;

// 浏览器端运行配置
// 配置测试在浏览器环境中运行
// wasm_bindgen_test_configure!(run_in_browser);

/// 创建测试用的共享渲染状态
fn create_test_shared_state() -> SharedRenderState {
    let canvas_manager = Rc::new(RefCell::new(CanvasManager::new_uninitialized()));
    let data_manager = Rc::new(RefCell::new(DataManager::new()));
    let layout = Rc::new(RefCell::new(create_test_chart_layout()));
    let theme = Rc::new(ChartTheme::default());
    let config = None::<Rc<ChartConfig>>;
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

/// 创建测试用的图表布局
fn create_test_chart_layout() -> ChartLayout {
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

    // 主图区域：x: 50-650, y: 50-350
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

    ChartLayout::new(panes, 10)
}

/// 创建测试用的K线数据（FlatBuffer格式）
fn create_test_kline_data(count: usize) -> Vec<u8> {
    use flatbuffers::FlatBufferBuilder;

    let mut builder = FlatBufferBuilder::new();

    // 创建K线数据项
    let mut items = Vec::new();
    for i in 0..count {
        let item = KlineItem::create(
            &mut builder,
            &KlineItemArgs {
                timestamp: i as i32,
                open: 100.0 + i as f64,
                high: 105.0 + i as f64,
                low: 95.0 + i as f64,
                close: 102.0 + i as f64,
                b_vol: 500.0 + i as f64 * 5.0,
                s_vol: 500.0 + i as f64 * 5.0,
                volumes: None,
                last_price: 102.0 + i as f64,
                bid_price: 101.5 + i as f64,
                ask_price: 102.5 + i as f64,
            },
        );
        items.push(item);
    }

    // 创建K线数据向量
    let items_vector = builder.create_vector(&items);

    // 创建根对象
    let kline_data = KlineData::create(
        &mut builder,
        &KlineDataArgs {
            items: Some(items_vector),
            tick: 0.01,
        },
    );

    builder.finish(kline_data, None);
    builder.finished_data().to_vec()
}

/// 测试导航器区域内的滚轮事件处理
///
/// 验证在导航器区域内滚动时，事件被正确路由到 DataZoomRenderer，
/// 并返回 CommandResult::Redraw(CanvasLayerType::Overlay)
#[wasm_bindgen_test]
fn test_wheel_event_in_navigator_area() {
    let shared_state = create_test_shared_state();
    let mut command_manager = CommandManager::new(shared_state.clone());

    // 添加测试数据 - DataZoomRenderer需要数据才能处理滚轮事件
    {
        let mut data_manager = shared_state.data_manager.borrow_mut();
        let test_data = create_test_kline_data(100);
        data_manager.set_initial_data(test_data);
    }

    // 验证数据已正确设置
    {
        let data_manager = shared_state.data_manager.borrow();
        assert!(
            data_manager.len() > 0,
            "测试数据应该已设置，实际长度: {}",
            data_manager.len()
        );
    }

    // 在导航器区域中心位置 (350, 425) 进行滚轮事件
    web_sys::console::log_1(&"开始执行导航器区域滚轮事件测试".into());
    let result = command_manager.execute(Event::Wheel {
        delta: -1.0,
        x: 350.0,
        y: 425.0,
    });
    web_sys::console::log_1(&format!("滚轮事件结果: {:?}", result).into());

    // 导航器区域应返回 Overlay 重绘
    match result {
        CommandResult::Redraw(layer_type) => {
            assert_eq!(layer_type, CanvasLayerType::Overlay);
        }
        _ => panic!(
            "导航器区域滚轮事件应返回 Redraw(Overlay)，实际返回: {:?}",
            result
        ),
    }
}

/// 测试主图区域内的滚轮事件处理
///
/// 验证在主图区域内滚动时，事件被正确路由到 DataManager，
/// 并返回 CommandResult::LayoutChanged
#[wasm_bindgen_test]
fn test_wheel_event_in_main_chart_area() {
    let shared_state = create_test_shared_state();
    let mut command_manager = CommandManager::new(shared_state.clone());

    // 添加测试数据
    {
        let mut data_manager = shared_state.data_manager.borrow_mut();
        let test_data = create_test_kline_data(100);
        data_manager.set_initial_data(test_data);
    }

    // 在主图区域中心位置 (350, 200) 进行滚轮事件
    let result = command_manager.execute(Event::Wheel {
        delta: -1.0,
        x: 350.0,
        y: 200.0,
    });

    // 主图区域应返回 LayoutChanged
    match result {
        CommandResult::LayoutChanged => {
            // 验证通过
        }
        _ => panic!("主图区域滚轮事件应返回 LayoutChanged"),
    }
}

/// 测试区域外的滚轮事件处理
///
/// 验证在图表区域外滚动时，返回 CommandResult::None
#[wasm_bindgen_test]
fn test_wheel_event_outside_chart_areas() {
    let shared_state = create_test_shared_state();
    let mut command_manager = CommandManager::new(shared_state.clone());

    // 在图表区域外 (10, 10) 进行滚轮事件
    let result = command_manager.execute(Event::Wheel {
        delta: -1.0,
        x: 10.0,
        y: 10.0,
    });

    // 区域外应返回 None
    match result {
        CommandResult::None => {
            // 验证通过
        }
        _ => panic!("图表区域外滚轮事件应返回 None"),
    }
}

/// 测试导航器区域优先级
///
/// 验证当鼠标位置同时在导航器和主图区域边界时，
/// 导航器区域具有更高的优先级
#[wasm_bindgen_test]
fn test_navigator_area_priority() {
    let shared_state = create_test_shared_state();
    let mut command_manager = CommandManager::new(shared_state.clone());

    // 添加测试数据
    {
        let mut data_manager = shared_state.data_manager.borrow_mut();
        let test_data = create_test_kline_data(100);
        data_manager.set_initial_data(test_data);
    }

    // 在导航器区域上边界 (350, 400) 进行滚轮事件
    // 这个位置既在导航器区域内，也可能被认为在主图区域边界
    let result = command_manager.execute(Event::Wheel {
        delta: -1.0,
        x: 350.0,
        y: 400.0,
    });

    // 应该优先处理为导航器区域
    match result {
        CommandResult::Redraw(layer_type) => {
            assert_eq!(layer_type, CanvasLayerType::Overlay);
        }
        _ => panic!("边界位置应优先处理为导航器区域"),
    }
}

/// 测试缩放中心计算
///
/// 验证 DataManager 的 handle_wheel 方法能正确处理不同鼠标位置的缩放中心
#[wasm_bindgen_test]
fn test_zoom_center_calculation() {
    let shared_state = create_test_shared_state();
    let mut data_manager = shared_state.data_manager.borrow_mut();

    // 添加测试数据
    let test_data = create_test_kline_data(100);
    data_manager.set_initial_data(test_data);

    // 获取主图区域信息
    let layout = shared_state.layout.borrow();
    let main_rect = layout.get_rect(&PaneId::HeatmapArea);

    // 测试左边缘缩放
    let mut command_manager = CommandManager::new(shared_state.clone());
    let left_result = command_manager.execute(Event::Wheel {
        delta: -1.0,
        x: main_rect.x + 10.0,
        y: main_rect.y + main_rect.height / 2.0,
    });
    assert!(
        matches!(left_result, CommandResult::LayoutChanged),
        "左边缘缩放应该成功"
    );

    // 测试右边缘缩放
    let right_result = command_manager.execute(Event::Wheel {
        delta: -1.0,
        x: main_rect.x + main_rect.width - 10.0,
        y: main_rect.y + main_rect.height / 2.0,
    });
    assert!(
        matches!(right_result, CommandResult::LayoutChanged),
        "右边缘缩放应该成功"
    );

    // 测试中心缩放
    let center_result = command_manager.execute(Event::Wheel {
        delta: -1.0,
        x: main_rect.x + main_rect.width / 2.0,
        y: main_rect.y + main_rect.height / 2.0,
    });
    assert!(
        matches!(center_result, CommandResult::LayoutChanged),
        "中心缩放应该成功"
    );
}

/// 测试缩放边界限制
///
/// 验证缩放操作不会超出数据边界，确保至少显示1个数据点
#[wasm_bindgen_test]
fn test_zoom_boundary_limits() {
    let shared_state = create_test_shared_state();
    let mut data_manager = shared_state.data_manager.borrow_mut();

    // 添加少量测试数据
    let test_data = create_test_kline_data(5);
    data_manager.set_initial_data(test_data);

    let layout = shared_state.layout.borrow();
    let main_rect = layout.get_rect(&PaneId::HeatmapArea);

    // 连续放大缩放，测试边界限制
    drop(data_manager);
    let mut command_manager = CommandManager::new(shared_state.clone());
    for _ in 0..20 {
        command_manager.execute(Event::Wheel {
            delta: -5.0, // 大幅缩放
            x: main_rect.x + main_rect.width / 2.0,
            y: main_rect.y + main_rect.height / 2.0,
        });
    }

    // 验证可见范围仍然有效
    let data_manager = shared_state.data_manager.borrow();
    let visible_range = data_manager.get_visible_range();
    let (start, count, _end) = visible_range.get_range();
    assert!(count >= 1, "至少应显示1个数据点");
    assert!(start < 5, "起始索引应在数据范围内");
    assert!(start + count <= 5, "结束索引应在数据范围内");
}

/// 测试空数据状态下的滚轮事件
///
/// 验证在没有数据时，滚轮事件不会引起错误或异常行为
#[wasm_bindgen_test]
fn test_wheel_event_with_empty_data() {
    let shared_state = create_test_shared_state();
    let mut command_manager = CommandManager::new(shared_state.clone());

    // 不添加任何数据，直接测试滚轮事件

    // 导航器区域
    let navigator_result = command_manager.execute(Event::Wheel {
        delta: -1.0,
        x: 350.0,
        y: 425.0,
    });
    match navigator_result {
        CommandResult::None => {
            // 空数据时导航器应返回 None
        }
        _ => panic!("空数据时导航器区域应返回 None"),
    }

    // 主图区域
    let main_result = command_manager.execute(Event::Wheel {
        delta: -1.0,
        x: 350.0,
        y: 200.0,
    });
    match main_result {
        CommandResult::None => {
            // 空数据时主图应返回 None
        }
        _ => panic!("空数据时主图区域应返回 None"),
    }
}

/// 测试平滑缩放因子
///
/// 验证不同的 delta 值产生合适的缩放效果
#[wasm_bindgen_test]
fn test_smooth_zoom_factors() {
    let shared_state = create_test_shared_state();
    let mut data_manager = shared_state.data_manager.borrow_mut();

    // 添加测试数据
    let test_data = create_test_kline_data(100);
    data_manager.set_initial_data(test_data);

    let layout = shared_state.layout.borrow();
    let main_rect = layout.get_rect(&PaneId::HeatmapArea);

    // 记录初始可见数量
    let (_start, initial_count, _end) = data_manager.get_visible_range().get_range();

    // 测试小幅缩放
    drop(data_manager);
    let mut command_manager = CommandManager::new(shared_state.clone());
    command_manager.execute(Event::Wheel {
        delta: -0.5, // 小幅缩放
        x: main_rect.x + main_rect.width / 2.0,
        y: main_rect.y + main_rect.height / 2.0,
    });
    let data_manager = shared_state.data_manager.borrow();
    let (_start, small_zoom_count, _end) = data_manager.get_visible_range().get_range();
    drop(data_manager);

    // 重置数据
    let reset_data = create_test_kline_data(100);
    {
        let mut data_manager = shared_state.data_manager.borrow_mut();
        data_manager.set_initial_data(reset_data);
    }

    // 测试大幅缩放
    command_manager.execute(Event::Wheel {
        delta: -2.0, // 大幅缩放
        x: main_rect.x + main_rect.width / 2.0,
        y: main_rect.y + main_rect.height / 2.0,
    });
    let data_manager = shared_state.data_manager.borrow();
    let (_start, large_zoom_count, _end) = data_manager.get_visible_range().get_range();

    // 验证缩放效果的差异
    assert!(
        small_zoom_count != initial_count || large_zoom_count != initial_count,
        "缩放应该改变可见数量"
    );

    // 验证所有结果都在合理范围内
    assert!(small_zoom_count >= 1, "小幅缩放后至少显示1个数据点");
    assert!(large_zoom_count >= 1, "大幅缩放后至少显示1个数据点");
}
