//! 性能基准测试模块
//! 提供渲染性能测试

pub mod render_benchmark;

pub use render_benchmark::RenderBenchmark;

/// 基准测试结果
#[derive(Debug, Clone)]
pub struct BenchmarkResult {
    pub test_name: String,
    pub duration_ms: f64,
    pub operations_per_second: f64,
    pub memory_usage_mb: f64,
}

/// 基准测试配置
#[derive(Debug, Clone)]
pub struct BenchmarkConfig {
    pub iterations: usize,
    pub data_size: usize,
    pub warmup_iterations: usize,
}

impl Default for BenchmarkConfig {
    fn default() -> Self {
        Self {
            iterations: 100,
            data_size: 1000,
            warmup_iterations: 10,
        }
    }
}

/// 基准测试套件
pub struct BenchmarkSuite {
    config: BenchmarkConfig,
    results: Vec<BenchmarkResult>,
}

impl BenchmarkSuite {
    pub fn new(config: BenchmarkConfig) -> Self {
        Self {
            config,
            results: Vec::new(),
        }
    }

    pub fn run_all_tests(&mut self) -> Vec<BenchmarkResult> {
        self.results.clear();

        // 运行渲染性能测试
        let render_benchmark = RenderBenchmark::new();
        self.results
            .extend(render_benchmark.run_tests(&self.config));

        self.results.clone()
    }

    pub fn get_results(&self) -> &[BenchmarkResult] {
        &self.results
    }

    pub fn print_results(&self) {
        println!("\n=== 性能基准测试结果 ===");
        println!(
            "{:<30} {:>15} {:>20} {:>15}",
            "测试名称", "耗时(ms)", "操作/秒", "内存(MB)"
        );
        println!("{}", "-".repeat(80));

        for result in &self.results {
            println!(
                "{:<30} {:>15.2} {:>20.0} {:>15.2}",
                result.test_name,
                result.duration_ms,
                result.operations_per_second,
                result.memory_usage_mb
            );
        }
    }
}
