//! Tooltip模块 - 负责绘制十字光标处的提示框

use crate::ChartTheme;
use crate::data::DataManager;
use crate::data::model::KlineItemRef;

use crate::layout::{ChartLayout, CoordinateMapper, PaneId};
use crate::render::chart_renderer::RenderMode;
use crate::utils::time;
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
        data_manager: &DataManager,
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

        let item = match data_manager.get(hover_index) {
            Some(item) => item,
            None => return,
        };

        let price_rect = layout.get_rect(&PaneId::HeatmapArea);
        let y_mapper = CoordinateMapper::new_for_y_axis(price_rect, min_low, max_high, 8.0);

        let lines = match mode {
            RenderMode::Kmap => {
                let price = y_mapper.unmap_y(mouse_y);
                self.get_kmap_tooltip_lines(&item, price)
            }
            RenderMode::Heatmap => {
                if tick <= 0.0 {
                    return;
                }
                let tick_height = price_rect.height / ((max_high - min_low) / tick);
                let tick_idx =
                    ((price_rect.y + price_rect.height - mouse_y) / tick_height).floor() as usize;
                self.get_heatmap_tooltip_lines(&item, tick_idx, min_low, tick)
            }
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
        if lines.is_empty() {
            return;
        }

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

        let main_chart_rect = layout.get_rect(&PaneId::HeatmapArea);
        let mut box_x = x + 20.0;
        let mut box_y = y + 20.0;

        if box_x + box_width > main_chart_rect.x + main_chart_rect.width {
            box_x = x - box_width - 20.0;
        }
        if box_y + box_height > main_chart_rect.y + main_chart_rect.height {
            box_y = y - box_height - 20.0;
        }
        if box_x < main_chart_rect.x {
            box_x = main_chart_rect.x;
        }
        if box_y < main_chart_rect.y {
            box_y = main_chart_rect.y;
        }

        ctx.set_fill_style_str(&theme.tooltip_bg);
        ctx.set_stroke_style_str(&theme.tooltip_border);
        ctx.set_line_width(1.0);
        ctx.begin_path();
        self.draw_rounded_rect(ctx, box_x, box_y, box_width, box_height, 5.0);
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

    /// 绘制圆角矩形
    fn draw_rounded_rect(
        &self,
        ctx: &OffscreenCanvasRenderingContext2d,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        radius: f64,
    ) {
        ctx.move_to(x + radius, y);
        ctx.line_to(x + width - radius, y);
        ctx.quadratic_curve_to(x + width, y, x + width, y + radius);
        ctx.line_to(x + width, y + height - radius);
        ctx.quadratic_curve_to(x + width, y + height, x + width - radius, y + height);
        ctx.line_to(x + radius, y + height);
        ctx.quadratic_curve_to(x, y + height, x, y + height - radius);
        ctx.line_to(x, y + radius);
        ctx.quadratic_curve_to(x, y, x + radius, y);
        ctx.close_path();
    }

    /// 获取K线图模式的Tooltip文本
    fn get_kmap_tooltip_lines(&self, item: &KlineItemRef, price: f64) -> Vec<String> {
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
        item: &KlineItemRef,
        tick_idx: usize,
        min_low: f64,
        tick: f64,
    ) -> Vec<String> {
        let price = min_low + tick_idx as f64 * tick;
        let volume_at_price = self.calculate_volume_for_price(item, tick_idx, min_low, tick);

        // 检查是否达到热图显示阈值 (与heat_renderer.rs的逻辑一致)
        if let Some(volume) = volume_at_price {
            // 计算全局最大值来判断是否应该显示
            let global_max = self.calculate_global_max_volume(item, min_low, tick);
            if global_max > 0.0 {
                let norm = (volume + 1.0).ln() / (global_max + 1.0).ln();
                // 只在热图会显示颜色的情况下显示tooltip
                if norm >= 0.05 {
                    return vec![
                        format!(
                            "时间: {}",
                            time::format_timestamp(item.timestamp() as i64, "%Y-%m-%d %H:%M")
                        ),
                        format!("价格: {:.2}", price),
                        format!("订单量: {}", volume as u64), // 显示为整数
                    ];
                }
            }
        }
        // 无数据或低于显示阈值时返回空
        vec![]
    }

    /// 计算特定价格区间的累计成交量
    fn calculate_volume_for_price(
        &self,
        kline: &KlineItemRef,
        tick_idx: usize,
        min_low: f64,
        tick: f64,
    ) -> Option<f64> {
        if tick <= 0.0 {
            return None;
        }
        kline
            .volumes()
            .map(|volumes| {
                volumes
                    .filter(|pv| ((pv.price() - min_low) / tick).floor() as usize == tick_idx)
                    .map(|pv| pv.volume())
                    .sum::<f64>()
            })
            .filter(|&sum| sum > 0.0)
    }

    /// 计算全局最大成交量 (与heat_renderer.rs逻辑一致)
    fn calculate_global_max_volume(&self, kline: &KlineItemRef, min_low: f64, tick: f64) -> f64 {
        if tick <= 0.0 {
            return 0.0;
        }

        let num_bins = ((kline.high() - min_low) / tick).ceil() as usize;
        if num_bins == 0 {
            return 0.0;
        }

        let mut bins = vec![0.0; num_bins];
        if let Some(volumes) = kline.volumes() {
            for pv in volumes {
                if pv.price() >= min_low && pv.price() < kline.high() {
                    let bin_idx = ((pv.price() - min_low) / tick).floor() as usize;
                    if bin_idx < num_bins {
                        bins[bin_idx] += pv.volume();
                    }
                }
            }
        }

        bins.iter().fold(0.0, |max, &vol| max.max(vol))
    }
}
