//! 订单簿可视化渲染器 - 在main层右侧20%宽度区域绘制订单簿深度

use crate::config::ChartTheme;
use crate::data::DataManager;
use crate::layout::ChartLayout;
use crate::render::chart_renderer::RenderMode;
use std::cell::Cell;
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::OffscreenCanvasRenderingContext2d;

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
        theme: &ChartTheme,
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
            || last_visible_range != Some(current_visible_range);

        if !need_render {
            return;
        }

        // 更新缓存
        self.last_mode.set(Some(mode));
        self.last_idx.set(Some(idx));
        self.last_visible_range.set(Some(current_visible_range));

        let item = items.get(idx);
        let last_price = item.last_price();
        let volumes = match item.volumes() {
            Some(vols) => vols,
            None => return,
        };

        // 获取可见数据的价格范围和tick，与heatmap保持一致
        let (min_low, max_high, _) = data_manager_ref.get_cached_cal();
        let tick = data_manager_ref.get_tick();
        if tick <= 0.0 || min_low >= max_high {
            return;
        }

        // 计算tick区间数量，与heatmap逻辑完全一致
        let num_bins = ((max_high - min_low) / tick).ceil() as usize;
        if num_bins == 0 {
            return;
        }

        // 计算区域
        let area_x = layout.chart_area_x + layout.main_chart_width;
        let area_width = layout.book_area_width;

        // 使用与heatmap相同的bin索引逻辑聚合成交量
        let mut bins = vec![0.0; num_bins];
        let mut max_volume = 0.0f64;

        for i in 0..volumes.len() {
            let pv = volumes.get(i);
            let price = pv.price();
            let volume = pv.volume();

            // 只处理在可见价格范围内的数据，与heatmap逻辑一致
            if price < min_low || price >= max_high {
                continue;
            }

            // 使用与heatmap完全相同的bin索引计算
            let bin_idx = ((price - min_low) / tick).floor() as usize;
            if bin_idx < bins.len() {
                bins[bin_idx] += volume;
                max_volume = max_volume.max(bins[bin_idx]);
            }
        }

        if max_volume <= 0.0 {
            return;
        }

        // 清理订单簿区域
        self.clear_area(ctx, layout);

        // 绘制每个bin，与heatmap的bin遍历逻辑完全一致
        for (bin_idx, &volume) in bins.iter().enumerate() {
            if volume <= 0.0 {
                continue; // 只绘制有成交量的bin
            }

            // 使用与heatmap完全相同的价格计算
            let price_low = min_low + bin_idx as f64 * tick;
            let price_high = price_low + tick;
            let price_mid = (price_low + price_high) / 2.0;

            // 使用与heatmap完全相同的Y坐标映射
            let y_high = layout.map_price_to_y(price_high, min_low, max_high);
            let y_low = layout.map_price_to_y(price_low, min_low, max_high);
            let bar_y = y_high.min(y_low);
            let bar_height = (y_low - y_high).abs().max(1.0); // 确保最小高度为1像素

            // 根据价格与lastPrice的关系判断买卖盘
            let is_ask = price_mid > last_price;

            self.draw_level(
                ctx, area_x, area_width, bar_height, bar_y, volume, max_volume, is_ask, theme,
            );
        }
    }

    /// 绘制单个价格档位
    fn draw_level(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        area_x: f64,
        area_width: f64,
        bar_height: f64,
        bar_y: f64,
        volume: f64,
        max_volume: f64,
        is_ask: bool,
        theme: &ChartTheme,
    ) {
        let norm = (volume / max_volume).min(1.0);
        let text_reserved_width = 40.0; // 预留宽度用于显示数量
        let bar_width = (area_width - text_reserved_width) * norm;
        let bar_x = area_x;

        // 绘制柱状图
        ctx.set_fill_style_str(if is_ask {
            &theme.bearish // 卖单用绿色
        } else {
            &theme.bullish // 买单用红色
        });
        ctx.fill_rect(bar_x, bar_y, bar_width, bar_height - 1.0);

        // 绘制数量文本（右侧）
        if volume > 0.0 {
            let volume_text = format!("{}", volume as u64);
            let volume_x = bar_x + bar_width + 4.0;
            let volume_y = bar_y + bar_height / 2.0;
            ctx.set_fill_style_str(&theme.text);
            ctx.set_font(&theme.font_legend);
            ctx.set_text_align("left");
            ctx.set_text_baseline("middle");
            ctx.fill_text(&volume_text, volume_x, volume_y).ok();
        }
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
