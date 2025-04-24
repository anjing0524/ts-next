//! DataZoom导航器模块 - 负责绘制和处理数据缩放导航器

use crate::canvas::{CanvasLayerType, CanvasManager};
use crate::data::DataManager;
use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartColors, ChartLayout};
use flatbuffers;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// DataZoom导航器绘制器
pub struct DataZoomRenderer;

impl DataZoomRenderer {
    /// 绘制DataZoom导航器
    pub fn draw(&self, canvas_manager: &CanvasManager, data_manager: &Rc<RefCell<DataManager>>) {
        // 获取 BASE 上下文和布局
        let ctx = canvas_manager.get_context(CanvasLayerType::Overlay);
        let layout = canvas_manager.layout.borrow();

        // 计算导航器位置
        let nav_x = layout.chart_area_x;
        let nav_y = layout.canvas_height - layout.navigator_height;
        let nav_width = layout.chart_area_width;
        let nav_height = layout.navigator_height;

        // 绘制导航器背景
        ctx.set_fill_style_str(ChartColors::NAVIGATOR_BG);
        ctx.fill_rect(nav_x, nav_y, nav_width, nav_height);

        let items_opt = data_manager.borrow().get_items();
        let items = match items_opt {
            Some(items) => items,
            None => return,
        };

        // 如果数据为空，直接返回
        if items.len() == 0 {
            return;
        }

        // 绘制成交量曲线作为背景
        self.draw_volume_area(ctx, &layout, items, nav_x, nav_y, nav_height);
        // 绘制当前可见区域指示器
        self.draw_visible_range_indicator(
            ctx,
            &layout,
            items,
            nav_x,
            nav_y,
            nav_width,
            nav_height,
            data_manager,
        );
    }

    /// 在导航器上绘制成交量区域图
    fn draw_volume_area(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        nav_x: f64,
        nav_y: f64,
        nav_height: f64,
    ) {
        let items_len = items.len();
        if items_len == 0 {
            return;
        }

        // 使用ChartLayout中的方法计算导航器中每个K线的宽度
        let nav_candle_width = layout.calculate_navigator_candle_width(items_len);

        // 找出最大成交量，用于缩放
        let mut max_volume: f64 = 0.0;

        // 使用步进采样来减少计算量，对于大数据集特别有效
        let step = (items_len / 100).max(1); // 至少每100个点采样一次

        for i in (0..items_len).step_by(step) {
            let item = items.get(i);
            let volume = item.b_vol() + item.s_vol();
            max_volume = max_volume.max(volume);
        }

        // 检查最大值是否有效
        if max_volume <= 0.0 {
            // 如果采样没有找到有效值，进行完整扫描
            for i in 0..items_len {
                let item = items.get(i);
                let volume = item.b_vol() + item.s_vol();
                max_volume = max_volume.max(volume);
            }

            // 如果仍然没有有效值，返回
            if max_volume <= 0.0 {
                return;
            }
        }

        // 绘制成交量曲线
        ctx.begin_path();
        ctx.set_stroke_style_str(ChartColors::VOLUME_LINE);
        ctx.set_line_width(1.0);
        ctx.set_fill_style_str(ChartColors::VOLUME_AREA);

        // 移动到第一个点
        let first_item = items.get(0);
        let first_volume = first_item.b_vol() + first_item.s_vol();
        let first_y = nav_y + nav_height - (first_volume / max_volume) * nav_height * 0.8;
        ctx.move_to(nav_x, first_y);

        // 对于大数据集，使用采样绘制曲线以提高性能
        let draw_step = if items_len > 1000 {
            items_len / 500 // 对于大数据集，最多绘制500个点
        } else {
            1
        };

        for i in (0..items_len).step_by(draw_step) {
            let item = items.get(i);
            let volume = item.b_vol() + item.s_vol();
            let x = nav_x + i as f64 * nav_candle_width;
            let y = nav_y + nav_height - (volume / max_volume) * nav_height * 0.8;
            ctx.line_to(x, y);
        }

        // 确保最后一个点被绘制
        if items_len > 1 && draw_step > 1 {
            let last_idx = items_len - 1;
            let last_item = items.get(last_idx);
            let last_volume = last_item.b_vol() + last_item.s_vol();
            let last_x = nav_x + last_idx as f64 * nav_candle_width;
            let last_y = nav_y + nav_height - (last_volume / max_volume) * nav_height * 0.8;
            ctx.line_to(last_x, last_y);
        }

        // 完成路径，回到底部形成闭合区域
        let last_x = nav_x + (items_len - 1) as f64 * nav_candle_width;
        ctx.line_to(last_x, nav_y + nav_height);
        ctx.line_to(nav_x, nav_y + nav_height);
        ctx.close_path();

        // 填充区域
        ctx.fill();
        // 描边曲线
        ctx.stroke();
    }

    /// 绘制可见区域指示器
    fn draw_visible_range_indicator(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: flatbuffers::Vector<flatbuffers::ForwardsUOffset<KlineItem>>,
        nav_x: f64,
        nav_y: f64,
        nav_width: f64,
        nav_height: f64,
        data_manager: &Rc<RefCell<DataManager>>,
    ) {
        let items_len = items.len();
        if items_len == 0 {
            return;
        }

        // 从DataManager获取可见区域的起始索引和数量
        let data_manager_ref = data_manager.borrow();
        // 获取可见范围
        let (visible_start, visible_count, _) = data_manager_ref.get_visible();

        // 使用ChartLayout中的方法计算可见区域坐标
        let (visible_start_x, visible_end_x) =
            layout.calculate_visible_range_coordinates(items_len, visible_start, visible_count);

        // 绘制半透明遮罩 (左侧不可见区域)
        ctx.set_fill_style_str(ChartColors::NAVIGATOR_MASK);
        ctx.fill_rect(nav_x, nav_y, visible_start_x - nav_x, nav_height);

        // 绘制半透明遮罩 (右侧不可见区域)
        ctx.fill_rect(
            visible_end_x,
            nav_y,
            nav_x + nav_width - visible_end_x,
            nav_height,
        );

        // 绘制可见区域边框
        ctx.set_stroke_style_str(ChartColors::NAVIGATOR_HANDLE);
        ctx.set_line_width(layout.navigator_handle_width);
        ctx.begin_path();

        // 左侧边框
        ctx.move_to(visible_start_x, nav_y);
        ctx.line_to(visible_start_x, nav_y + nav_height);
        // 右侧边框
        ctx.move_to(visible_end_x, nav_y);
        ctx.line_to(visible_end_x, nav_y + nav_height);
        ctx.stroke();
        // 绘制可拖动手柄
        ctx.set_fill_style_str(ChartColors::NAVIGATOR_HANDLE);
        // 左侧手柄
        ctx.fill_rect(
            visible_start_x - layout.navigator_handle_width / 2.0,
            nav_y,
            layout.navigator_handle_width,
            nav_height,
        );

        // 右侧手柄
        ctx.fill_rect(
            visible_end_x - layout.navigator_handle_width / 2.0,
            nav_y,
            layout.navigator_handle_width,
            nav_height,
        );
    }
}
