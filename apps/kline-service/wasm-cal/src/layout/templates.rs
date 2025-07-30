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
                                    // 新增一个VBox来容纳可变高度的图表
                                    LayoutNode::VBox {
                                        id: PaneId::Custom("ChartsContainer".to_string()),
                                        constraint: Constraint::Fill,
                                        children: vec![
                                            // 主图表（K线/热图）
                                            LayoutNode::Pane {
                                                id: PaneId::HeatmapArea,
                                                constraint: main_chart_constraint,
                                            },
                                            // 成交量图（与HeatmapArea同宽）
                                            LayoutNode::Pane {
                                                id: PaneId::VolumeChart,
                                                constraint: volume_chart_constraint,
                                            },
                                        ],
                                    },
                                    // 时间轴（固定高度）
                                    LayoutNode::Pane {
                                        id: PaneId::TimeAxis,
                                        constraint: Constraint::Fixed(30.0),
                                    },
                                    // 导航器（固定高度）
                                    LayoutNode::Pane {
                                        id: PaneId::NavigatorContainer,
                                        constraint: Constraint::Fixed(40.0),
                                    },
                                ],
                            },
                        ],
                    },
                    // 右侧订单簿: 固定宽度20%
                    LayoutNode::Pane {
                        id: PaneId::OrderBook,
                        constraint: Constraint::Percent(20.0),
                    },
                ],
            },
        ],
    }
}
