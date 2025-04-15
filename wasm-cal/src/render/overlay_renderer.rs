//! 交互层渲染器 - 负责绘制十字光标、提示框等交互元素

use super::tooltip_renderer::TooltipRenderer;
use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::kline_generated::kline::KlineItem;
use flatbuffers;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 交互层渲染器
pub struct OverlayRenderer;

impl OverlayRenderer {}
