//! 数据管理器 - 负责管理K线数据和可见范围
//!
//! 这个模块是数据处理的核心，它通过分离历史数据和增量数据来优化性能。
//! - **历史数据**: 一次性从FlatBuffers加载，零拷贝读取。
//! - **增量数据**: 实时追加到`Vec`中，写入效率高。
//! - **统一访问**: 通过`KlineItemRef`枚举，对上层屏蔽了数据源的差异。

use super::model::{KlineItemOwned, KlineItemRef};
use crate::data::visible_range::{DataRange, VisibleRange};
use crate::kline_generated::kline::{self};
use crate::layout::ChartLayout;
use std::collections::HashMap;
use web_time::Instant;

/// 数据管理器
///
/// 持有并管理所有K线图表数据。
pub struct DataManager {
    /// 拥有所有权的FlatBuffers二进制数据。
    /// 这是所有`Borrowed`数据的来源。
    initial_buffer: Vec<u8>,

    /// 缓存的FlatBuffers解析结果，避免重复解析
    /// 使用'static生命周期 + unsafe代码确保内存安全
    parsed_data: Option<kline::KlineData<'static>>,

    /// 初始数据的长度，用于索引计算
    initial_items_len: usize,

    /// 存储实时追加的、已拥有所有权的K线数据。
    incremental_data: Vec<KlineItemOwned>,

    /// 最小变动价位。
    tick: f64,

    /// 可见数据范围。
    visible_range: VisibleRange,

    /// 缓存的可见区域数据范围（最高价、最低价、最大成交量）。
    /// `None`表示缓存无效，需要重新计算。
    cached_data_range: Option<DataRange>,

    /// 时间戳索引，用于快速查找和去重
    /// key: timestamp, value: index in incremental_data
    timestamp_index: HashMap<i32, usize>,
}

impl Default for DataManager {
    fn default() -> Self {
        Self::new()
    }
}

impl DataManager {
    /// 创建一个新的、空的`DataManager`。
    pub fn new() -> Self {
        Self {
            initial_buffer: Vec::new(),
            parsed_data: None,
            initial_items_len: 0,
            incremental_data: Vec::new(),
            tick: 0.01,
            visible_range: VisibleRange::new(0, 0, 0),
            cached_data_range: None,
            timestamp_index: HashMap::new(),
        }
    }

    /// 设置初始的、大量的历史数据。
    ///
    /// 此方法会获取`buffer`的所有权，并建立一个对其中数据的零拷贝视图。
    /// 同时缓存解析结果以避免重复解析，这是关键的性能优化。
    pub fn set_initial_data(&mut self, buffer: Vec<u8>) {
        self.invalidate_cache();
        self.incremental_data.clear(); // 清除任何旧的增量数据
        self.timestamp_index.clear(); // 清除时间戳索引

        // 安全性检查：确保传入的buffer是有效的KlineData
        if let Ok(kline_data) = kline::root_as_kline_data(&buffer) {
            self.tick = if kline_data.tick() > 0.0 {
                kline_data.tick()
            } else {
                0.01
            };

            // 获取初始数据的长度
            self.initial_items_len = kline_data.items().map_or(0, |items| items.len());

            // 移动buffer到self.initial_buffer
            self.initial_buffer = buffer;

            // 🔥 关键性能优化：缓存解析结果避免重复解析
            // unsafe: 我们确保initial_buffer的生命周期长于parsed_data
            // 因为DataManager拥有initial_buffer的所有权，所以这是安全的
            let parsed = kline::root_as_kline_data(&self.initial_buffer).ok();
            self.parsed_data = unsafe {
                std::mem::transmute::<Option<kline::KlineData<'_>>, Option<kline::KlineData<'static>>>(
                    parsed,
                )
            };
        } else {
            // 如果buffer无效，则重置所有状态
            self.initial_buffer.clear();
            self.parsed_data = None;
            self.initial_items_len = 0;
            self.tick = 0.01;
        }

        self.visible_range.update_total_len(self.len());
    }

    /// 追加一条新的K线数据（带去重功能）
    /// 返回是否实际添加了新数据
    pub fn append_item(&mut self, item: KlineItemOwned) -> bool {
        let _start_time = Instant::now();
        let timestamp = item.timestamp;

        // 检查是否已存在相同时间戳的数据
        if let Some(&existing_index) = self.timestamp_index.get(&timestamp) {
            // 更新现有数据而不是添加重复数据
            if existing_index < self.incremental_data.len() {
                self.incremental_data[existing_index] = item;
                self.invalidate_cache();
                return false; // 没有添加新数据
            }
        }

        // 添加新数据
        let new_index = self.incremental_data.len();
        self.incremental_data.push(item);
        self.timestamp_index.insert(timestamp, new_index);

        self.invalidate_cache();
        self.visible_range.update_total_len(self.len());

        true // 成功添加新数据
    }

    /// 合并一批新的K线数据项，并保持排序。
    ///
    /// 此方法用于处理数据补齐或乱序的场景。
    /// 它会合并新数据和现有增量数据，然后按时间戳排序。
    ///
    /// # 参数
    /// * `items_to_merge` - 一个包含 `KlineItemOwned` 的向量，代表需要合并的数据。
    ///
    /// # 返回
    /// * `usize` - 成功合并的新数据项数量。
    pub fn merge_items(&mut self, items_to_merge: Vec<KlineItemOwned>) -> usize {
        let mut new_items_count = 0;
        let mut needs_resort = false;

        for item in items_to_merge {
            let timestamp = item.timestamp;
            if !self.timestamp_index.contains_key(&timestamp) {
                // 只有当时间戳不存在时才添加
                self.incremental_data.push(item);
                // 标记需要重新排序
                needs_resort = true;
                new_items_count += 1;
            }
        }

        if needs_resort {
            // 如果添加了新数据，则对增量数据部分进行排序
            self.incremental_data.sort_by_key(|item| item.timestamp);

            // 排序后，必须重建时间戳索引
            self.timestamp_index.clear();
            for (index, item) in self.incremental_data.iter().enumerate() {
                self.timestamp_index.insert(item.timestamp, index);
            }

            // 数据结构发生变化，必须使缓存失效
            self.invalidate_cache();
            self.visible_range.update_total_len(self.len());
        }

        new_items_count
    }

    /// 获取指定索引的K线数据项的统一视图。
    ///
    /// 这个方法是数据访问的核心，它会根据索引自动从历史数据或增量数据中获取。
    /// 🔥 性能优化：使用缓存的解析结果避免重复解析FlatBuffers
    pub fn get(&self, index: usize) -> Option<KlineItemRef> {
        if index < self.initial_items_len {
            // 🔥 关键性能优化：优先使用缓存的解析结果
            if let Some(ref parsed) = self.parsed_data {
                if let Some(items) = parsed.items() {
                    if index < items.len() {
                        let item = items.get(index);
                        return Some(KlineItemRef::Borrowed(item));
                    }
                }
            }

            // fallback: 只有在缓存失效时才重新解析
            // 这种情况应该很少发生，主要是为了健壮性
            if let Ok(kline_data) = kline::root_as_kline_data(&self.initial_buffer) {
                if let Some(items) = kline_data.items() {
                    if index < items.len() {
                        let item = items.get(index);
                        return Some(KlineItemRef::Borrowed(item));
                    }
                }
            }
            None
        } else {
            // 从增量数据中获取所有权引用
            let incremental_index = index - self.initial_items_len;
            self.incremental_data
                .get(incremental_index)
                .map(KlineItemRef::Owned)
        }
    }

    /// 返回数据集中K线项的总数（历史 + 增量）。
    pub fn len(&self) -> usize {
        self.initial_items_len + self.incremental_data.len()
    }

    /// 根据布局初始化可见范围。
    pub fn initialize_visible_range(&mut self, layout: &ChartLayout) {
        self.visible_range = VisibleRange::from_layout(layout, self.len());
        self.invalidate_cache();
    }

    /// 更新可见范围。
    pub fn update_visible_range(&mut self, start: usize, count: usize) -> bool {
        if self.visible_range.update(start, count) {
            self.invalidate_cache();
            true
        } else {
            false
        }
    }

    /// 获取可见范围的元组 `(start, count, end)`。
    pub fn get_visible(&self) -> (usize, usize, usize) {
        self.visible_range.get_range()
    }

    /// 获取可见范围对象的不可变引用。
    pub fn get_visible_range(&self) -> &VisibleRange {
        &self.visible_range
    }

    /// 无效化缓存的数据范围计算结果。
    pub fn invalidate_cache(&mut self) {
        self.cached_data_range = None;
    }

    /// 获取缓存的计算结果 `(min_low, max_high, max_volume)`。
    pub fn get_cached_cal(&self) -> (f64, f64, f64) {
        self.cached_data_range
            .map_or((0.0, 0.0, 0.0), |dr| dr.get())
    }

    /// 计算可见区域的价格范围和最大成交量。
    ///
    /// 如果缓存有效，则直接返回缓存结果。否则，进行计算并缓存结果。
    pub fn calculate_data_ranges(&mut self) -> (f64, f64, f64) {
        if let Some(data_range) = &self.cached_data_range {
            return data_range.get();
        }

        if self.len() == 0 {
            return (0.0, 0.0, 0.0);
        }

        // 使用VisibleRange的calculate_data_ranges方法计算数据范围
        // 注意：这里需要传递一个闭包，让VisibleRange能够通过索引访问数据
        let data_range = self.visible_range.calculate_data_ranges(|i| self.get(i));

        self.cached_data_range = Some(data_range);
        data_range.get()
    }

    /// 处理鼠标滚轮事件。
    pub fn handle_wheel(
        &mut self,
        mouse_x: f64,
        _mouse_y: f64,
        delta: f64,
        chart_area_x: f64,
        chart_area_width: f64,
        is_in_chart: bool,
    ) -> bool {
        if !is_in_chart || self.len() == 0 {
            return false;
        }

        let (new_visible_start, new_visible_count) =
            self.visible_range
                .handle_wheel(mouse_x, chart_area_x, chart_area_width, delta);

        if self
            .visible_range
            .update(new_visible_start, new_visible_count)
        {
            self.invalidate_cache();
            self.calculate_data_ranges();
            true
        } else {
            false
        }
    }

    /// 获取tick值。
    pub fn get_tick(&self) -> f64 {
        self.tick
    }

    pub fn get_full_data_range(&self) -> (f64, f64) {
        if self.len() == 0 {
            return (0.0, 0.0);
        }

        let (min_low, max_high, _) = (0..self.len()).fold(
            (f64::MAX, f64::MIN, 0.0_f64),
            |(min_low, max_high, max_volume), idx| {
                if let Some(item) = self.get(idx) {
                    let low = item.low();
                    let high = item.high();
                    let volume = item.b_vol() + item.s_vol();
                    (min_low.min(low), max_high.max(high), max_volume.max(volume))
                } else {
                    (min_low, max_high, max_volume)
                }
            },
        );

        (min_low, max_high)
    }
}

/// 自定义Clone实现，因为parsed_data字段包含不可克隆的类型
impl Clone for DataManager {
    fn clone(&self) -> Self {
        // 对于克隆，我们需要重新解析FlatBuffers数据
        // 这比共享引用更安全，但性能稍差
        // 不过克隆操作本身应该很少发生
        let parsed_data = if self.initial_buffer.is_empty() {
            None
        } else {
            kline::root_as_kline_data(&self.initial_buffer)
                .ok()
                .map(|parsed| unsafe {
                    std::mem::transmute::<kline::KlineData<'_>, kline::KlineData<'static>>(parsed)
                })
        };

        Self {
            initial_buffer: self.initial_buffer.clone(),
            parsed_data,
            initial_items_len: self.initial_items_len,
            incremental_data: self.incremental_data.clone(),
            tick: self.tick,
            visible_range: self.visible_range,
            cached_data_range: self.cached_data_range,
            timestamp_index: self.timestamp_index.clone(),
        }
    }
}
