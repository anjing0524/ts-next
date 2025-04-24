//! 成交量图模块 - 专门负责绘制成交量图部分

use crate::data::DataManager;
use crate::layout::{ChartColors, ChartLayout};
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

/// 成交量图绘制器
pub struct VolumeRenderer;

impl VolumeRenderer {
    /// 绘制成交量图使用DataManager获取所有数据
    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
    ) {
        let data_manager_ref = data_manager.borrow();
        // 获取数据
        let items = match data_manager_ref.get_items() {
            Some(items) => items,
            None => return,
        };

        // 获取可见范围
        let data_manager_ref = data_manager.borrow();
        let (visible_start, _, visible_end) = data_manager_ref.get_visible();

        // 获取最大成交量
        let (_, _, max_volume) = data_manager_ref.get_cached_cal();

        // 如果可见区域为空，或最大成交量无效，则不绘制
        if visible_start >= visible_end || max_volume <= 0.0 {
            return;
        }

        // 只清空成交量图区域，而不是整个画布
        ctx.clear_rect(
            layout.chart_area_x,
            layout.volume_chart_y,
            layout.chart_area_width,
            layout.volume_chart_height,
        );

        // 预先设置绘图样式，减少状态切换
        ctx.set_line_width(0.0); // 成交量柱状图不需要边框

        // 使用缓存机制减少重复计算
        let mut volume_y_cache = std::collections::HashMap::new();
        let mut map_volume = |volume: f64| -> f64 {
            // 将浮点数转换为位模式的u64，作为HashMap的键
            let volume_bits = volume.to_bits();
            *volume_y_cache
                .entry(volume_bits)
                .or_insert_with(|| layout.map_volume_to_y(volume, max_volume))
        };

        // 计算底部Y坐标（只计算一次）
        let bottom_y = layout.volume_chart_y + layout.volume_chart_height - layout.volume_margin;

        // 绘制成交量柱状图
        for (i, item_idx) in (visible_start..visible_end).enumerate() {
            let item = items.get(item_idx);
            // 使用 i (相对索引) 计算 X 坐标
            let x = layout.chart_area_x + (i as f64 * layout.total_candle_width);
            // 判断是上涨还是下跌
            let is_bullish = item.close() >= item.open();
            // 计算总成交量
            let total_volume = item.b_vol() + item.s_vol();

            // 使用缓存函数获取Y坐标
            let y = map_volume(total_volume);

            // 计算柱子高度，确保从底部开始绘制
            let height = bottom_y - y;

            // 确保成交量柱状图的宽度与K线宽度协调，稍微窄一些
            let volume_width = layout.candle_width.max(1.5);

            // 设置颜色 - 与K线颜色匹配，但使用半透明效果
            ctx.set_fill_style_str(if is_bullish {
                ChartColors::VOLUME_BULLISH
            } else {
                ChartColors::VOLUME_BEARISH
            });

            // 确保高度至少为1像素，避免绘制负高度
            ctx.fill_rect(x, y, volume_width, height.max(1.0));
        }
    }
}
