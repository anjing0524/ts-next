//! Canvas管理器 - 管理多层Canvas

use super::{get_canvas_context, layer::CanvasLayerType};
use crate::layout::ChartLayout;
use crate::utils::WasmError;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::{OffscreenCanvas, OffscreenCanvasRenderingContext2d};

/// Canvas管理器 - 管理三层Canvas
pub struct CanvasManager {
    /// 底层Canvas上下文 - 用于绘制静态元素
    pub base_ctx: OffscreenCanvasRenderingContext2d,
    /// 中间层Canvas上下文 - 用于绘制主要图表元素
    pub main_ctx: OffscreenCanvasRenderingContext2d,
    /// 顶层Canvas上下文 - 用于绘制交互元素
    pub overlay_ctx: OffscreenCanvasRenderingContext2d,
    /// 图表布局
    pub layout: Rc<RefCell<ChartLayout>>,
}

impl CanvasManager {
    /// 创建Canvas管理器
    pub fn new(
        base_canvas: &OffscreenCanvas,
        main_canvas: &OffscreenCanvas,
        overlay_canvas: &OffscreenCanvas,
        layout: ChartLayout,
    ) -> Result<Self, WasmError> {
        // 获取Canvas上下文
        let base_ctx = get_canvas_context(base_canvas)?;
        let main_ctx = get_canvas_context(main_canvas)?;
        let overlay_ctx = get_canvas_context(overlay_canvas)?;

        Ok(Self {
            base_ctx,
            main_ctx,
            overlay_ctx,
            layout: Rc::new(RefCell::new(layout)),
        })
    }

    /// 获取指定层的Canvas上下文
    pub fn get_context(&self, layer_type: CanvasLayerType) -> &OffscreenCanvasRenderingContext2d {
        match layer_type {
            CanvasLayerType::Base => &self.base_ctx,
            CanvasLayerType::Main => &self.main_ctx,
            CanvasLayerType::Overlay => &self.overlay_ctx,
        }
    }
}
