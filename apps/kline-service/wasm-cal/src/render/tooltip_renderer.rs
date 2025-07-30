//! Tooltip模块 - 负责绘制十字光标处的提示框

use crate::config::ChartTheme;
use crate::kline_generated::kline::KlineItem;
use crate::layout::{ChartLayout, CoordinateMapper, PaneId};
use crate::render::chart_renderer::RenderMode;
use crate::utils::time;
use flatbuffers;
use web_sys::OffscreenCanvasRenderingContext2d;

#[derive(Default)]
pub struct TooltipRenderer;

impl TooltipRenderer {
    pub fn new() -> Self {
        Self {}
    }

    /// 绘制主图表的Tooltip
    pub fn draw_main_chart_tooltip(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        items: flatbuffers::Vector<'_, flatbuffers::ForwardsUOffset<KlineItem<'_>>>,
        hover_candle_index: Option<usize>,
        mouse_x: f64,
        mouse_y: f64,
        mode: RenderMode,
        min_low: f64,
        max_high: f64,
        tick: f64,
        theme: &ChartTheme,
    ) {
        let hover_index = match hover_candle_index {
            Some(idx) => idx,
            None => return,
        };

        if hover_index >= items.len() {
            return;
        }

        let item = items.get(hover_index);
        let price_rect = layout.get_rect(&PaneId::HeatmapArea);
        let y_mapper = CoordinateMapper::new_for_y_axis(price_rect, min_low, max_high, 8.0);
        let price = y_mapper.unmap_y(mouse_y);

        let lines = match mode {
            RenderMode::Kmap => self.get_kmap_tooltip_lines(&item, price),
            RenderMode::Heatmap => self.get_heatmap_tooltip_lines(&item, price, min_low, tick),
        };

        self.draw_tooltip_box(ctx, mouse_x, mouse_y, &lines, theme, layout);
    }

    /// 绘制订单簿的Tooltip
    pub fn draw_book_tooltip(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        layout: &ChartLayout,
        timestamp: i64,
        price: f64,
        volume: f64,
        mouse_x: f64,
        mouse_y: f64,
        theme: &ChartTheme,
    ) {
        let lines = vec![
            format!(
                "时间: {}",
                time::format_timestamp(timestamp, "%Y-%m-%d %H:%M")
            ),
            format!("价格: {:.2}", price),
            format!("订单量: {}", volume as u64),
        ];
        self.draw_tooltip_box(ctx, mouse_x, mouse_y, &lines, theme, layout);
    }

    /// 绘制Tooltip的背景框和文字
    fn draw_tooltip_box(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        x: f64,
        y: f64,
        lines: &[String],
        theme: &ChartTheme,
        layout: &ChartLayout,
    ) {
        let line_height = 18.0;
        let padding = 10.0;
        let mut max_width = 0.0;

        ctx.set_font(&theme.font_legend);
        for line in lines {
            if let Ok(metrics) = ctx.measure_text(line) {
                let width = metrics.width();
                if width > max_width {
                    max_width = width;
                }
            }
        }

        let box_width = max_width + padding * 2.0;
        let box_height = lines.len() as f64 * line_height + padding * 2.0;

        let root_rect = layout.get_rect(&PaneId::Root);
        let mut box_x = x + 15.0;
        let mut box_y = y + 15.0;

        if box_x + box_width > root_rect.x + root_rect.width {
            box_x = x - box_width - 15.0;
        }
        if box_y + box_height > root_rect.y + root_rect.height {
            box_y = y - box_height - 15.0;
        }

        ctx.set_fill_style_str(&theme.tooltip_bg);
        ctx.set_stroke_style_str(&theme.tooltip_border);
        ctx.set_line_width(1.0);
        ctx.begin_path();
        ctx.rect(box_x, box_y, box_width, box_height);
        ctx.fill();
        ctx.stroke();

        ctx.set_fill_style_str(&theme.tooltip_text);
        ctx.set_text_align("left");
        ctx.set_text_baseline("top");

        for (i, line) in lines.iter().enumerate() {
            let _ = ctx.fill_text(
                line,
                box_x + padding,
                box_y + padding + i as f64 * line_height,
            );
        }
    }

    /// 获取K线图模式的Tooltip文本
    fn get_kmap_tooltip_lines(&self, item: &KlineItem, price: f64) -> Vec<String> {
        vec![
            format!(
                "时间: {}",
                time::format_timestamp(item.timestamp() as i64, "%Y-%m-%d %H:%M")
            ),
            format!("价格: {:.4}", price),
            format!("开: {:.4}", item.open()),
            format!("高: {:.4}", item.high()),
            format!("低: {:.4}", item.low()),
            format!("收: {:.4}", item.close()),
            format!(
                "成交量: {}",
                time::format_volume(item.b_vol() + item.s_vol(), 2)
            ),
        ]
    }

    /// 获取热图模式的Tooltip文本
    fn get_heatmap_tooltip_lines(
        &self,
        item: &KlineItem,
        price: f64,
        min_low: f64,
        tick: f64,
    ) -> Vec<String> {
        let volume_at_price = self.calculate_volume_for_price(item, price, min_low, tick);
        vec![
            format!(
                "时间: {}",
                time::format_timestamp(item.timestamp() as i64, "%Y-%m-%d %H:%M")
            ),
            format!("价格: {:.2}", price),
            format!(
                "订单量: {}",
                time::format_volume(volume_at_price.unwrap_or(0.0), 2)
            ),
        ]
    }

    /// 计算特定价格的成交量
    fn calculate_volume_for_price(
        &self,
        kline: &KlineItem,
        price: f64,
        min_low: f64,
        tick: f64,
    ) -> Option<f64> {
        if tick <= 0.0 {
            return None;
        }
        let tick_idx = ((price - min_low) / tick).floor() as usize;
        kline.volumes().map(|volumes| {
            volumes
                .iter()
                .filter(|pv| ((pv.price() - min_low) / tick).floor() as usize == tick_idx)
                .map(|pv| pv.volume())
                .sum::<f64>()
        })
    }
}
