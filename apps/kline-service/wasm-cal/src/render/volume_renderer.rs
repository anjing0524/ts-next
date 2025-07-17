//! 成交量图模块 - 专门负责绘制成交量图部分

use crate::config::ChartTheme;
use crate::data::DataManager;
use crate::layout::ChartLayout;
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
        theme: &ChartTheme,
    ) {
        let data_manager_ref = data_manager.borrow();
        // 获取数据
        let items = match data_manager_ref.get_items() {
            Some(items) => items,
            None => return,
        };

        // 获取可见范围
        let visible_range = data_manager_ref.get_visible_range();
        let (visible_start, visible_count, visible_end) = visible_range.get_range();

        if visible_start >= visible_end {
            return;
        }

        // 获取成交量范围
        let (_, _, max_volume) = data_manager_ref.get_cached_cal();

        // 预先计算所有可见K线的X坐标
        let x_coordinates = visible_range.precompute_x_coordinates(layout);

        // 优化：使用临时数组收集所有绘制操作，减少绘制调用次数
        let mut bullish_rects = Vec::with_capacity(visible_count);
        let mut bearish_rects = Vec::with_capacity(visible_count);

        // 遍历所有可见的K线数据
        for (rel_idx, global_idx) in (visible_start..visible_end).enumerate() {
            if global_idx >= items.len() || rel_idx >= x_coordinates.len() {
                break;
            }

            let item = items.get(global_idx);
            let x_center = x_coordinates[rel_idx];

            // 计算成交量矩形的参数
            let candle_x = x_center - (layout.candle_width / 2.0);
            let candle_width = layout.candle_width.max(1.0);

            // 计算成交量对应的高度
            let volume = item.b_vol() + item.s_vol();
            let height = if max_volume > 0.0 {
                (volume / max_volume) * layout.volume_chart_height
            } else {
                0.0
            };

            // Y坐标需要从底部开始计算
            let volume_y = layout.volume_chart_y + layout.volume_chart_height - height;

            // 根据价格变化收集矩形信息
            if item.close() >= item.open() {
                // 上涨K线
                bullish_rects.push((candle_x, volume_y, candle_width, height));
            } else {
                // 下跌K线
                bearish_rects.push((candle_x, volume_y, candle_width, height));
            }
        }

        // 批量绘制所有上涨成交量矩形
        if !bullish_rects.is_empty() {
            ctx.set_fill_style_str(&theme.bullish);
            ctx.begin_path();
            for (x, y, width, height) in bullish_rects {
                ctx.rect(x, y, width, height);
            }
            ctx.fill();
        }

        // 批量绘制所有下跌成交量矩形
        if !bearish_rects.is_empty() {
            ctx.set_fill_style_str(&theme.bearish);
            ctx.begin_path();
            for (x, y, width, height) in bearish_rects {
                ctx.rect(x, y, width, height);
            }
            ctx.fill();
        }
    }
}
