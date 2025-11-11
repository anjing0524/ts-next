//! 全局热图索引模块 - 存储预计算的热图数据

/// 存储整个数据集的预计算热图索引
///
/// 该结构体在数据加载时一次性生成，用于在渲染时提供快速的数据切片访问，
/// 避免了在拖拽或缩放过程中的重复计算。
#[derive(Debug, Clone)]
pub struct GlobalHeatmapIndex {
    /// 预计算好的热图数据。
    /// 使用一维Vec模拟二维数组，布局为 (time_idx * price_buckets_len + price_bucket_idx)。
    /// 这种布局对CPU缓存更友好。
    pub heatmap_bins: Vec<f64>,

    /// 时间轴维度，即K线数据的总长度。
    pub time_len: usize,

    /// 价格轴维度，即价格分桶的数量。
    pub price_buckets_len: usize,

    // --- 元数据 ---
    /// 全局最小价格，对应价格桶索引0。
    pub global_min_price: f64,

    /// 全局最大价格。
    pub global_max_price: f64,

    /// 用于分桶的tick大小，通常是合约的最小变动价位。
    pub tick_size: f64,

    /// 在所有数据中，单个(时间, 价格)组合的bin内出现的最大订单量。
    /// 用于颜色渲染时的归一化。
    pub global_max_volume_in_bin: f64,
}

impl GlobalHeatmapIndex {
    /// 创建一个新的、空的 `GlobalHeatmapIndex`。
    pub fn new(
        time_len: usize,
        price_buckets_len: usize,
        global_min_price: f64,
        global_max_price: f64,
        tick_size: f64,
    ) -> Self {
        let heatmap_bins = if time_len > 0 && price_buckets_len > 0 {
            vec![0.0; time_len * price_buckets_len]
        } else {
            Vec::new()
        };
        Self {
            heatmap_bins,
            time_len,
            price_buckets_len,
            global_min_price,
            global_max_price,
            tick_size,
            global_max_volume_in_bin: 0.0,
        }
    }
}
