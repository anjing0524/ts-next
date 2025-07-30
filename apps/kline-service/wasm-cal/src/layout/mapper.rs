//! 坐标映射器模块 - 负责数据值与屏幕坐标之间的转换

use super::definition::Rect;

/// 负责将数据值映射到特定面板的屏幕坐标
pub struct CoordinateMapper {
    pane_rect: Rect,
    data_min: f64,
    data_max: f64,
    margin: f64, // Y轴上下边距
}

impl CoordinateMapper {
    /// 为Y轴（价格、成交量）创建映射器
    pub fn new_for_y_axis(pane_rect: Rect, data_min: f64, data_max: f64, margin: f64) -> Self {
        Self {
            pane_rect,
            data_min,
            data_max,
            margin,
        }
    }

    /// 将Y轴数据值映射到屏幕Y坐标
    pub fn map_y(&self, value: f64) -> f64 {
        let usable_height = self.pane_rect.height - 2.0 * self.margin;
        let data_range = self.data_max - self.data_min;

        if usable_height <= 0.0 || data_range.abs() < 1e-9 {
            return self.pane_rect.y + self.margin;
        }

        let ratio = (value - self.data_min) / data_range;
        // Y轴坐标系是反的 (0在顶部)
        self.pane_rect.y + self.pane_rect.height - self.margin - (ratio * usable_height)
    }

    /// 将屏幕Y坐标映射回数据值
    pub fn unmap_y(&self, y: f64) -> f64 {
        let usable_height = self.pane_rect.height - 2.0 * self.margin;
        let data_range = self.data_max - self.data_min;

        if usable_height <= 0.0 || data_range.abs() < 1e-9 {
            return self.data_min;
        }

        let y_from_bottom = self.pane_rect.y + self.pane_rect.height - self.margin - y;
        let ratio = y_from_bottom / usable_height;

        self.data_min + ratio * data_range
    }
}
