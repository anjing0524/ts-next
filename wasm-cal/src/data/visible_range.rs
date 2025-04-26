//! 可见数据范围模块 - 封装可见数据范围的计算和管理

use crate::layout::ChartLayout;
use crate::kline_generated::kline::KlineItem;
use flatbuffers;

/// 可见数据范围结构体
///
/// 封装了可见数据的起始索引、数量和结束索引，提供了安全的边界检查和范围计算
#[derive(Debug, Clone, Copy)]
pub struct VisibleRange {
    /// 可见区域起始索引
    start: usize,
    /// 可见区域数据数量
    count: usize,
    /// 可见区域结束索引（不包含）
    end: usize,
    /// 数据总长度
    total_len: usize,
}

/// 数据范围结构体
///
/// 存储计算后的价格范围和成交量范围
#[derive(Debug, Clone, Copy)]
pub struct DataRange {
    /// 最低价格
    pub min_low: f64,
    /// 最高价格
    pub max_high: f64,
    /// 最大成交量
    pub max_volume: f64,
}

impl DataRange {
    /// 创建新的数据范围
    pub fn new() -> Self {
        Self {
            min_low: 0.0,
            max_high: 0.0,
            max_volume: 0.0,
        }
    }

    /// 获取数据范围
    pub fn get(&self) -> (f64, f64, f64) {
        (self.min_low, self.max_high, self.max_volume)
    }
}

impl VisibleRange {
    /// 创建新的可见数据范围
    ///
    /// # 参数
    /// * `start` - 起始索引
    /// * `count` - 数据数量
    /// * `total_len` - 数据总长度
    ///
    /// # 返回值
    /// 返回一个新的VisibleRange实例，自动处理边界情况
    pub fn new(start: usize, count: usize, total_len: usize) -> Self {
        let count = count.max(1).min(total_len); // 确保至少显示1个数据点，且不超过总数据量
        let start = start.min(total_len.saturating_sub(count)); // 确保起始位置有效
        let end = (start + count).min(total_len); // 确保结束位置不超过总数据量

        Self {
            start,
            count,
            end,
            total_len,
        }
    }

    /// 根据布局初始化可见范围
    ///
    /// # 参数
    /// * `layout` - 图表布局
    /// * `items_len` - 数据总长度
    ///
    /// # 返回值
    /// 返回一个新的VisibleRange实例，基于布局计算初始可见范围
    pub fn from_layout(layout: &ChartLayout, items_len: usize) -> Self {
        if items_len == 0 {
            return Self::new(0, 0, 0);
        }

        // 计算一屏可以显示的K线数量
        let initial_visible_count = ((layout.chart_area_width / layout.total_candle_width)
            .floor() as usize)
            .max(1) // 确保至少显示1根K线
            .min(items_len); // 不能超过总数据量

        // 默认显示末尾的数据，而不是从0开始
        let start = if items_len > initial_visible_count {
            items_len - initial_visible_count
        } else {
            0
        };

        Self::new(start, initial_visible_count, items_len)
    }

    /// 更新可见范围
    ///
    /// # 参数
    /// * `start` - 新的起始索引
    /// * `count` - 新的数据数量
    ///
    /// # 返回值
    /// 返回是否发生了变化
    pub fn update(&mut self, start: usize, count: usize) -> bool {
        let old_start = self.start;
        let old_count = self.count;

        let count = count.max(1).min(self.total_len); // 确保至少显示1个数据点，且不超过总数据量
        let start = start.min(self.total_len.saturating_sub(count)); // 确保起始位置有效
        let end = (start + count).min(self.total_len); // 确保结束位置不超过总数据量

        self.start = start;
        self.count = count;
        self.end = end;

        // 返回是否发生了变化
        old_start != start || old_count != count
    }

    /// 更新数据总长度
    ///
    /// 当数据源变化时调用此方法更新总长度，并自动调整可见范围
    ///
    /// # 参数
    /// * `new_total_len` - 新的数据总长度
    ///
    /// # 返回值
    /// 返回是否发生了变化
    pub fn update_total_len(&mut self, new_total_len: usize) -> bool {
        if self.total_len == new_total_len {
            return false;
        }

        let old_start = self.start;
        let old_count = self.count;

        self.total_len = new_total_len;
        let count = self.count.max(1).min(new_total_len); // 确保至少显示1个数据点，且不超过总数据量
        let start = self.start.min(new_total_len.saturating_sub(count)); // 确保起始位置有效
        let end = (start + count).min(new_total_len); // 确保结束位置不超过总数据量

        self.start = start;
        self.count = count;
        self.end = end;

        // 返回是否发生了变化
        old_start != start || old_count != count
    }

    /// 获取完整的可见范围信息
    ///
    /// # 返回值
    /// 返回一个元组 (start, count, end)
    pub fn get_range(&self) -> (usize, usize, usize) {
        (self.start, self.count, self.end)
    }

    /// 检查索引是否在可见范围内
    pub fn contains(&self, index: usize) -> bool {
        index >= self.start && index < self.end
    }

    /// 获取指定全局索引在可见范围内的相对索引
    /// 
    /// # 参数
    /// * `global_index` - 全局数据索引
    /// 
    /// # 返回值
    /// 相对于可见范围起始位置的索引，如果索引不在可见范围内则返回None
    pub fn get_relative_index(&self, global_index: usize) -> Option<usize> {
        if self.contains(global_index) {
            Some(global_index - self.start)
        } else {
            None
        }
    }

    /// 将指数据点映射到X坐标
    /// 
    /// # 参数
    /// * `global_index` - 全局数据索引
    /// * `layout` - 图表布局
    /// 
    /// # 返回值
    /// X坐标（画布坐标系），如果索引不在可见范围内则返回None
    pub fn map_index_to_x(&self, global_index: usize, layout: &ChartLayout) -> Option<f64> {
        if self.contains(global_index) {
            Some(layout.map_index_to_x(global_index, self.start))
        } else {
            None
        }
    }

    /// 将X坐标映射到数据索引
    /// 
    /// # 参数
    /// * `x` - X坐标（画布坐标系）
    /// * `layout` - 图表布局
    /// 
    /// # 返回值
    /// 全局数据索引，如果X坐标超出范围则返回None
    pub fn map_x_to_index(&self, x: f64, layout: &ChartLayout) -> Option<usize> {
        layout.map_x_to_index(x, self.start, self.count, self.total_len)
    }

    /// 计算可见范围的屏幕坐标
    /// 
    /// # 参数
    /// * `layout` - 图表布局
    /// 
    /// # 返回值
    /// 可见范围的起始和结束X坐标
    pub fn get_screen_coordinates(&self, layout: &ChartLayout) -> (f64, f64) {
        layout.calculate_visible_range_coordinates(self.total_len, self.start, self.count)
    }

    /// 基于相对位置的缩放方法
    ///
    /// # 参数
    /// * `zoom_factor` - 缩放因子（小于1缩小可见范围，大于1扩大可见范围）
    /// * `relative_position` - 鼠标在可见区域内的相对位置 (0.0-1.0)
    ///
    /// # 返回值
    /// 返回新的起始索引和可见数量
    pub fn zoom_with_relative_position(
        &self,
        zoom_factor: f64,
        relative_position: f64,
    ) -> (usize, usize) {
        // 确保相对位置在有效范围内
        let relative_position = relative_position.min(1.0).max(0.0);
        
        let visible_count = self.count.max(1);
        let visible_center_idx = self.start as f64 + (visible_count as f64 * relative_position);

        // 计算新的可见数量，并确保在有效范围内
        let new_visible_count = ((visible_count as f64 * zoom_factor).round() as usize)
            .max(1)
            .min(self.total_len);

        // 计算新的起始位置，保持相对位置点不变
        let new_start = ((visible_center_idx - (new_visible_count as f64 * relative_position))
            .round() as isize)
            .max(0)
            .min((self.total_len - new_visible_count) as isize) as usize;

        (new_start, new_visible_count)
    }

    /// 处理鼠标滚轮事件
    ///
    /// # 参数
    /// * `mouse_x` - 鼠标X坐标
    /// * `chart_area_x` - 图表区域X坐标
    /// * `chart_area_width` - 图表区域宽度
    /// * `delta` - 滚轮滚动量
    ///
    /// # 返回值
    /// 返回新的起始索引和可见数量
    pub fn handle_wheel(
        &self,
        mouse_x: f64,
        chart_area_x: f64,
        chart_area_width: f64,
        delta: f64,
    ) -> (usize, usize) {
        // 计算相对位置
        let relative_position = if chart_area_width > 0.0 {
            ((mouse_x - chart_area_x) / chart_area_width).min(1.0).max(0.0)
        } else {
            0.5
        };

        // 计算缩放因子
        let zoom_factor = if delta > 0.0 { 0.8 } else { 1.25 };

        // 调用通用缩放方法
        self.zoom_with_relative_position(zoom_factor, relative_position)
    }

    /// 计算可见区域的数据范围
    ///
    /// # 参数
    /// * `items` - K线数据
    ///
    /// # 返回值
    /// 返回计算出的数据范围
    pub fn calculate_data_ranges(
        &self,
        items: &flatbuffers::Vector<'_, flatbuffers::ForwardsUOffset<KlineItem<'_>>>,
    ) -> DataRange {
        if items.is_empty() || self.start >= self.end {
            return DataRange::new();
        }

        // 只计算可见范围内的最大最小值
        let (min_low, max_high, max_volume) = (self.start..self.end).fold(
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

        DataRange {
            min_low: min_low - buffer,
            max_high: max_high + buffer,
            max_volume,
        }
    }

    /// 预计算所有可见项的X坐标，用于批量渲染
    /// 
    /// # 参数
    /// * `layout` - 图表布局
    /// 
    /// # 返回值
    /// 返回包含所有可见项X坐标的向量
    pub fn precompute_x_coordinates(&self, layout: &ChartLayout) -> Vec<f64> {
        let mut x_coords = Vec::with_capacity(self.count);
        
        // 始终绘制所有可见区域内的内容，不进行任何过滤
        // 这样可确保在缩放操作期间所有数据点都能够被正确渲染
        for global_index in self.start..self.end {
            let x = layout.map_index_to_x(global_index, self.start);
            x_coords.push(x);
        }
        
        x_coords
    }
}
