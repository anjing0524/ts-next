//! 渲染性能基准测试
//! 测试K线图渲染的各个环节性能

use crate::benchmark::{BenchmarkConfig, BenchmarkResult};
use crate::data::data_manager::DataManager;
use crate::layout::ChartLayout;
use std::time::Instant;

/// 渲染性能基准测试器
pub struct RenderBenchmark {
    data_manager: DataManager,
    layout: ChartLayout,
}

impl RenderBenchmark {
    pub fn new() -> Self {
        Self {
            data_manager: DataManager::new(),
            layout: ChartLayout::new(800.0, 600.0),
        }
    }

    /// 运行所有渲染性能测试
    pub fn run_tests(&self, config: &BenchmarkConfig) -> Vec<BenchmarkResult> {
        let mut results = Vec::new();

        // 测试数据范围计算性能
        results.push(self.benchmark_data_range_calculation(config));

        // 测试可见范围更新性能
        results.push(self.benchmark_visible_range_update(config));

        // 测试布局计算性能
        results.push(self.benchmark_layout_calculation(config));

        // 测试完整渲染流程性能
        results.push(self.benchmark_full_render_pipeline(config));

        results
    }

    /// 基准测试：数据范围计算
    fn benchmark_data_range_calculation(&self, config: &BenchmarkConfig) -> BenchmarkResult {
        let mut data_manager = self.data_manager.clone();

        // 预热
        for _ in 0..config.warmup_iterations {
            data_manager.calculate_data_ranges();
        }

        // 实际测试
        let start = Instant::now();
        for _ in 0..config.iterations {
            data_manager.calculate_data_ranges();
        }
        let duration = start.elapsed();

        let duration_ms = duration.as_secs_f64() * 1000.0;
        let ops_per_sec = config.iterations as f64 / duration.as_secs_f64();

        BenchmarkResult {
            test_name: "数据范围计算".to_string(),
            duration_ms,
            operations_per_second: ops_per_sec,
            memory_usage_mb: 0.0, // TODO: 实现内存使用测量
        }
    }

    /// 基准测试：可见范围更新
    fn benchmark_visible_range_update(&self, config: &BenchmarkConfig) -> BenchmarkResult {
        let mut data_manager = self.data_manager.clone();

        // 预热
        for i in 0..config.warmup_iterations {
            data_manager.update_visible_range(i % 100, 50);
        }

        // 实际测试
        let start = Instant::now();
        for i in 0..config.iterations {
            data_manager.update_visible_range(i % 100, 50);
        }
        let duration = start.elapsed();

        let duration_ms = duration.as_secs_f64() * 1000.0;
        let ops_per_sec = config.iterations as f64 / duration.as_secs_f64();

        BenchmarkResult {
            test_name: "可见范围更新".to_string(),
            duration_ms,
            operations_per_second: ops_per_sec,
            memory_usage_mb: 0.0,
        }
    }

    /// 基准测试：布局计算
    fn benchmark_layout_calculation(&self, config: &BenchmarkConfig) -> BenchmarkResult {
        let layout = ChartLayout::new(800.0, 600.0);

        // 预热
        for _ in 0..config.warmup_iterations {
            // 暂时使用简单操作替代，等待ChartLayout方法实现
            let _ = &layout;
        }

        // 实际测试
        let start = Instant::now();
        for _ in 0..config.iterations {
            // 暂时使用简单操作替代，等待ChartLayout方法实现
            let _ = &layout;
        }
        let duration = start.elapsed();

        let duration_ms = duration.as_secs_f64() * 1000.0;
        let ops_per_sec = config.iterations as f64 / duration.as_secs_f64();

        BenchmarkResult {
            test_name: "布局计算".to_string(),
            duration_ms,
            operations_per_second: ops_per_sec,
            memory_usage_mb: 0.0,
        }
    }

    /// 测试完整渲染流程性能
    fn benchmark_full_render_pipeline(&self, _config: &BenchmarkConfig) -> BenchmarkResult {
        // 注意：这里只能测试渲染逻辑，不能测试实际的Canvas绘制
        // 因为在测试环境中没有真实的Canvas上下文

        let duration_ms = 0.0; // 占位符
        let ops_per_sec = 0.0; // 占位符

        BenchmarkResult {
            test_name: "完整渲染流程".to_string(),
            duration_ms,
            operations_per_second: ops_per_sec,
            memory_usage_mb: 0.0,
        }
    }
}

impl Default for RenderBenchmark {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_benchmark_creation() {
        let benchmark = RenderBenchmark::new();
        let config = BenchmarkConfig::default();
        let results = benchmark.run_tests(&config);

        assert!(!results.is_empty());
        assert!(results.len() >= 3); // 至少有3个测试
    }

    #[test]
    fn test_data_range_calculation_benchmark() {
        let benchmark = RenderBenchmark::new();
        let config = BenchmarkConfig {
            iterations: 10,
            data_size: 100,
            warmup_iterations: 2,
        };

        let result = benchmark.benchmark_data_range_calculation(&config);
        assert_eq!(result.test_name, "数据范围计算");
        assert!(result.duration_ms >= 0.0);
        assert!(result.operations_per_second >= 0.0);
    }
}
