//! 数据管理器 - 负责管理K线数据和可见范围

use crate::kline_generated::kline::KlineItem;
use crate::layout::ChartLayout;
use flatbuffers;

/// 数据管理器 - 负责管理K线数据和可见范围
pub struct DataManager {
    /// K线数据
    items: Option<flatbuffers::Vector<'static, flatbuffers::ForwardsUOffset<KlineItem<'static>>>>,
    /// 可见区域起始索引
    visible_start: usize,
    /// 可见区域K线数量
    visible_count: usize,
    /// 缓存的价格最低值
    cached_min_low: Option<f64>,
    /// 缓存的价格最高值
    cached_max_high: Option<f64>,
    /// 缓存的成交量最大值
    cached_max_volume: Option<f64>,
    /// 数据范围是否有效
    cached_range_valid: bool,
}

impl DataManager {
    /// 创建新的数据管理器
    pub fn new() -> Self {
        Self {
            items: None,
            visible_start: 0,
            visible_count: 0,
            cached_min_low: None,
            cached_max_high: None,
            cached_max_volume: None,
            cached_range_valid: false,
        }
    }

    /// 设置K线数据
    pub fn set_items(
        &mut self,
        items: flatbuffers::Vector<'static, flatbuffers::ForwardsUOffset<KlineItem<'static>>>,
    ) {
        // 清除缓存的范围计算
        self.invalidate_cache();

        // 设置数据
        self.items = Some(items);
    }

    /// 根据布局初始化可见范围
    pub fn initialize_visible_range(&mut self, layout: &ChartLayout) {
        let items_len = match &self.items {
            Some(items) => items.len(),
            None => 0,
        };

        if items_len > 0 {
            // 计算一屏可以显示的K线数量
            let initial_visible_count = ((layout.chart_area_width / layout.total_candle_width)
                .floor() as usize)
                .max(1) // 确保至少显示1根K线
                .min(items_len); // 不能超过总数据量
            self.visible_count = initial_visible_count;
            // 修改：默认显示末尾的数据，而不是从0开始
            if items_len > initial_visible_count {
                self.visible_start = items_len - initial_visible_count;
            } else {
                self.visible_start = 0;
            }
        } else {
            self.visible_count = 0;
            self.visible_start = 0;
        }
        // 确保缓存失效，以便重新计算数据范围
        self.invalidate_cache();
    }

    /// 获取K线数据
    pub fn get_items(
        &self,
    ) -> Option<flatbuffers::Vector<'static, flatbuffers::ForwardsUOffset<KlineItem<'static>>>>
    {
        self.items
    }

    /// 更新可见范围
    pub fn update_visible_range(&mut self, start: usize, count: usize) {
        // 如果可见范围发生变化，则无效化缓存
        if self.visible_start != start || self.visible_count != count {
            self.invalidate_cache();
        }

        self.visible_start = start;
        self.visible_count = count;
    }

    /// 获取可见范围
    pub fn get_visible(&self) -> (usize, usize, usize) {
        let items = match self.items {
            Some(items) => items,
            None => return (0, 0, 0),
        };
        (
            self.visible_start,
            self.visible_count,
            (self.visible_start + self.visible_count).min(items.len()),
        )
    }

    /// 无效化缓存的范围计算
    pub fn invalidate_cache(&mut self) {
        self.cached_min_low = None;
        self.cached_max_high = None;
        self.cached_max_volume = None;
        self.cached_range_valid = false;
    }
    // 获取计算缓存结果
    pub fn get_cached_cal(&self) -> (f64, f64, f64) {
        if self.cached_range_valid
            && self.cached_min_low.is_some()
            && self.cached_max_high.is_some()
            && self.cached_max_volume.is_some()
        {
            return (
                self.cached_min_low.unwrap(),
                self.cached_max_high.unwrap(),
                self.cached_max_volume.unwrap(),
            );
        }
        (0.0, 0.0, 0.0)
    }

    /// 计算可见区域的价格范围和最大成交量
    pub fn calculate_data_ranges(&mut self) -> (f64, f64, f64) {
        // 如果缓存有效，直接返回
        if self.cached_range_valid
            && self.cached_min_low.is_some()
            && self.cached_max_high.is_some()
            && self.cached_max_volume.is_some()
        {
            return (
                self.cached_min_low.unwrap(),
                self.cached_max_high.unwrap(),
                self.cached_max_volume.unwrap(),
            );
        }

        // 否则计算范围
        let (min_low, max_high, max_volume) = self.compute_data_ranges();

        // 缓存计算结果
        self.cached_min_low = Some(min_low);
        self.cached_max_high = Some(max_high);
        self.cached_max_volume = Some(max_volume);
        self.cached_range_valid = true;

        (min_low, max_high, max_volume)
    }

    /// 计算可见区域的价格范围和最大成交量（实际计算）
    fn compute_data_ranges(&self) -> (f64, f64, f64) {
        if let Some(items) = &self.items {
            if items.is_empty() {
                return (0.0, 0.0, 0.0);
            }

            // 获取可见范围
            let visible_start = self.visible_start;
            let visible_count = self.visible_count;
            let visible_end = (visible_start + visible_count).min(items.len());

            // 如果可见范围为空，返回默认值
            if visible_start >= visible_end {
                return (0.0, 0.0, 0.0);
            }

            // 只计算可见范围内的最大最小值
            let (min_low, max_high, max_volume) = (visible_start..visible_end).fold(
                (f64::MAX, f64::MIN, 0.0 as f64),
                |(min_low, max_high, max_volume), idx| {
                    let item = items.get(idx);
                    let low = item.low();
                    let high = item.high();
                    let volume = item.b_vol() + item.s_vol();
                    (min_low.min(low), max_high.max(high), max_volume.max(volume))
                },
            );

            // 为价格范围添加一点缓冲，让K线不贴边
            let price_range = max_high - min_low;
            let buffer = if price_range > 0.0 {
                price_range * 0.05 // 上下各增加5%的缓冲
            } else {
                1.0 // 如果价格范围为0（例如只有一个点），添加固定边距
            };

            // 如果最大成交量为0，设置一个默认值
            let max_volume = if max_volume == 0.0 {
                1.0 // 返回 1.0 而不是更大的值，避免坐标轴刻度过大
            } else {
                max_volume * 1.05 // 添加5%的边距，使图表更美观
            };

            return (min_low - buffer, max_high + buffer, max_volume);
        }

        (0.0, 0.0, 0.0)
    }

    /// 处理鼠标滚轮事件
    pub fn handle_wheel(
        &mut self,
        mouse_x: f64,
        mouse_y: f64,
        delta: f64,
        chart_area_x: f64,
        chart_area_width: f64,
        is_in_chart: bool,
    ) -> bool {
        // 如果没有数据或不在图表区域内，则不处理
        if !is_in_chart || self.items.is_none() {
            return false;
        }

        let items_len = self.items.unwrap().len();
        if items_len == 0 {
            return false;
        }

        // 计算鼠标在图表区域内的相对位置 (0.0 - 1.0)
        let relative_position = if chart_area_width > 0.0 {
            (mouse_x - chart_area_x) / chart_area_width
        } else {
            0.5 // 默认居中
        };

        // 缩放因子 - 正值放大，负值缩小
        let zoom_factor = if delta > 0.0 { 0.8 } else { 1.25 };

        // 当前可见区域的中心索引
        let visible_center_idx =
            self.visible_start as f64 + (self.visible_count as f64 * relative_position);

        // 新的可见数量
        let new_visible_count = ((self.visible_count as f64 * zoom_factor).round() as usize)
            .max(1) // 至少显示1根K线
            .min(items_len); // 不能超过总数据量

        // 计算新的起始索引，保持鼠标位置下的K线不变
        let new_visible_start = ((visible_center_idx
            - (new_visible_count as f64 * relative_position))
            .round() as isize)
            .max(0) // 不能小于0
            .min((items_len - new_visible_count) as isize) as usize; // 不能使结束索引超过数据长度

        // 如果可见范围发生变化，则更新并返回true表示需要重绘
        if new_visible_start != self.visible_start || new_visible_count != self.visible_count {
            self.update_visible_range(new_visible_start, new_visible_count);
            self.calculate_data_ranges();
            return true;
        }

        false
    }
}
