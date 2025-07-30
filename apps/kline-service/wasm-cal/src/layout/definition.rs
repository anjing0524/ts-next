//! 布局定义模块 - 描述布局的声明式数据结构

/// 描述一个布局节点，采用声明式定义
#[derive(Debug, Clone)]
pub enum LayoutNode {
    /// 一个具体的面板，是布局树的叶子节点
    Pane { id: PaneId, constraint: Constraint },
    /// 垂直容器 (子节点垂直排列)
    VBox {
        id: PaneId,
        children: Vec<LayoutNode>,
        constraint: Constraint,
    },
    /// 水平容器 (子节点水平排列)
    HBox {
        id: PaneId,
        children: Vec<LayoutNode>,
        constraint: Constraint,
    },
}

/// 定义节点的尺寸约束
#[derive(Debug, Clone, Copy)]
pub enum Constraint {
    /// 固定像素值
    Fixed(f64),
    /// 占父容器可用空间的百分比
    Percent(f64), // 0.0 to 100.0
    /// 填充剩余所有可用空间 (flex-grow: 1)
    Fill,
}

/// 唯一标识符，用于在计算后查找特定面板的矩形区域
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum PaneId {
    Root,
    Header,
    MainContent,
    ChartArea,
    YAxis,
    DrawingArea,
    HeatmapArea, // K线或热图区域
    OrderBook,
    VolumeChart,
    TimeAxis,
    NavigatorContainer,
    // 可以添加自定义ID
    Custom(String),
}

/// 定义一个矩形区域
#[derive(Clone, Copy, Debug, Default)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    /// 检查一个点是否在该矩形区域内
    pub fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.x + self.width && y >= self.y && y <= self.y + self.height
    }
}
