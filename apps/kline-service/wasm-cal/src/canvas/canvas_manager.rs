//! Canvas管理器 - 管理多层Canvas

use super::{get_canvas_context, layer::CanvasLayerType};
use crate::utils::WasmCalError;
use web_sys::{OffscreenCanvas, OffscreenCanvasRenderingContext2d};

/// Canvas管理器 - 管理三层Canvas
pub struct CanvasManager {
    /// 底层Canvas上下文 - 用于绘制静态元素
    pub base_ctx: Option<OffscreenCanvasRenderingContext2d>,
    /// 中间层Canvas上下文 - 用于绘制主要图表元素
    pub main_ctx: Option<OffscreenCanvasRenderingContext2d>,
    /// 顶层Canvas上下文 - 用于绘制交互元素
    pub overlay_ctx: Option<OffscreenCanvasRenderingContext2d>,
    /// 底层是否需要重绘
    base_dirty: bool,
    /// 中间层是否需要重绘
    main_dirty: bool,
    /// 顶层是否需要重绘
    overlay_dirty: bool,
}

impl CanvasManager {
    /// 创建一个未初始化的Canvas管理器
    ///
    /// 使用场景：当还无法立即获取到 OffscreenCanvas 上下文时，可以先创建占位的管理器。
    /// 后续通过 new(...) 进行完整初始化。
    pub fn new_uninitialized() -> Self {
        Self {
            base_ctx: None,
            main_ctx: None,
            overlay_ctx: None,
            base_dirty: true,
            main_dirty: true,
            overlay_dirty: true,
        }
    }

    /// 创建Canvas管理器
    ///
    /// 参数：
    /// - base_canvas: 底层 OffscreenCanvas
    /// - main_canvas: 主渲染 OffscreenCanvas
    /// - overlay_canvas: 交互覆盖 OffscreenCanvas
    /// 返回：初始化完成的 CanvasManager 或 WasmCalError 错误
    pub fn new(
        base_canvas: &OffscreenCanvas,
        main_canvas: &OffscreenCanvas,
        overlay_canvas: &OffscreenCanvas,
    ) -> Result<Self, WasmCalError> {
        // 获取Canvas上下文
        let base_ctx = get_canvas_context(base_canvas)?;
        let main_ctx = get_canvas_context(main_canvas)?;
        let overlay_ctx = get_canvas_context(overlay_canvas)?;

        Ok(Self {
            base_ctx: Some(base_ctx),
            main_ctx: Some(main_ctx),
            overlay_ctx: Some(overlay_ctx),
            // 初始状态下，所有层都需要绘制
            base_dirty: true,
            main_dirty: true,
            overlay_dirty: true,
        })
    }

    /// 获取指定层的Canvas上下文（不可变引用）
    ///
    /// 设计理念：统一错误处理，避免在渲染流程中触发 panic。
    /// 使用说明：请使用 `?` 或 `match` 处理返回的 Result，确保在未初始化时提供清晰的错误信息。
    /// 参数：
    /// - layer_type: 目标层类型（Base/Main/Overlay）
    /// 返回：对应层的 OffscreenCanvasRenderingContext2d 引用，或 WasmCalError
    pub fn get_context(
        &self,
        layer_type: CanvasLayerType,
    ) -> Result<&OffscreenCanvasRenderingContext2d, WasmCalError> {
        let ctx_opt = match layer_type {
            CanvasLayerType::Base => &self.base_ctx,
            CanvasLayerType::Main => &self.main_ctx,
            CanvasLayerType::Overlay => &self.overlay_ctx,
        };
        ctx_opt.as_ref().ok_or_else(|| {
            WasmCalError::canvas("Canvas上下文未初始化，请先调用 set_canvases 进行初始化")
        })
    }

    /// 检查指定层是否需要重绘
    pub fn is_dirty(&self, layer_type: CanvasLayerType) -> bool {
        match layer_type {
            CanvasLayerType::Base => self.base_dirty,
            CanvasLayerType::Main => self.main_dirty,
            CanvasLayerType::Overlay => self.overlay_dirty,
        }
    }

    /// 标记指定层需要重绘
    pub fn set_dirty(&mut self, layer_type: CanvasLayerType, is_dirty: bool) {
        match layer_type {
            CanvasLayerType::Base => self.base_dirty = is_dirty,
            CanvasLayerType::Main => self.main_dirty = is_dirty,
            CanvasLayerType::Overlay => self.overlay_dirty = is_dirty,
        }
    }

    /// 标记所有层都需要重绘
    pub fn set_all_dirty(&mut self) {
        self.base_dirty = true;
        self.main_dirty = true;
        self.overlay_dirty = true;
    }

    /// 清除所有层的重绘标记
    pub fn clear_all_dirty_flags(&mut self) {
        self.base_dirty = false;
        self.main_dirty = false;
        self.overlay_dirty = false;
    }
}
