//! 存储和提供布局计算的最终结果

use super::definition::{PaneId, Rect};
use std::collections::HashMap;

/// 存储布局计算的最终结果
#[derive(Clone, Debug)]
pub struct ChartLayout {
    pub panes: HashMap<PaneId, Rect>,
    // 保留一些高频访问的、与K线本身相关的计算参数
    pub candle_width: f64,
    pub total_candle_width: f64,
}

impl ChartLayout {
    /// 从计算结果和可见K线数创建
    pub fn new(panes: HashMap<PaneId, Rect>, visible_count: usize) -> Self {
        let main_chart_rect = panes.get(&PaneId::HeatmapArea).cloned().unwrap_or_default();

        // K线相关的计算仍然保留，因为它们依赖于动态的 visible_count
        let total_candle_width = if visible_count > 0 {
            main_chart_rect.width / visible_count as f64
        } else {
            0.0
        };
        // 蜡烛图实体宽度 = 总宽度 * 80% (留出20%间距)，最小为1px
        let candle_width = (total_candle_width * 0.8).max(1.0);

        Self {
            panes,
            candle_width,
            total_candle_width,
        }
    }

    /// 获取指定面板的矩形区域，如果找不到则返回一个默认的空矩形
    pub fn get_rect(&self, id: &PaneId) -> Rect {
        self.panes.get(id).cloned().unwrap_or_default()
    }

    /// 将数据索引映射到X轴坐标
    pub fn map_index_to_x(&self, index: usize, visible_start: usize) -> f64 {
        let main_chart_rect = self.get_rect(&PaneId::HeatmapArea);
        main_chart_rect.x + (index - visible_start) as f64 * self.total_candle_width
    }

    /// 计算可见范围在导航器中的坐标
    pub fn calculate_visible_range_coordinates(
        &self,
        items_len: usize,
        start: usize,
        count: usize,
    ) -> (f64, f64) {
        let nav_rect = self.get_rect(&PaneId::NavigatorContainer);
        if items_len == 0 {
            return (nav_rect.x, nav_rect.x);
        }
        let start_x = nav_rect.x + (start as f64 / items_len as f64) * nav_rect.width;
        let end_x = nav_rect.x + ((start + count) as f64 / items_len as f64) * nav_rect.width;
        (start_x, end_x)
    }
}
