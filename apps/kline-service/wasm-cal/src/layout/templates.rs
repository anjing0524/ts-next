//! 布局模板模块 - 根据渲染模式动态生成布局定义

use crate::layout::definition::{Constraint, LayoutNode, PaneId};
use crate::render::chart_renderer::RenderMode;

/// 根据当前的渲染模式，生成对应的布局定义树
pub fn create_layout_template(mode: RenderMode) -> LayoutNode {
    // 1. 定义模式切换时会发生变化的部分
    //    在这里，是主图区（价格/热图）和成交量图的高度约束
    let (main_chart_constraint, volume_chart_constraint) = match mode {
        RenderMode::Kmap => {
            // K线图模式下，价格图占80%，成交量图占20%
            (Constraint::Percent(80.0), Constraint::Percent(20.0))
        }
        RenderMode::Heatmap => {
            // 热图模式下，热图占90%，成交量图被压缩为10%
            (Constraint::Percent(90.0), Constraint::Percent(10.0))
        }
    };

    // 2. 构建重构后的布局树，确保宽度对齐
    LayoutNode::VBox {
        id: PaneId::Root,
        constraint: Constraint::Fill,
        children: vec![
            // 顶部 Header: 固定高度
            LayoutNode::Pane {
                id: PaneId::Header,
                constraint: Constraint::Fixed(25.0),
            },
            // 中间主内容区: 填充剩余空间
            LayoutNode::HBox {
                id: PaneId::MainContent,
                constraint: Constraint::Fill,
                children: vec![
                    // 左侧图表主体区域: 包含YAxis和所有图表元素
                    LayoutNode::HBox {
                        id: PaneId::ChartArea,
                        constraint: Constraint::Fill,
                        children: vec![
                            // 左侧YAxis: 固定宽度
                            LayoutNode::Pane {
                                id: PaneId::YAxis,
                                constraint: Constraint::Fixed(60.0),
                            },
                            // 右侧图表内容区域: 垂直排列
                            LayoutNode::VBox {
                                id: PaneId::DrawingArea,
                                constraint: Constraint::Fill,
                                children: vec![
                                    // 主图表区域: 包含图表和订单簿
                                    LayoutNode::VBox {
                                        id: PaneId::Custom("ChartsContainer".to_string()),
                                        constraint: Constraint::Fill,
                                        children: vec![
                                            // 主图表（K线/热图）和订单簿
                                            LayoutNode::HBox {
                                                id: PaneId::Custom(
                                                    "HeatmapWithOrderBook".to_string(),
                                                ),
                                                constraint: main_chart_constraint,
                                                children: vec![
                                                    // 左侧K线/热图区域
                                                    LayoutNode::Pane {
                                                        id: PaneId::HeatmapArea,
                                                        constraint: Constraint::Percent(80.0),
                                                    },
                                                    // 右侧订单簿: 只与HeatmapArea等高
                                                    LayoutNode::Pane {
                                                        id: PaneId::OrderBook,
                                                        constraint: Constraint::Percent(20.0),
                                                    },
                                                ],
                                            },
                                            // 成交量图区域（与HeatmapArea等宽）
                                            LayoutNode::HBox {
                                                id: PaneId::Custom(
                                                    "VolumeChartWrapper".to_string(),
                                                ),
                                                constraint: volume_chart_constraint,
                                                children: vec![
                                                    // 左侧成交量图（与HeatmapArea同宽）
                                                    LayoutNode::Pane {
                                                        id: PaneId::VolumeChart,
                                                        constraint: Constraint::Percent(80.0),
                                                    },
                                                    // 右侧空白区域（与OrderBook对齐）
                                                    LayoutNode::Pane {
                                                        id: PaneId::Custom(
                                                            "VolumeChartSpacer".to_string(),
                                                        ),
                                                        constraint: Constraint::Percent(20.0),
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                    // 时间轴（固定高度）
                                    LayoutNode::Pane {
                                        id: PaneId::TimeAxis,
                                        constraint: Constraint::Fixed(30.0),
                                    },
                                    // 导航器（固定高度）- 与主图等宽
                                    LayoutNode::HBox {
                                        id: PaneId::Custom("NavigatorWrapper".to_string()),
                                        constraint: Constraint::Fixed(40.0),
                                        children: vec![
                                            // 导航器主体区域（与MainChartWrapper结构对齐）
                                            LayoutNode::HBox {
                                                id: PaneId::Custom(
                                                    "NavigatorMainWrapper".to_string(),
                                                ),
                                                constraint: Constraint::Fill,
                                                children: vec![
                                                    // 导航器容器（与HeatmapArea对齐）
                                                    LayoutNode::Pane {
                                                        id: PaneId::NavigatorContainer,
                                                        constraint: Constraint::Percent(80.0),
                                                    },
                                                    // 右侧空白区域（与OrderBook对齐）
                                                    LayoutNode::Pane {
                                                        id: PaneId::Custom(
                                                            "NavigatorRightSpacer".to_string(),
                                                        ),
                                                        constraint: Constraint::Percent(20.0),
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    }
}
