//! Canvas层定义

/// Canvas层类型
pub enum CanvasLayerType {
    /// 底层Canvas - 用于绘制静态元素（坐标轴、网格线等）
    Base,
    /// 中间层Canvas - 用于绘制主要图表元素（K线、成交量等）
    Main,
    /// 顶层Canvas - 用于绘制交互元素（十字光标、提示框等）
    Overlay,
}
