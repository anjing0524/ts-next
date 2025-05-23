//! 订单簿可视化渲染器 - 在main层右侧20%宽度区域绘制订单簿深度

use crate::data::DataManager;
use crate::layout::{ChartColors, ChartFont, ChartLayout};
use crate::render::chart_renderer::RenderMode;
use std::cell::Cell;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d; // 假设RenderMode定义在这里

pub struct BookRenderer {
    last_idx: Cell<Option<usize>>,
    last_mode: Cell<Option<RenderMode>>,
    last_visible_range: Cell<Option<(usize, usize)>>, // 新增：缓存可见范围
}

impl BookRenderer {
    pub fn new() -> Self {
        Self {
            last_idx: Cell::new(None),
            last_mode: Cell::new(None),
            last_visible_range: Cell::new(None), // 新增：初始化为None
        }
    }

    /// 在main层右侧20%宽度区域绘制订单簿
    pub fn draw(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        data_manager: &Rc<RefCell<DataManager>>,
        hover_index: Option<usize>,
        mode: RenderMode,
    ) {
        let data_manager_ref = data_manager.borrow();
        let items = match data_manager_ref.get_items() {
            Some(items) => items,
            None => return,
        };
        let visible_range = data_manager_ref.get_visible_range();
        let (visible_start, _visible_count, visible_end) = visible_range.get_range();
        if visible_start >= visible_end {
            return;
        }
        let idx = hover_index.unwrap_or_else(|| visible_end - 1);
        if idx >= items.len() {
            return;
        }

        // 检查是否需要渲染：mode变化、idx变化或可见范围变化
        let last_mode = self.last_mode.get();
        let last_idx = self.last_idx.get();
        let last_visible_range = self.last_visible_range.get();
        let current_visible_range = (visible_start, visible_end);

        let need_render = last_mode != Some(mode)
            || last_idx != Some(idx)
            || last_visible_range != Some(current_visible_range); // 新增：检查可见范围变化

        if !need_render {
            return;
        }

        // 更新缓存
        self.last_mode.set(Some(mode));
        self.last_idx.set(Some(idx));
        self.last_visible_range.set(Some(current_visible_range)); // 新增：缓存当前可见范围

        let item = items.get(idx);
        let last_price = item.last_price();
        let volumes = match item.volumes() {
            Some(vols) => vols,
            None => return,
        };
        // 计算区域
        let area_x = layout.chart_area_x + layout.main_chart_width;
        let area_y = layout.chart_area_y;
        let area_width = layout.book_area_width;
        let area_height = layout.price_chart_height;
        // 分离买卖盘
        let mut bids = Vec::new();
        let mut asks = Vec::new();
        for i in 0..volumes.len() {
            let pv = volumes.get(i);
            let price = pv.price();
            let volume = pv.volume();
            if price < last_price {
                bids.push((price, volume));
            } else if price > last_price {
                asks.push((price, volume));
            }
        }
        // 按价格排序：卖盘从高到低，买盘从高到低（可选，便于视觉一致）
        asks.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        bids.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        // 合并买卖盘用于统一绘制（自上而下）
        let mut all_levels = Vec::new();
        for (p, v) in asks.iter() {
            all_levels.push((p, v, true)); // true: 卖盘
        }
        for (p, v) in bids.iter() {
            all_levels.push((p, v, false)); // false: 买盘
        }
        // 计算最大volume用于归一化
        let max_volume = all_levels.iter().map(|(_, v, _)| **v).fold(0.0, f64::max);
        if max_volume <= 0.0 {
            return;
        }
        // 清理订单簿区域
        self.clear_area(&ctx, &layout);
        // 绘制
        let bar_height = area_height / all_levels.len().max(1) as f64;
        for (i, (_price, volume, is_ask)) in all_levels.iter().enumerate() {
            let norm = (*volume / max_volume).min(1.0);
            let text_reserved_width = 40.0;
            let bar_width = (area_width - text_reserved_width) * norm;
            let bar_x = area_x;
            let bar_y = area_y + i as f64 * bar_height;
            ctx.set_fill_style_str(if *is_ask {
                ChartColors::BEARISH
            } else {
                ChartColors::BULLISH
            });
            ctx.global_alpha(); // 确保透明度为1
            ctx.fill_rect(bar_x, bar_y, bar_width, bar_height - 1.0);
            // --- 新增：在柱状图末尾右侧绘制数量文本 ---
            if **volume > 0.0 {
                // 格式化数量为整数
                let text = format!("{}", **volume as u64);
                // 计算文本位置
                let text_x = bar_x + bar_width + 4.0; // 柱状图右端+4像素
                let text_y = bar_y + bar_height / 2.0; // 垂直居中
                ctx.set_fill_style_str(ChartColors::TEXT); // 文本颜色
                ctx.set_font(ChartFont::LEGEND);
                ctx.set_text_align("left");
                ctx.set_text_baseline("middle");
                ctx.fill_text(&text, text_x, text_y).ok();
            }
        }
        ctx.set_global_alpha(1.0); // 恢复透明度
    }

    pub fn clear_area(&self, ctx: &OffscreenCanvasRenderingContext2d, layout: &ChartLayout) {
        let area_x = layout.chart_area_x + layout.main_chart_width;
        let area_y = layout.chart_area_y;
        let area_width = layout.book_area_width;
        let area_height = layout.price_chart_height;
        ctx.clear_rect(area_x, area_y, area_width, area_height);
    }

    /// 重置缓存，强制下次绘制时重新渲染
    /// 当main canvas被清除时应该调用此方法
    pub fn reset_cache(&self) {
        self.last_idx.set(None);
        self.last_mode.set(None);
        self.last_visible_range.set(None);
    }
}
