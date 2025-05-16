//! 数据管理器 - 负责管理K线数据和可见范围

use crate::data::visible_range::{DataRange, VisibleRange};
use crate::kline_generated::kline::KlineItem;
use crate::layout::ChartLayout;
use flatbuffers;

/// 数据管理器 - 负责管理K线数据和可见范围
pub struct DataManager {
    /// K线数据
    items: Option<flatbuffers::Vector<'static, flatbuffers::ForwardsUOffset<KlineItem<'static>>>>,
    /// 最小变动价位
    tick: f64,
    /// 可见数据范围
    visible_range: VisibleRange,
    /// 缓存的数据范围
    cached_data_range: Option<DataRange>,
    /// 数据范围是否有效
    cached_range_valid: bool,
}

impl DataManager {
    /// 创建新的数据管理器
    pub fn new() -> Self {
        Self {
            items: None,
            tick: 1.0,
            visible_range: VisibleRange::new(0, 0, 0),
            cached_data_range: None,
            cached_range_valid: false,
        }
    }

    /// 设置K线数据
    pub fn set_items(
        &mut self,
        items: flatbuffers::Vector<'static, flatbuffers::ForwardsUOffset<KlineItem<'static>>>,
        tick: f64,
    ) {
        // 清除缓存的范围计算
        self.invalidate_cache();

        // 设置数据
        let items_len = items.len();
        self.items = Some(items);
        self.tick = if tick > 0.0 { tick } else { 0.01 }; // 确保 tick 为正数
        // 更新可见范围的总长度
        self.visible_range.update_total_len(items_len);
    }

    /// 根据布局初始化可见范围
    pub fn initialize_visible_range(&mut self, layout: &ChartLayout) {
        let items_len = match &self.items {
            Some(items) => items.len(),
            None => 0,
        };

        // 使用VisibleRange的from_layout方法创建新的可见范围
        self.visible_range = VisibleRange::from_layout(layout, items_len);

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
        // 使用VisibleRange的update方法更新范围，如果发生变化则无效化缓存
        if self.visible_range.update(start, count) {
            self.invalidate_cache();
        }
    }

    /// 获取可见范围
    pub fn get_visible(&self) -> (usize, usize, usize) {
        // 直接使用VisibleRange的get_range方法
        self.visible_range.get_range()
    }

    /// 获取可见范围对象的引用
    pub fn get_visible_range(&self) -> &VisibleRange {
        &self.visible_range
    }

    /// 无效化缓存的范围计算
    pub fn invalidate_cache(&mut self) {
        self.cached_data_range = None;
        self.cached_range_valid = false;
    }

    /// 获取缓存的计算结果
    pub fn get_cached_cal(&self) -> (f64, f64, f64) {
        if self.cached_range_valid && self.cached_data_range.is_some() {
            return self.cached_data_range.unwrap().get();
        }
        (0.0, 0.0, 0.0)
    }

    /// 计算可见区域的价格范围和最大成交量
    pub fn calculate_data_ranges(&mut self) -> (f64, f64, f64) {
        // 如果缓存有效，直接返回
        if self.cached_range_valid && self.cached_data_range.is_some() {
            return self.cached_data_range.unwrap().get();
        }

        // 获取数据
        if let Some(items) = &self.items {
            // 使用VisibleRange的calculate_data_ranges方法计算数据范围
            let data_range = self.visible_range.calculate_data_ranges(items);

            // 缓存计算结果
            self.cached_data_range = Some(data_range);
            self.cached_range_valid = true;

            return data_range.get();
        }

        (0.0, 0.0, 0.0)
    }

    /// 处理鼠标滚轮事件
    pub fn handle_wheel(
        &mut self,
        mouse_x: f64,
        _mouse_y: f64,
        delta: f64,
        chart_area_x: f64,
        chart_area_width: f64,
        is_in_chart: bool,
    ) -> bool {
        // 如果没有数据或不在图表区域内，则不处理
        if !is_in_chart || self.items.is_none() {
            return false;
        }

        let items = self.items.unwrap();
        if items.len() == 0 {
            return false;
        }

        // 使用VisibleRange的handle_wheel方法计算新的可见范围
        let (new_visible_start, new_visible_count) =
            self.visible_range
                .handle_wheel(mouse_x, chart_area_x, chart_area_width, delta);

        // 无论是否更新可见范围，都无效化缓存
        // 这确保即使可见范围不变，也会重新计算数据范围
        self.invalidate_cache();

        // 更新可见范围并返回结果
        let range_updated = self
            .visible_range
            .update(new_visible_start, new_visible_count);

        // 始终重新计算数据范围，确保使用最新的数据边界
        self.calculate_data_ranges();

        // 如果发生了更新，或者Delta很大（表示快速缩放），则返回需要重绘
        range_updated || delta.abs() > 5.0
    }

    /// 获取 tick 值的方法
    pub fn get_tick(&self) -> f64 {
        self.tick
    }
}
