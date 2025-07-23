# WASM-CAL 渲染引擎架构设计文档

## 版本信息
- **版本**: v3.1
- **最后更新**: 2024-12-19
- **作者**: 架构团队
- **更新内容**: 添加性能基准、WebAssembly 优化策略、OffscreenCanvas 最佳实践和具体实施指导

## 概述

WASM-CAL 是一个基于 WebAssembly 和 Rust 构建的高性能 K 线图渲染引擎。本文档详细描述了 v3.0 版本的架构设计，重点关注性能优化、内存管理和可扩展性。该引擎充分利用了 WebAssembly 的近原生性能优势和 Rust 的内存安全特性，为金融数据可视化提供了企业级的解决方案。

**文档目标**: 本文档是重构渲染引擎的最终工程蓝图。它提供了对**所有**核心组件的详尽设计、实现逻辑和演进思路，包含具体的性能基准、优化策略和迁移指南，是后续编码的唯一依据。

**性能目标**:
- 渲染帧率：目标 60fps，最低 30fps
- 内存使用：峰值内存不超过 50MB
- 初始化时间：小于 100ms
- 数据处理延迟：小于 16ms（一帧时间）
- Canvas API 调用优化：减少 50% 的调用次数

---

## 1. 技术背景与理论基础

### 1.1 WebAssembly 技术优势

#### 1.1.1 性能特性
- **近原生执行速度**: WebAssembly 提供接近原生代码的执行性能，相比 JavaScript 在计算密集型任务中有显著优势
- **紧凑的二进制格式**: 优化的字节码格式确保快速下载和解析
- **SIMD 支持**: 利用 SIMD 指令集进行向量化计算，特别适合图形渲染和数值计算

#### 1.1.2 内存模型
- **线性内存**: WebAssembly 使用单一的线性内存空间，简化内存管理
- **多内存块支持**: 2024年标准化的多内存块特性允许模块内部数据和共享数据分离，提升安全性
- **内存隔离**: 严格的内存访问规则减少缓冲区溢出等安全风险

#### 1.1.3 线程模型演进
- **共享线性内存**: 基于 SharedArrayBuffer 的线程提案支持多线程并行处理
- **单线程优化**: 针对当前主流的单线程执行环境进行专门优化

#### 1.1.4 WebAssembly 特定优化策略

**内存布局优化**:
```rust
// 使用紧凑的内存布局减少内存占用
#[repr(C, packed)]
struct CompactKlineData {
    timestamp: i64,
    ohlcv: [f32; 5], // 使用 f32 而非 f64，减少 50% 内存
}

// 批量数据结构，提高缓存局部性
#[repr(C)]
struct KlineDataBatch {
    timestamps: Vec<i64>,
    opens: Vec<f32>,
    highs: Vec<f32>,
    lows: Vec<f32>,
    closes: Vec<f32>,
    volumes: Vec<f32>,
}
```

**跨边界调用优化**:
- 最小化 JS-WASM 数据传输，采用"复制一次"策略
- 使用 FlatBuffer 进行高效的序列化/反序列化
- 批量传输数据而非单个元素传输

**SIMD 指令集优化**:
```rust
#[cfg(target_feature = "simd128")]
use std::arch::wasm32::*;

// 向量化价格坐标计算
fn batch_price_to_y_simd(prices: &[f32], min_price: f32, max_price: f32, chart_height: f32) -> Vec<f32> {
    let price_range = max_price - min_price;
    let scale = chart_height / price_range;
    
    let min_vec = f32x4_splat(min_price);
    let scale_vec = f32x4_splat(scale);
    let height_vec = f32x4_splat(chart_height);
    
    // 每次处理 4 个价格值
    prices.chunks_exact(4).map(|chunk| {
        unsafe {
            let prices_vec = v128_load(chunk.as_ptr() as *const v128);
            let normalized = f32x4_sub(prices_vec, min_vec);
            let scaled = f32x4_mul(normalized, scale_vec);
            f32x4_sub(height_vec, scaled)
        }
    }).collect()
}
```

**内存增长策略**:
- 预分配内存池避免频繁扩容
- 使用对象池模式复用临时对象
- 实现智能的内存回收机制

### 1.2 Rust 语言优势

#### 1.2.1 内存安全
- **所有权系统**: 编译时保证内存安全，无需垃圾回收器
- **借用检查**: 防止数据竞争和悬垂指针
- **智能指针**: `Rc<RefCell<T>>` 模式支持运行时借用检查和多重所有权

#### 1.2.2 性能特性
- **零成本抽象**: 高级抽象不引入运行时开销
- **LLVM 优化**: 利用 LLVM 后端进行深度代码优化
- **内存布局控制**: 精确控制数据结构的内存布局

#### 1.2.3 Rust 在 WASM 环境下的特殊考虑

**所有权模型优化**:
```rust
// 使用 Rc<RefCell<T>> 进行共享状态管理
use std::rc::Rc;
use std::cell::RefCell;

struct ChartCore {
    data_manager: Rc<RefCell<DataManager>>,
    layout: Rc<RefCell<ChartLayout>>,
    config_manager: Rc<RefCell<ConfigManager>>,
}

// 借用检查器友好的设计模式
impl ChartCore {
    fn update_layout(&self, new_size: (f64, f64)) {
        let mut layout = self.layout.borrow_mut();
        layout.update_size(new_size);
        // 自动释放借用
    }
}
```

**零拷贝数据处理**:
```rust
// 直接操作 WASM 线性内存
fn process_flatbuffer_data(buffer: &[u8]) -> &[KlineData] {
    // 零拷贝解析 FlatBuffer 数据
    flatbuffers::root::<KlineDataVector>(buffer)
        .unwrap()
        .items()
        .unwrap()
}

// 避免不必要的数据复制
fn get_visible_data<'a>(data: &'a [KlineData], range: &VisibleRange) -> &'a [KlineData] {
    &data[range.start_index..range.end_index]
}
```

**生命周期管理策略**:
- 明确数据的生命周期边界
- 使用 RAII 模式自动管理资源
- 避免循环引用导致的内存泄漏

### 1.3 软件工程最佳实践

#### 1.3.1 SOLID 原则应用
- **单一职责原则 (SRP)**: 每个组件只负责一个明确的功能
- **开闭原则 (OCP)**: 通过 trait 系统支持扩展而无需修改现有代码
- **里氏替换原则 (LSP)**: 确保实现类型可以无缝替换抽象类型
- **接口隔离原则 (ISP)**: 设计细粒度的 trait 接口
- **依赖倒置原则 (DIP)**: 依赖抽象而非具体实现

#### 1.3.2 清洁架构模式
- **分层架构**: 明确的依赖方向，内层不依赖外层
- **依赖注入**: 通过构造函数注入依赖，提高可测试性
- **关注点分离**: 业务逻辑与技术实现分离

### 1.4 OffscreenCanvas 最佳实践

#### 1.4.1 多层渲染策略

**三层架构设计**:
```rust
#[derive(Debug, Clone, Copy)]
enum CanvasLayer {
    Base,    // 静态背景：网格、坐标轴
    Main,    // 主要内容：K线、成交量
    Overlay, // 交互层：十字线、提示框
}

struct CanvasManager {
    base_canvas: OffscreenCanvas,
    main_canvas: OffscreenCanvas,
    overlay_canvas: OffscreenCanvas,
    composite_canvas: OffscreenCanvas, // 最终合成画布
}

impl CanvasManager {
    fn composite_layers(&self) {
        let ctx = self.composite_canvas.get_context("2d").unwrap();
        ctx.clear_rect(0.0, 0.0, self.width, self.height);
        
        // 按层次顺序合成
        ctx.draw_image(&self.base_canvas, 0.0, 0.0);
        ctx.draw_image(&self.main_canvas, 0.0, 0.0);
        ctx.draw_image(&self.overlay_canvas, 0.0, 0.0);
    }
}
```

**智能层级更新**:
```rust
#[derive(Debug, Clone, Copy, Default)]
struct DirtyFlags {
    base: bool,
    main: bool,
    overlay: bool,
}

impl CanvasManager {
    fn render_layers(&mut self, dirty_flags: DirtyFlags) {
        if dirty_flags.base {
            self.render_base_layer();
        }
        if dirty_flags.main {
            self.render_main_layer();
        }
        if dirty_flags.overlay {
            self.render_overlay_layer();
        }
        
        // 只有在有层更新时才重新合成
        if dirty_flags.base || dirty_flags.main || dirty_flags.overlay {
            self.composite_layers();
        }
    }
}
```

#### 1.4.2 批量 Canvas API 调用优化

**路径批量处理**:
```rust
struct BatchCanvasRenderer {
    path_commands: Vec<PathCommand>,
    text_commands: Vec<TextCommand>,
    current_style: CanvasStyle,
}

#[derive(Debug)]
enum PathCommand {
    MoveTo(f64, f64),
    LineTo(f64, f64),
    Rect(f64, f64, f64, f64),
    Arc(f64, f64, f64, f64, f64),
    Stroke,
    Fill,
}

impl BatchCanvasRenderer {
    fn add_line(&mut self, x1: f64, y1: f64, x2: f64, y2: f64) {
        self.path_commands.push(PathCommand::MoveTo(x1, y1));
        self.path_commands.push(PathCommand::LineTo(x2, y2));
    }
    
    fn flush(&mut self, ctx: &OffscreenCanvasRenderingContext2d) {
        if !self.path_commands.is_empty() {
            ctx.begin_path();
            for cmd in &self.path_commands {
                match cmd {
                    PathCommand::MoveTo(x, y) => ctx.move_to(*x, *y),
                    PathCommand::LineTo(x, y) => ctx.line_to(*x, *y),
                    PathCommand::Rect(x, y, w, h) => ctx.rect(*x, *y, *w, *h),
                    PathCommand::Stroke => ctx.stroke(),
                    PathCommand::Fill => ctx.fill(),
                    _ => {}
                }
            }
            self.path_commands.clear();
        }
    }
}
```

#### 1.4.3 ImageData 直接操作优化

**像素级优化**:
```rust
struct PixelBuffer {
    data: Vec<u8>,
    width: u32,
    height: u32,
}

impl PixelBuffer {
    fn set_pixel(&mut self, x: u32, y: u32, color: [u8; 4]) {
        let index = ((y * self.width + x) * 4) as usize;
        if index + 3 < self.data.len() {
            self.data[index] = color[0];     // R
            self.data[index + 1] = color[1]; // G
            self.data[index + 2] = color[2]; // B
            self.data[index + 3] = color[3]; // A
        }
    }
    
    fn draw_line_bresenham(&mut self, x0: i32, y0: i32, x1: i32, y1: i32, color: [u8; 4]) {
        // Bresenham 直线算法，直接操作像素
        let dx = (x1 - x0).abs();
        let dy = (y1 - y0).abs();
        let sx = if x0 < x1 { 1 } else { -1 };
        let sy = if y0 < y1 { 1 } else { -1 };
        let mut err = dx - dy;
        
        let mut x = x0;
        let mut y = y0;
        
        loop {
            self.set_pixel(x as u32, y as u32, color);
            
            if x == x1 && y == y1 { break; }
            
            let e2 = 2 * err;
            if e2 > -dy {
                err -= dy;
                x += sx;
            }
            if e2 < dx {
                err += dx;
                y += sy;
            }
        }
    }
    
    fn to_image_data(&self) -> ImageData {
        ImageData::new_with_u8_clamped_array_and_sh(
            wasm_bindgen::Clamped(&self.data),
            self.width,
            self.height,
        ).unwrap()
    }
}
```

### 1.5 性能测试和基准测试策略

#### 1.5.1 性能基准指标

**核心性能指标**:
```rust
#[derive(Debug, Clone)]
struct PerformanceMetrics {
    // 渲染性能
    frame_rate: f64,           // 当前帧率
    render_time: f64,          // 单帧渲染时间 (ms)
    
    // 内存使用
    memory_usage: usize,       // 当前内存使用 (bytes)
    peak_memory: usize,        // 峰值内存使用
    
    // 数据处理
    data_load_time: f64,       // 数据加载时间 (ms)
    cache_hit_rate: f64,       // 缓存命中率
    
    // Canvas 操作
    canvas_api_calls: u32,     // Canvas API 调用次数
    batch_efficiency: f64,     // 批量操作效率
}

struct PerformanceMonitor {
    metrics: PerformanceMetrics,
    frame_times: VecDeque<f64>,
    memory_samples: VecDeque<usize>,
    start_time: f64,
}

impl PerformanceMonitor {
    fn record_frame(&mut self, render_time: f64) {
        self.frame_times.push_back(render_time);
        if self.frame_times.len() > 60 { // 保持最近60帧的数据
            self.frame_times.pop_front();
        }
        
        // 计算平均帧率
        let avg_frame_time: f64 = self.frame_times.iter().sum::<f64>() / self.frame_times.len() as f64;
        self.metrics.frame_rate = 1000.0 / avg_frame_time;
    }
    
    fn get_performance_report(&self) -> PerformanceReport {
        PerformanceReport {
            fps: self.metrics.frame_rate,
            memory_mb: self.metrics.memory_usage as f64 / 1024.0 / 1024.0,
            cache_efficiency: self.metrics.cache_hit_rate,
            optimization_score: self.calculate_optimization_score(),
        }
    }
}
```

#### 1.5.2 测试场景设计

**压力测试场景**:
```rust
#[derive(Debug)]
enum TestScenario {
    LargeDataset {        // 大数据集测试
        data_points: usize,   // 数据点数量
        time_range: TimeRange, // 时间范围
    },
    FrequentInteraction { // 频繁交互测试
        operations_per_second: u32,
        duration_seconds: u32,
    },
    MultiChart {          // 多图表测试
        chart_count: usize,
        data_per_chart: usize,
    },
    MemoryPressure {      // 内存压力测试
        target_memory_mb: usize,
        sustained_duration: u32,
    },
}

struct PerformanceTestSuite {
    scenarios: Vec<TestScenario>,
    baseline_metrics: Option<PerformanceMetrics>,
}

impl PerformanceTestSuite {
    fn run_benchmark(&mut self, chart_core: &mut ChartCore) -> TestResults {
        let mut results = TestResults::new();
        
        for scenario in &self.scenarios {
            let start_time = web_sys::window().unwrap().performance().unwrap().now();
            
            match scenario {
                TestScenario::LargeDataset { data_points, time_range } => {
                    let test_data = self.generate_test_data(*data_points, time_range);
                    chart_core.set_data(test_data);
                    
                    // 测试渲染性能
                    for _ in 0..60 { // 渲染60帧
                        chart_core.render();
                    }
                },
                TestScenario::FrequentInteraction { operations_per_second, duration_seconds } => {
                    self.simulate_user_interactions(chart_core, *operations_per_second, *duration_seconds);
                },
                _ => {}
            }
            
            let end_time = web_sys::window().unwrap().performance().unwrap().now();
            results.add_scenario_result(scenario, end_time - start_time);
        }
        
        results
    }
}
```

## 2. 核心设计哲学

- **职责分离**: 严格分离API边界 (`KlineProcess`) 与应用核心 (`ChartCore`)。
- **类型系统驱动**: 以 Rust Trait 为基石，构建模块化、可组合的动态渲染架构。
- **单线程优化**: 所有共享状态使用 `Rc<RefCell<T>>` 进行高效、安全的管理。
- **所有权明确**: 在WASM边界通过"复制一次"原则获取数据所有权，确保内存安全。

---

## 3. 顶层架构设计

### 3.1 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        KlineProcess                        │
│                     (API 委托层)                           │
│              WebAssembly 边界接口                          │
├─────────────────────────────────────────────────────────────┤
│                        ChartCore                           │
│                  (应用状态与逻辑核心)                        │
│                   Rc<RefCell<T>> 管理                      │
├─────────────────────────────────────────────────────────────┤
│  DataManager  │  LayoutManager  │  CanvasManager           │
│   (数据服务)   │   (布局服务)     │   (画布服务)              │
│    SOLID SRP  │    坐标变换      │    渲染上下文             │
├─────────────────────────────────────────────────────────────┤
│                   RendererManager                          │
│                  (动态渲染管理器)                            │
│                   工厂模式 + 策略模式                        │
├─────────────────────────────────────────────────────────────┤
│  CandleRenderer │ VolumeRenderer │ IndicatorRenderer │ ... │
│   (K线渲染器)    │  (成交量渲染器)  │   (指标渲染器)     │     │
│    Trait 驱动   │   内存优化      │    可扩展设计      │     │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 架构层次说明

#### 3.2.1 API 委托层 (KlineProcess)
- **职责**: WebAssembly 与 JavaScript 的边界接口
- **设计原则**: 最小化跨边界数据传输，采用"复制一次"策略
- **内存管理**: 在边界处获取数据所有权，避免悬垂引用

#### 3.2.2 应用核心层 (ChartCore)
- **职责**: 应用状态管理和业务逻辑协调
- **共享状态**: 使用 `Rc<RefCell<T>>` 模式管理组件间共享数据
- **生命周期**: 控制所有子组件的创建、更新和销毁

#### 3.2.3 服务层 (Managers)
- **DataManager**: 数据存储、索引和查询服务
- **LayoutManager**: 坐标系统和视口管理
- **CanvasManager**: 渲染上下文和画布操作

#### 3.2.4 渲染层 (Renderers)
- **动态加载**: 支持运行时添加和移除渲染器
- **性能优化**: 基于脏标记的增量渲染
- **内存效率**: 对象池和缓存策略

### 3.3 性能优化策略

#### 3.3.1 基于代码分析的性能瓶颈识别

**当前架构性能问题**:
1. **内存分配频繁**: `VisibleRange::calculate_data_ranges` 每次都重新计算
2. **重复计算**: `ChartLayout` 坐标映射函数缺乏缓存
3. **字符串分配**: `AxisRenderer` 中大量字符串格式化操作
4. **Canvas API 调用**: 每个渲染器独立调用 Canvas API，缺乏批量优化
5. **数据访问模式**: FlatBuffer 数据访问未充分利用零拷贝特性

#### 3.3.2 内存管理优化

**对象池模式 - 减少分配开销**:
```rust
use std::collections::VecDeque;

struct RenderObjectPool {
    coordinate_buffers: VecDeque<Vec<f64>>,
    string_buffers: VecDeque<String>,
    path_buffers: VecDeque<Vec<(f64, f64)>>,
}

impl RenderObjectPool {
    fn acquire_coordinate_buffer(&mut self, capacity: usize) -> Vec<f64> {
        self.coordinate_buffers.pop_front()
            .map(|mut buf| { buf.clear(); buf.reserve(capacity); buf })
            .unwrap_or_else(|| Vec::with_capacity(capacity))
    }
    
    fn release_coordinate_buffer(&mut self, mut buffer: Vec<f64>) {
        if buffer.capacity() <= 1024 { // 避免内存泄漏
            buffer.clear();
            self.coordinate_buffers.push_back(buffer);
        }
    }
}
```

**智能缓存策略 - 基于数据哈希的失效机制**:
```rust
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

struct SmartRenderCache {
    price_coordinates: Option<(u64, Vec<f64>)>, // (hash, coordinates)
    volume_coordinates: Option<(u64, Vec<f64>)>,
    axis_labels: Option<(u64, Vec<String>)>,
    layout_hash: Option<u64>,
}

impl SmartRenderCache {
    fn get_price_coordinates(&mut self, data_manager: &DataManager, layout: &ChartLayout) -> &[f64] {
        let current_hash = self.calculate_data_hash(data_manager, layout);
        
        if let Some((cached_hash, ref coords)) = self.price_coordinates {
            if cached_hash == current_hash {
                return coords;
            }
        }
        
        // 重新计算并缓存
        let new_coords = self.calculate_price_coordinates(data_manager, layout);
        self.price_coordinates = Some((current_hash, new_coords));
        &self.price_coordinates.as_ref().unwrap().1
    }
}
```

**内存布局优化 - 结构体对齐和紧凑存储**:
```rust
#[repr(C, packed)]
struct CompactKlineData {
    timestamp: i64,
    ohlc: [f32; 4],    // 使用 f32 减少 50% 内存
    volume: f32,
}

// 批量数据结构，提高缓存局部性
#[repr(C)]
struct KlineDataBatch {
    timestamps: Vec<i64>,
    opens: Vec<f32>,
    highs: Vec<f32>,
    lows: Vec<f32>,
    closes: Vec<f32>,
    volumes: Vec<f32>,
}
```

#### 3.3.3 渲染性能优化

**增量渲染 - 基于脏区域的精确更新**:
```rust
#[derive(Debug, Clone, Copy)]
struct DirtyRegion {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    layer: CanvasLayer,
}

struct IncrementalRenderer {
    dirty_regions: Vec<DirtyRegion>,
    last_visible_range: Option<(usize, usize)>,
    last_layout_hash: Option<u64>,
}

impl IncrementalRenderer {
    fn render_incremental(&mut self, 
                         renderers: &[Box<dyn Renderer>],
                         ctx: &OffscreenCanvasRenderingContext2d) {
        for region in &self.dirty_regions {
            ctx.save();
            ctx.begin_path();
            ctx.rect(region.x, region.y, region.width, region.height);
            ctx.clip();
            
            // 只渲染影响该区域的渲染器
            for renderer in renderers {
                if renderer.affects_region(region) {
                    renderer.render_region(ctx, region);
                }
            }
            
            ctx.restore();
        }
        
        self.dirty_regions.clear();
    }
}
```

**Canvas API 批量优化**:
```rust
struct BatchCanvasRenderer {
    line_batch: Vec<(f64, f64, f64, f64)>,
    rect_batch: Vec<(f64, f64, f64, f64)>,
    text_batch: Vec<(String, f64, f64)>,
    current_style: Option<CanvasStyle>,
}

impl BatchCanvasRenderer {
    fn flush_lines(&mut self, ctx: &OffscreenCanvasRenderingContext2d) {
        if self.line_batch.is_empty() { return; }
        
        ctx.begin_path();
        for &(x1, y1, x2, y2) in &self.line_batch {
            ctx.move_to(x1, y1);
            ctx.line_to(x2, y2);
        }
        ctx.stroke();
        
        self.line_batch.clear();
    }
}
```

**SIMD 优化 - 向量化数学计算**:
```rust
#[cfg(target_arch = "wasm32")]
use std::arch::wasm32::*;

struct SIMDCalculator;

impl SIMDCalculator {
    #[cfg(target_arch = "wasm32")]
    fn calculate_price_coordinates_simd(prices: &[f32], 
                                       min_price: f32, 
                                       max_price: f32,
                                       chart_height: f32) -> Vec<f32> {
        let mut result = Vec::with_capacity(prices.len());
        let price_range = max_price - min_price;
        let scale = chart_height / price_range;
        
        let min_vec = f32x4_splat(min_price);
        let scale_vec = f32x4_splat(scale);
        let height_vec = f32x4_splat(chart_height);
        
        for chunk in prices.chunks_exact(4) {
            unsafe {
                let prices_vec = v128_load(chunk.as_ptr() as *const v128);
                let normalized = f32x4_sub(prices_vec, min_vec);
                let scaled = f32x4_mul(normalized, scale_vec);
                let y_coords = f32x4_sub(height_vec, scaled);
                
                let coords: [f32; 4] = std::mem::transmute(y_coords);
                result.extend_from_slice(&coords);
            }
        }
        
        result
    }
}
```

#### 3.3.4 数据处理优化

**智能预取和缓存**:
```rust
struct AdaptiveDataLoader {
    cache: LruCache<TimeRange, Arc<KlineDataBatch>>,
    prefetch_strategy: PrefetchStrategy,
    access_pattern: AccessPatternAnalyzer,
}

#[derive(Debug, Clone)]
enum PrefetchStrategy {
    Conservative,  // 预取 1x 当前窗口
    Aggressive,    // 预取 3x 当前窗口
    Adaptive,      // 基于访问模式动态调整
}
```

**数据压缩和解压缩优化**:
```rust
struct DeltaCompressor {
    base_values: [f64; 5], // OHLCV 基准值
}

impl DeltaCompressor {
    fn compress_batch(&mut self, data: &[KlineData]) -> CompressedBatch {
        let mut deltas = Vec::with_capacity(data.len() * 5);
        
        for item in data {
            // 使用差分编码
            deltas.push(self.quantize_delta(item.open - self.base_values[0]));
            deltas.push(self.quantize_delta(item.high - self.base_values[1]));
            deltas.push(self.quantize_delta(item.low - self.base_values[2]));
            deltas.push(self.quantize_delta(item.close - self.base_values[3]));
            deltas.push(self.quantize_delta(item.volume - self.base_values[4]));
            
            // 更新基准值（移动平均）
            self.update_base_values(item);
        }
        
        CompressedBatch {
            base_values: self.base_values,
            deltas,
            count: data.len(),
        }
    }
}
```

**索引优化 - 多级索引结构**:
```rust
struct HierarchicalTimeIndex {
    // 一级索引：小时级别
    hour_index: BTreeMap<i64, usize>,
    // 二级索引：分钟级别
    minute_index: BTreeMap<i64, usize>,
    // 数据偏移
    data_offsets: Vec<usize>,
}

impl HierarchicalTimeIndex {
    fn range_search(&self, start_time: i64, end_time: i64) -> Range<usize> {
        // 使用小时索引快速定位大致范围
        let start_hour = start_time / 3600;
        let end_hour = end_time / 3600;
        
        let rough_start = self.hour_index.range(..=start_hour)
            .next_back()
            .map(|(_, &offset)| offset)
            .unwrap_or(0);
            
        let rough_end = self.hour_index.range(end_hour..)
            .next()
            .map(|(_, &offset)| offset)
            .unwrap_or(self.data_offsets.len());
        
        // 在粗略范围内使用分钟索引精确定位
        let precise_start = self.binary_search_in_range(start_time, rough_start, rough_end);
        let precise_end = self.binary_search_in_range(end_time, precise_start, rough_end);
        
        precise_start..precise_end
    }
}
```

## 4. API边界与应用核心

架构的核心是将WASM的API边界 (`KlineProcess`) 与应用的内部核心 (`ChartCore`) 进行彻底分离，以实现高度封装和可测试性。

### 2.1. `KlineProcess`: 轻量级API委托层

`KlineProcess` 的唯一职责是作为JS和Rust核心逻辑之间的桥梁。

**最终实现**:

```rust
// in: wasm-cal/src/kline_process.rs
use crate::core::ChartCore;

#[wasm_bindgen]
pub struct KlineProcess { core: ChartCore }

#[wasm_bindgen]
impl KlineProcess {
    #[wasm_bindgen(constructor)]
    pub fn new(...) -> Result<Self, JsValue> {
        Ok(Self { core: ChartCore::new(...)? })
    }

    pub fn handle_mouse_move(&mut self, x: f64, y: f64) {
        self.core.handle_mouse_move(x, y);
    }
    // ... 所有其他方法都遵循这种简单的委托模式
}
```

### 2.2. `ChartCore`: 应用状态与逻辑核心

`ChartCore` 是引擎的心脏，封装了所有内部状态和业务逻辑。

**最终结构体定义**:

```rust
// in: wasm-cal/src/core.rs
use std::rc::Rc;
use std::cell::RefCell;

pub struct ChartCore {
    data_manager: Rc<RefCell<DataManager>>,
    layout: Rc<RefCell<ChartLayout>>,
    config_manager: Rc<RefCell<ConfigManager>>,
    canvas_manager: CanvasManager,
    renderer_manager: RendererManager,
    dirty_flags: DirtyFlags,
}
```

**核心方法实现逻辑**:

```rust
// in: wasm-cal/src/core.rs
impl ChartCore {
    pub fn new(...) -> Result<Self, WasmError> { /* ... */ }

    pub fn set_render_mode(&mut self, mode: &str) {
        self.renderer_manager = RendererFactory::create_manager_for_mode(mode);
        self.dirty_flags = DirtyFlags { base: true, main: true, overlay: true };
        self.draw_all();
    }

    pub fn handle_mouse_move(&mut self, x: f64, y: f64) {
        let layout = self.layout.borrow();
        let returned_flags = self.renderer_manager.handle_mouse_move(x, y, &layout);
        self.dirty_flags.base |= returned_flags.base;
        self.dirty_flags.main |= returned_flags.main;
        self.dirty_flags.overlay |= returned_flags.overlay;
        self.draw_all();
    }

    fn draw_all(&mut self) {
        if !self.dirty_flags.base && !self.dirty_flags.main && !self.dirty_flags.overlay { return; }

        self.renderer_manager.render_all(
            &self.canvas_manager,
            &self.data_manager.borrow(),
            &self.layout.borrow(),
            &self.config_manager.borrow().theme,
            self.dirty_flags,
        );

        self.dirty_flags = DirtyFlags::default(); // 重置脏标记
    }
}
```

---

## 5. 核心服务详解 (系统基石)

本章节详述了支撑整个渲染引擎的、职责保持不变的核心服务模块。

### 3.1. `DataManager`: 数据管理器

**职责**: 作为所有图表数据的唯一真实来源，负责数据的存储、访问、范围计算和缓存。

**关键API**: `new`, `set_items`, `initialize_visible_range`, `calculate_data_ranges`, `handle_wheel`, `get_visible`。

### 3.2. `LayoutManager` (`ChartLayout`): 布局管理器

**职责**: 负责所有与空间划分、尺寸计算和坐标系映射相关的逻辑。

**关键API**: `new`, `map_price_to_y`, `map_x_to_index`, `update_for_visible_count`, `is_point_in_navigator`。

### 3.3. `CanvasManager`: 画布管理器

**职责**: 统一管理三层`OffscreenCanvas`，提供对渲染上下文的访问，并封装图层操作。

**关键API**: `new`, `get_context`, `clear_layer`。

---

## 6. 动态渲染子系统详解

### 4.1. `Renderer` & `InteractiveRenderer` Traits: 行为契约

**最终定义**:

```rust
// in: wasm-cal/src/render/renderer_traits.rs
pub enum CanvasLayer { Base, Main, Overlay }
#[derive(Debug, Clone, Copy, Default)]
pub struct DirtyFlags { pub base: bool, pub main: bool, pub overlay: bool }

pub trait Renderer {
    fn render(&self, ctx: &OffscreenCanvasRenderingContext2d, ...);
    fn layer_type(&self) -> CanvasLayer;
    fn as_interactive_mut(&mut self) -> Option<&mut dyn InteractiveRenderer> { None }
}

pub trait InteractiveRenderer {
    fn handle_mouse_move(&mut self, x: f64, y: f64, layout: &ChartLayout) -> DirtyFlags;
    // ... 其他交互事件，均返回 DirtyFlags
}
```

### 4.2. `RendererManager`: 核心调度器

**最终实现逻辑**:

```rust
// in: wasm-cal/src/render/renderer_manager.rs
pub struct RendererManager {
    renderers: Vec<Box<dyn Renderer>>,
}

impl RendererManager {
    pub fn new() -> Self { /* ... */ }
    pub fn register(&mut self, renderer: Box<dyn Renderer>) { /* ... */ }

    pub fn render_all(&self, canvas_manager: &CanvasManager, ..., dirty_flags: DirtyFlags) {
        // ... (分层渲染逻辑)
    }

    pub fn handle_mouse_move(&mut self, x: f64, y: f64, layout: &ChartLayout) -> DirtyFlags {
        let mut combined_flags = DirtyFlags::default();
        for renderer in &mut self.renderers {
            if let Some(interactive) = renderer.as_interactive_mut() {
                let flags = interactive.handle_mouse_move(x, y, layout);
                combined_flags.base |= flags.base;
                combined_flags.main |= flags.main;
                combined_flags.overlay |= flags.overlay;
            }
        }
        combined_flags
    }
}
```

### 4.3. `RendererFactory`: 渲染器构造器

**最终实现逻辑**:

```rust
// in: wasm-cal/src/render/renderer_factory.rs
impl RendererFactory {
    pub fn create_manager_for_mode(mode: &str) -> RendererManager {
        let mut manager = RendererManager::new();
        match mode {
            "kline" => {
                manager.register(Box::new(AxisRenderer::new()));
                manager.register(Box::new(PriceRenderer::new()));
                manager.register(Box::new(VolumeRenderer::new()));
                manager.register(Box::new(OverlayRenderer::new()));
            }
            "heatmap" => { /* ... */ }
            _ => { /* 默认模式 */ }
        }
        manager
    }
}
```

---

## 7. 实现指南与最佳实践

### 7.1 基于代码分析的性能优化策略

#### 7.1.1 性能瓶颈识别

基于对现有代码的深入分析，识别出以下主要性能瓶颈：

**1. 内存频繁分配问题**
- `VisibleRange::calculate_data_ranges()` 每次调用都重新计算
- `ChartLayout` 坐标映射函数重复计算相同结果
- `AxisRenderer` 中大量字符串格式化和分配
- 渲染过程中临时 `Vec` 和坐标数组的频繁创建

**2. 重复计算问题**
- 价格到Y坐标的映射在每帧都重新计算
- 时间轴标签格式化缺乏缓存
- 数据范围计算没有利用增量更新

**3. Canvas API 调用效率**
- 单个绘制操作分别调用 Canvas API
- 缺乏批量绘制优化
- 字体和样式设置重复调用

**4. FlatBuffer 数据访问**
- 未充分利用零拷贝特性
- 数据访问模式不够优化

#### 7.1.2 针对性优化方案

**内存管理优化**
```rust
// 渲染对象池 - 减少内存分配
pub struct RenderObjectPool {
    coordinate_buffers: Vec<Vec<f64>>,
    path_buffers: Vec<Vec<(f64, f64)>>,
    string_buffers: Vec<String>,
    max_pool_size: usize,
}

impl RenderObjectPool {
    pub fn acquire_coordinate_buffer(&mut self, min_capacity: usize) -> Vec<f64> {
        self.coordinate_buffers.pop()
            .map(|mut buf| {
                buf.clear();
                if buf.capacity() < min_capacity {
                    buf.reserve(min_capacity - buf.capacity());
                }
                buf
            })
            .unwrap_or_else(|| Vec::with_capacity(min_capacity))
    }
    
    pub fn release_coordinate_buffer(&mut self, buffer: Vec<f64>) {
        if self.coordinate_buffers.len() < self.max_pool_size {
            self.coordinate_buffers.push(buffer);
        }
    }
}

// 智能缓存策略 - 基于数据哈希的缓存
pub struct SmartRenderCache {
    coordinate_cache: HashMap<u64, CoordinateSet>,
    layout_cache: HashMap<u64, LayoutInfo>,
    string_cache: HashMap<String, String>, // 格式化字符串缓存
}

impl SmartRenderCache {
    pub fn get_coordinates(&mut self, data_hash: u64, calculator: impl FnOnce() -> CoordinateSet) -> &CoordinateSet {
        self.coordinate_cache.entry(data_hash).or_insert_with(calculator)
    }
    
    pub fn invalidate_by_prefix(&mut self, prefix: &str) {
        self.string_cache.retain(|k, _| !k.starts_with(prefix));
    }
}

// 内存布局优化 - 紧凑的数据结构
#[repr(C)]
pub struct CompactKlineData {
    pub timestamp: i64,
    pub ohlcv: [f32; 5], // open, high, low, close, volume
}

// 批量数据处理
pub struct KlineDataBatch {
    data: Vec<CompactKlineData>,
    // 预计算的索引，提高查询性能
    time_index: BTreeMap<i64, usize>,
}

impl KlineDataBatch {
    pub fn get_range_by_time(&self, start: i64, end: i64) -> &[CompactKlineData] {
        let start_idx = self.time_index.range(..=start).next_back()
            .map(|(_, &idx)| idx).unwrap_or(0);
        let end_idx = self.time_index.range(..=end).next_back()
            .map(|(_, &idx)| idx + 1).unwrap_or(self.data.len());
        &self.data[start_idx..end_idx]
    }
}
```

**渲染性能优化**
```rust
// 增量渲染 - 脏区域管理
pub struct IncrementalRenderer {
    dirty_regions: Vec<Rect>,
    last_render_hash: Option<u64>,
    cached_canvas: Option<ImageData>,
}

impl IncrementalRenderer {
    pub fn mark_dirty(&mut self, region: Rect) {
        // 合并重叠的脏区域
        let mut merged = false;
        for existing in &mut self.dirty_regions {
            if existing.intersects(&region) {
                *existing = existing.union(&region);
                merged = true;
                break;
            }
        }
        if !merged {
            self.dirty_regions.push(region);
        }
    }
    
    pub fn render_incremental(&mut self, ctx: &OffscreenCanvasRenderingContext2d, data: &KlineDataBatch) {
        if self.dirty_regions.is_empty() {
            return; // 无需重绘
        }
        
        // 只重绘脏区域
        for region in &self.dirty_regions {
            ctx.save();
            ctx.begin_path();
            ctx.rect(region.x, region.y, region.width, region.height);
            ctx.clip();
            
            // 在裁剪区域内渲染
            self.render_region(ctx, data, region);
            
            ctx.restore();
        }
        
        self.dirty_regions.clear();
    }
}

// 批量Canvas操作 - 减少API调用
pub struct BatchCanvasRenderer {
    path_commands: Vec<PathCommand>,
    text_commands: Vec<TextCommand>,
    style_state: CanvasStyleState,
}

#[derive(Debug)]
enum PathCommand {
    MoveTo(f64, f64),
    LineTo(f64, f64),
    Rect(f64, f64, f64, f64),
    Stroke,
    Fill,
}

#[derive(Debug)]
struct TextCommand {
    text: String,
    x: f64,
    y: f64,
    style: TextStyle,
}

impl BatchCanvasRenderer {
    pub fn execute_batch(&mut self, ctx: &OffscreenCanvasRenderingContext2d) {
        // 批量执行路径命令
        if !self.path_commands.is_empty() {
            ctx.begin_path();
            for cmd in &self.path_commands {
                match cmd {
                    PathCommand::MoveTo(x, y) => ctx.move_to(*x, *y),
                    PathCommand::LineTo(x, y) => ctx.line_to(*x, *y),
                    PathCommand::Rect(x, y, w, h) => ctx.rect(*x, *y, *w, *h),
                    PathCommand::Stroke => ctx.stroke(),
                    PathCommand::Fill => ctx.fill(),
                }
            }
            self.path_commands.clear();
        }
        
        // 批量执行文本命令
        let mut current_style: Option<&TextStyle> = None;
        for cmd in &self.text_commands {
            if current_style != Some(&cmd.style) {
                cmd.style.apply_to_context(ctx);
                current_style = Some(&cmd.style);
            }
            ctx.fill_text(&cmd.text, cmd.x, cmd.y).unwrap();
        }
        self.text_commands.clear();
    }
}

// SIMD 数学计算优化
#[cfg(target_feature = "simd128")]
pub struct SIMDCalculator;

#[cfg(target_feature = "simd128")]
impl SIMDCalculator {
    pub fn batch_price_to_y(prices: &[f32], min_price: f32, max_price: f32, 
                           chart_height: f32, chart_y: f32) -> Vec<f32> {
        use std::arch::wasm32::*;
        
        let mut result = Vec::with_capacity(prices.len());
        let price_range = max_price - min_price;
        let scale = chart_height / price_range;
        
        let min_vec = f32x4_splat(min_price);
        let scale_vec = f32x4_splat(scale);
        let chart_y_vec = f32x4_splat(chart_y);
        let max_price_vec = f32x4_splat(max_price);
        
        for chunk in prices.chunks_exact(4) {
            unsafe {
                let prices_vec = v128_load(chunk.as_ptr() as *const v128);
                let price_diff = f32x4_sub(max_price_vec, prices_vec);
                let scaled = f32x4_mul(price_diff, scale_vec);
                let y_coords = f32x4_add(chart_y_vec, scaled);
                
                let coords: [f32; 4] = std::mem::transmute(y_coords);
                result.extend_from_slice(&coords);
            }
        }
        
        // 处理剩余元素
        for &price in prices.chunks_exact(4).remainder() {
            let y = chart_y + (max_price - price) * scale;
            result.push(y);
        }
        
        result
    }
}
```

**数据处理优化**
```rust
// 智能数据预取和缓存
pub struct AdaptiveDataLoader {
    cache: LruCache<TimeRange, Arc<KlineDataBatch>>,
    prefetch_strategy: PrefetchStrategy,
    compression: Option<CompressionConfig>,
}

#[derive(Debug, Clone)]
enum PrefetchStrategy {
    Conservative, // 预取当前视口的 1.5 倍数据
    Aggressive,   // 预取当前视口的 3 倍数据
    Adaptive,     // 根据用户行为动态调整
}

impl AdaptiveDataLoader {
    pub fn load_data_range(&mut self, range: TimeRange, viewport: TimeRange) -> Arc<KlineDataBatch> {
        // 检查缓存
        if let Some(cached) = self.cache.get(&range) {
            return cached.clone();
        }
        
        // 计算预取范围
        let prefetch_range = self.calculate_prefetch_range(range, viewport);
        
        // 加载并缓存数据
        let data = self.load_from_source(prefetch_range);
        let compressed = self.compress_if_needed(data);
        let batch = Arc::new(compressed);
        
        self.cache.put(range, batch.clone());
        batch
    }
    
    fn calculate_prefetch_range(&self, requested: TimeRange, viewport: TimeRange) -> TimeRange {
        match self.prefetch_strategy {
            PrefetchStrategy::Conservative => {
                let extra = (viewport.end - viewport.start) / 2;
                TimeRange {
                    start: requested.start - extra,
                    end: requested.end + extra,
                }
            },
            PrefetchStrategy::Aggressive => {
                let extra = (viewport.end - viewport.start) * 2;
                TimeRange {
                    start: requested.start - extra,
                    end: requested.end + extra,
                }
            },
            PrefetchStrategy::Adaptive => {
                // 基于历史访问模式动态调整
                self.calculate_adaptive_range(requested, viewport)
            }
        }
    }
}

// 数据压缩优化
pub struct DeltaCompressor {
    base_values: CompactKlineData,
    deltas: Vec<DeltaRecord>,
}

#[derive(Debug, Clone)]
struct DeltaRecord {
    timestamp_delta: i32,
    price_deltas: [i16; 4], // 使用更小的整数类型存储差值
    volume_delta: i32,
}

impl DeltaCompressor {
    pub fn compress(data: &[CompactKlineData]) -> Self {
        if data.is_empty() {
            return Self {
                base_values: CompactKlineData::default(),
                deltas: Vec::new(),
            };
        }
        
        let base = data[0];
        let mut deltas = Vec::with_capacity(data.len() - 1);
        
        for window in data.windows(2) {
            let prev = &window[0];
            let curr = &window[1];
            
            deltas.push(DeltaRecord {
                timestamp_delta: (curr.timestamp - prev.timestamp) as i32,
                price_deltas: [
                    ((curr.ohlcv[0] - prev.ohlcv[0]) * 100.0) as i16, // 保留2位小数精度
                    ((curr.ohlcv[1] - prev.ohlcv[1]) * 100.0) as i16,
                    ((curr.ohlcv[2] - prev.ohlcv[2]) * 100.0) as i16,
                    ((curr.ohlcv[3] - prev.ohlcv[3]) * 100.0) as i16,
                ],
                volume_delta: (curr.ohlcv[4] - prev.ohlcv[4]) as i32,
            });
        }
        
        Self {
            base_values: base,
            deltas,
        }
    }
    
    pub fn decompress(&self) -> Vec<CompactKlineData> {
        let mut result = Vec::with_capacity(self.deltas.len() + 1);
        result.push(self.base_values);
        
        let mut current = self.base_values;
        for delta in &self.deltas {
            current.timestamp += delta.timestamp_delta as i64;
            for i in 0..4 {
                current.ohlcv[i] += delta.price_deltas[i] as f32 / 100.0;
            }
            current.ohlcv[4] += delta.volume_delta as f32;
            result.push(current);
        }
        
        result
    }
}

// 多级索引结构
pub struct HierarchicalTimeIndex {
    // 小时级索引
    hour_index: BTreeMap<i64, usize>, // timestamp_hour -> data_index
    // 分钟级索引
    minute_index: BTreeMap<i64, usize>, // timestamp_minute -> data_index
    // 秒级索引（如果需要）
    second_index: Option<BTreeMap<i64, usize>>,
}

impl HierarchicalTimeIndex {
    pub fn build(data: &[CompactKlineData]) -> Self {
        let mut hour_index = BTreeMap::new();
        let mut minute_index = BTreeMap::new();
        
        for (i, item) in data.iter().enumerate() {
            let hour_key = item.timestamp / 3600;
            let minute_key = item.timestamp / 60;
            
            hour_index.entry(hour_key).or_insert(i);
            minute_index.entry(minute_key).or_insert(i);
        }
        
        Self {
            hour_index,
            minute_index,
            second_index: None,
        }
    }
    
    pub fn find_range(&self, start_time: i64, end_time: i64) -> (usize, usize) {
        // 使用分钟级索引快速定位
        let start_minute = start_time / 60;
        let end_minute = end_time / 60;
        
        let start_idx = self.minute_index.range(..=start_minute)
            .next_back()
            .map(|(_, &idx)| idx)
            .unwrap_or(0);
            
        let end_idx = self.minute_index.range(..=end_minute)
            .next_back()
            .map(|(_, &idx)| idx + 60) // 预估一分钟内的数据点数
            .unwrap_or(0);
            
        (start_idx, end_idx)
    }
}
```

### 7.2 性能监控与基准测试

#### 7.2.1 性能监控系统
```rust
// 性能监控器 - 实时性能指标收集
pub struct PerformanceMonitor {
    frame_times: VecDeque<f64>,
    render_times: VecDeque<f64>,
    memory_usage: VecDeque<usize>,
    cache_hit_rates: HashMap<String, f64>,
    max_samples: usize,
}

impl PerformanceMonitor {
    pub fn new(max_samples: usize) -> Self {
        Self {
            frame_times: VecDeque::with_capacity(max_samples),
            render_times: VecDeque::with_capacity(max_samples),
            memory_usage: VecDeque::with_capacity(max_samples),
            cache_hit_rates: HashMap::new(),
            max_samples,
        }
    }
    
    pub fn record_frame_time(&mut self, time_ms: f64) {
        if self.frame_times.len() >= self.max_samples {
            self.frame_times.pop_front();
        }
        self.frame_times.push_back(time_ms);
    }
    
    pub fn get_fps(&self) -> f64 {
        if self.frame_times.is_empty() {
            return 0.0;
        }
        
        let avg_frame_time = self.frame_times.iter().sum::<f64>() / self.frame_times.len() as f64;
        1000.0 / avg_frame_time
    }
    
    pub fn get_performance_report(&self) -> PerformanceReport {
        PerformanceReport {
            avg_fps: self.get_fps(),
            avg_render_time: self.render_times.iter().sum::<f64>() / self.render_times.len() as f64,
            memory_usage_mb: self.memory_usage.back().copied().unwrap_or(0) as f64 / 1024.0 / 1024.0,
            cache_efficiency: self.cache_hit_rates.values().sum::<f64>() / self.cache_hit_rates.len() as f64,
        }
    }
}

#[derive(Debug, Clone)]
pub struct PerformanceReport {
    pub avg_fps: f64,
    pub avg_render_time: f64,
    pub memory_usage_mb: f64,
    pub cache_efficiency: f64,
}

// 性能基准测试框架
pub struct BenchmarkSuite {
    test_cases: Vec<BenchmarkCase>,
    results: Vec<BenchmarkResult>,
}

#[derive(Debug, Clone)]
struct BenchmarkCase {
    name: String,
    data_size: usize,
    viewport_size: (u32, u32),
    test_duration_ms: u64,
}

#[derive(Debug, Clone)]
struct BenchmarkResult {
    case_name: String,
    avg_fps: f64,
    min_fps: f64,
    max_fps: f64,
    memory_peak_mb: f64,
    render_time_p95: f64,
}

impl BenchmarkSuite {
    pub fn new() -> Self {
        Self {
            test_cases: vec![
                BenchmarkCase {
                    name: "Small Dataset".to_string(),
                    data_size: 1000,
                    viewport_size: (800, 600),
                    test_duration_ms: 5000,
                },
                BenchmarkCase {
                    name: "Medium Dataset".to_string(),
                    data_size: 10000,
                    viewport_size: (1920, 1080),
                    test_duration_ms: 10000,
                },
                BenchmarkCase {
                    name: "Large Dataset".to_string(),
                    data_size: 100000,
                    viewport_size: (3840, 2160),
                    test_duration_ms: 15000,
                },
            ],
            results: Vec::new(),
        }
    }
    
    pub fn run_benchmarks(&mut self, renderer: &mut dyn Renderer) {
        for case in &self.test_cases {
            let result = self.run_single_benchmark(case, renderer);
            self.results.push(result);
        }
    }
    
    fn run_single_benchmark(&self, case: &BenchmarkCase, renderer: &mut dyn Renderer) -> BenchmarkResult {
        let mut monitor = PerformanceMonitor::new(1000);
        let test_data = self.generate_test_data(case.data_size);
        
        let start_time = web_sys::window().unwrap().performance().unwrap().now();
        let mut frame_count = 0;
        let mut fps_samples = Vec::new();
        
        while web_sys::window().unwrap().performance().unwrap().now() - start_time < case.test_duration_ms as f64 {
            let frame_start = web_sys::window().unwrap().performance().unwrap().now();
            
            // 执行渲染
            renderer.render(&test_data).unwrap();
            
            let frame_end = web_sys::window().unwrap().performance().unwrap().now();
            let frame_time = frame_end - frame_start;
            
            monitor.record_frame_time(frame_time);
            fps_samples.push(1000.0 / frame_time);
            frame_count += 1;
        }
        
        // 计算统计数据
        fps_samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let avg_fps = fps_samples.iter().sum::<f64>() / fps_samples.len() as f64;
        let min_fps = fps_samples[0];
        let max_fps = fps_samples[fps_samples.len() - 1];
        let p95_idx = (fps_samples.len() as f64 * 0.95) as usize;
        let render_time_p95 = 1000.0 / fps_samples[p95_idx];
        
        BenchmarkResult {
            case_name: case.name.clone(),
            avg_fps,
            min_fps,
            max_fps,
            memory_peak_mb: 0.0, // 需要实际的内存监控实现
            render_time_p95,
        }
    }
}
```

#### 7.2.2 A/B 测试框架
```rust
// A/B 测试框架 - 比较不同优化策略的效果
pub struct ABTestFramework {
    test_variants: HashMap<String, Box<dyn RenderStrategy>>,
    current_variant: String,
    results: HashMap<String, Vec<PerformanceMetric>>,
}

#[derive(Debug, Clone)]
struct PerformanceMetric {
    timestamp: f64,
    fps: f64,
    render_time: f64,
    memory_usage: usize,
}

impl ABTestFramework {
    pub fn new() -> Self {
        Self {
            test_variants: HashMap::new(),
            current_variant: String::new(),
            results: HashMap::new(),
        }
    }
    
    pub fn add_variant(&mut self, name: String, strategy: Box<dyn RenderStrategy>) {
        self.test_variants.insert(name.clone(), strategy);
        self.results.insert(name, Vec::new());
    }
    
    pub fn run_comparison_test(&mut self, test_data: &KlineDataBatch, duration_ms: u64) -> ABTestResult {
        let mut results = HashMap::new();
        
        for (variant_name, strategy) in &self.test_variants {
            let metrics = self.run_variant_test(variant_name, strategy.as_ref(), test_data, duration_ms);
            results.insert(variant_name.clone(), metrics);
        }
        
        ABTestResult { results }
    }
    
    fn run_variant_test(
        &self,
        variant_name: &str,
        strategy: &dyn RenderStrategy,
        test_data: &KlineDataBatch,
        duration_ms: u64,
    ) -> VariantMetrics {
        let mut fps_samples = Vec::new();
        let mut render_times = Vec::new();
        
        let start_time = web_sys::window().unwrap().performance().unwrap().now();
        
        while web_sys::window().unwrap().performance().unwrap().now() - start_time < duration_ms as f64 {
            let frame_start = web_sys::window().unwrap().performance().unwrap().now();
            
            // 使用当前策略渲染
            strategy.render(test_data).unwrap();
            
            let frame_end = web_sys::window().unwrap().performance().unwrap().now();
            let render_time = frame_end - frame_start;
            
            fps_samples.push(1000.0 / render_time);
            render_times.push(render_time);
        }
        
        VariantMetrics {
            avg_fps: fps_samples.iter().sum::<f64>() / fps_samples.len() as f64,
            avg_render_time: render_times.iter().sum::<f64>() / render_times.len() as f64,
            fps_std_dev: self.calculate_std_dev(&fps_samples),
            sample_count: fps_samples.len(),
        }
    }
    
    fn calculate_std_dev(&self, samples: &[f64]) -> f64 {
        let mean = samples.iter().sum::<f64>() / samples.len() as f64;
        let variance = samples.iter()
            .map(|x| (x - mean).powi(2))
            .sum::<f64>() / samples.len() as f64;
        variance.sqrt()
    }
}

#[derive(Debug)]
struct ABTestResult {
    results: HashMap<String, VariantMetrics>,
}

#[derive(Debug)]
struct VariantMetrics {
    avg_fps: f64,
    avg_render_time: f64,
    fps_std_dev: f64,
    sample_count: usize,
}
```

### 7.3 针对当前架构的具体优化建议

#### 7.3.1 VisibleRange 优化
```rust
// 优化后的 VisibleRange - 减少重复计算和内存分配
#[derive(Debug, Clone)]
pub struct OptimizedVisibleRange {
    start_index: usize,
    count: usize,
    total_length: usize,
    // 缓存计算结果
    cached_end_index: Option<usize>,
    cached_data_range: Option<(f64, f64)>,
    // 脏标记
    is_dirty: bool,
}

impl OptimizedVisibleRange {
    pub fn new(start_index: usize, count: usize, total_length: usize) -> Self {
        Self {
            start_index,
            count,
            total_length,
            cached_end_index: None,
            cached_data_range: None,
            is_dirty: true,
        }
    }
    
    // 使用缓存的结束索引计算
    pub fn end_index(&mut self) -> usize {
        if self.is_dirty || self.cached_end_index.is_none() {
            let end = (self.start_index + self.count).min(self.total_length);
            self.cached_end_index = Some(end);
        }
        self.cached_end_index.unwrap()
    }
    
    // 批量更新以减少重复计算
    pub fn batch_update(&mut self, start_index: usize, count: usize, total_length: usize) {
        if self.start_index != start_index || self.count != count || self.total_length != total_length {
            self.start_index = start_index;
            self.count = count;
            self.total_length = total_length;
            self.invalidate_cache();
        }
    }
    
    fn invalidate_cache(&mut self) {
        self.cached_end_index = None;
        self.cached_data_range = None;
        self.is_dirty = true;
    }
    
    // 智能缩放 - 避免频繁的小幅调整
    pub fn smart_zoom(&mut self, zoom_factor: f64, center_ratio: f64) {
        let new_count = ((self.count as f64) / zoom_factor).round() as usize;
        let new_count = new_count.max(10).min(self.total_length); // 限制范围
        
        // 只有变化足够大时才更新
        if (new_count as i32 - self.count as i32).abs() > 5 {
            let center_index = self.start_index + (self.count as f64 * center_ratio) as usize;
            let new_start = center_index.saturating_sub(new_count / 2);
            let new_start = new_start.min(self.total_length.saturating_sub(new_count));
            
            self.batch_update(new_start, new_count, self.total_length);
        }
    }
}
```

#### 7.3.2 ChartLayout 优化
```rust
// 优化后的 ChartLayout - 预计算和缓存布局信息
#[derive(Debug, Clone)]
pub struct OptimizedChartLayout {
    // 基础布局参数
    canvas_width: u32,
    canvas_height: u32,
    
    // 预计算的布局区域
    cached_main_area: Option<LayoutRect>,
    cached_price_axis_area: Option<LayoutRect>,
    cached_time_axis_area: Option<LayoutRect>,
    cached_volume_area: Option<LayoutRect>,
    
    // 坐标映射缓存
    price_to_y_cache: LRUCache<i32, f64>,
    time_to_x_cache: LRUCache<i64, f64>,
    
    // 布局版本号 - 用于缓存失效
    layout_version: u32,
}

#[derive(Debug, Clone, Copy)]
struct LayoutRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl OptimizedChartLayout {
    pub fn new(canvas_width: u32, canvas_height: u32) -> Self {
        Self {
            canvas_width,
            canvas_height,
            cached_main_area: None,
            cached_price_axis_area: None,
            cached_time_axis_area: None,
            cached_volume_area: None,
            price_to_y_cache: LRUCache::new(1000),
            time_to_x_cache: LRUCache::new(1000),
            layout_version: 0,
        }
    }
    
    // 批量预计算所有布局区域
    pub fn precompute_layout(&mut self) {
        self.layout_version += 1;
        
        // 预计算主绘图区域
        self.cached_main_area = Some(LayoutRect {
            x: 60.0,
            y: 20.0,
            width: (self.canvas_width as f64) - 120.0,
            height: (self.canvas_height as f64) * 0.7,
        });
        
        // 预计算价格轴区域
        self.cached_price_axis_area = Some(LayoutRect {
            x: (self.canvas_width as f64) - 60.0,
            y: 20.0,
            width: 60.0,
            height: (self.canvas_height as f64) * 0.7,
        });
        
        // 预计算时间轴区域
        self.cached_time_axis_area = Some(LayoutRect {
            x: 60.0,
            y: (self.canvas_height as f64) * 0.7 + 20.0,
            width: (self.canvas_width as f64) - 120.0,
            height: 40.0,
        });
        
        // 预计算成交量区域
        self.cached_volume_area = Some(LayoutRect {
            x: 60.0,
            y: (self.canvas_height as f64) * 0.7 + 60.0,
            width: (self.canvas_width as f64) - 120.0,
            height: (self.canvas_height as f64) * 0.3 - 60.0,
        });
    }
    
    // 缓存的坐标映射
    pub fn price_to_y_cached(&mut self, price: f64, price_range: (f64, f64)) -> f64 {
        let cache_key = (price * 1000.0) as i32; // 精度到小数点后3位
        
        if let Some(cached_y) = self.price_to_y_cache.get(&cache_key) {
            return *cached_y;
        }
        
        let main_area = self.cached_main_area.unwrap_or_else(|| {
            // 如果缓存失效，重新计算
            self.precompute_layout();
            self.cached_main_area.unwrap()
        });
        
        let y = main_area.y + main_area.height * (1.0 - (price - price_range.0) / (price_range.1 - price_range.0));
        self.price_to_y_cache.put(cache_key, y);
        y
    }
    
    // 批量坐标转换 - 减少重复计算
    pub fn batch_price_to_y(&mut self, prices: &[f64], price_range: (f64, f64)) -> Vec<f64> {
        let main_area = self.get_main_area();
        let range_height = price_range.1 - price_range.0;
        
        prices.iter().map(|&price| {
            main_area.y + main_area.height * (1.0 - (price - price_range.0) / range_height)
        }).collect()
    }
    
    fn get_main_area(&mut self) -> LayoutRect {
        if self.cached_main_area.is_none() {
            self.precompute_layout();
        }
        self.cached_main_area.unwrap()
    }
}

// LRU 缓存实现
struct LRUCache<K, V> {
    capacity: usize,
    map: HashMap<K, V>,
    order: VecDeque<K>,
}

impl<K: Clone + Eq + std::hash::Hash, V: Clone> LRUCache<K, V> {
    fn new(capacity: usize) -> Self {
        Self {
            capacity,
            map: HashMap::new(),
            order: VecDeque::new(),
        }
    }
    
    fn get(&mut self, key: &K) -> Option<&V> {
        if self.map.contains_key(key) {
            // 移动到最前面
            self.order.retain(|k| k != key);
            self.order.push_front(key.clone());
            self.map.get(key)
        } else {
            None
        }
    }
    
    fn put(&mut self, key: K, value: V) {
        if self.map.len() >= self.capacity {
            if let Some(old_key) = self.order.pop_back() {
                self.map.remove(&old_key);
            }
        }
        
        self.map.insert(key.clone(), value);
        self.order.push_front(key);
    }
}
```

#### 7.3.3 AxisRenderer 优化
```rust
// 优化后的 AxisRenderer - 减少字符串分配和Canvas调用
pub struct OptimizedAxisRenderer {
    // 预分配的字符串缓冲区
    string_buffer: String,
    // 批量绘制缓冲区
    text_batch: Vec<TextDrawCommand>,
    line_batch: Vec<LineDrawCommand>,
    // 标签缓存
    price_label_cache: HashMap<i32, String>,
    time_label_cache: HashMap<i64, String>,
}

#[derive(Debug, Clone)]
struct TextDrawCommand {
    text: String,
    x: f64,
    y: f64,
    font: String,
    color: String,
}

#[derive(Debug, Clone)]
struct LineDrawCommand {
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    color: String,
    width: f64,
}

impl OptimizedAxisRenderer {
    pub fn new() -> Self {
        Self {
            string_buffer: String::with_capacity(1024),
            text_batch: Vec::with_capacity(100),
            line_batch: Vec::with_capacity(100),
            price_label_cache: HashMap::new(),
            time_label_cache: HashMap::new(),
        }
    }
    
    // 批量渲染价格轴
    pub fn render_price_axis_batch(
        &mut self,
        context: &web_sys::CanvasRenderingContext2d,
        price_range: (f64, f64),
        layout: &OptimizedChartLayout,
    ) -> Result<(), WasmError> {
        self.text_batch.clear();
        self.line_batch.clear();
        
        let tick_count = 10;
        let price_step = (price_range.1 - price_range.0) / tick_count as f64;
        
        // 批量准备绘制命令
        for i in 0..=tick_count {
            let price = price_range.0 + price_step * i as f64;
            let y = layout.price_to_y_cached(price, price_range);
            
            // 使用缓存的标签
            let label = self.get_cached_price_label(price);
            
            self.text_batch.push(TextDrawCommand {
                text: label,
                x: layout.get_price_axis_area().x + 5.0,
                y: y + 4.0,
                font: "12px Arial".to_string(),
                color: "#666".to_string(),
            });
            
            self.line_batch.push(LineDrawCommand {
                x1: layout.get_main_area().x,
                y1: y,
                x2: layout.get_main_area().x + layout.get_main_area().width,
                y2: y,
                color: "#e0e0e0".to_string(),
                width: 1.0,
            });
        }
        
        // 批量执行绘制
        self.execute_line_batch(context)?;
        self.execute_text_batch(context)?;
        
        Ok(())
    }
    
    fn get_cached_price_label(&mut self, price: f64) -> String {
        let cache_key = (price * 100.0) as i32; // 精度到小数点后2位
        
        if let Some(cached_label) = self.price_label_cache.get(&cache_key) {
            return cached_label.clone();
        }
        
        // 重用字符串缓冲区
        self.string_buffer.clear();
        write!(&mut self.string_buffer, "{:.2}", price).unwrap();
        let label = self.string_buffer.clone();
        
        // 限制缓存大小
        if self.price_label_cache.len() > 1000 {
            self.price_label_cache.clear();
        }
        
        self.price_label_cache.insert(cache_key, label.clone());
        label
    }
    
    fn execute_line_batch(&self, context: &web_sys::CanvasRenderingContext2d) -> Result<(), WasmError> {
        context.begin_path();
        
        for cmd in &self.line_batch {
            context.set_stroke_style(&JsValue::from_str(&cmd.color));
            context.set_line_width(cmd.width);
            context.move_to(cmd.x1, cmd.y1);
            context.line_to(cmd.x2, cmd.y2);
        }
        
        context.stroke();
        Ok(())
    }
    
    fn execute_text_batch(&self, context: &web_sys::CanvasRenderingContext2d) -> Result<(), WasmError> {
        for cmd in &self.text_batch {
            context.set_font(&cmd.font);
            context.set_fill_style(&JsValue::from_str(&cmd.color));
            context.fill_text(&cmd.text, cmd.x, cmd.y)
                .map_err(|_| WasmError::CanvasError("Failed to draw text".to_string()))?;
        }
        Ok(())
    }
}
```

### 7.4 WebAssembly 优化实践

#### 7.4.1 编译优化配置
```toml
# Cargo.toml 优化配置
[profile.release]
opt-level = 3
lto = true
codegen-units = 1
panic = "abort"
strip = true

[dependencies]
wasm-bindgen = { version = "0.2", features = ["serde-serialize"] }
web-sys = { version = "0.3", features = [
  "console",
  "CanvasRenderingContext2d",
  "HtmlCanvasElement",
  "ImageData",
  "Performance",
  "Window",
] }
js-sys = "0.3"
wee_alloc = { version = "0.4", optional = true }
serde = { version = "1.0", features = ["derive"] }
serde-wasm-bindgen = "0.4"
flatbuffers = "23.5"

[features]
default = ["wee_alloc"]
```

#### 7.4.2 内存管理优化
```rust
// 使用 wee_alloc 作为全局分配器
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

// 内存池管理器
pub struct WasmMemoryPool {
    vec_pools: HashMap<usize, Vec<Vec<u8>>>,
    string_pool: Vec<String>,
    max_pool_size: usize,
}

impl WasmMemoryPool {
    pub fn new(max_pool_size: usize) -> Self {
        Self {
            vec_pools: HashMap::new(),
            string_pool: Vec::with_capacity(max_pool_size),
            max_pool_size,
        }
    }
    
    // 获取预分配的 Vec
    pub fn get_vec(&mut self, capacity: usize) -> Vec<u8> {
        let pool = self.vec_pools.entry(capacity).or_insert_with(Vec::new);
        
        if let Some(mut vec) = pool.pop() {
            vec.clear();
            vec.reserve(capacity);
            vec
        } else {
            Vec::with_capacity(capacity)
        }
    }
    
    // 归还 Vec 到池中
    pub fn return_vec(&mut self, vec: Vec<u8>) {
        let capacity = vec.capacity();
        let pool = self.vec_pools.entry(capacity).or_insert_with(Vec::new);
        
        if pool.len() < self.max_pool_size {
            pool.push(vec);
        }
    }
    
    // 获取预分配的 String
    pub fn get_string(&mut self) -> String {
        self.string_pool.pop().unwrap_or_else(|| String::with_capacity(256))
    }
    
    // 归还 String 到池中
    pub fn return_string(&mut self, mut string: String) {
        if self.string_pool.len() < self.max_pool_size {
            string.clear();
            self.string_pool.push(string);
        }
    }
}

// 全局内存池实例
static mut MEMORY_POOL: Option<WasmMemoryPool> = None;
static MEMORY_POOL_INIT: std::sync::Once = std::sync::Once::new();

pub fn get_memory_pool() -> &'static mut WasmMemoryPool {
    unsafe {
        MEMORY_POOL_INIT.call_once(|| {
            MEMORY_POOL = Some(WasmMemoryPool::new(100));
        });
        MEMORY_POOL.as_mut().unwrap()
    }
}
```

#### 7.4.3 SIMD 优化实现
```rust
// SIMD 优化的数学计算
use std::arch::wasm32::*;

pub struct SIMDCalculator;

impl SIMDCalculator {
    // SIMD 优化的价格范围计算
    pub fn calculate_price_range_simd(prices: &[f32]) -> (f32, f32) {
        if prices.len() < 4 {
            return Self::calculate_price_range_scalar(prices);
        }
        
        let mut min_vec = f32x4_splat(f32::INFINITY);
        let mut max_vec = f32x4_splat(f32::NEG_INFINITY);
        
        // 处理4的倍数部分
        let chunks = prices.chunks_exact(4);
        let remainder = chunks.remainder();
        
        for chunk in chunks {
            let vec = f32x4(chunk[0], chunk[1], chunk[2], chunk[3]);
            min_vec = f32x4_pmin(min_vec, vec);
            max_vec = f32x4_pmax(max_vec, vec);
        }
        
        // 提取最小值和最大值
        let min_array = [f32x4_extract_lane::<0>(min_vec),
                        f32x4_extract_lane::<1>(min_vec),
                        f32x4_extract_lane::<2>(min_vec),
                        f32x4_extract_lane::<3>(min_vec)];
        
        let max_array = [f32x4_extract_lane::<0>(max_vec),
                        f32x4_extract_lane::<1>(max_vec),
                        f32x4_extract_lane::<2>(max_vec),
                        f32x4_extract_lane::<3>(max_vec)];
        
        let mut min_val = min_array[0];
        let mut max_val = max_array[0];
        
        for i in 1..4 {
            min_val = min_val.min(min_array[i]);
            max_val = max_val.max(max_array[i]);
        }
        
        // 处理剩余元素
        for &price in remainder {
            min_val = min_val.min(price);
            max_val = max_val.max(price);
        }
        
        (min_val, max_val)
    }
    
    fn calculate_price_range_scalar(prices: &[f32]) -> (f32, f32) {
        prices.iter().fold((f32::INFINITY, f32::NEG_INFINITY), |(min, max), &price| {
            (min.min(price), max.max(price))
        })
    }
    
    // SIMD 优化的移动平均计算
    pub fn calculate_moving_average_simd(prices: &[f32], window: usize) -> Vec<f32> {
        if prices.len() < window || window < 4 {
            return Self::calculate_moving_average_scalar(prices, window);
        }
        
        let mut result = Vec::with_capacity(prices.len() - window + 1);
        let window_f32 = window as f32;
        let inv_window = f32x4_splat(1.0 / window_f32);
        
        for i in 0..=(prices.len() - window) {
            let window_slice = &prices[i..i + window];
            let mut sum_vec = f32x4_splat(0.0);
            
            // SIMD 求和
            let chunks = window_slice.chunks_exact(4);
            let remainder = chunks.remainder();
            
            for chunk in chunks {
                let vec = f32x4(chunk[0], chunk[1], chunk[2], chunk[3]);
                sum_vec = f32x4_add(sum_vec, vec);
            }
            
            // 提取并求和
            let mut sum = f32x4_extract_lane::<0>(sum_vec) +
                         f32x4_extract_lane::<1>(sum_vec) +
                         f32x4_extract_lane::<2>(sum_vec) +
                         f32x4_extract_lane::<3>(sum_vec);
            
            // 处理剩余元素
            for &price in remainder {
                sum += price;
            }
            
            result.push(sum / window_f32);
        }
        
        result
    }
    
    fn calculate_moving_average_scalar(prices: &[f32], window: usize) -> Vec<f32> {
        prices.windows(window)
            .map(|window| window.iter().sum::<f32>() / window.len() as f32)
            .collect()
    }
}
```

#### 7.4.4 JavaScript 互操作优化
```rust
// 零拷贝的 JavaScript 互操作
use wasm_bindgen::prelude::*;
use js_sys::{Float32Array, Uint8Array};

#[wasm_bindgen]
pub struct ZeroCopyDataTransfer {
    buffer: Vec<u8>,
    view_ptr: *mut u8,
    view_len: usize,
}

#[wasm_bindgen]
impl ZeroCopyDataTransfer {
    #[wasm_bindgen(constructor)]
    pub fn new(capacity: usize) -> ZeroCopyDataTransfer {
        let mut buffer = Vec::with_capacity(capacity);
        let view_ptr = buffer.as_mut_ptr();
        let view_len = buffer.capacity();
        
        ZeroCopyDataTransfer {
            buffer,
            view_ptr,
            view_len,
        }
    }
    
    // 获取内存视图，JavaScript 可以直接访问
    #[wasm_bindgen(getter)]
    pub fn memory_view(&self) -> Uint8Array {
        unsafe {
            Uint8Array::view_mut_raw(self.view_ptr, self.view_len)
        }
    }
    
    // 批量传输 K 线数据
    #[wasm_bindgen]
    pub fn transfer_kline_data(&mut self, js_data: &Float32Array) -> Result<(), JsValue> {
        let data_len = js_data.length() as usize;
        
        if data_len * 4 > self.view_len {
            return Err(JsValue::from_str("Buffer too small"));
        }
        
        // 直接从 JavaScript 内存复制到 WASM 内存
        unsafe {
            let dest_slice = std::slice::from_raw_parts_mut(
                self.view_ptr as *mut f32,
                data_len
            );
            js_data.copy_to(dest_slice);
        }
        
        Ok(())
    }
    
    // 批量返回渲染结果
    #[wasm_bindgen]
    pub fn get_render_commands(&self) -> js_sys::Array {
        let commands = js_sys::Array::new();
        
        // 批量构建渲染命令
        // 这里可以直接操作 JavaScript 对象，避免序列化开销
        
        commands
    }
}

// 高效的批量 JavaScript 调用
#[wasm_bindgen]
pub struct BatchCanvasOperations {
    commands: Vec<CanvasCommand>,
}

#[derive(Clone)]
enum CanvasCommand {
    MoveTo { x: f64, y: f64 },
    LineTo { x: f64, y: f64 },
    SetStrokeStyle { color: String },
    SetLineWidth { width: f64 },
    Stroke,
    FillText { text: String, x: f64, y: f64 },
}

#[wasm_bindgen]
impl BatchCanvasOperations {
    #[wasm_bindgen(constructor)]
    pub fn new() -> BatchCanvasOperations {
        BatchCanvasOperations {
            commands: Vec::with_capacity(1000),
        }
    }
    
    #[wasm_bindgen]
    pub fn add_line(&mut self, x1: f64, y1: f64, x2: f64, y2: f64) {
        self.commands.push(CanvasCommand::MoveTo { x: x1, y: y1 });
        self.commands.push(CanvasCommand::LineTo { x: x2, y: y2 });
    }
    
    #[wasm_bindgen]
    pub fn set_stroke_style(&mut self, color: &str) {
        self.commands.push(CanvasCommand::SetStrokeStyle { 
            color: color.to_string() 
        });
    }
    
    #[wasm_bindgen]
    pub fn execute_batch(&mut self, context: &web_sys::CanvasRenderingContext2d) -> Result<(), JsValue> {
        context.begin_path();
        
        for command in &self.commands {
            match command {
                CanvasCommand::MoveTo { x, y } => {
                    context.move_to(*x, *y);
                }
                CanvasCommand::LineTo { x, y } => {
                    context.line_to(*x, *y);
                }
                CanvasCommand::SetStrokeStyle { color } => {
                    context.set_stroke_style(&JsValue::from_str(color));
                }
                CanvasCommand::SetLineWidth { width } => {
                    context.set_line_width(*width);
                }
                CanvasCommand::Stroke => {
                    context.stroke();
                }
                CanvasCommand::FillText { text, x, y } => {
                    context.fill_text(text, *x, *y)?;
                }
            }
        }
        
        context.stroke();
        self.commands.clear();
        Ok(())
    }
}
```

#### 7.4.5 Canvas 绘图深度优化

基于现有**三层 OffscreenCanvas 架构**的实用优化策略，专注于可行性和性能提升。

**设计可行性论证**：
1. **技术成熟度**：基于现有 base、main、overlay 三层架构，无需重构
2. **兼容性保证**：优化策略不改变现有接口，向后兼容
3. **实施难度低**：每个优化都可独立实施，风险可控
4. **性能收益明确**：每项优化都有明确的性能提升目标
5. **维护成本低**：不引入复杂的多线程或 GPU 计算逻辑

**1. 三层架构智能缓存优化**
```rust
use wasm_bindgen::prelude::*;
use web_sys::{OffscreenCanvas, OffscreenCanvasRenderingContext2d, ImageData};
use std::collections::HashMap;
use std::cell::RefCell;
use std::rc::Rc;

// 基于现有三层架构的优化渲染器
#[wasm_bindgen]
pub struct OptimizedThreeLayerRenderer {
    // 现有三层架构（保持不变）
    base_canvas: OffscreenCanvas,     // 静态背景和网格
    main_canvas: OffscreenCanvas,     // K 线数据和指标
    overlay_canvas: OffscreenCanvas,  // 交互元素
    
    // 智能缓存系统
    layer_cache: LayerCacheManager,
    
    // 批量绘制优化
    batch_renderer: BatchDrawingOptimizer,
    
    // 脏区域管理
    dirty_manager: DirtyRegionTracker,
    
    // 性能统计
    perf_stats: PerformanceTracker,
}

// 分层缓存管理器
struct LayerCacheManager {
    base_cache: Option<ImageData>,        // base 层缓存
    main_cache: Option<ImageData>,        // main 层缓存
    cache_validity: [bool; 3],            // 缓存有效性标记
    cache_timestamps: [f64; 3],           // 缓存时间戳
    cache_hit_rate: f64,                  // 缓存命中率
}

// 批量绘制优化器
struct BatchDrawingOptimizer {
    kline_path: web_sys::Path2d,          // K 线批量路径
    volume_path: web_sys::Path2d,         // 成交量批量路径
    grid_path: web_sys::Path2d,           // 网格批量路径
    text_buffer: Vec<TextDrawCommand>,     // 文本绘制缓冲
    path_buffer: Vec<PathDrawCommand>,     // 路径绘制缓冲
}

// 脏区域跟踪器
struct DirtyRegionTracker {
    dirty_rects: Vec<DirtyRect>,          // 脏矩形列表
    merge_threshold: f64,                 // 合并阈值
    total_dirty_area: f64,                // 总脏区域面积
    optimization_enabled: bool,           // 是否启用优化
}

#[derive(Clone)]
struct DirtyRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    layer: u8,  // 0=base, 1=main, 2=overlay
}

#[derive(Clone)]
struct TextDrawCommand {
    text: String,
    x: f64,
    y: f64,
    font: String,
    color: String,
}

#[derive(Clone)]
struct PathDrawCommand {
    points: Vec<(f64, f64)>,
    stroke_color: String,
    fill_color: Option<String>,
    line_width: f64,
}

#[wasm_bindgen]
impl OptimizedThreeLayerRenderer {
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32) -> Result<Self, JsValue> {
        Ok(Self {
            base_canvas: OffscreenCanvas::new(width, height)?,
            main_canvas: OffscreenCanvas::new(width, height)?,
            overlay_canvas: OffscreenCanvas::new(width, height)?,
            layer_cache: LayerCacheManager::new(),
            batch_renderer: BatchDrawingOptimizer::new()?,
            dirty_manager: DirtyRegionTracker::new(),
            perf_stats: PerformanceTracker::new(),
        })
    }
    
    // 智能渲染调度 - 核心优化方法
    #[wasm_bindgen]
    pub fn render_optimized(&mut self, 
                           layout: &ChartLayout,
                           kline_data: &[KlineData],
                           mouse_pos: Option<(f64, f64)>) -> Result<ImageData, JsValue> {
        
        let start_time = js_sys::Date::now();
        
        // 1. 智能判断各层是否需要重绘
        let needs_base_redraw = self.should_redraw_base_layer(layout);
        let needs_main_redraw = self.should_redraw_main_layer(kline_data);
        let needs_overlay_redraw = self.should_redraw_overlay_layer(mouse_pos);
        
        // 2. 按需重绘各层
        if needs_base_redraw {
            self.render_base_layer_cached(layout)?;
        }
        
        if needs_main_redraw {
            self.render_main_layer_batch(layout, kline_data)?;
        }
        
        if needs_overlay_redraw {
            self.render_overlay_layer_incremental(mouse_pos)?;
        }
        
        // 3. 合成最终结果
        let result = self.composite_layers_optimized()?;
        
        // 4. 更新性能统计
        let render_time = js_sys::Date::now() - start_time;
        self.perf_stats.record_frame(render_time, needs_base_redraw, needs_main_redraw, needs_overlay_redraw);
        
        Ok(result)
    }
    
    // 缓存优化的 base 层渲染
    fn render_base_layer_cached(&mut self, layout: &ChartLayout) -> Result<(), JsValue> {
        // 检查缓存有效性
        if self.layer_cache.is_base_cache_valid(layout) {
            // 使用缓存，直接返回
            self.layer_cache.cache_hit_rate += 0.01;
            return Ok(());
        }
        
        let ctx = self.base_canvas
            .get_context("2d")?
            .unwrap()
            .dyn_into::<OffscreenCanvasRenderingContext2d>()?;
        
        // 清空画布
        ctx.clear_rect(0.0, 0.0, 
                      self.base_canvas.width() as f64, 
                      self.base_canvas.height() as f64);
        
        // 批量绘制网格
        self.batch_renderer.build_grid_path(layout);
        ctx.stroke_with_path(&self.batch_renderer.grid_path);
        
        // 批量绘制坐标轴标签
        self.batch_renderer.build_axis_labels(layout);
        self.batch_renderer.draw_text_batch(&ctx)?;
        
        // 更新缓存
        self.layer_cache.update_base_cache(&self.base_canvas)?;
        
        Ok(())
    }
    
    // 批量优化的 main 层渲染
    fn render_main_layer_batch(&mut self, 
                              layout: &ChartLayout, 
                              kline_data: &[KlineData]) -> Result<(), JsValue> {
        let ctx = self.main_canvas
            .get_context("2d")?
            .unwrap()
            .dyn_into::<OffscreenCanvasRenderingContext2d>()?;
        
        // 只清除脏区域而非整个画布
        self.clear_dirty_regions_only(&ctx)?;
        
        // 批量构建 K 线路径
        self.batch_renderer.clear_paths();
        
        // 使用 Path2D 批量绘制 K 线
        for (i, kline) in kline_data.iter().enumerate() {
            let x = layout.get_x_position(i);
            let y_open = layout.get_y_position(kline.open);
            let y_close = layout.get_y_position(kline.close);
            let y_high = layout.get_y_position(kline.high);
            let y_low = layout.get_y_position(kline.low);
            
            // 添加到批量路径（避免单独的 Canvas API 调用）
            self.batch_renderer.add_kline_to_batch(x, y_open, y_close, y_high, y_low, kline.is_bullish());
        }
        
        // 一次性绘制所有 K 线
        self.batch_renderer.draw_klines_batch(&ctx)?;
        
        // 批量绘制成交量
        self.batch_renderer.draw_volume_batch(&ctx, layout, kline_data)?;
        
        Ok(())
    }
    
    // 增量优化的 overlay 层渲染
    fn render_overlay_layer_incremental(&mut self, mouse_pos: Option<(f64, f64)>) -> Result<(), JsValue> {
        let ctx = self.overlay_canvas
            .get_context("2d")?
            .unwrap()
            .dyn_into::<OffscreenCanvasRenderingContext2d>()?;
        
        // 只清除变化的区域
        if let Some(dirty_rect) = self.dirty_manager.get_overlay_dirty_rect(mouse_pos) {
            ctx.clear_rect(dirty_rect.x, dirty_rect.y, dirty_rect.width, dirty_rect.height);
        }
        
        // 绘制十字线和提示信息
        if let Some((x, y)) = mouse_pos {
            self.draw_crosshair_optimized(&ctx, x, y)?;
            self.draw_tooltip_optimized(&ctx, x, y)?;
        }
        
        Ok(())
    }
    
    // 优化的层合成
    fn composite_layers_optimized(&self) -> Result<ImageData, JsValue> {
        // 创建合成画布
        let composite_canvas = OffscreenCanvas::new(
            self.base_canvas.width(), 
            self.base_canvas.height()
        )?;
        
        let ctx = composite_canvas
            .get_context("2d")?
            .unwrap()
            .dyn_into::<OffscreenCanvasRenderingContext2d>()?;
        
        // 关闭图像平滑以提升性能
        ctx.set_image_smoothing_enabled(false);
        
        // 按顺序合成三层（使用硬件加速的 drawImage）
        ctx.draw_image_with_offscreen_canvas(&self.base_canvas, 0.0, 0.0)?;
        ctx.draw_image_with_offscreen_canvas(&self.main_canvas, 0.0, 0.0)?;
        ctx.draw_image_with_offscreen_canvas(&self.overlay_canvas, 0.0, 0.0)?;
        
        // 返回最终图像数据
        ctx.get_image_data(0.0, 0.0, 
                          composite_canvas.width() as f64, 
                          composite_canvas.height() as f64)
    }
    
    // 智能判断是否需要重绘 base 层
    fn should_redraw_base_layer(&self, layout: &ChartLayout) -> bool {
        // base 层包含网格和坐标轴，只有布局变化时才需要重绘
        !self.layer_cache.cache_validity[0] || 
        layout.has_changed_since(self.layer_cache.cache_timestamps[0])
    }
    
    // 智能判断是否需要重绘 main 层
    fn should_redraw_main_layer(&self, kline_data: &[KlineData]) -> bool {
        // main 层包含 K 线数据，数据变化时需要重绘
        !self.layer_cache.cache_validity[1] || 
        kline_data.len() > 0  // 有新数据
    }
    
    // 智能判断是否需要重绘 overlay 层
    fn should_redraw_overlay_layer(&self, mouse_pos: Option<(f64, f64)>) -> bool {
        // overlay 层包含交互元素，鼠标位置变化时需要重绘
        mouse_pos.is_some()
    }
    
    // 获取性能统计
    #[wasm_bindgen]
    pub fn get_performance_stats(&self) -> js_sys::Object {
        let stats = js_sys::Object::new();
        
        js_sys::Reflect::set(&stats, &"avgFrameTime".into(), 
                           &self.perf_stats.avg_frame_time.into()).unwrap();
        js_sys::Reflect::set(&stats, &"cacheHitRate".into(), 
                           &self.layer_cache.cache_hit_rate.into()).unwrap();
        js_sys::Reflect::set(&stats, &"dirtyRegionRatio".into(), 
                           &self.dirty_manager.get_dirty_ratio().into()).unwrap();
        
        stats
    }
}

// 批量绘制优化器实现
impl BatchDrawingOptimizer {
    fn new() -> Result<Self, JsValue> {
        Ok(Self {
            kline_path: web_sys::Path2d::new()?,
            volume_path: web_sys::Path2d::new()?,
            grid_path: web_sys::Path2d::new()?,
            text_buffer: Vec::new(),
            path_buffer: Vec::new(),
        })
    }
    
    // 批量构建网格路径
    fn build_grid_path(&mut self, layout: &ChartLayout) {
        self.grid_path = web_sys::Path2d::new().unwrap();
        
        // 垂直网格线
        for i in 0..layout.grid_columns {
            let x = layout.get_grid_x(i);
            self.grid_path.move_to(x, 0.0);
            self.grid_path.line_to(x, layout.height);
        }
        
        // 水平网格线
        for i in 0..layout.grid_rows {
            let y = layout.get_grid_y(i);
            self.grid_path.move_to(0.0, y);
            self.grid_path.line_to(layout.width, y);
        }
    }
    
    // 批量添加 K 线到路径
    fn add_kline_to_batch(&mut self, x: f64, y_open: f64, y_close: f64, y_high: f64, y_low: f64, is_bullish: bool) {
        // 影线
        self.kline_path.move_to(x, y_high);
        self.kline_path.line_to(x, y_low);
        
        // 实体
        let body_width = 8.0;
        let body_height = (y_close - y_open).abs();
        let body_y = y_open.min(y_close);
        
        self.kline_path.rect(x - body_width / 2.0, body_y, body_width, body_height);
    }
    
    // 批量绘制 K 线
    fn draw_klines_batch(&self, ctx: &OffscreenCanvasRenderingContext2d) -> Result<(), JsValue> {
        // 设置样式
        ctx.set_stroke_style(&JsValue::from_str("#333"));
        ctx.set_line_width(1.0);
        
        // 一次性绘制所有路径
        ctx.stroke_with_path(&self.kline_path);
        
        Ok(())
    }
    
    // 清空所有路径
    fn clear_paths(&mut self) {
        self.kline_path = web_sys::Path2d::new().unwrap();
        self.volume_path = web_sys::Path2d::new().unwrap();
        self.text_buffer.clear();
        self.path_buffer.clear();
    }
}

// 性能跟踪器
struct PerformanceTracker {
    frame_times: Vec<f64>,
    avg_frame_time: f64,
    frame_count: u32,
}

impl PerformanceTracker {
    fn new() -> Self {
        Self {
            frame_times: Vec::with_capacity(60),
            avg_frame_time: 0.0,
            frame_count: 0,
        }
    }
    
    fn record_frame(&mut self, frame_time: f64, base_redraw: bool, main_redraw: bool, overlay_redraw: bool) {
        self.frame_times.push(frame_time);
        
        if self.frame_times.len() > 60 {
            self.frame_times.remove(0);
        }
        
        self.avg_frame_time = self.frame_times.iter().sum::<f64>() / self.frame_times.len() as f64;
        self.frame_count += 1;
    }
}
        for i in 0..dirty_regions.length() {
            let region = dirty_regions.get(i);
            // 解析脏区域坐标
            // 只清除和重绘该区域
        }
        
        Ok(())
    }
}
```

**2. 批量绘制优化策略**

基于现有三层架构的批量绘制优化，通过 `Path2D` 和绘制命令缓冲区减少 Canvas API 调用次数：

```rust
// 扩展批量绘制优化器
impl BatchDrawingOptimizer {
    // 批量绘制成交量柱状图
    fn draw_volume_batch(&mut self, 
                        ctx: &OffscreenCanvasRenderingContext2d,
                        layout: &ChartLayout,
                        kline_data: &[KlineData]) -> Result<(), JsValue> {
        
        self.volume_path = web_sys::Path2d::new()?;
        
        // 批量构建成交量路径
        for (i, kline) in kline_data.iter().enumerate() {
            let x = layout.get_x_position(i);
            let volume_height = layout.get_volume_height(kline.volume);
            let bar_width = layout.get_bar_width();
            
            // 添加成交量柱到批量路径
            self.volume_path.rect(
                x - bar_width / 2.0,
                layout.volume_baseline - volume_height,
                bar_width,
                volume_height
            );
        }
        
        // 设置成交量样式并一次性绘制
        ctx.set_fill_style(&JsValue::from_str("rgba(100, 149, 237, 0.3)"));
        ctx.fill_with_path(&self.volume_path);
        
        Ok(())
    }
    
    // 批量绘制坐标轴标签
    fn build_axis_labels(&mut self, layout: &ChartLayout) {
        self.text_buffer.clear();
        
        // X 轴时间标签
        for i in 0..layout.x_axis_label_count {
            let x = layout.get_x_label_position(i);
            let time_str = layout.get_time_label(i);
            
            self.text_buffer.push(TextDrawCommand {
                text: time_str,
                x,
                y: layout.height - 20.0,
                font: "12px Arial".to_string(),
                color: "#666".to_string(),
            });
        }
        
        // Y 轴价格标签
        for i in 0..layout.y_axis_label_count {
            let y = layout.get_y_label_position(i);
            let price_str = layout.get_price_label(i);
            
            self.text_buffer.push(TextDrawCommand {
                text: price_str,
                x: layout.width - 60.0,
                y,
                font: "12px Arial".to_string(),
                color: "#666".to_string(),
            });
        }
    }
    
    // 批量执行文本绘制
    fn draw_text_batch(&self, ctx: &OffscreenCanvasRenderingContext2d) -> Result<(), JsValue> {
        for cmd in &self.text_buffer {
            ctx.set_font(&cmd.font);
            ctx.set_fill_style(&JsValue::from_str(&cmd.color));
            ctx.fill_text(&cmd.text, cmd.x, cmd.y)?;
        }
        Ok(())
    }
    
    // 使用 Path2D 进行批量线条绘制
    pub fn batch_draw_lines(&self, 
                           ctx: &OffscreenCanvasRenderingContext2d, 
                           lines: &[(f64, f64, f64, f64)]) -> Result<(), JsValue> {
        let path = web_sys::Path2d::new()?;
        
        // 批量构建路径
        for &(start_x, start_y, end_x, end_y) in lines {
            path.move_to(start_x, start_y);
            path.line_to(end_x, end_y);
        }
        
        // 一次性绘制所有线条
        ctx.stroke_with_path(&path);
        
        Ok(())
    }
}
```

**3. 智能缓存与内存优化**

基于现有三层架构的缓存优化，专注于减少重复绘制和内存分配：

```rust
// 分层缓存管理器实现
impl LayerCacheManager {
    fn new() -> Self {
        Self {
            base_cache: None,
            main_cache: None,
            cache_validity: [false; 3],
            cache_timestamps: [0.0; 3],
            cache_hit_rate: 0.0,
        }
    }
    
    // 检查 base 层缓存有效性
    fn is_base_cache_valid(&self, layout: &ChartLayout) -> bool {
        self.cache_validity[0] && 
        !layout.has_changed_since(self.cache_timestamps[0])
    }
    
    // 更新 base 层缓存
    fn update_base_cache(&mut self, canvas: &OffscreenCanvas) -> Result<(), JsValue> {
        let ctx = canvas
            .get_context("2d")?
            .unwrap()
            .dyn_into::<OffscreenCanvasRenderingContext2d>()?;
        
        self.base_cache = Some(ctx.get_image_data(
            0.0, 0.0, 
            canvas.width() as f64, 
            canvas.height() as f64
        )?);
        
        self.cache_validity[0] = true;
        self.cache_timestamps[0] = js_sys::Date::now();
        
        Ok(())
    }
    
    // 从缓存恢复 base 层
    fn restore_from_cache(&self, ctx: &OffscreenCanvasRenderingContext2d, layer: usize) -> Result<(), JsValue> {
        match layer {
            0 => {
                if let Some(ref cache) = self.base_cache {
                    ctx.put_image_data(cache, 0.0, 0.0)?;
                }
            },
            1 => {
                if let Some(ref cache) = self.main_cache {
                    ctx.put_image_data(cache, 0.0, 0.0)?;
                }
            },
            _ => {}
        }
        Ok(())
    }
}

// 脏区域跟踪器实现
impl DirtyRegionTracker {
    fn new() -> Self {
        Self {
            dirty_rects: Vec::new(),
            merge_threshold: 0.3,  // 30% 重叠时合并
            total_dirty_area: 0.0,
            optimization_enabled: true,
        }
    }
    
    // 添加脏区域
    fn add_dirty_region(&mut self, x: f64, y: f64, width: f64, height: f64, layer: u8) {
        let new_rect = DirtyRect { x, y, width, height, layer };
        
        // 尝试与现有脏区域合并
        if self.try_merge_with_existing(&new_rect) {
            return;
        }
        
        self.dirty_rects.push(new_rect);
        self.total_dirty_area += width * height;
    }
    
    // 尝试合并脏区域
    fn try_merge_with_existing(&mut self, new_rect: &DirtyRect) -> bool {
        for existing in &mut self.dirty_rects {
            if existing.layer == new_rect.layer && 
               self.should_merge(existing, new_rect) {
                *existing = self.merge_rects(existing, new_rect);
                return true;
            }
        }
        false
    }
    
    // 判断是否应该合并两个矩形
    fn should_merge(&self, rect1: &DirtyRect, rect2: &DirtyRect) -> bool {
        let overlap_area = self.calculate_overlap_area(rect1, rect2);
        let total_area = rect1.width * rect1.height + rect2.width * rect2.height;
        
        overlap_area / total_area > self.merge_threshold
    }
    
    // 计算重叠面积
    fn calculate_overlap_area(&self, rect1: &DirtyRect, rect2: &DirtyRect) -> f64 {
        let x_overlap = (rect1.x + rect1.width).min(rect2.x + rect2.width) - rect1.x.max(rect2.x);
        let y_overlap = (rect1.y + rect1.height).min(rect2.y + rect2.height) - rect1.y.max(rect2.y);
        
        if x_overlap > 0.0 && y_overlap > 0.0 {
            x_overlap * y_overlap
        } else {
            0.0
        }
    }
    
    // 合并两个矩形
    fn merge_rects(&self, rect1: &DirtyRect, rect2: &DirtyRect) -> DirtyRect {
        let min_x = rect1.x.min(rect2.x);
        let min_y = rect1.y.min(rect2.y);
        let max_x = (rect1.x + rect1.width).max(rect2.x + rect2.width);
        let max_y = (rect1.y + rect1.height).max(rect2.y + rect2.height);
        
        DirtyRect {
            x: min_x,
            y: min_y,
            width: max_x - min_x,
            height: max_y - min_y,
            layer: rect1.layer,
        }
    }
    
    // 获取 overlay 层脏区域
    fn get_overlay_dirty_rect(&self, mouse_pos: Option<(f64, f64)>) -> Option<DirtyRect> {
        mouse_pos.map(|(x, y)| DirtyRect {
            x: x - 50.0,
            y: y - 50.0,
            width: 100.0,
            height: 100.0,
            layer: 2,  // overlay 层
        })
    }
    
    // 获取脏区域比例
    fn get_dirty_ratio(&self) -> f64 {
        if self.dirty_rects.is_empty() {
            0.0
        } else {
            self.total_dirty_area / (800.0 * 600.0)  // 假设画布大小
        }
    }
    
    // 清空脏区域
    fn clear(&mut self) {
        self.dirty_rects.clear();
        self.total_dirty_area = 0.0;
    }
}

// 优化的 Canvas 对象池
#[wasm_bindgen]
pub struct CanvasObjectPool {
    canvas_pool: Vec<OffscreenCanvas>,
    context_pool: Vec<OffscreenCanvasRenderingContext2d>,
    max_pool_size: usize,
}

#[wasm_bindgen]
impl CanvasObjectPool {
    #[wasm_bindgen(constructor)]
    pub fn new(max_size: usize) -> Self {
        Self {
            canvas_pool: Vec::with_capacity(max_size),
            context_pool: Vec::with_capacity(max_size),
            max_pool_size: max_size,
        }
    }
    
    // 从池中获取 Canvas
    #[wasm_bindgen]
    pub fn get_canvas(&mut self, width: u32, height: u32) -> Result<OffscreenCanvas, JsValue> {
        if let Some(canvas) = self.canvas_pool.pop() {
            canvas.set_width(width);
            canvas.set_height(height);
            Ok(canvas)
        } else {
            OffscreenCanvas::new(width, height)
        }
    }
    
    // 归还 Canvas 到池
    #[wasm_bindgen]
    pub fn return_canvas(&mut self, canvas: OffscreenCanvas) {
        if self.canvas_pool.len() < self.max_pool_size {
            self.canvas_pool.push(canvas);
        }
    }
    
    // 预热对象池
    #[wasm_bindgen]
    pub fn warm_up(&mut self, count: usize, width: u32, height: u32) -> Result<(), JsValue> {
        for _ in 0..count.min(self.max_pool_size) {
            let canvas = OffscreenCanvas::new(width, height)?;
            self.canvas_pool.push(canvas);
        }
        Ok(())
    }
}
```

#### 7.4.6 基于当前架构的 Canvas 优化实施

针对现有三层 Canvas 架构的具体优化策略：

**1. 优化现有 CanvasManager**
```rust
use web_sys::{OffscreenCanvas, OffscreenCanvasRenderingContext2d, ImageData};
use std::collections::HashMap;
use std::cell::RefCell;
use std::rc::Rc;

// 增强版 Canvas 管理器
pub struct OptimizedCanvasManager {
    // 原有三层架构
    pub base_ctx: OffscreenCanvasRenderingContext2d,
    pub main_ctx: OffscreenCanvasRenderingContext2d,
    pub overlay_ctx: OffscreenCanvasRenderingContext2d,
    
    // 新增优化功能
    dirty_regions: RefCell<Vec<DirtyRegion>>,
    layer_cache: RefCell<HashMap<String, OffscreenCanvas>>,
    render_stats: RefCell<RenderStats>,
    
    // 批量绘制缓冲区
    batch_commands: RefCell<Vec<DrawCommand>>,
    
    // 预分配的 ImageData 缓冲区
    image_data_pool: RefCell<Vec<ImageData>>,
    
    pub layout: Rc<RefCell<ChartLayout>>,
}

#[derive(Clone)]
struct DirtyRegion {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    layer: CanvasLayerType,
    priority: u8,
}

#[derive(Clone)]
enum DrawCommand {
    Line { x1: f64, y1: f64, x2: f64, y2: f64, color: String, width: f64 },
    Rectangle { x: f64, y: f64, width: f64, height: f64, fill_color: Option<String>, stroke_color: Option<String> },
    Text { text: String, x: f64, y: f64, font: String, color: String },
    Path { points: Vec<(f64, f64)>, stroke_color: String, fill_color: Option<String> },
}

struct RenderStats {
    frame_count: u32,
    total_render_time: f64,
    cache_hits: u32,
    cache_misses: u32,
    dirty_region_count: u32,
}

impl OptimizedCanvasManager {
    // 智能脏区域管理
    pub fn mark_dirty_region(&self, x: f64, y: f64, width: f64, height: f64, layer: CanvasLayerType) {
        let mut dirty_regions = self.dirty_regions.borrow_mut();
        
        // 合并重叠的脏区域
        let new_region = DirtyRegion { x, y, width, height, layer, priority: 1 };
        
        // 检查是否可以与现有区域合并
        let mut merged = false;
        for existing in dirty_regions.iter_mut() {
            if existing.layer == layer && self.regions_overlap(existing, &new_region) {
                *existing = self.merge_regions(existing, &new_region);
                merged = true;
                break;
            }
        }
        
        if !merged {
            dirty_regions.push(new_region);
        }
    }
    
    // 批量执行绘制命令
    pub fn execute_batch_commands(&self, layer: CanvasLayerType) -> Result<(), JsValue> {
        let commands = self.batch_commands.borrow();
        let ctx = self.get_context(layer);
        
        // 开始路径批处理
        ctx.begin_path();
        
        let mut current_stroke_color = String::new();
        let mut current_line_width = 0.0;
        
        for command in commands.iter() {
            match command {
                DrawCommand::Line { x1, y1, x2, y2, color, width } => {
                    // 只在颜色或线宽改变时设置样式
                    if *color != current_stroke_color {
                        ctx.set_stroke_style(&JsValue::from_str(color));
                        current_stroke_color = color.clone();
                    }
                    if *width != current_line_width {
                        ctx.set_line_width(*width);
                        current_line_width = *width;
                    }
                    
                    ctx.move_to(*x1, *y1);
                    ctx.line_to(*x2, *y2);
                }
                DrawCommand::Path { points, stroke_color, fill_color } => {
                    if let Some(first_point) = points.first() {
                        ctx.move_to(first_point.0, first_point.1);
                        for point in points.iter().skip(1) {
                            ctx.line_to(point.0, point.1);
                        }
                    }
                }
                _ => {}
            }
        }
        
        // 一次性执行所有绘制
        ctx.stroke();
        
        Ok(())
    }
    
    // 增量渲染优化
    pub fn render_incremental(&self) -> Result<(), JsValue> {
        let dirty_regions = self.dirty_regions.borrow();
        
        if dirty_regions.is_empty() {
            return Ok(()); // 无需重绘
        }
        
        // 按层分组脏区域
        let mut regions_by_layer: HashMap<CanvasLayerType, Vec<&DirtyRegion>> = HashMap::new();
        for region in dirty_regions.iter() {
            regions_by_layer.entry(region.layer).or_insert_with(Vec::new).push(region);
        }
        
        // 按层渲染
        for (layer, regions) in regions_by_layer {
            let ctx = self.get_context(layer);
            
            // 设置裁剪区域
            ctx.save();
            for region in regions {
                ctx.rect(region.x, region.y, region.width, region.height);
            }
            ctx.clip();
            
            // 只重绘裁剪区域内的内容
            self.render_layer_content(layer)?;
            
            ctx.restore();
        }
        
        // 清除脏区域标记
        self.dirty_regions.borrow_mut().clear();
        
        Ok(())
    }
    
    // 预渲染缓存管理
    pub fn cache_static_content(&self, cache_key: &str, render_fn: impl FnOnce(&OffscreenCanvasRenderingContext2d) -> Result<(), JsValue>) -> Result<(), JsValue> {
        let layout = self.layout.borrow();
        let cache_canvas = OffscreenCanvas::new(layout.canvas_width as u32, layout.canvas_height as u32)?;
        let cache_ctx = cache_canvas
            .get_context("2d")?
            .unwrap()
            .dyn_into::<OffscreenCanvasRenderingContext2d>()?;
        
        // 执行渲染到缓存
        render_fn(&cache_ctx)?;
        
        // 存储到缓存
        self.layer_cache.borrow_mut().insert(cache_key.to_string(), cache_canvas);
        
        Ok(())
    }
    
    // 从缓存绘制
    pub fn draw_from_cache(&self, cache_key: &str, layer: CanvasLayerType) -> Result<bool, JsValue> {
        if let Some(cached_canvas) = self.layer_cache.borrow().get(cache_key) {
            let ctx = self.get_context(layer);
            ctx.draw_image_with_offscreen_canvas(cached_canvas, 0.0, 0.0)?;
            
            // 更新统计
            self.render_stats.borrow_mut().cache_hits += 1;
            Ok(true)
        } else {
            self.render_stats.borrow_mut().cache_misses += 1;
            Ok(false)
        }
    }
}
```

**2. 优化现有渲染器架构**
```rust
// 增强版图表渲染器
impl ChartRenderer {
    // 智能渲染调度
    pub fn render_optimized(&self) {
        let start_time = js_sys::Date::now();
        
        // 1. 检查是否需要重新计算布局
        let layout_changed = self.check_layout_changes();
        
        // 2. 检查数据变化
        let data_changed = self.check_data_changes();
        
        // 3. 智能渲染策略
        if !layout_changed && !data_changed {
            // 只渲染交互层
            self.render_interaction_layer_only();
        } else if layout_changed {
            // 全量重渲染
            self.render_full();
        } else {
            // 增量数据渲染
            self.render_data_incremental();
        }
        
        // 4. 性能统计
        let render_time = js_sys::Date::now() - start_time;
        self.update_performance_stats(render_time);
    }
    
    // 预渲染静态内容
    pub fn prerender_static_elements(&self) -> Result<(), JsValue> {
        // 预渲染背景网格
        self.canvas_manager.cache_static_content("background_grid", |ctx| {
            self.axis_renderer.render_grid_only(ctx, &self.canvas_manager.layout.borrow())
        })?;
        
        // 预渲染坐标轴标签
        self.canvas_manager.cache_static_content("axis_labels", |ctx| {
            self.axis_renderer.render_labels_only(ctx, &self.canvas_manager.layout.borrow(), &self.data_manager)
        })?;
        
        Ok(())
    }
    
    // 批量绘制 K 线数据
    pub fn render_klines_batch(&self) -> Result<(), JsValue> {
        let data_manager = self.data_manager.borrow();
        let (start_idx, visible_count, _) = data_manager.get_visible();
        
        if visible_count == 0 {
            return Ok(());
        }
        
        // 批量计算所有 K 线的坐标
        let mut coordinates = Vec::with_capacity(visible_count * 8); // 每个 K 线 8 个坐标点
        
        for i in 0..visible_count {
            if let Some(item) = data_manager.get_item_at_index(start_idx + i) {
                let layout = self.canvas_manager.layout.borrow();
                
                // 计算 K 线坐标
                let x = layout.get_x_for_index(start_idx + i);
                let open_y = layout.price_to_y(item.open());
                let high_y = layout.price_to_y(item.high());
                let low_y = layout.price_to_y(item.low());
                let close_y = layout.price_to_y(item.close());
                
                // 添加到批量坐标数组
                coordinates.extend_from_slice(&[x, open_y, x, high_y, x, low_y, x, close_y]);
            }
        }
        
        // 批量绘制
        let ctx = self.canvas_manager.get_context(CanvasLayerType::Main);
        self.batch_draw_klines(ctx, &coordinates)?;
        
        Ok(())
    }
    
    // 使用 Path2D 批量绘制
    fn batch_draw_klines(&self, ctx: &OffscreenCanvasRenderingContext2d, coordinates: &[f64]) -> Result<(), JsValue> {
        let path = web_sys::Path2d::new()?;
        
        // 批量构建路径
        for chunk in coordinates.chunks(8) {
            if chunk.len() == 8 {
                let x = chunk[0];
                let open_y = chunk[1];
                let high_y = chunk[3];
                let low_y = chunk[5];
                let close_y = chunk[7];
                
                // 影线
                path.move_to(x, high_y);
                path.line_to(x, low_y);
                
                // 实体
                let body_top = open_y.min(close_y);
                let body_bottom = open_y.max(close_y);
                path.rect(x - 2.0, body_top, 4.0, body_bottom - body_top);
            }
        }
        
        // 一次性绘制所有路径
        ctx.stroke_with_path(&path);
        
        Ok(())
    }
}

**3. 增量渲染算法实现**

增量渲染是基于三层架构的核心优化策略，通过精确跟踪变化实现最小化重绘：

```rust
#[wasm_bindgen]
pub struct IncrementalRenderEngine {
    // 渲染状态管理
    last_render_state: RenderState,
    current_render_state: RenderState,
    
    // 变化检测器
    data_change_detector: DataChangeDetector,
    layout_change_detector: LayoutChangeDetector,
    interaction_change_detector: InteractionChangeDetector,
    
    // 渲染区域管理
    dirty_region_manager: DirtyRegionManager,
    
    // 性能统计
    performance_tracker: PerformanceTracker,
}

#[derive(Clone, Debug)]
struct RenderState {
    data_hash: u64,
    layout_hash: u64,
    viewport_start: usize,
    viewport_end: usize,
    mouse_position: Option<(f64, f64)>,
    zoom_level: f64,
    timestamp: f64,
}

struct DataChangeDetector {
    last_data_version: u64,
    last_visible_range: (usize, usize),
    price_range_cache: (f64, f64),
    volume_range_cache: (f64, f64),
}

struct LayoutChangeDetector {
    last_canvas_size: (u32, u32),
    last_chart_area: ChartArea,
    last_axis_config: AxisConfig,
    last_theme_hash: u32,
}

struct InteractionChangeDetector {
    last_mouse_position: Option<(f64, f64)>,
    last_hover_index: Option<usize>,
    last_selection_range: Option<(usize, usize)>,
    crosshair_enabled: bool,
}

struct DirtyRegionManager {
    regions: Vec<DirtyRegion>,
    merge_threshold: f64,
    max_regions: usize,
}

#[derive(Clone, Debug)]
struct DirtyRegion {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    layer: LayerType,
    priority: u8,
    change_type: ChangeType,
}

#[derive(Clone, Debug)]
enum ChangeType {
    DataAppend,      // 新增数据
    DataUpdate,      // 数据更新
    LayoutResize,    // 布局变化
    InteractionMove, // 交互移动
    ViewportShift,   // 视口移动
}

#[derive(Clone, Copy, Debug)]
enum LayerType {
    Base,    // 背景层
    Main,    // 主数据层
    Overlay, // 交互层
}

#[wasm_bindgen]
impl IncrementalRenderEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            last_render_state: RenderState::default(),
            current_render_state: RenderState::default(),
            data_change_detector: DataChangeDetector::new(),
            layout_change_detector: LayoutChangeDetector::new(),
            interaction_change_detector: InteractionChangeDetector::new(),
            dirty_region_manager: DirtyRegionManager::new(),
            performance_tracker: PerformanceTracker::new(),
        }
    }
    
    // 主要的增量渲染入口
    #[wasm_bindgen]
    pub fn render_incremental(
        &mut self,
        data: &KlineData,
        layout: &ChartLayout,
        interaction: &InteractionState,
        canvas_manager: &OptimizedCanvasManager,
    ) -> Result<RenderResult, JsValue> {
        let start_time = js_sys::Date::now();
        
        // 1. 更新当前渲染状态
        self.update_current_state(data, layout, interaction);
        
        // 2. 检测所有类型的变化
        let changes = self.detect_all_changes(data, layout, interaction)?;
        
        // 3. 生成脏区域
        self.generate_dirty_regions(&changes, layout)?;
        
        // 4. 优化脏区域（合并、排序）
        self.optimize_dirty_regions();
        
        // 5. 执行分层增量渲染
        let render_result = self.execute_layered_rendering(
            data, layout, interaction, canvas_manager
        )?;
        
        // 6. 更新渲染状态
        self.last_render_state = self.current_render_state.clone();
        
        // 7. 记录性能数据
        let total_time = js_sys::Date::now() - start_time;
        self.performance_tracker.record_render(total_time, &render_result);
        
        Ok(render_result)
    }
    
    // 检测所有类型的变化
    fn detect_all_changes(
        &mut self,
        data: &KlineData,
        layout: &ChartLayout,
        interaction: &InteractionState,
    ) -> Result<Vec<DetectedChange>, JsValue> {
        let mut changes = Vec::new();
        
        // 检测数据变化
        if let Some(data_change) = self.data_change_detector.detect_change(data, &self.last_render_state)? {
            changes.push(DetectedChange::Data(data_change));
        }
        
        // 检测布局变化
        if let Some(layout_change) = self.layout_change_detector.detect_change(layout, &self.last_render_state)? {
            changes.push(DetectedChange::Layout(layout_change));
        }
        
        // 检测交互变化
        if let Some(interaction_change) = self.interaction_change_detector.detect_change(interaction, &self.last_render_state)? {
            changes.push(DetectedChange::Interaction(interaction_change));
        }
        
        Ok(changes)
    }
    
    // 生成脏区域
    fn generate_dirty_regions(
        &mut self,
        changes: &[DetectedChange],
        layout: &ChartLayout,
    ) -> Result<(), JsValue> {
        self.dirty_region_manager.clear();
        
        for change in changes {
            match change {
                DetectedChange::Data(data_change) => {
                    self.generate_data_dirty_regions(data_change, layout)?;
                },
                DetectedChange::Layout(layout_change) => {
                    self.generate_layout_dirty_regions(layout_change, layout)?;
                },
                DetectedChange::Interaction(interaction_change) => {
                    self.generate_interaction_dirty_regions(interaction_change, layout)?;
                },
            }
        }
        
        Ok(())
    }
    
    // 生成数据变化的脏区域
    fn generate_data_dirty_regions(
        &mut self,
        data_change: &DataChange,
        layout: &ChartLayout,
    ) -> Result<(), JsValue> {
        match data_change {
            DataChange::Append { new_count } => {
                // 只需要重绘新增数据的区域
                let start_x = layout.index_to_x(self.last_render_state.viewport_end);
                let width = layout.index_to_x(self.last_render_state.viewport_end + new_count) - start_x;
                
                self.dirty_region_manager.add_region(DirtyRegion {
                    x: start_x,
                    y: layout.chart_area.y,
                    width,
                    height: layout.chart_area.height,
                    layer: LayerType::Main,
                    priority: 1,
                    change_type: ChangeType::DataAppend,
                });
            },
            DataChange::Update { affected_range } => {
                // 重绘受影响的数据区域
                let start_x = layout.index_to_x(affected_range.0);
                let end_x = layout.index_to_x(affected_range.1);
                
                self.dirty_region_manager.add_region(DirtyRegion {
                    x: start_x,
                    y: layout.chart_area.y,
                    width: end_x - start_x,
                    height: layout.chart_area.height,
                    layer: LayerType::Main,
                    priority: 2,
                    change_type: ChangeType::DataUpdate,
                });
            },
            DataChange::ViewportShift { old_range, new_range } => {
                // 计算需要重绘的区域（新显示的部分）
                if new_range.0 < old_range.0 {
                    // 左侧新区域
                    let start_x = layout.index_to_x(new_range.0);
                    let end_x = layout.index_to_x(old_range.0);
                    
                    self.dirty_region_manager.add_region(DirtyRegion {
                        x: start_x,
                        y: layout.chart_area.y,
                        width: end_x - start_x,
                        height: layout.chart_area.height,
                        layer: LayerType::Main,
                        priority: 1,
                        change_type: ChangeType::ViewportShift,
                    });
                }
                
                if new_range.1 > old_range.1 {
                    // 右侧新区域
                    let start_x = layout.index_to_x(old_range.1);
                    let end_x = layout.index_to_x(new_range.1);
                    
                    self.dirty_region_manager.add_region(DirtyRegion {
                        x: start_x,
                        y: layout.chart_area.y,
                        width: end_x - start_x,
                        height: layout.chart_area.height,
                        layer: LayerType::Main,
                        priority: 1,
                        change_type: ChangeType::ViewportShift,
                    });
                }
            },
        }
        
        Ok(())
    }
    
    // 生成交互变化的脏区域
    fn generate_interaction_dirty_regions(
        &mut self,
        interaction_change: &InteractionChange,
        layout: &ChartLayout,
    ) -> Result<(), JsValue> {
        match interaction_change {
            InteractionChange::MouseMove { old_pos, new_pos } => {
                // 清除旧的十字线区域
                if let Some(old) = old_pos {
                    self.add_crosshair_dirty_region(*old, layout);
                }
                
                // 添加新的十字线区域
                if let Some(new) = new_pos {
                    self.add_crosshair_dirty_region(*new, layout);
                }
            },
            InteractionChange::HoverChange { old_index, new_index } => {
                // 清除旧的高亮区域
                if let Some(old) = old_index {
                    self.add_kline_highlight_dirty_region(*old, layout);
                }
                
                // 添加新的高亮区域
                if let Some(new) = new_index {
                    self.add_kline_highlight_dirty_region(*new, layout);
                }
            },
        }
        
        Ok(())
    }
    
    // 添加十字线脏区域
    fn add_crosshair_dirty_region(&mut self, pos: (f64, f64), layout: &ChartLayout) {
        // 水平线
        self.dirty_region_manager.add_region(DirtyRegion {
            x: layout.chart_area.x,
            y: pos.1 - 1.0,
            width: layout.chart_area.width,
            height: 3.0,
            layer: LayerType::Overlay,
            priority: 3,
            change_type: ChangeType::InteractionMove,
        });
        
        // 垂直线
        self.dirty_region_manager.add_region(DirtyRegion {
            x: pos.0 - 1.0,
            y: layout.chart_area.y,
            width: 3.0,
            height: layout.chart_area.height,
            layer: LayerType::Overlay,
            priority: 3,
            change_type: ChangeType::InteractionMove,
        });
    }
    
    // 执行分层渲染
    fn execute_layered_rendering(
        &mut self,
        data: &KlineData,
        layout: &ChartLayout,
        interaction: &InteractionState,
        canvas_manager: &OptimizedCanvasManager,
    ) -> Result<RenderResult, JsValue> {
        let mut result = RenderResult::new();
        
        // 按层分组脏区域
        let regions_by_layer = self.dirty_region_manager.group_by_layer();
        
        // 按优先级渲染各层
        for layer in [LayerType::Base, LayerType::Main, LayerType::Overlay] {
            if let Some(regions) = regions_by_layer.get(&layer) {
                let layer_result = self.render_layer_incremental(
                    layer, regions, data, layout, interaction, canvas_manager
                )?;
                
                result.merge(layer_result);
            }
        }
        
        Ok(result)
    }
    
    // 单层增量渲染
    fn render_layer_incremental(
        &self,
        layer: LayerType,
        regions: &[DirtyRegion],
        data: &KlineData,
        layout: &ChartLayout,
        interaction: &InteractionState,
        canvas_manager: &OptimizedCanvasManager,
    ) -> Result<LayerRenderResult, JsValue> {
        let ctx = canvas_manager.get_context(layer);
        let mut result = LayerRenderResult::new(layer);
        
        // 设置裁剪区域
        ctx.save();
        
        for region in regions {
            ctx.rect(region.x, region.y, region.width, region.height);
        }
        ctx.clip();
        
        // 清除脏区域
        for region in regions {
            ctx.clear_rect(region.x, region.y, region.width, region.height);
        }
        
        // 根据层类型执行相应的渲染
        match layer {
            LayerType::Base => {
                self.render_base_layer_content(&ctx, layout, regions)?;
            },
            LayerType::Main => {
                self.render_main_layer_content(&ctx, data, layout, regions)?;
            },
            LayerType::Overlay => {
                self.render_overlay_layer_content(&ctx, interaction, layout, regions)?;
            },
        }
        
        ctx.restore();
        
        result.rendered_regions = regions.len();
        result.total_area = regions.iter().map(|r| r.width * r.height).sum();
        
        Ok(result)
    }
}

// 渲染结果结构
#[wasm_bindgen]
pub struct RenderResult {
    pub total_time: f64,
    pub layers_rendered: u32,
    pub regions_rendered: u32,
    pub total_dirty_area: f64,
    pub cache_hits: u32,
    pub cache_misses: u32,
}

struct LayerRenderResult {
    layer: LayerType,
    rendered_regions: usize,
    total_area: f64,
}

// 变化检测结果
enum DetectedChange {
    Data(DataChange),
    Layout(LayoutChange),
    Interaction(InteractionChange),
}

enum DataChange {
    Append { new_count: usize },
    Update { affected_range: (usize, usize) },
    ViewportShift { old_range: (usize, usize), new_range: (usize, usize) },
}

enum LayoutChange {
    Resize { old_size: (u32, u32), new_size: (u32, u32) },
    ThemeChange { old_theme: u32, new_theme: u32 },
    AxisChange,
}

enum InteractionChange {
    MouseMove { old_pos: Option<(f64, f64)>, new_pos: Option<(f64, f64)> },
    HoverChange { old_index: Option<usize>, new_index: Option<usize> },
}

// 脏区域管理器实现
impl DirtyRegionManager {
    fn new() -> Self {
        Self {
            regions: Vec::new(),
            merge_threshold: 0.3,
            max_regions: 50,
        }
    }
    
    fn add_region(&mut self, region: DirtyRegion) {
        // 尝试与现有区域合并
        for existing in &mut self.regions {
            if existing.layer == region.layer && 
               self.should_merge(existing, &region) {
                *existing = self.merge_regions(existing, &region);
                return;
            }
        }
        
        // 添加新区域
        self.regions.push(region);
        
        // 限制区域数量
        if self.regions.len() > self.max_regions {
            self.consolidate_regions();
        }
    }
    
    fn should_merge(&self, r1: &DirtyRegion, r2: &DirtyRegion) -> bool {
        let overlap_area = self.calculate_overlap(r1, r2);
        let total_area = r1.width * r1.height + r2.width * r2.height;
        
        overlap_area / total_area > self.merge_threshold
    }
    
    fn merge_regions(&self, r1: &DirtyRegion, r2: &DirtyRegion) -> DirtyRegion {
        let min_x = r1.x.min(r2.x);
        let min_y = r1.y.min(r2.y);
        let max_x = (r1.x + r1.width).max(r2.x + r2.width);
        let max_y = (r1.y + r1.height).max(r2.y + r2.height);
        
        DirtyRegion {
            x: min_x,
            y: min_y,
            width: max_x - min_x,
            height: max_y - min_y,
            layer: r1.layer,
            priority: r1.priority.max(r2.priority),
            change_type: r1.change_type.clone(),
        }
    }
    
    fn group_by_layer(&self) -> std::collections::HashMap<LayerType, Vec<DirtyRegion>> {
        let mut grouped = std::collections::HashMap::new();
        
        for region in &self.regions {
            grouped.entry(region.layer)
                   .or_insert_with(Vec::new)
                   .push(region.clone());
        }
        
        grouped
    }
    
    fn clear(&mut self) {
        self.regions.clear();
    }
}

**4. 性能监控与优化建议**

```rust
#[wasm_bindgen]
pub struct PerformanceTracker {
    render_times: Vec<f64>,
    cache_stats: CacheStats,
    dirty_region_stats: DirtyRegionStats,
    frame_stats: FrameStats,
}

struct CacheStats {
    hits: u32,
    misses: u32,
    total_requests: u32,
}

struct DirtyRegionStats {
    total_regions: u32,
    merged_regions: u32,
    average_region_size: f64,
    dirty_area_ratio: f64,
}

struct FrameStats {
    target_fps: f64,
    actual_fps: f64,
    frame_drops: u32,
    smooth_frames: u32,
}

#[wasm_bindgen]
impl PerformanceTracker {
    #[wasm_bindgen]
    pub fn get_optimization_recommendations(&self) -> js_sys::Array {
        let recommendations = js_sys::Array::new();
        
        // 基于缓存命中率的建议
        let cache_hit_rate = self.cache_stats.hits as f64 / self.cache_stats.total_requests as f64;
        if cache_hit_rate < 0.8 {
            recommendations.push(&JsValue::from_str(
                "缓存命中率较低，建议增加静态内容预渲染"
            ));
        }
        
        // 基于脏区域统计的建议
        if self.dirty_region_stats.dirty_area_ratio > 0.5 {
            recommendations.push(&JsValue::from_str(
                "脏区域过大，建议优化变化检测算法"
            ));
        }
        
        // 基于帧率的建议
        if self.frame_stats.actual_fps < self.frame_stats.target_fps * 0.9 {
            recommendations.push(&JsValue::from_str(
                "帧率不稳定，建议启用更激进的缓存策略"
            ));
        }
        
        // 基于渲染时间的建议
        let avg_render_time = self.render_times.iter().sum::<f64>() / self.render_times.len() as f64;
        if avg_render_time > 16.67 {
            recommendations.push(&JsValue::from_str(
                "渲染时间过长，建议启用批量绘制优化"
            ));
        }
        
        recommendations
    }
    
    #[wasm_bindgen]
    pub fn get_performance_score(&self) -> f64 {
        let cache_score = (self.cache_stats.hits as f64 / self.cache_stats.total_requests as f64) * 25.0;
        let fps_score = (self.frame_stats.actual_fps / self.frame_stats.target_fps).min(1.0) * 35.0;
        let efficiency_score = (1.0 - self.dirty_region_stats.dirty_area_ratio).max(0.0) * 25.0;
        
        let avg_render_time = self.render_times.iter().sum::<f64>() / self.render_times.len() as f64;
        let timing_score = (16.67 / avg_render_time).min(1.0) * 15.0;
        
        cache_score + fps_score + efficiency_score + timing_score
    }
}
```

#### 7.4.7 Canvas 优化实施路线图与性能预期

**实施优先级与预期收益**：

**第一阶段：基础优化（预期性能提升 30-50%）**
1. **脏区域渲染**：只重绘变化的区域，减少 70% 的无效绘制
2. **批量绘制命令**：减少 Canvas API 调用次数，提升 40% 绘制效率
3. **静态内容缓存**：背景、网格、坐标轴预渲染，减少 60% 重复计算

**第二阶段：高级优化（预期性能提升 50-80%）**
1. **智能缓存策略**：基于三层架构的分层缓存，减少 60% 重复渲染
2. **批量绘制优化**：Path2D 批量操作，提升 50% 绘制效率
3. **内存池管理**：复用 Canvas 对象和缓冲区，减少 40% 内存分配

**第三阶段：极致优化（预期性能提升 80-150%）**
1. **增量渲染算法**：精确计算变化区域，最小化重绘范围，提升 60% 渲染效率
2. **WASM SIMD 优化**：数学计算加速 4-8 倍，专注于数据处理而非渲染
3. **零拷贝数据传输**：减少 90% 内存分配和拷贝开销
4. **智能预测缓存**：基于用户行为预渲染静态内容，实现近零延迟交互

**性能监控指标**：
```rust
#[wasm_bindgen]
pub struct CanvasPerformanceMetrics {
    // 渲染性能指标
    pub avg_frame_time: f64,        // 平均帧时间 (ms)
    pub fps: f64,                   // 帧率
    pub cache_hit_rate: f64,        // 缓存命中率 (%)
    pub dirty_region_ratio: f64,    // 脏区域占比 (%)
    
    // 内存使用指标
    pub canvas_memory_usage: u32,   // Canvas 内存使用 (MB)
    pub cache_memory_usage: u32,    // 缓存内存使用 (MB)
    pub peak_memory_usage: u32,     // 峰值内存使用 (MB)
    
    // 交互响应指标
    pub mouse_response_time: f64,   // 鼠标响应时间 (ms)
    pub scroll_smoothness: f64,     // 滚动流畅度评分
    pub zoom_performance: f64,      // 缩放性能评分
}

#[wasm_bindgen]
impl CanvasPerformanceMetrics {
    #[wasm_bindgen]
    pub fn get_performance_score(&self) -> f64 {
        // 综合性能评分算法
        let frame_score = (60.0 / self.avg_frame_time).min(1.0) * 30.0;
        let cache_score = self.cache_hit_rate * 25.0;
        let memory_score = (100.0 - self.canvas_memory_usage as f64).max(0.0) * 0.2;
        let interaction_score = (self.mouse_response_time / 16.67).min(1.0) * 25.0;
        
        frame_score + cache_score + memory_score + interaction_score
    }
    
    #[wasm_bindgen]
    pub fn get_optimization_suggestions(&self) -> js_sys::Array {
        let suggestions = js_sys::Array::new();
        
        if self.avg_frame_time > 16.67 {
            suggestions.push(&JsValue::from_str("启用脏区域渲染以提升帧率"));
        }
        
        if self.cache_hit_rate < 0.8 {
            suggestions.push(&JsValue::from_str("增加静态内容缓存以提升缓存命中率"));
        }
        
        if self.canvas_memory_usage > 100 {
            suggestions.push(&JsValue::from_str("启用内存池管理以减少内存使用"));
        }
        
        if self.mouse_response_time > 8.0 {
            suggestions.push(&JsValue::from_str("启用增量渲染算法以提升交互响应性"));
        }
        
        suggestions
    }
}
```

**最佳实践总结**：

1. **渐进式优化**：从基础优化开始，逐步实施高级特性
2. **性能监控**：持续监控关键指标，数据驱动优化决策
3. **用户体验优先**：优化策略应以提升用户交互体验为核心目标
4. **兼容性考虑**：确保优化不影响浏览器兼容性
5. **内存管理**：平衡性能提升与内存使用，避免内存泄漏

通过实施这些 Canvas 优化策略，预期整体渲染性能可提升 **2-3 倍**，交互响应性提升 **5-10 倍**，内存使用减少 **30-50%**，为用户提供流畅、高效的 K 线图交互体验。

#### 7.4.8 FlatBuffer 零拷贝优化
```rust
// FlatBuffer 零拷贝数据访问
use flatbuffers::{FlatBufferBuilder, WIPOffset};

#[wasm_bindgen]
pub struct FlatBufferKlineData {
    buffer: Vec<u8>,
    root_offset: usize,
}

#[wasm_bindgen]
impl FlatBufferKlineData {
    #[wasm_bindgen]
    pub fn from_js_buffer(js_buffer: &Uint8Array) -> FlatBufferKlineData {
        let mut buffer = vec![0u8; js_buffer.length() as usize];
        js_buffer.copy_to(&mut buffer);
        
        FlatBufferKlineData {
            buffer,
            root_offset: 0,
        }
    }
    
    // 零拷贝访问价格数据
    #[wasm_bindgen]
    pub fn get_prices_view(&self) -> Float32Array {
        // 直接从 FlatBuffer 获取价格数组的内存视图
        // 避免数据复制
        unsafe {
            let prices_ptr = self.buffer.as_ptr().add(self.root_offset) as *const f32;
            let prices_len = self.get_prices_count();
            Float32Array::view(std::slice::from_raw_parts(prices_ptr, prices_len))
        }
    }
    
    fn get_prices_count(&self) -> usize {
        // 从 FlatBuffer 头部读取价格数组长度
        // 实际实现需要根据 FlatBuffer schema
        1000 // 示例值
    }
    
    // 增量数据更新
    #[wasm_bindgen]
    pub fn apply_delta(&mut self, delta_buffer: &Uint8Array) -> Result<(), JsValue> {
        // 应用增量更新，只修改变化的部分
        // 避免重新构建整个数据结构
        Ok(())
    }
}
```
[profile.release]
opt-level = "z"          # 优化代码大小
lto = true               # 链接时优化
codegen-units = 1        # 减少代码生成单元
panic = "abort"          # 减少 panic 处理代码

[profile.release.package."*"]
opt-level = "z"

# 减少二进制大小的依赖配置
[dependencies]
wasm-bindgen = { version = "0.2", features = ["serde-serialize"] }
web-sys = { version = "0.3", features = ["console", "CanvasRenderingContext2d"] }
```

#### 7.1.2 内存管理最佳实践
```rust
// 使用 wee_alloc 减少内存分配器开销
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

// 内存池管理
pub struct MemoryPool<T> {
    pool: Vec<T>,
    in_use: Vec<bool>,
}

impl<T: Default + Clone> MemoryPool<T> {
    pub fn new(capacity: usize) -> Self {
        Self {
            pool: vec![T::default(); capacity],
            in_use: vec![false; capacity],
        }
    }
    
    pub fn acquire(&mut self) -> Option<&mut T> {
        for (i, in_use) in self.in_use.iter_mut().enumerate() {
            if !*in_use {
                *in_use = true;
                return Some(&mut self.pool[i]);
            }
        }
        None
    }
    
    pub fn release(&mut self, index: usize) {
        if index < self.in_use.len() {
            self.in_use[index] = false;
        }
    }
}
```

#### 7.1.3 JavaScript 互操作优化
```rust
// 最小化跨边界调用
#[wasm_bindgen]
pub struct BatchOperations {
    operations: Vec<RenderOperation>,
}

#[wasm_bindgen]
impl BatchOperations {
    #[wasm_bindgen(constructor)]
    pub fn new() -> BatchOperations {
        BatchOperations {
            operations: Vec::new(),
        }
    }
    
    // 批量添加操作，减少单次调用开销
    pub fn add_operations(&mut self, ops: &[u8]) {
        // 反序列化批量操作
        let decoded: Vec<RenderOperation> = bincode::deserialize(ops).unwrap();
        self.operations.extend(decoded);
    }
    
    // 批量执行所有操作
    pub fn execute_all(&mut self, context: &web_sys::CanvasRenderingContext2d) {
        for op in &self.operations {
            op.execute(context);
        }
        self.operations.clear();
    }
}
```

### 7.2 Rust 性能优化

#### 7.2.1 零成本抽象应用
```rust
// 使用泛型和 trait 实现零成本抽象
pub trait DataProcessor<T> {
    type Output;
    fn process(&self, data: &[T]) -> Self::Output;
}

// 编译时特化，无运行时开销
pub struct MovingAverageProcessor {
    window: usize,
}

impl DataProcessor<f32> for MovingAverageProcessor {
    type Output = Vec<f32>;
    
    #[inline]
    fn process(&self, data: &[f32]) -> Self::Output {
        data.windows(self.window)
            .map(|window| window.iter().sum::<f32>() / window.len() as f32)
            .collect()
    }
}
```

#### 7.2.2 SIMD 优化实现
```rust
#[cfg(target_feature = "simd128")]
mod simd_optimized {
    use std::arch::wasm32::*;
    
    pub fn vector_add(a: &[f32], b: &[f32]) -> Vec<f32> {
        assert_eq!(a.len(), b.len());
        let mut result = Vec::with_capacity(a.len());
        
        // 处理 4 的倍数部分
        let chunks = a.len() / 4;
        for i in 0..chunks {
            let idx = i * 4;
            let va = v128_load(a.as_ptr().add(idx) as *const v128);
            let vb = v128_load(b.as_ptr().add(idx) as *const v128);
            let vc = f32x4_add(va, vb);
            
            let mut temp = [0f32; 4];
            v128_store(temp.as_mut_ptr() as *mut v128, vc);
            result.extend_from_slice(&temp);
        }
        
        // 处理剩余元素
        for i in (chunks * 4)..a.len() {
            result.push(a[i] + b[i]);
        }
        
        result
    }
}
```

### 7.3 架构模式实现

#### 7.3.1 依赖注入容器
```rust
use std::any::{Any, TypeId};
use std::collections::HashMap;
use std::rc::Rc;

pub struct DIContainer {
    services: HashMap<TypeId, Box<dyn Any>>,
}

impl DIContainer {
    pub fn new() -> Self {
        Self {
            services: HashMap::new(),
        }
    }
    
    pub fn register<T: 'static>(&mut self, service: T) {
        self.services.insert(TypeId::of::<T>(), Box::new(Rc::new(service)));
    }
    
    pub fn resolve<T: 'static>(&self) -> Option<Rc<T>> {
        self.services
            .get(&TypeId::of::<T>())
            .and_then(|service| service.downcast_ref::<Rc<T>>())
            .cloned()
    }
}
```

#### 7.3.2 观察者模式实现
```rust
use std::rc::{Rc, Weak};
use std::cell::RefCell;

pub trait Observer<T> {
    fn notify(&self, event: &T);
}

pub struct EventBus<T> {
    observers: RefCell<Vec<Weak<dyn Observer<T>>>>,
}

impl<T> EventBus<T> {
    pub fn new() -> Self {
        Self {
            observers: RefCell::new(Vec::new()),
        }
    }
    
    pub fn subscribe(&self, observer: Weak<dyn Observer<T>>) {
        self.observers.borrow_mut().push(observer);
    }
    
    pub fn publish(&self, event: &T) {
        let mut observers = self.observers.borrow_mut();
        observers.retain(|weak_observer| {
            if let Some(observer) = weak_observer.upgrade() {
                observer.notify(event);
                true
            } else {
                false // 移除已失效的观察者
            }
        });
    }
}
```

## 8. 工程实施任务清单 (Checklist)

### 8.1 核心架构实施
1.  **[ ] 创建 `core.rs`**: 实现 `ChartCore` 结构体，封装所有核心服务和业务逻辑
2.  **[ ] 重构 `kline_process.rs`**: 将其简化为纯粹的API委托层，所有逻辑委托给 `ChartCore`
3.  **[ ] 实现依赖注入容器**: 管理组件间的依赖关系
4.  **[ ] 建立事件系统**: 实现观察者模式用于组件间通信

### 8.2 核心服务实施
5.  **[ ] 实现 `DataManager`**: 负责K线数据的存储、索引和查询，包含内存池和缓存机制
6.  **[ ] 实现 `LayoutManager`**: 处理坐标变换、视口管理和布局计算，支持多分辨率
7.  **[ ] 实现 `CanvasManager`**: 管理画布上下文和基础绘图操作，包含批量渲染优化

### 8.3 渲染系统实施
8.  **[ ] 定义渲染器 Traits**: 创建 `Renderer` 和 `InteractiveRenderer` trait 定义
9.  **[ ] 实现 `RendererManager`**: 动态管理渲染器的注册、执行和生命周期
10. **[ ] 实现 `RendererFactory`**: 提供渲染器的创建和配置功能
11. **[ ] 创建具体渲染器**: 实现 `CandleRenderer`、`VolumeRenderer` 等，包含 SIMD 优化

### 8.4 性能优化实施
12. **[ ] 内存管理优化**: 实现对象池、内存池和智能缓存策略
13. **[ ] 渲染性能优化**: 实现脏标记系统、批量渲染和增量更新
14. **[ ] SIMD 优化**: 为数值计算密集的操作实现 SIMD 加速
15. **[ ] WebAssembly 优化**: 配置编译优化选项，减少二进制大小

### 8.5 测试与文档
16. **[ ] 单元测试**: 为每个组件编写全面的单元测试
17. **[ ] 集成测试**: 确保所有组件协同工作正常
18. **[ ] 性能基准测试**: 建立性能基准和回归测试
19. **[ ] API文档**: 完善代码文档和API参考
20. **[ ] 使用指南**: 编写详细的使用指南和最佳实践文档

## 9. 错误处理与容错机制

### 9.1 错误类型定义
```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum WasmCalError {
    #[error("数据解析错误: {0}")]
    DataParseError(String),
    
    #[error("渲染错误: {0}")]
    RenderError(String),
    
    #[error("内存分配错误: {0}")]
    MemoryError(String),
    
    #[error("配置错误: {0}")]
    ConfigError(String),
    
    #[error("JavaScript 互操作错误: {0}")]
    JsInteropError(String),
}

pub type Result<T> = std::result::Result<T, WasmCalError>;
```

### 9.2 容错策略
```rust
pub struct FaultTolerantRenderer {
    primary_renderer: Box<dyn Renderer>,
    fallback_renderer: Box<dyn Renderer>,
    error_count: usize,
    max_errors: usize,
}

impl FaultTolerantRenderer {
    pub fn new(
        primary: Box<dyn Renderer>,
        fallback: Box<dyn Renderer>,
        max_errors: usize,
    ) -> Self {
        Self {
            primary_renderer: primary,
            fallback_renderer: fallback,
            error_count: 0,
            max_errors,
        }
    }
}

impl Renderer for FaultTolerantRenderer {
    fn render(&mut self, context: &RenderContext) -> Result<()> {
        match self.primary_renderer.render(context) {
            Ok(()) => {
                self.error_count = 0; // 重置错误计数
                Ok(())
            }
            Err(e) => {
                self.error_count += 1;
                if self.error_count >= self.max_errors {
                    // 切换到备用渲染器
                    self.fallback_renderer.render(context)
                } else {
                    Err(e)
                }
            }
        }
    }
}
```

## 10. 测试策略

### 10.1 单元测试框架
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::*;
    
    wasm_bindgen_test_configure!(run_in_browser);
    
    #[wasm_bindgen_test]
    fn test_data_manager_basic_operations() {
        let mut data_manager = DataManager::new();
        
        // 测试数据添加
        let test_data = vec![
            KlineData { /* ... */ },
            // 更多测试数据
        ];
        
        assert!(data_manager.add_data(&test_data).is_ok());
        assert_eq!(data_manager.len(), test_data.len());
    }
    
    #[wasm_bindgen_test]
    fn test_renderer_performance() {
        let mut renderer = CandleRenderer::new();
        let context = create_test_context();
        
        let start = web_sys::window()
            .unwrap()
            .performance()
            .unwrap()
            .now();
            
        renderer.render(&context).unwrap();
        
        let duration = web_sys::window()
            .unwrap()
            .performance()
            .unwrap()
            .now() - start;
            
        // 确保渲染时间在合理范围内
        assert!(duration < 16.0); // 60fps 要求
    }
}
```

### 10.2 集成测试
```rust
// tests/integration_test.rs
use wasm_bindgen_test::*;
use wasm_cal::*;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
async fn test_full_rendering_pipeline() {
    let mut kline_process = KlineProcess::new();
    
    // 设置画布
    let canvas = create_test_canvas(800, 600);
    kline_process.set_canvas(&canvas).unwrap();
    
    // 加载测试数据
    let test_data = load_test_kline_data().await;
    kline_process.parse_data(&test_data).unwrap();
    
    // 执行渲染
    kline_process.render().unwrap();
    
    // 验证渲染结果
    assert_canvas_content(&canvas, "expected_output.png");
}
```

### 10.3 性能基准测试
```rust
// benches/performance.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use wasm_cal::*;

fn benchmark_data_processing(c: &mut Criterion) {
    let data = generate_large_dataset(10000);
    
    c.bench_function("data_processing", |b| {
        b.iter(|| {
            let mut processor = DataProcessor::new();
            processor.process(black_box(&data))
        })
    });
}

fn benchmark_rendering(c: &mut Criterion) {
    let mut renderer = CandleRenderer::new();
    let context = create_benchmark_context();
    
    c.bench_function("candle_rendering", |b| {
        b.iter(|| {
            renderer.render(black_box(&context))
        })
    });
}

criterion_group!(benches, benchmark_data_processing, benchmark_rendering);
criterion_main!(benches);
```

## 11. 部署与构建

### 11.1 构建脚本
```bash
#!/bin/bash
# build.sh

set -e

echo "构建 WASM-CAL 渲染引擎..."

# 清理之前的构建
cargo clean

# 构建 WebAssembly 模块
wasm-pack build --target web --out-dir pkg --release

# 优化 WASM 文件大小
wasm-opt -Oz -o pkg/wasm_cal_bg.wasm pkg/wasm_cal_bg.wasm

# 生成类型定义
wasm-pack build --target bundler --out-dir pkg-bundler

echo "构建完成！"
echo "Web 版本: ./pkg/"
echo "Bundler 版本: ./pkg-bundler/"
```

### 11.2 CI/CD 配置
```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: 安装 Rust
      uses: actions-rs/toolchain@v1
      with:
        toolchain: stable
        target: wasm32-unknown-unknown
        
    - name: 安装 wasm-pack
      run: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
      
    - name: 运行测试
      run: |
        cargo test
        wasm-pack test --headless --firefox
        
    - name: 运行基准测试
      run: cargo bench
      
    - name: 构建发布版本
      run: |
        wasm-pack build --release
        wasm-opt -Oz -o pkg/wasm_cal_bg.wasm pkg/wasm_cal_bg.wasm
        
    - name: 上传构建产物
      uses: actions/upload-artifact@v3
      with:
        name: wasm-cal-build
        path: pkg/
```

### 11.3 版本管理
```toml
# Cargo.toml 版本配置
[package]
name = "wasm-cal"
version = "3.0.0"
authors = ["Your Name <your.email@example.com>"]
edition = "2021"
description = "高性能 WebAssembly K线图渲染引擎"
license = "MIT"
repository = "https://github.com/your-org/wasm-cal"
readme = "README.md"
keywords = ["webassembly", "canvas", "kline", "chart", "finance"]
categories = ["wasm", "visualization", "finance"]

[lib]
crate-type = ["cdylib"]

[features]
default = ["console_error_panic_hook"]
console_error_panic_hook = ["dep:console_error_panic_hook"]
wee_alloc = ["dep:wee_alloc"]
simd = []
```

## 8. 迁移指南与实施策略

### 8.1 从当前架构到新架构的迁移路径

#### 8.1.1 迁移阶段规划

**第一阶段：基础架构重构（预计 2-3 周）**
1. **创建新的核心模块**：
   - 实现 `ChartCore` 作为新的应用核心
   - 创建 `DataManager`、`LayoutManager`、`CanvasManager` 服务层
   - 建立依赖注入容器和事件系统

2. **保持 API 兼容性**：
   - 保留现有的 `KlineProcess` 公共接口
   - 内部逐步委托给新的 `ChartCore`
   - 添加 `@deprecated` 标记到即将废弃的方法

**第二阶段：渲染系统重构（预计 3-4 周）**
1. **实现新的渲染器架构**：
   - 定义 `Renderer` 和 `InteractiveRenderer` traits
   - 实现 `RendererManager` 和 `RendererFactory`
   - 创建具体的渲染器实现（`CandleRenderer`、`VolumeRenderer` 等）

2. **性能优化实施**：
   - 实现对象池和内存池管理
   - 添加脏标记系统和增量渲染
   - 集成 SIMD 优化和批量渲染

**第三阶段：测试与优化（预计 1-2 周）**
1. **全面测试**：
   - 单元测试覆盖率达到 90% 以上
   - 集成测试确保功能完整性
   - 性能基准测试验证优化效果

2. **文档完善**：
   - 更新 API 文档
   - 编写迁移指南
   - 提供最佳实践示例

#### 8.1.2 代码迁移示例

**旧架构代码**：
```rust
// 旧的紧密耦合设计
let mut kline_process = KlineProcess::new();
kline_process.set_canvas(&canvas);
kline_process.parse_data(&data);
kline_process.set_render_mode(RenderMode::Candle);
kline_process.render();
```

**新架构代码**：
```rust
// 新的松耦合设计
let mut chart_core = ChartCore::new();
chart_core.canvas_manager().set_canvas(&canvas);
chart_core.data_manager().load_data(&data);
chart_core.renderer_manager().set_active_renderer("candle");
chart_core.render();

// 或者通过 KlineProcess 适配层（保持兼容性）
let mut kline_process = KlineProcess::new();
kline_process.set_canvas(&canvas);  // 内部委托给 ChartCore
kline_process.parse_data(&data);    // 内部委托给 ChartCore
kline_process.set_render_mode(RenderMode::Candle);
kline_process.render();
```

#### 8.1.3 配置迁移

**旧配置格式**：
```rust
pub struct ChartConfig {
    pub width: u32,
    pub height: u32,
    pub background_color: String,
    pub grid_color: String,
    // 所有配置混在一起
}
```

**新配置格式**：
```rust
// 分层配置管理
pub struct ChartConfig {
    pub canvas: CanvasConfig,
    pub layout: LayoutConfig,
    pub rendering: RenderingConfig,
    pub performance: PerformanceConfig,
}

pub struct CanvasConfig {
    pub width: u32,
    pub height: u32,
    pub background_color: String,
    pub device_pixel_ratio: f64,
}

pub struct PerformanceConfig {
    pub enable_object_pool: bool,
    pub enable_simd: bool,
    pub cache_size: usize,
    pub batch_size: usize,
}
```

### 8.2 实施策略与最佳实践

#### 8.2.1 渐进式重构策略

```rust
// 适配器模式确保向后兼容
pub struct LegacyKlineProcessAdapter {
    chart_core: ChartCore,
}

impl LegacyKlineProcessAdapter {
    pub fn new() -> Self {
        Self {
            chart_core: ChartCore::new(),
        }
    }
    
    // 保持旧 API，内部委托给新架构
    pub fn set_canvas(&mut self, canvas: &HtmlCanvasElement) {
        self.chart_core.canvas_manager().set_canvas(canvas);
    }
    
    pub fn parse_data(&mut self, data: &str) -> Result<(), JsValue> {
        let parsed_data = parse_kline_data(data)?;
        self.chart_core.data_manager().load_data(&parsed_data)
    }
    
    pub fn render(&mut self) -> Result<(), JsValue> {
        self.chart_core.render()
    }
}
```

#### 8.2.2 测试驱动迁移

```rust
#[cfg(test)]
mod migration_tests {
    use super::*;
    
    #[test]
    fn test_api_compatibility() {
        // 确保新架构与旧 API 完全兼容
        let mut old_process = LegacyKlineProcessAdapter::new();
        let mut new_process = KlineProcess::new();
        
        // 相同的操作应该产生相同的结果
        let test_data = generate_test_data();
        
        old_process.parse_data(&test_data).unwrap();
        new_process.parse_data(&test_data).unwrap();
        
        // 验证状态一致性
        assert_eq!(old_process.get_data_count(), new_process.get_data_count());
    }
    
    #[test]
    fn test_performance_improvement() {
        let mut old_renderer = create_legacy_renderer();
        let mut new_renderer = create_optimized_renderer();
        
        let start = Instant::now();
        old_renderer.render_large_dataset();
        let old_time = start.elapsed();
        
        let start = Instant::now();
        new_renderer.render_large_dataset();
        let new_time = start.elapsed();
        
        // 新架构应该更快
        assert!(new_time < old_time);
        println!("性能提升: {:.2}x", old_time.as_millis() as f64 / new_time.as_millis() as f64);
    }
}
```

#### 8.2.3 错误处理与回滚策略

```rust
pub struct MigrationManager {
    backup_state: Option<LegacyState>,
    migration_flags: MigrationFlags,
}

pub struct MigrationFlags {
    pub use_new_renderer: bool,
    pub use_new_data_manager: bool,
    pub use_new_layout_manager: bool,
}

impl MigrationManager {
    pub fn migrate_with_fallback<F, T>(&mut self, operation: F) -> Result<T, MigrationError>
    where
        F: FnOnce() -> Result<T, MigrationError>,
    {
        // 备份当前状态
        self.backup_state = Some(self.capture_current_state());
        
        match operation() {
            Ok(result) => {
                self.backup_state = None; // 清除备份
                Ok(result)
            }
            Err(e) => {
                // 回滚到备份状态
                if let Some(backup) = &self.backup_state {
                    self.restore_state(backup);
                }
                Err(e)
            }
        }
    }
    
    fn capture_current_state(&self) -> LegacyState {
        // 捕获当前状态用于回滚
        LegacyState::new()
    }
    
    fn restore_state(&mut self, state: &LegacyState) {
        // 恢复到之前的状态
    }
}
```

### 8.3 性能验证与监控

#### 8.3.1 迁移前后性能对比

```rust
pub struct PerformanceComparison {
    pub legacy_metrics: PerformanceMetrics,
    pub new_metrics: PerformanceMetrics,
}

impl PerformanceComparison {
    pub fn run_comparison() -> Self {
        let legacy_metrics = Self::benchmark_legacy_architecture();
        let new_metrics = Self::benchmark_new_architecture();
        
        Self {
            legacy_metrics,
            new_metrics,
        }
    }
    
    pub fn generate_report(&self) -> String {
        format!(
            "性能对比报告:\n\
             渲染时间: {:.2}ms -> {:.2}ms (提升 {:.1}%)\n\
             内存使用: {:.1}MB -> {:.1}MB (减少 {:.1}%)\n\
             帧率: {:.1}fps -> {:.1}fps (提升 {:.1}%)\n\
             初始化时间: {:.2}ms -> {:.2}ms (提升 {:.1}%)",
            self.legacy_metrics.render_time,
            self.new_metrics.render_time,
            self.improvement_percentage("render_time"),
            self.legacy_metrics.memory_usage,
            self.new_metrics.memory_usage,
            self.improvement_percentage("memory_usage"),
            self.legacy_metrics.fps,
            self.new_metrics.fps,
            self.improvement_percentage("fps"),
            self.legacy_metrics.init_time,
            self.new_metrics.init_time,
            self.improvement_percentage("init_time")
        )
    }
    
    fn improvement_percentage(&self, metric: &str) -> f64 {
        match metric {
            "render_time" | "init_time" => {
                let old = self.legacy_metrics.render_time;
                let new = self.new_metrics.render_time;
                ((old - new) / old) * 100.0
            }
            "memory_usage" => {
                let old = self.legacy_metrics.memory_usage;
                let new = self.new_metrics.memory_usage;
                ((old - new) / old) * 100.0
            }
            "fps" => {
                let old = self.legacy_metrics.fps;
                let new = self.new_metrics.fps;
                ((new - old) / old) * 100.0
            }
            _ => 0.0,
        }
    }
}
```

#### 8.3.2 持续监控系统

```rust
pub struct MigrationMonitor {
    metrics_collector: MetricsCollector,
    alert_thresholds: AlertThresholds,
}

pub struct AlertThresholds {
    pub max_render_time: f64,      // 最大渲染时间 (ms)
    pub max_memory_usage: f64,     // 最大内存使用 (MB)
    pub min_fps: f64,              // 最小帧率
    pub max_error_rate: f64,       // 最大错误率 (%)
}

impl MigrationMonitor {
    pub fn check_performance(&mut self) -> Vec<Alert> {
        let current_metrics = self.metrics_collector.collect();
        let mut alerts = Vec::new();
        
        if current_metrics.render_time > self.alert_thresholds.max_render_time {
            alerts.push(Alert::PerformanceDegradation {
                metric: "render_time".to_string(),
                current: current_metrics.render_time,
                threshold: self.alert_thresholds.max_render_time,
            });
        }
        
        if current_metrics.memory_usage > self.alert_thresholds.max_memory_usage {
            alerts.push(Alert::MemoryUsageHigh {
                current: current_metrics.memory_usage,
                threshold: self.alert_thresholds.max_memory_usage,
            });
        }
        
        alerts
    }
    
    pub fn auto_rollback_if_needed(&mut self) -> bool {
        let alerts = self.check_performance();
        let critical_alerts = alerts.iter()
            .filter(|alert| alert.is_critical())
            .count();
            
        if critical_alerts > 2 {
            // 触发自动回滚
            self.trigger_rollback();
            true
        } else {
            false
        }
    }
    
    fn trigger_rollback(&mut self) {
        // 实施自动回滚逻辑
        log::warn!("检测到严重性能问题，触发自动回滚");
    }
}

#[derive(Debug)]
pub enum Alert {
    PerformanceDegradation {
        metric: String,
        current: f64,
        threshold: f64,
    },
    MemoryUsageHigh {
        current: f64,
        threshold: f64,
    },
    ErrorRateHigh {
        current: f64,
        threshold: f64,
    },
}

impl Alert {
    pub fn is_critical(&self) -> bool {
        match self {
            Alert::PerformanceDegradation { current, threshold, .. } => {
                current > &(threshold * 1.5) // 超过阈值 50% 视为严重
            }
            Alert::MemoryUsageHigh { current, threshold } => {
                current > &(threshold * 1.3) // 超过阈值 30% 视为严重
            }
            Alert::ErrorRateHigh { current, threshold } => {
                current > &(threshold * 2.0) // 超过阈值 100% 视为严重
            }
        }
    }
}
```

### 8.4 团队协作与知识传递

#### 8.4.1 代码审查清单

**架构设计审查**：
- [ ] 是否遵循 SOLID 原则
- [ ] 是否正确实现依赖注入
- [ ] 是否有适当的抽象层次
- [ ] 是否考虑了扩展性

**性能优化审查**：
- [ ] 是否实现了对象池模式
- [ ] 是否有适当的缓存策略
- [ ] 是否使用了 SIMD 优化
- [ ] 是否最小化了内存分配

**代码质量审查**：
- [ ] 是否有充分的单元测试
- [ ] 是否有适当的错误处理
- [ ] 是否有清晰的文档
- [ ] 是否遵循 Rust 最佳实践

#### 8.4.2 知识分享计划

**技术分享会议**：
1. **Week 1**: WebAssembly 性能优化最佳实践
2. **Week 2**: Rust 所有权模型在图形渲染中的应用
3. **Week 3**: OffscreenCanvas 与多线程渲染
4. **Week 4**: 架构设计模式在前端的应用

**文档与培训**：
- 创建内部技术 Wiki
- 录制架构演示视频
- 编写最佳实践指南
- 建立代码示例库

## 9. 开发工具与调试策略

### 9.1 开发环境配置

#### 9.1.1 Rust 工具链配置

```toml
# rust-toolchain.toml
[toolchain]
channel = "stable"
components = ["rustfmt", "clippy", "rust-src"]
targets = ["wasm32-unknown-unknown"]
```

```toml
# .cargo/config.toml
[build]
target = "wasm32-unknown-unknown"

[target.wasm32-unknown-unknown]
rustflags = [
    "-C", "target-feature=+simd128",
    "-C", "target-feature=+bulk-memory",
    "-C", "target-feature=+mutable-globals"
]

[alias]
wasm-build = "build --release --target wasm32-unknown-unknown"
wasm-test = "test --target wasm32-unknown-unknown"
```

#### 9.1.2 开发脚本

```bash
#!/bin/bash
# scripts/dev.sh

set -e

echo "🚀 启动 WASM-CAL 开发环境..."

# 检查依赖
command -v wasm-pack >/dev/null 2>&1 || {
    echo "❌ wasm-pack 未安装，请运行: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh"
    exit 1
}

command -v wasm-opt >/dev/null 2>&1 || {
    echo "❌ wasm-opt 未安装，请运行: npm install -g wasm-opt"
    exit 1
}

# 构建开发版本
echo "📦 构建开发版本..."
wasm-pack build --dev --target web --out-dir pkg-dev

# 启动开发服务器
echo "🌐 启动开发服务器..."
cd examples && python3 -m http.server 8080 &
DEV_SERVER_PID=$!

echo "✅ 开发环境已启动！"
echo "📱 访问: http://localhost:8080"
echo "🔧 调试工具: http://localhost:8080/debug.html"
echo "📊 性能监控: http://localhost:8080/performance.html"

# 监听文件变化
echo "👀 监听文件变化..."
cargo watch -x "build --target wasm32-unknown-unknown" -s "wasm-pack build --dev --target web --out-dir pkg-dev"

# 清理
trap "kill $DEV_SERVER_PID" EXIT
```

### 9.2 调试工具集成

#### 9.2.1 浏览器调试支持

```rust
// 调试宏定义
#[cfg(debug_assertions)]
macro_rules! debug_log {
    ($($arg:tt)*) => {
        web_sys::console::log_1(&format!($($arg)*).into());
    };
}

#[cfg(not(debug_assertions))]
macro_rules! debug_log {
    ($($arg:tt)*) => {};
}

// 性能调试工具
#[wasm_bindgen]
pub struct DebugProfiler {
    start_times: std::collections::HashMap<String, f64>,
    measurements: Vec<PerformanceMeasurement>,
}

#[wasm_bindgen]
pub struct PerformanceMeasurement {
    pub name: String,
    pub duration: f64,
    pub timestamp: f64,
}

#[wasm_bindgen]
impl DebugProfiler {
    #[wasm_bindgen(constructor)]
    pub fn new() -> DebugProfiler {
        DebugProfiler {
            start_times: std::collections::HashMap::new(),
            measurements: Vec::new(),
        }
    }
    
    #[wasm_bindgen]
    pub fn start_measurement(&mut self, name: &str) {
        let now = web_sys::window()
            .unwrap()
            .performance()
            .unwrap()
            .now();
        self.start_times.insert(name.to_string(), now);
    }
    
    #[wasm_bindgen]
    pub fn end_measurement(&mut self, name: &str) {
        let now = web_sys::window()
            .unwrap()
            .performance()
            .unwrap()
            .now();
            
        if let Some(start_time) = self.start_times.remove(name) {
            let duration = now - start_time;
            self.measurements.push(PerformanceMeasurement {
                name: name.to_string(),
                duration,
                timestamp: now,
            });
            
            debug_log!("⏱️ {}: {:.2}ms", name, duration);
        }
    }
    
    #[wasm_bindgen]
    pub fn get_measurements(&self) -> js_sys::Array {
        let array = js_sys::Array::new();
        for measurement in &self.measurements {
            let obj = js_sys::Object::new();
            js_sys::Reflect::set(&obj, &"name".into(), &measurement.name.clone().into()).unwrap();
            js_sys::Reflect::set(&obj, &"duration".into(), &measurement.duration.into()).unwrap();
            js_sys::Reflect::set(&obj, &"timestamp".into(), &measurement.timestamp.into()).unwrap();
            array.push(&obj);
        }
        array
    }
    
    #[wasm_bindgen]
    pub fn clear_measurements(&mut self) {
        self.measurements.clear();
    }
}

// 内存使用监控
#[wasm_bindgen]
pub struct MemoryMonitor {
    allocations: u32,
    deallocations: u32,
    peak_usage: u32,
    current_usage: u32,
}

#[wasm_bindgen]
impl MemoryMonitor {
    #[wasm_bindgen(constructor)]
    pub fn new() -> MemoryMonitor {
        MemoryMonitor {
            allocations: 0,
            deallocations: 0,
            peak_usage: 0,
            current_usage: 0,
        }
    }
    
    #[wasm_bindgen]
    pub fn record_allocation(&mut self, size: u32) {
        self.allocations += 1;
        self.current_usage += size;
        if self.current_usage > self.peak_usage {
            self.peak_usage = self.current_usage;
        }
    }
    
    #[wasm_bindgen]
    pub fn record_deallocation(&mut self, size: u32) {
        self.deallocations += 1;
        self.current_usage = self.current_usage.saturating_sub(size);
    }
    
    #[wasm_bindgen]
    pub fn get_stats(&self) -> js_sys::Object {
        let stats = js_sys::Object::new();
        js_sys::Reflect::set(&stats, &"allocations".into(), &self.allocations.into()).unwrap();
        js_sys::Reflect::set(&stats, &"deallocations".into(), &self.deallocations.into()).unwrap();
        js_sys::Reflect::set(&stats, &"peak_usage".into(), &self.peak_usage.into()).unwrap();
        js_sys::Reflect::set(&stats, &"current_usage".into(), &self.current_usage.into()).unwrap();
        stats
    }
}
```

#### 9.2.2 可视化调试界面

```html
<!-- debug.html -->
<!DOCTYPE html>
<html>
<head>
    <title>WASM-CAL 调试工具</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .debug-panel { border: 1px solid #ccc; padding: 15px; margin: 10px 0; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
        .metric { background: #f5f5f5; padding: 10px; border-radius: 5px; }
        .chart { width: 100%; height: 200px; border: 1px solid #ddd; }
        button { padding: 8px 16px; margin: 5px; cursor: pointer; }
        .error { color: red; }
        .warning { color: orange; }
        .info { color: blue; }
    </style>
</head>
<body>
    <h1>🔧 WASM-CAL 调试工具</h1>
    
    <div class="debug-panel">
        <h2>📊 实时性能监控</h2>
        <div class="metrics">
            <div class="metric">
                <h3>帧率</h3>
                <div id="fps-display">-- fps</div>
            </div>
            <div class="metric">
                <h3>渲染时间</h3>
                <div id="render-time-display">-- ms</div>
            </div>
            <div class="metric">
                <h3>内存使用</h3>
                <div id="memory-display">-- MB</div>
            </div>
            <div class="metric">
                <h3>缓存命中率</h3>
                <div id="cache-hit-rate">-- %</div>
            </div>
        </div>
        <canvas id="performance-chart" class="chart"></canvas>
    </div>
    
    <div class="debug-panel">
        <h2>🎛️ 调试控制</h2>
        <button onclick="toggleDebugMode()">切换调试模式</button>
        <button onclick="clearCache()">清除缓存</button>
        <button onclick="forceGC()">强制垃圾回收</button>
        <button onclick="exportDebugData()">导出调试数据</button>
        <button onclick="runPerformanceTest()">运行性能测试</button>
    </div>
    
    <div class="debug-panel">
        <h2>📝 日志输出</h2>
        <div id="log-output" style="height: 300px; overflow-y: scroll; background: #f9f9f9; padding: 10px; font-family: monospace;"></div>
        <button onclick="clearLogs()">清除日志</button>
    </div>
    
    <div class="debug-panel">
        <h2>🔍 渲染器状态</h2>
        <div id="renderer-state"></div>
    </div>
    
    <script type="module">
        import init, { 
            KlineProcess, 
            DebugProfiler, 
            MemoryMonitor 
        } from './pkg-dev/wasm_cal.js';
        
        let wasmModule;
        let debugProfiler;
        let memoryMonitor;
        let klineProcess;
        
        async function initDebugTools() {
            wasmModule = await init();
            debugProfiler = new DebugProfiler();
            memoryMonitor = new MemoryMonitor();
            klineProcess = new KlineProcess();
            
            // 启动性能监控
            startPerformanceMonitoring();
            
            console.log('🎉 调试工具初始化完成');
        }
        
        function startPerformanceMonitoring() {
            setInterval(() => {
                updatePerformanceMetrics();
            }, 100); // 每100ms更新一次
        }
        
        function updatePerformanceMetrics() {
            // 更新FPS
            const fps = calculateFPS();
            document.getElementById('fps-display').textContent = `${fps.toFixed(1)} fps`;
            
            // 更新内存使用
            const memoryStats = memoryMonitor.get_stats();
            document.getElementById('memory-display').textContent = 
                `${(memoryStats.current_usage / 1024 / 1024).toFixed(2)} MB`;
            
            // 更新性能图表
            updatePerformanceChart(fps, memoryStats.current_usage);
        }
        
        function calculateFPS() {
            // 简化的FPS计算
            return Math.random() * 60; // 实际应该从渲染器获取
        }
        
        function updatePerformanceChart(fps, memory) {
            // 使用Canvas绘制性能图表
            const canvas = document.getElementById('performance-chart');
            const ctx = canvas.getContext('2d');
            
            // 简化的图表绘制逻辑
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'blue';
            ctx.fillRect(10, 10, fps * 2, 20);
        }
        
        window.toggleDebugMode = function() {
            console.log('🔄 切换调试模式');
        };
        
        window.clearCache = function() {
            console.log('🗑️ 清除缓存');
        };
        
        window.forceGC = function() {
            console.log('♻️ 强制垃圾回收');
        };
        
        window.exportDebugData = function() {
            const data = {
                measurements: debugProfiler.get_measurements(),
                memoryStats: memoryMonitor.get_stats(),
                timestamp: Date.now()
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], 
                { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `debug-data-${Date.now()}.json`;
            a.click();
            
            URL.revokeObjectURL(url);
        };
        
        window.runPerformanceTest = function() {
            console.log('🏃‍♂️ 运行性能测试...');
            
            debugProfiler.start_measurement('performance_test');
            
            // 模拟性能测试
            setTimeout(() => {
                debugProfiler.end_measurement('performance_test');
                console.log('✅ 性能测试完成');
            }, 1000);
        };
        
        window.clearLogs = function() {
            document.getElementById('log-output').innerHTML = '';
        };
        
        // 拦截console.log输出到调试界面
        const originalLog = console.log;
        console.log = function(...args) {
            originalLog.apply(console, args);
            
            const logOutput = document.getElementById('log-output');
            const logEntry = document.createElement('div');
            logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${args.join(' ')}`;
            logOutput.appendChild(logEntry);
            logOutput.scrollTop = logOutput.scrollHeight;
        };
        
        // 初始化
        initDebugTools();
    </script>
</body>
</html>
```

### 9.3 自动化测试与CI/CD

#### 9.3.1 测试配置

```toml
# Cargo.toml 测试配置
[dev-dependencies]
wasm-bindgen-test = "0.3"
web-sys = { version = "0.3", features = ["console", "Performance"] }
console_error_panic_hook = "0.1"
criterion = { version = "0.5", features = ["html_reports"] }

[[bench]]
name = "rendering_benchmark"
harness = false

[[bench]]
name = "data_processing_benchmark"
harness = false
```

```rust
// tests/integration_tests.rs
use wasm_bindgen_test::*;
use wasm_cal::*;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
async fn test_full_rendering_pipeline() {
    console_error_panic_hook::set_once();
    
    let mut kline_process = KlineProcess::new();
    
    // 创建测试画布
    let document = web_sys::window().unwrap().document().unwrap();
    let canvas = document
        .create_element("canvas")
        .unwrap()
        .dyn_into::<web_sys::HtmlCanvasElement>()
        .unwrap();
    canvas.set_width(800);
    canvas.set_height(600);
    
    // 设置画布
    kline_process.set_canvas(&canvas).unwrap();
    
    // 加载测试数据
    let test_data = generate_test_kline_data();
    kline_process.parse_data(&test_data).unwrap();
    
    // 执行渲染
    let start = web_sys::window()
        .unwrap()
        .performance()
        .unwrap()
        .now();
        
    kline_process.render().unwrap();
    
    let duration = web_sys::window()
        .unwrap()
        .performance()
        .unwrap()
        .now() - start;
    
    // 验证性能
    assert!(duration < 16.0, "渲染时间超过16ms: {}ms", duration);
    
    // 验证渲染结果
    let context = canvas
        .get_context("2d")
        .unwrap()
        .unwrap()
        .dyn_into::<web_sys::CanvasRenderingContext2d>()
        .unwrap();
    
    let image_data = context
        .get_image_data(0.0, 0.0, 800.0, 600.0)
        .unwrap();
    
    // 验证画布不为空
    let data = image_data.data();
    let has_content = data.iter().any(|&pixel| pixel != 0);
    assert!(has_content, "画布内容为空");
}

fn generate_test_kline_data() -> String {
    // 生成测试用的K线数据
    serde_json::json!({
        "data": [
            {
                "timestamp": 1640995200000i64,
                "open": 50000.0,
                "high": 51000.0,
                "low": 49000.0,
                "close": 50500.0,
                "volume": 1000.0
            }
            // 更多测试数据...
        ]
    }).to_string()
}
```

#### 9.3.2 性能基准测试

```rust
// benches/rendering_benchmark.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use wasm_cal::*;

fn benchmark_rendering_performance(c: &mut Criterion) {
    let mut group = c.benchmark_group("rendering");
    
    // 测试不同数据量的渲染性能
    for data_size in [100, 500, 1000, 5000].iter() {
        group.bench_with_input(
            BenchmarkId::new("candle_rendering", data_size),
            data_size,
            |b, &size| {
                let mut renderer = create_test_renderer();
                let test_data = generate_test_data(size);
                
                b.iter(|| {
                    renderer.render(black_box(&test_data))
                });
            },
        );
    }
    
    group.finish();
}

fn benchmark_data_processing(c: &mut Criterion) {
    let mut group = c.benchmark_group("data_processing");
    
    group.bench_function("parse_kline_data", |b| {
        let raw_data = generate_raw_kline_data(1000);
        b.iter(|| {
            parse_kline_data(black_box(&raw_data))
        });
    });
    
    group.bench_function("calculate_indicators", |b| {
        let kline_data = generate_kline_data(1000);
        b.iter(|| {
            calculate_moving_average(black_box(&kline_data), 20)
        });
    });
    
    group.finish();
}

fn benchmark_memory_operations(c: &mut Criterion) {
    let mut group = c.benchmark_group("memory");
    
    group.bench_function("object_pool_allocation", |b| {
        let mut pool = ObjectPool::new(100);
        b.iter(|| {
            let obj = pool.acquire();
            black_box(obj);
        });
    });
    
    group.bench_function("direct_allocation", |b| {
        b.iter(|| {
            let obj = RenderObject::new();
            black_box(obj);
        });
    });
    
    group.finish();
}

criterion_group!(
    benches,
    benchmark_rendering_performance,
    benchmark_data_processing,
    benchmark_memory_operations
);
criterion_main!(benches);

// 辅助函数
fn create_test_renderer() -> TestRenderer {
    TestRenderer::new()
}

fn generate_test_data(size: usize) -> Vec<KlineData> {
    (0..size).map(|i| KlineData {
        timestamp: i as i64 * 60000,
        open: 50000.0 + (i as f64 * 10.0),
        high: 51000.0 + (i as f64 * 10.0),
        low: 49000.0 + (i as f64 * 10.0),
        close: 50500.0 + (i as f64 * 10.0),
        volume: 1000.0 + (i as f64 * 5.0),
    }).collect()
}
```

#### 9.3.3 CI/CD 流水线

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

env:
  CARGO_TERM_COLOR: always

jobs:
  test:
    name: 测试
    runs-on: ubuntu-latest
    
    steps:
    - name: 检出代码
      uses: actions/checkout@v4
      
    - name: 安装 Rust
      uses: dtolnay/rust-toolchain@stable
      with:
        targets: wasm32-unknown-unknown
        components: rustfmt, clippy
        
    - name: 缓存 Cargo
      uses: actions/cache@v3
      with:
        path: |
          ~/.cargo/bin/
          ~/.cargo/registry/index/
          ~/.cargo/registry/cache/
          ~/.cargo/git/db/
          target/
        key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}
        
    - name: 安装 wasm-pack
      run: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
      
    - name: 代码格式检查
      run: cargo fmt --all -- --check
      
    - name: Clippy 检查
      run: cargo clippy --all-targets --all-features -- -D warnings
      
    - name: 单元测试
      run: cargo test --lib
      
    - name: WASM 测试
      run: wasm-pack test --headless --firefox
      
    - name: 构建发布版本
      run: wasm-pack build --release --target web
      
    - name: 优化 WASM 大小
      run: |
        npm install -g wasm-opt
        wasm-opt -Oz -o pkg/wasm_cal_bg.wasm pkg/wasm_cal_bg.wasm
        
    - name: 检查 WASM 大小
      run: |
        WASM_SIZE=$(stat -c%s pkg/wasm_cal_bg.wasm)
        echo "WASM 文件大小: $WASM_SIZE bytes"
        if [ $WASM_SIZE -gt 1048576 ]; then  # 1MB
          echo "❌ WASM 文件过大: $WASM_SIZE bytes > 1MB"
          exit 1
        fi
        
  benchmark:
    name: 性能基准测试
    runs-on: ubuntu-latest
    
    steps:
    - name: 检出代码
      uses: actions/checkout@v4
      
    - name: 安装 Rust
      uses: dtolnay/rust-toolchain@stable
      with:
        targets: wasm32-unknown-unknown
        
    - name: 运行基准测试
      run: cargo bench
      
    - name: 上传基准测试报告
      uses: actions/upload-artifact@v3
      with:
        name: benchmark-report
        path: target/criterion/
        
  security:
    name: 安全检查
    runs-on: ubuntu-latest
    
    steps:
    - name: 检出代码
      uses: actions/checkout@v4
      
    - name: 安全审计
      run: |
        cargo install cargo-audit
        cargo audit
        
    - name: 依赖检查
      run: |
        cargo install cargo-deny
        cargo deny check
        
  deploy:
    name: 部署
    runs-on: ubuntu-latest
    needs: [test, benchmark, security]
    if: github.ref == 'refs/heads/main'
    
    steps:
    - name: 检出代码
      uses: actions/checkout@v4
      
    - name: 构建生产版本
      run: |
        curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
        wasm-pack build --release --target web
        npm install -g wasm-opt
        wasm-opt -Oz -o pkg/wasm_cal_bg.wasm pkg/wasm_cal_bg.wasm
        
    - name: 发布到 NPM
      run: |
        cd pkg
        npm publish
      env:
        NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        
    - name: 创建 GitHub Release
      uses: actions/create-release@v1
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      with:
        tag_name: v${{ github.run_number }}
        release_name: Release v${{ github.run_number }}
        body: |
          自动发布版本 v${{ github.run_number }}
          
          ## 更新内容
          - 性能优化
          - Bug 修复
          - 新功能添加
          
          ## 性能指标
          - WASM 文件大小: $(stat -c%s pkg/wasm_cal_bg.wasm) bytes
          - 构建时间: ${{ job.duration }}
        draft: false
        prerelease: false
```

## 12. 代码架构分析与优化建议

### 12.1 当前架构分析

#### 12.1.1 架构优势
1. **模块化设计**：代码按功能模块清晰分离（canvas、config、data、layout、render、utils）
2. **三层Canvas架构**：Base、Main、Overlay层分离，支持高效的局部重绘
3. **数据管理**：DataManager统一管理K线数据和可见范围
4. **配置管理**：ConfigManager支持主题和配置的动态切换
5. **FlatBuffer集成**：使用FlatBuffer进行高效的数据序列化
6. **工厂模式**：RendererFactory支持渲染器的动态创建和管理
7. **策略模式**：RenderStrategy支持不同的渲染策略（K线图、热力图等）

#### 12.1.2 架构问题识别
1. **内存管理不够优化**：大量使用`Rc<RefCell<T>>`，存在运行时借用检查开销
2. **渲染性能瓶颈**：缺乏有效的脏标记机制和批量渲染优化
3. **WASM边界调用频繁**：JS-WASM数据传输未充分优化
4. **错误处理不够完善**：缺乏统一的错误恢复机制
5. **缓存策略不足**：渲染结果和计算结果缓存机制不完善

### 12.2 客户端性能优化建议

**核心理念**：充分利用客户端PC的计算资源和内存空间，采用空间换时间的策略。

#### 12.2.1 客户端内存优化策略

**背景**：由于WASM运行在客户端PC上，内存不是瓶颈，可以采用更激进的缓存策略和预分配方案。

**优化方案**：
```rust
// 大容量预分配缓存
pub struct ClientSideCache {
    // 预分配大量K线数据缓存
    candle_cache: Vec<CandleData>,
    // 预分配渲染缓存
    render_cache: Vec<RenderCommand>,
    // 预分配计算缓存
    calculation_cache: HashMap<String, Vec<f64>>,
    // 预分配像素缓存
    pixel_buffer: Vec<u8>,
}

impl ClientSideCache {
    pub fn new() -> Self {
        Self {
            // 预分配10万根K线的缓存空间
            candle_cache: Vec::with_capacity(100_000),
            // 预分配1万个渲染命令缓存
            render_cache: Vec::with_capacity(10_000),
            // 预分配常用指标计算缓存
            calculation_cache: HashMap::with_capacity(50),
            // 预分配4K分辨率的像素缓存
            pixel_buffer: vec![0; 3840 * 2160 * 4],
        }
    }
    
    /// 智能缓存管理：根据使用频率调整缓存大小
    pub fn optimize_cache_size(&mut self, usage_stats: &UsageStats) {
        if usage_stats.max_candles_displayed > self.candle_cache.capacity() {
            self.candle_cache.reserve(usage_stats.max_candles_displayed * 2);
        }
    }
}

// 直接内存访问优化（客户端环境安全）
pub struct DirectMemoryRenderer {
    // 直接操作像素数据，避免Canvas API开销
    framebuffer: *mut u8,
    width: usize,
    height: usize,
}

impl DirectMemoryRenderer {
    /// 直接绘制K线到内存缓冲区
    pub unsafe fn draw_candle_direct(
        &mut self,
        x: usize,
        y: usize,
        width: usize,
        height: usize,
        color: u32,
    ) {
        let bytes_per_pixel = 4;
        for dy in 0..height {
            for dx in 0..width {
                let offset = ((y + dy) * self.width + (x + dx)) * bytes_per_pixel;
                if offset + 3 < self.width * self.height * bytes_per_pixel {
                    *self.framebuffer.add(offset) = (color & 0xFF) as u8;
                    *self.framebuffer.add(offset + 1) = ((color >> 8) & 0xFF) as u8;
                    *self.framebuffer.add(offset + 2) = ((color >> 16) & 0xFF) as u8;
                    *self.framebuffer.add(offset + 3) = ((color >> 24) & 0xFF) as u8;
                }
            }
        }
    }
}
```

#### 12.2.2 渲染性能优化

**问题**：当前渲染器缺乏有效的脏标记机制，每次都进行全量渲染。

**优化方案**：
```rust
// 脏标记系统
#[derive(Debug, Clone, Copy)]
pub struct DirtyFlags {
    pub data_changed: bool,
    pub layout_changed: bool,
    pub theme_changed: bool,
    pub viewport_changed: bool,
}

impl DirtyFlags {
    pub fn is_dirty(&self) -> bool {
        self.data_changed || self.layout_changed || self.theme_changed || self.viewport_changed
    }
    
    pub fn clear(&mut self) {
        *self = Self::default();
    }
}

// 增量渲染器
pub trait IncrementalRenderer {
    fn render_incremental(
        &mut self,
        ctx: &OffscreenCanvasRenderingContext2d,
        dirty_flags: &DirtyFlags,
    ) -> Result<(), WasmError>;
}

// 批量渲染优化
pub struct BatchRenderer {
    draw_calls: Vec<DrawCall>,
    vertex_buffer: Vec<f32>,
    index_buffer: Vec<u16>,
}

impl BatchRenderer {
    pub fn add_candle(&mut self, x: f32, y: f32, width: f32, height: f32, color: u32) {
        let base_index = (self.vertex_buffer.len() / 4) as u16;
        
        // 添加顶点数据
        self.vertex_buffer.extend_from_slice(&[
            x, y, color as f32, 0.0,
            x + width, y, color as f32, 0.0,
            x + width, y + height, color as f32, 0.0,
            x, y + height, color as f32, 0.0,
        ]);
        
        // 添加索引数据
        self.index_buffer.extend_from_slice(&[
            base_index, base_index + 1, base_index + 2,
            base_index, base_index + 2, base_index + 3,
        ]);
    }
    
    pub fn flush(&mut self, ctx: &OffscreenCanvasRenderingContext2d) {
        // 批量提交所有绘制调用
        // 使用 ImageData 直接操作像素数据
    }
}
```

#### 12.2.3 客户端数据传输优化

**策略**：最小化JS-WASM边界调用，采用大块数据传输和本地缓存。

**优化方案**：
```rust
// 客户端大容量数据管理
use js_sys::{Float32Array, Uint8Array};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct ClientKlineProcessor {
    // 大容量本地数据存储
    historical_data: Vec<CandleData>,
    // 预计算结果缓存
    indicator_cache: HashMap<String, Vec<f64>>,
    // 渲染结果缓存
    render_cache: Vec<u8>,
    // 客户端配置
    client_config: ClientConfig,
}

#[wasm_bindgen]
impl ClientKlineProcessor {
    /// 批量加载历史数据（一次性传输大量数据）
    #[wasm_bindgen(js_name = loadHistoricalData)]
    pub fn load_historical_data(&mut self, buffer: &Uint8Array) {
        // 一次性加载几个月的历史数据
        let data_size = buffer.length() as usize;
        self.historical_data.reserve(data_size / std::mem::size_of::<CandleData>());
        
        // 解析并存储到本地
        let mut offset = 0;
        while offset + std::mem::size_of::<CandleData>() <= data_size {
            let candle = unsafe {
                std::ptr::read(buffer.offset(offset as i32) as *const CandleData)
            };
            self.historical_data.push(candle);
            offset += std::mem::size_of::<CandleData>();
        }
        
        // 立即预计算常用指标
        self.precompute_indicators();
    }
    
    /// 预计算所有常用技术指标
    fn precompute_indicators(&mut self) {
        // 利用客户端CPU预计算移动平均线
        self.indicator_cache.insert(
            "MA5".to_string(),
            self.calculate_moving_average(5),
        );
        self.indicator_cache.insert(
            "MA10".to_string(),
            self.calculate_moving_average(10),
        );
        self.indicator_cache.insert(
            "MA20".to_string(),
            self.calculate_moving_average(20),
        );
        
        // 预计算MACD
        self.indicator_cache.insert(
            "MACD".to_string(),
            self.calculate_macd(),
        );
        
        // 预计算RSI
        self.indicator_cache.insert(
            "RSI".to_string(),
            self.calculate_rsi(14),
        );
    }
    
    /// 获取完整渲染数据（减少边界调用）
    #[wasm_bindgen(js_name = getCompleteRenderData)]
    pub fn get_complete_render_data(&self, viewport: &Viewport) -> js_sys::Object {
        let result = js_sys::Object::new();
        
        // 一次性返回所有渲染所需数据
        js_sys::Reflect::set(
            &result,
            &"candles".into(),
            &self.get_visible_candles(viewport).into(),
        ).unwrap();
        
        js_sys::Reflect::set(
            &result,
            &"indicators".into(),
            &self.get_visible_indicators(viewport).into(),
        ).unwrap();
        
        js_sys::Reflect::set(
            &result,
            &"volume".into(),
            &self.get_visible_volume(viewport).into(),
        ).unwrap();
        
        result
    }
    
    /// 智能缓存更新：只更新变化的部分
    #[wasm_bindgen(js_name = updateIncrementalData)]
    pub fn update_incremental_data(&mut self, new_candles: &Uint8Array) {
        // 只更新新增的K线数据
        let start_index = self.historical_data.len();
        
        // 解析新数据
        let mut new_data = Vec::new();
        // ... 解析逻辑
        
        // 增量更新指标缓存
        self.update_indicators_incremental(start_index, &new_data);
        
        // 添加到历史数据
        self.historical_data.extend(new_data);
    }
}

// 客户端专用配置
#[derive(Debug, Clone)]
pub struct ClientConfig {
    // 预加载数据量（客户端可以更大）
    pub preload_candles: usize,
    // 缓存大小（客户端内存充足）
    pub cache_size_mb: usize,
    // 预计算指标列表
    pub precompute_indicators: Vec<String>,
    // 渲染质量设置
    pub render_quality: RenderQuality,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            preload_candles: 50_000,  // 预加载5万根K线
            cache_size_mb: 100,       // 100MB缓存
            precompute_indicators: vec![
                "MA5".to_string(),
                "MA10".to_string(),
                "MA20".to_string(),
                "MACD".to_string(),
                "RSI".to_string(),
                "BOLL".to_string(),
            ],
            render_quality: RenderQuality::High,
        }
    }
}
```

### 12.3 架构重构建议

#### 12.3.1 客户端架构优化

**优化策略**：利用客户端环境的优势，采用更直接的架构模式。

**优化方案**：
```rust
// 客户端单例管理器（无需复杂的依赖注入）
pub struct ClientChartManager {
    // 直接持有所有组件，避免引用计数开销
    data_manager: DataManager,
    config_manager: ConfigManager,
    canvas_manager: CanvasManager,
    render_pipeline: RenderPipeline,
    // 客户端特有的大容量缓存
    cache_manager: ClientSideCache,
}

impl ClientChartManager {
    pub fn new() -> Self {
        Self {
            data_manager: DataManager::new(),
            config_manager: ConfigManager::new(),
            canvas_manager: CanvasManager::new(),
            render_pipeline: RenderPipeline::new(),
            cache_manager: ClientSideCache::new(),
        }
    }
    
    /// 一体化渲染：减少组件间通信开销
    pub fn render_integrated(&mut self, viewport: &Viewport) -> Result<(), WasmError> {
        // 直接访问所有组件，无需借用检查
        let visible_data = self.data_manager.get_visible_range(viewport);
        let theme = self.config_manager.get_current_theme();
        let layout = self.canvas_manager.get_layout();
        
        // 使用预分配的缓存进行渲染
        self.render_pipeline.render_with_cache(
            &visible_data,
            &theme,
            &layout,
            &mut self.cache_manager,
        )
    }
    
    /// 预热缓存：利用客户端空闲时间
    pub fn preheat_cache(&mut self, data_range: Range<usize>) {
        // 在空闲时间预计算常用指标
        for i in data_range {
            if let Some(candle) = self.data_manager.get_candle(i) {
                // 预计算移动平均线
                self.cache_manager.precalculate_ma(candle, &[5, 10, 20, 60]);
                // 预计算MACD
                self.cache_manager.precalculate_macd(candle);
                // 预计算布林带
                self.cache_manager.precalculate_bollinger(candle);
            }
        }
    }
}

// 客户端专用的高性能渲染管道
pub struct ClientRenderPipeline {
    // 预分配的渲染状态
    render_states: Vec<RenderState>,
    // 批量渲染缓冲区
    batch_buffer: Vec<DrawCommand>,
}

impl ClientRenderPipeline {
    /// 批量预处理：一次性处理大量数据
    pub fn batch_preprocess(&mut self, candles: &[CandleData]) {
        self.render_states.clear();
        self.render_states.reserve(candles.len());
        
        // 并行预处理（在客户端环境下安全）
        for candle in candles {
            self.render_states.push(RenderState {
                x: self.calculate_x_position(candle),
                y_open: self.calculate_y_position(candle.open),
                y_close: self.calculate_y_position(candle.close),
                y_high: self.calculate_y_position(candle.high),
                y_low: self.calculate_y_position(candle.low),
                color: self.determine_color(candle),
            });
        }
    }
}
```

#### 12.3.2 事件系统优化

**当前问题**：事件处理分散在各个组件中，缺乏统一管理。

**优化方案**：
```rust
// 高性能事件系统
use std::collections::VecDeque;

#[derive(Debug, Clone)]
pub enum ChartEvent {
    DataChanged { timestamp: f64 },
    ViewportChanged { start: usize, count: usize },
    ThemeChanged { theme_id: String },
    MouseMove { x: f64, y: f64 },
    MouseClick { x: f64, y: f64, button: u8 },
    Wheel { delta: f64, x: f64, y: f64 },
}

pub struct EventBus {
    events: VecDeque<ChartEvent>,
    handlers: Vec<Box<dyn Fn(&ChartEvent)>>,
    capacity: usize,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        Self {
            events: VecDeque::with_capacity(capacity),
            handlers: Vec::new(),
            capacity,
        }
    }
    
    pub fn emit(&mut self, event: ChartEvent) {
        if self.events.len() >= self.capacity {
            self.events.pop_front();
        }
        self.events.push_back(event);
    }
    
    pub fn process_events(&mut self) {
        while let Some(event) = self.events.pop_front() {
            for handler in &self.handlers {
                handler(&event);
            }
        }
    }
    
    pub fn subscribe<F>(&mut self, handler: F)
    where
        F: Fn(&ChartEvent) + 'static,
    {
        self.handlers.push(Box::new(handler));
    }
}
```

### 12.4 客户端智能优化策略

#### 12.4.1 智能预加载系统

**策略**：基于用户行为模式，预测性加载数据和预计算指标。

**实现方案**：
```rust
// 用户行为分析器
#[derive(Debug, Clone)]
pub struct UserBehaviorAnalyzer {
    // 用户查看的时间范围历史
    view_history: VecDeque<TimeRange>,
    // 常用的技术指标
    preferred_indicators: HashMap<String, u32>,
    // 缩放级别偏好
    zoom_preferences: Vec<f64>,
    // 访问模式（顺序浏览、跳跃浏览等）
    access_pattern: AccessPattern,
}

impl UserBehaviorAnalyzer {
    /// 分析用户行为并预测下一步操作
    pub fn predict_next_action(&self) -> PredictedAction {
        // 基于历史行为预测用户可能的下一步操作
        let recent_views = self.view_history.iter().take(10).collect::<Vec<_>>();
        
        if self.is_sequential_browsing(&recent_views) {
            // 顺序浏览模式：预加载相邻时间段
            PredictedAction::LoadAdjacentTimeRange {
                direction: self.detect_browsing_direction(&recent_views),
                range_size: self.estimate_preferred_range_size(),
            }
        } else if self.is_pattern_browsing(&recent_views) {
            // 模式浏览：预加载相似时间段
            PredictedAction::LoadSimilarPatterns {
                pattern_type: self.detect_pattern_type(&recent_views),
            }
        } else {
            // 随机浏览：预加载热门指标
            PredictedAction::PrecomputePopularIndicators {
                indicators: self.get_popular_indicators(),
            }
        }
    }
    
    /// 智能缓存管理：根据使用频率调整缓存策略
    pub fn optimize_cache_strategy(&self) -> CacheStrategy {
        CacheStrategy {
            // 根据用户偏好调整预加载数量
            preload_multiplier: self.calculate_preload_multiplier(),
            // 优先缓存常用指标
            priority_indicators: self.preferred_indicators.keys().cloned().collect(),
            // 根据访问模式调整缓存淘汰策略
            eviction_policy: match self.access_pattern {
                AccessPattern::Sequential => EvictionPolicy::LRU,
                AccessPattern::Random => EvictionPolicy::LFU,
                AccessPattern::Pattern => EvictionPolicy::Adaptive,
            },
        }
    }
}

// 智能预加载管理器
pub struct IntelligentPreloader {
    behavior_analyzer: UserBehaviorAnalyzer,
    preload_queue: VecDeque<PreloadTask>,
    background_processor: BackgroundProcessor,
}

impl IntelligentPreloader {
    /// 后台智能预加载
    pub fn start_background_preloading(&mut self) {
        // 利用客户端空闲时间进行预加载
        let predicted_action = self.behavior_analyzer.predict_next_action();
        
        match predicted_action {
            PredictedAction::LoadAdjacentTimeRange { direction, range_size } => {
                self.schedule_adjacent_preload(direction, range_size);
            }
            PredictedAction::LoadSimilarPatterns { pattern_type } => {
                self.schedule_pattern_preload(pattern_type);
            }
            PredictedAction::PrecomputePopularIndicators { indicators } => {
                self.schedule_indicator_precompute(indicators);
            }
        }
    }
    
    /// 自适应预加载：根据网络状况和设备性能调整
    pub fn adaptive_preload(&mut self, device_info: &DeviceInfo) {
        let preload_config = PreloadConfig {
            // 根据设备性能调整预加载强度
            intensity: match device_info.performance_tier {
                PerformanceTier::High => PreloadIntensity::Aggressive,
                PerformanceTier::Medium => PreloadIntensity::Moderate,
                PerformanceTier::Low => PreloadIntensity::Conservative,
            },
            // 根据内存大小调整缓存策略
            cache_size: std::cmp::min(
                device_info.available_memory / 4,  // 使用1/4可用内存
                1024 * 1024 * 1024,  // 最大1GB
            ),
            // 根据CPU核心数调整并行度
            parallel_tasks: device_info.cpu_cores.min(8),
        };
        
        self.apply_preload_config(preload_config);
    }
}
```

#### 12.4.2 离线计算优化

**策略**：利用客户端空闲时间进行复杂计算，提升实时响应性能。

**实现方案**：
```rust
// 离线计算调度器
pub struct OfflineComputeScheduler {
    // 计算任务队列
    task_queue: VecDeque<ComputeTask>,
    // 空闲时间检测器
    idle_detector: IdleDetector,
    // 计算结果缓存
    result_cache: HashMap<String, ComputeResult>,
}

impl OfflineComputeScheduler {
    /// 检测空闲时间并执行后台计算
    pub fn process_idle_tasks(&mut self) {
        if self.idle_detector.is_idle() {
            // 在空闲时间执行复杂计算
            while let Some(task) = self.task_queue.pop_front() {
                if !self.idle_detector.is_idle() {
                    // 如果不再空闲，暂停计算
                    self.task_queue.push_front(task);
                    break;
                }
                
                let result = self.execute_compute_task(task);
                self.cache_result(result);
            }
        }
    }
    
    /// 智能任务优先级调度
    pub fn schedule_compute_task(&mut self, task: ComputeTask) {
        // 根据任务重要性和计算复杂度排序
        let priority = self.calculate_task_priority(&task);
        
        // 插入到合适位置
        let insert_pos = self.task_queue
            .iter()
            .position(|t| self.calculate_task_priority(t) < priority)
            .unwrap_or(self.task_queue.len());
            
        self.task_queue.insert(insert_pos, task);
    }
    
    /// 预计算常用技术指标组合
    pub fn precompute_indicator_combinations(&mut self, data: &[CandleData]) {
        // 预计算常用指标组合
        let combinations = vec![
            vec!["MA5", "MA10", "MA20"],  // 移动平均线组合
            vec!["MACD", "Signal", "Histogram"],  // MACD组合
            vec!["RSI", "Stoch"],  // 动量指标组合
            vec!["BOLL_UPPER", "BOLL_MIDDLE", "BOLL_LOWER"],  // 布林带组合
        ];
        
        for combination in combinations {
            let task = ComputeTask::IndicatorCombination {
                indicators: combination,
                data: data.to_vec(),
                priority: TaskPriority::Medium,
            };
            self.schedule_compute_task(task);
        }
    }
}

// 空闲时间检测器
pub struct IdleDetector {
    last_user_action: f64,
    idle_threshold_ms: f64,
    cpu_usage_monitor: CpuUsageMonitor,
}

impl IdleDetector {
    /// 检测是否处于空闲状态
    pub fn is_idle(&self) -> bool {
        let now = js_sys::Date::now();
        let time_since_action = now - self.last_user_action;
        
        // 同时检查时间空闲和CPU使用率
        time_since_action > self.idle_threshold_ms 
            && self.cpu_usage_monitor.get_usage() < 0.3  // CPU使用率低于30%
    }
    
    /// 更新用户活动时间
    pub fn update_user_activity(&mut self) {
        self.last_user_action = js_sys::Date::now();
    }
}
```

#### 12.4.3 错误处理与恢复优化

**策略**：针对客户端环境的特点，实现更智能的错误处理和恢复机制。

**实现方案**：
```rust
// 客户端错误处理器
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ClientWasmError {
    #[error("渲染错误: {message} (可恢复: {recoverable})")]
    Render { message: String, recoverable: bool },
    
    #[error("数据处理错误: {message} (数据索引: {index}, 建议: {suggestion})")]
    Data { message: String, index: usize, suggestion: String },
    
    #[error("内存不足警告: {message} (当前使用: {current_mb}MB, 建议清理: {cleanup_suggestion})")]
    Memory { message: String, current_mb: f64, cleanup_suggestion: String },
    
    #[error("性能降级: {message} (当前FPS: {fps}, 建议优化: {optimization})")]
    Performance { message: String, fps: f64, optimization: String },
}

// 智能错误恢复系统
pub struct IntelligentErrorRecovery {
    recovery_strategies: HashMap<String, RecoveryStrategy>,
    error_history: VecDeque<ErrorEvent>,
    performance_monitor: PerformanceMonitor,
}

impl IntelligentErrorRecovery {
    /// 智能错误恢复
    pub fn handle_error(&mut self, error: &ClientWasmError) -> RecoveryResult {
        // 记录错误事件
        self.record_error_event(error);
        
        match error {
            ClientWasmError::Render { recoverable: true, .. } => {
                // 渲染错误：降级到简化渲染模式
                self.fallback_to_simple_rendering()
            }
            ClientWasmError::Memory { current_mb, .. } => {
                // 内存不足：智能清理缓存
                self.intelligent_cache_cleanup(*current_mb)
            }
            ClientWasmError::Performance { fps, .. } => {
                // 性能问题：动态调整渲染质量
                self.adaptive_quality_adjustment(*fps)
            }
            _ => {
                // 其他错误：使用通用恢复策略
                self.generic_recovery(error)
            }
        }
    }
    
    /// 智能缓存清理
    fn intelligent_cache_cleanup(&mut self, current_memory_mb: f64) -> RecoveryResult {
        let cleanup_target = current_memory_mb * 0.7;  // 清理到70%
        
        // 优先清理最少使用的缓存
        let cleanup_plan = self.generate_cleanup_plan(cleanup_target);
        
        for cleanup_action in cleanup_plan {
            match cleanup_action {
                CleanupAction::ClearIndicatorCache { indicator } => {
                    // 清理指定指标缓存
                }
                CleanupAction::ReduceRenderCache { percentage } => {
                    // 减少渲染缓存
                }
                CleanupAction::CompressHistoricalData => {
                    // 压缩历史数据
                }
            }
        }
        
        RecoveryResult::Success {
            message: "内存清理完成".to_string(),
            actions_taken: cleanup_plan.len(),
        }
    }
    
    /// 自适应质量调整
    fn adaptive_quality_adjustment(&mut self, current_fps: f64) -> RecoveryResult {
        let target_fps = 60.0;
        
        if current_fps < target_fps * 0.8 {  // FPS低于48
            // 降低渲染质量
            let quality_reduction = QualityReduction {
                reduce_anti_aliasing: true,
                simplify_indicators: true,
                reduce_update_frequency: true,
                use_simplified_candles: current_fps < 30.0,
            };
            
            self.apply_quality_reduction(quality_reduction);
            
            RecoveryResult::Success {
                message: "已降低渲染质量以提升性能".to_string(),
                actions_taken: 1,
            }
        } else {
            RecoveryResult::NoActionNeeded
        }
    }
}
```

#### 12.4.2 测试覆盖率提升

**当前问题**：缺乏全面的单元测试和集成测试。

**优化方案**：
```rust
// 测试工具模块
#[cfg(test)]
mod test_utils {
    use super::*;
    use wasm_bindgen_test::*;
    
    pub fn create_test_data_manager() -> DataManager {
        let mut manager = DataManager::new();
        // 添加测试数据
        manager
    }
    
    pub fn create_test_canvas() -> web_sys::OffscreenCanvas {
        let canvas = web_sys::OffscreenCanvas::new(800, 600).unwrap();
        canvas
    }
    
    pub fn assert_performance<F>(test_fn: F, max_duration_ms: f64)
    where
        F: FnOnce(),
    {
        let start = web_sys::window().unwrap().performance().unwrap().now();
        test_fn();
        let duration = web_sys::window().unwrap().performance().unwrap().now() - start;
        assert!(duration < max_duration_ms, "性能测试失败: {}ms > {}ms", duration, max_duration_ms);
    }
}

// 性能基准测试
#[cfg(test)]
mod performance_tests {
    use super::*;
    use test_utils::*;
    
    #[wasm_bindgen_test]
    fn test_large_dataset_rendering() {
        assert_performance(|| {
            let mut renderer = PriceRenderer::new();
            let data_manager = create_large_test_dataset(10000);
            let canvas = create_test_canvas();
            let ctx = canvas.get_context("2d").unwrap();
            
            renderer.render(&ctx, &ChartLayout::new(800.0, 600.0), &data_manager, &ChartTheme::default());
        }, 16.0); // 60fps 要求
    }
    
    #[wasm_bindgen_test]
    fn test_memory_usage() {
        let initial_memory = get_memory_usage();
        
        {
            let _renderer = PriceRenderer::new();
            let _data_manager = create_large_test_dataset(50000);
            // 执行一些操作
        }
        
        // 强制垃圾回收
        force_gc();
        
        let final_memory = get_memory_usage();
        let memory_leak = final_memory - initial_memory;
        
        assert!(memory_leak < 1024 * 1024, "内存泄漏检测失败: {}bytes", memory_leak);
    }
}
```

### 12.5 实施优先级

#### 高优先级（立即实施）
1. **脏标记系统**：实现增量渲染，显著提升性能
2. **批量渲染优化**：减少Canvas API调用次数
3. **错误处理统一化**：提升系统稳定性
4. **内存池实现**：减少内存分配开销

#### 中优先级（1-2周内实施）
1. **WASM边界优化**：减少JS-WASM数据传输开销
2. **事件系统重构**：提升交互响应性能
3. **测试覆盖率提升**：确保代码质量
4. **性能监控系统**：实时监控性能指标

#### 低优先级（长期规划）
1. **SIMD指令集优化**：利用客户端CPU的向量计算能力
2. **预测性缓存**：基于用户行为模式预加载数据
3. **智能降采样**：根据缩放级别动态调整数据精度
4. **离线计算优化**：利用客户端空闲时间进行复杂指标计算

---

## 附录A：v1.0 静态渲染器架构分析 (待废弃)

本章节完整保留了v1.0的 `ChartRenderer` 设计，以展示架构演进的必要性和背景。

### A.1. `ChartRenderer` 的设计

在v1.0架构中，`ChartRenderer` 是一个紧密耦合的"上帝对象"，其职责包括状态持有、渲染调度、事件处理和模式切换。

### A.2. 核心问题

1.  **职责过载**: 违反单一职责原则
2.  **静态绑定**: 扩展性差，违反开闭原则
3.  **可测试性差**: 逻辑紧密耦合，难以进行单元测试
4.  **内存效率低**: 缺乏内存池和对象复用机制
5.  **错误处理不完善**: 缺乏统一的错误处理和容错机制

### A.3. 迁移策略

1. **渐进式重构**: 保持现有API兼容性，逐步迁移到新架构
2. **功能分解**: 将现有渲染器的功能分解到专门的渲染器中
3. **测试覆盖**: 在重构过程中确保测试覆盖率不降低
4. **性能验证**: 确保新架构的性能不低于现有实现
5. **向后兼容**: 提供适配层确保现有代码可以无缝迁移

### A.4. 废弃时间表

- **v3.0.0**: 引入新架构，标记旧架构为 deprecated
- **v3.1.0**: 提供迁移工具和详细迁移指南
- **v3.2.0**: 移除旧架构的非关键功能
- **v4.0.0**: 完全移除旧架构代码
