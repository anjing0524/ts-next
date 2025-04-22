//! 图表渲染器 - 整合所有模块，提供统一的渲染接口

use super::axis_renderer::AxisRenderer;
use super::overlay_renderer::OverlayRenderer;
use super::price_renderer::PriceRenderer;
use super::volume_renderer::VolumeRenderer;
use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::kline_generated::kline::KlineItem;
use crate::layout::ChartLayout;
use crate::utils::WasmError;
use flatbuffers;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvas;

/// 图表渲染器 - 整合所有模块，提供统一的渲染接口
pub struct ChartRenderer {
    /// Canvas管理器
    canvas_manager: Option<CanvasManager>,
    /// 坐标轴渲染器
    axis_renderer: Option<AxisRenderer>,
    /// 价格图(K线图)渲染器
    price_renderer: Option<PriceRenderer>,
    /// 成交量图渲染器
    volume_renderer: Option<VolumeRenderer>,
    /// DataZoom导航器渲染器
    /// 交互元素渲染器
    overlay_renderer: Option<Rc<RefCell<OverlayRenderer>>>,
}

impl ChartRenderer {
    /// 创建图表渲染器
    pub fn new(
        base_canvas: &OffscreenCanvas,
        main_canvas: &OffscreenCanvas,
        overlay_canvas: &OffscreenCanvas,
        layout: ChartLayout,
    ) -> Result<Self, WasmError> {
        let canvas_manager = CanvasManager::new(base_canvas, main_canvas, overlay_canvas, layout)?;
        let overlay_renderer = Rc::new(RefCell::new(OverlayRenderer::new()));

        Ok(Self {
            canvas_manager: Some(canvas_manager),
            axis_renderer: Some(AxisRenderer {}),
            price_renderer: Some(PriceRenderer {}),
            volume_renderer: Some(VolumeRenderer {}),
            overlay_renderer: Some(overlay_renderer),
        })
    }

    /// 渲染整个图表
    // 修改 render 方法，使用 layout_mut 方法

    pub fn render(&self, items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>) {
        // 获取所有渲染器，如果任何一个不存在则提前返回
        let canvas_manager = match &self.canvas_manager {
            Some(cm) => cm,
            None => return,
        };
        let axis_renderer = match &self.axis_renderer {
            Some(ar) => ar,
            None => return,
        };
        let price_renderer = match &self.price_renderer {
            Some(pcr) => pcr,
            None => return,
        };
        let volume_renderer = match &self.volume_renderer {
            Some(vcr) => vcr,
            None => return,
        };
        let overlay_renderer = match &self.overlay_renderer {
            Some(or) => or,
            None => return,
        };

        // 清除所有画布
        canvas_manager.clear_all();
        // 如果数据为空，直接返回
        if items.len() == 0 {
            return;
        }
        // 获取布局信息 (只借用一次)
        let layout_ref = canvas_manager.layout.borrow();
        let visible_start = layout_ref.navigator_visible_start;
        let visible_count = layout_ref.navigator_visible_count;
        let visible_end = (visible_start + visible_count).min(items.len()); // 计算可见范围的结束索引

        // 计算可见区域的价格范围
        let (min_low, max_high) =
            price_renderer.calculate_price_range(items, visible_start, visible_count);
        // 计算可见区域的最大成交量
        let max_volume = volume_renderer.calculate_max_volume(items, visible_start, visible_end); // 使用 visible_end
        overlay_renderer
            .borrow_mut()
            .set_cached(min_low, max_high, max_volume);
        // 绘制底层静态元素（坐标轴、网格线等）
        axis_renderer.draw(canvas_manager, items, min_low, max_high, max_volume);

        // 绘制DataZoom导航器 - 通过 OverlayRenderer 调用
        overlay_renderer
            .borrow()
            .render_datazoom(canvas_manager, items);

        // 获取主Canvas上下文
        let main_ctx = canvas_manager.get_context(CanvasLayerType::Main);

        // 绘制K线图 - 传入可见范围
        price_renderer.draw(
            main_ctx,
            &layout_ref, // 使用借用的布局
            items,
            min_low,
            max_high,
            visible_start, // 传递可见起始索引
            visible_count, // 传递可见数量
        );

        // 绘制成交量图 - 传入可见范围和最大成交量
        volume_renderer.draw(
            main_ctx,
            &layout_ref, // 使用借用的布局
            items,
            max_volume,    // 传递计算好的最大成交量
            visible_start, // 传递可见起始索引
            visible_count, // 传递可见数量
        );
    }

    // 处理鼠标移动事件
    pub fn handle_mouse_move(
        &self,
        x: f64,
        y: f64,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
    ) {
        // 获取覆盖层渲染器
        let overlay_renderer = match &self.overlay_renderer {
            Some(or) => or,
            None => return,
        };
        let canvas_manager = match &self.canvas_manager {
            Some(cm) => cm,
            None => return,
        };

        // 通过RefCell获取可变引用，并传入已计算的价格范围和最大成交量
        overlay_renderer
            .borrow_mut()
            .handle_mouse_move(canvas_manager, x, y, items);
    }

    // 处理鼠标离开事件 - 清除所有交互元素
    pub fn handle_mouse_leave(&self) {
        // 获取覆盖层渲染器
        let overlay_renderer = match &self.overlay_renderer {
            Some(or) => or,
            None => return,
        };
        let canvas_manager = match &self.canvas_manager {
            Some(cm) => cm,
            None => return,
        };

        // 通过RefCell获取可变引用
        overlay_renderer
            .borrow_mut()
            .handle_mouse_leave(canvas_manager);
    }

    // 重新绘制覆盖层
    pub fn render_overlay(
        &self,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
    ) {
        // 获取覆盖层渲染器和Canvas管理器
        let overlay_renderer = match &self.overlay_renderer {
            Some(or) => or,
            None => return,
        };
        let canvas_manager = match &self.canvas_manager {
            Some(cm) => cm,
            None => return,
        };

        // 先清除覆盖层
        overlay_renderer
            .borrow_mut()
            .clear_overlay(canvas_manager, items);
        // 然后绘制覆盖层
        overlay_renderer.borrow().draw(canvas_manager, items);
        // 最后确保 DataZoom 被绘制
        overlay_renderer
            .borrow()
            .render_datazoom(canvas_manager, items);
    }

    // 清除覆盖层
    pub fn clear_overlay(
        &self,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
    ) {
        // 获取覆盖层渲染器
        let overlay_renderer = match &self.overlay_renderer {
            Some(or) => or,
            None => return,
        };
        let canvas_manager = match &self.canvas_manager {
            Some(cm) => cm,
            None => return,
        };
        // 清除覆盖层
        overlay_renderer
            .borrow_mut()
            .clear_overlay(canvas_manager, items);
    }
}
