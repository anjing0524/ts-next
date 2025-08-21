//! Tick 计算工具 - 为热图和订单簿提供统一的 tick 大小计算逻辑

/// 计算优化的 tick 大小，确保热图和订单簿使用相同的价格区间划分
///
/// # 参数
/// * `base_tick` - 数据中的基础 tick 大小
/// * `min_price` - 最低价格
/// * `max_price` - 最高价格  
/// * `canvas_height` - 画布高度（像素）
///
/// # 返回
/// 调整后的最优 tick 大小
pub fn calculate_optimal_tick(
    base_tick: f64,
    min_price: f64,
    max_price: f64,
    canvas_height: f64,
) -> f64 {
    // 根据画布高度计算最优 bin 数量：
    // - 每个 bin 至少 3 像素高度以确保可视性
    // - 最小 50 个 bin，最大 200 个 bin 以平衡精度和性能
    let optimal_bins = (canvas_height / 3.0).max(50.0).min(200.0) as usize;

    // 计算理想的 tick 大小，但不小于基础 tick 的 2 倍
    // 这确保了不会过度细分价格区间
    let ideal_tick = (max_price - min_price) / optimal_bins as f64;
    ideal_tick.max(base_tick * 2.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_optimal_tick() {
        // 测试基本情况
        let result = calculate_optimal_tick(1.0, 2000.0, 3000.0, 600.0);
        assert!(result >= 2.0); // 应该至少是 base_tick 的 2 倍

        // 测试极小画布情况
        let result = calculate_optimal_tick(1.0, 2000.0, 3000.0, 100.0);
        assert!(result >= 2.0);

        // 测试极大画布情况
        let result = calculate_optimal_tick(1.0, 2000.0, 3000.0, 2000.0);
        assert!(result >= 2.0);
    }
}
