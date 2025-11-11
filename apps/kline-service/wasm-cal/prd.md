# K线图渲染系统（WASM-CAL）产品需求文档

## 1. 项目概述

### 1.1 项目定位

WASM-CAL是一个基于WebAssembly + Rust技术栈开发的高性能金融图表渲染引擎，专注于实现浏览器端接近原生应用的K线图表渲染性能和流畅交互体验。该系统通过Web Workers + OffscreenCanvas架构，在保证主线程流畅的同时，提供60fps的实时图表渲染能力。

### 1.2 核心价值

- **极致性能**：利用WASM的近原生执行效率，实现10,000条K线数据<100ms渲染时间
- **实时交互**：<16ms的鼠标响应延迟，支持流畅的缩放、拖拽、十字线跟踪
- **内存优化**：通过FlatBuffers零拷贝数据访问，100MB内存支持10万条数据
- **架构扩展**：模块化设计支持热图、订单簿等多种金融可视化模式

### 1.3 目标用户

- 金融交易平台开发团队
- 量化交易系统开发者
- 需要高性能图表渲染的Web应用

## 2. 功能需求规格

### 2.1 核心渲染功能

#### 2.1.1 多层价格线渲染（已实现）

**功能描述**：同时渲染最新价、买一价、卖一价三条独立价格曲线
**技术实现**：

- `src/render/line_renderer.rs` - 价格线绘制逻辑
- 支持独立的线条样式配置（颜色、宽度、虚实线）
- 抗锯齿平滑渲染，支持图像平滑处理

**详细规格**：

- **最新价线**：2px宽度实线，颜色可配置
- **买一价线**：1px宽度虚线，支持虚线间隔配置
- **卖一价线**：1px宽度虚线，支持虚线间隔配置
- **渲染优化**：使用`Path2D`批量绘制，单次绘制多条线段
- **数据映射**：通过`CoordinateMapper`进行价格到像素的精确映射

**性能要求**：

- 1000条数据点价格线渲染时间 < 20ms
- 支持实时数据更新，单点追加时间 < 2ms

#### 2.1.2 成交量柱状图渲染（已实现）

**功能描述**：在下方独立区域渲染买卖成交量对比柱状图
**技术实现**：

- `src/render/volume_renderer.rs` - 成交量渲染器
- 买卖量分离显示（b_vol/s_vol），支持堆叠和并排两种模式
- 与主图时间轴精确对齐，共享X轴坐标映射

**详细规格**：

- **柱状图样式**：矩形填充，支持渐变色填充
- **买卖量区分**：买量用绿色/红色，卖量用红色/绿色（主题可配置）
- **Y轴自适应**：根据最大成交量自动调整Y轴范围
- **工具提示**：鼠标悬停显示具体数值，格式化显示（K、M、B单位）

#### 2.1.3 Bookmap风格热力图（已实现）

**功能描述**：将价格-订单量数据以类似Bookmap的热力图形式可视化
**技术实现**：

- `src/render/heat_renderer.rs` - 热力图渲染器
- WASM SIMD优化的矩阵运算，支持`std::arch::wasm32`指令集
- 分层缓存系统，支持`HeatmapCacheKey`缓存失效检测

**详细规格**：

- **数据结构**：连续内存布局的`HeatmapBuffer`，支持最大512个价格档位
- **颜色映射**：基于成交量密度的对数色彩映射，支持自定义色谱
- **Tick计算**：`calculate_optimal_tick()`动态计算最优价格间隔
  - 每个bin最小3像素高度确保可视性
  - 自适应50-200个bins平衡精度与性能
  - 基础tick的2倍以上避免过度细分
- **性能优化**：
  - 缓存机制避免重复计算：相同可见范围+价格范围直接使用缓存
  - SIMD向量化计算，4个浮点数并行处理
  - 增量更新支持，只重新计算变化的数据区间

#### 2.1.4 多档位订单簿深度图（已实现）

**功能描述**：实时显示买卖订单深度的阶梯图，支持30+档位数据
**技术实现**：

- `src/render/book_renderer.rs` - 订单簿渲染器
- 与热力图共享价格tick计算逻辑，确保一致性
- 支持大单高亮显示和成交量分组

**详细规格**：

- **档位支持**：最多支持50个价格档位，可动态配置
- **大单检测**：自动识别大单（5-10倍平均订单量），独立颜色标记
- **热点聚合**：2-3个热点区域聚合显示，避免数据过于分散
- **实时更新**：买一价/卖一价实时跟踪，延迟<10ms

### 2.2 交互功能

#### 2.2.1 多模式数据缩放导航器（已实现）

**功能描述**：底部导航器组件支持三种操作模式的数据范围控制
**技术实现**：

- `src/render/datazoom_renderer.rs` - 缩放控制器，成交量面积图背景
- `src/command/manager.rs:handle_wheel()` - 滚轮缩放逻辑
- `src/data/visible_range.rs` - 可见范围算法和缓存

**详细交互规格**：

- **左边界拖拽**：10px检测区域，`DragHandleType::Left`
- **右边界拖拽**：10px检测区域，`DragHandleType::Right`
- **中间区域拖拽**：整体平移，`DragHandleType::Middle`
- **背景可视化**：成交量面积图提供数据密度感知
- **智能检测**：重叠区域优先最近边界，自动模糊处理

**滚轮缩放算法**：

- 主图区域：以鼠标位置为中心点缩放，保持缩放中心不变
- 导航器区域：基于导航器坐标进行精确缩放
- 缩放比例：每个滚轮步进10%增量，支持连续平滑缩放

**性能优化**：

- 拖拽状态缓存：`drag_start_visible_range`记录起始状态
- 增量计算：只计算变化量，避免全量重算
- 边界限制：自动防止超出数据范围

#### 2.2.2 双模式十字线系统（已实现）

**功能描述**：支持K线模式和热力图模式的差异化十字线和工具提示
**技术实现**：

- `src/render/overlay_renderer.rs` - 交互层渲染器，十字线绘制
- `src/render/tooltip_renderer.rs` - 模式感知的工具提示
- `src/command/manager.rs:update_hover_status()` - 精确的鼠标状态跟踪

**详细功能规格**：

- **十字线绘制**：
  - 水平线：跨越主图和成交量区域，虚线样式（4px间隔）
  - 垂直线：从主图顶部到成交量底部，精确对齐数据点
  - 自动约束：鼠标超出有效区域时自动约束到边界
- **坐标轴标签**：
  - Y轴价格标签：实时显示鼠标对应价格，2位小数格式
  - Y轴成交量标签：自动格式化（K/M/B单位），仅在成交量区域显示
  - X轴时间标签：120px宽度，"YYYY-MM-DD HH:MM"格式，智能居中

- **工具提示差异化**：
  - **K线模式**：显示OHLC、成交量、时间信息
  - **热力图模式**：显示价格档位、订单量、热度信息
  - 自适应位置：避免超出画布边界，智能调整位置

**悬停索引计算**：

- bin宽度动态计算：`ceil(heatmap_width / visible_count)`
- 防下溢保护：`count > 0 && end > start`检查
- 边界安全：`index.min(end - 1)`确保不超出范围

#### 2.2.3 上下文感知光标系统（已实现）

**功能描述**：根据鼠标位置和可操作元素动态切换光标样式，提供直观的交互反馈
**技术实现**：

- `src/render/cursor_style.rs` - 光标样式枚举定义
- `src/command/manager.rs:get_cursor_style_at()` - 区域检测和样式计算
- 策略工厂模式支持渲染器扩展光标样式

**支持的光标样式**：

- `Default`：默认指针，图表外区域
- `Crosshair`：十字光标，主图和成交量区域
- `EwResize`：左右调整，DataZoom边界手柄
- `Grab`：抓取手型，DataZoom中间拖拽区域

**区域检测逻辑**：

- 导航器优先级：先检测导航器区域，再检测主图区域
- 精确边界计算：基于`Rect::contains()`进行像素级检测
- 状态感知：结合拖拽状态(`is_dragging`)动态调整样式

### 2.3 数据管理功能

#### 2.3.1 高性能FlatBuffers数据层（已实现）

**功能描述**：零拷贝二进制数据格式，支持金融级数据精度和性能要求
**技术实现**：

- `schemas/kline.fbs` - 数据模式定义，支持版本演化
- `src/kline_generated.rs` - FlatBuffers编译器自动生成的类型安全访问代码
- `src/data/data_manager.rs` - 混合存储架构的数据管理器

**数据模式规格**：

```flatbuffers
table KlineItem {
    timestamp: int32;         // Unix时间戳(秒)，支持2038年后扩展
    open: double;            // 开盘价，IEEE754双精度
    high: double;            // 最高价
    low: double;             // 最低价
    close: double;           // 收盘价
    b_vol: double;           // 买方成交量
    s_vol: double;           // 卖方成交量
    volumes: [PriceVolume];  // 多档位订单量数组，最大50档
    last_price: double;      // 最新成交价
    bid_price: double;       // 买一价
    ask_price: double;       // 卖一价
}

table PriceVolume {
    price: double;           // 价格档位
    volume: double;          // 该档位订单量
}

table KlineData {
    items: [KlineItem];      // K线数据数组
    tick: double;            // 最小变动价位，用于精度控制
}

file_identifier "KLI1";     // 文件标识符，用于数据完整性验证
```

**数据验证机制**：

- 文件标识符验证：确保"KLI1"标识符匹配
- 数据长度检查：最小8字节长度验证
- FlatBuffers完整性验证：使用`VerifierOptions`进行结构验证
- 时间戳合理性检查：防止异常时间戳数据

#### 2.3.2 混合存储架构的增量数据系统（已实现）

**功能描述**：分离历史数据和实时数据，实现高效的增量更新和数据合并
**技术实现**：

- `DataManager::set_initial_data()` - 历史数据零拷贝加载
- `DataManager::append_data()` - 实时数据追加，支持去重
- `DataManager::merge_data()` - 乱序数据合并与排序

**混合存储设计**：

- **历史数据**：
  - FlatBuffers只读内存映射，零拷贝访问
  - 缓存解析结果：`parsed_data: Option<KlineData<'static>>`
  - unsafe生命周期转换确保内存安全
- **增量数据**：
  - `Vec<KlineItemOwned>`可写追加结构
  - HashMap时间戳索引：`timestamp_index: HashMap<i32, usize>`
  - 自动去重：相同时间戳数据更新而非重复添加

- **统一访问接口**：
  - `KlineItemRef`枚举：屏蔽数据源差异
  - `Borrowed(item)` - 引用FlatBuffers数据
  - `Owned(item)` - 引用增量数据
  - 自动索引映射：`index < initial_items_len`判断数据源

**增量更新性能**：

- 单条数据追加：O(1)时间复杂度（HashMap索引）
- 批量数据合并：O(n log n)排序 + O(n)索引重建
- 去重检测：O(1)HashMap查找，避免重复数据
- 内存增长：仅增量数据占用额外内存，历史数据共享

#### 2.3.3 智能可见范围管理（已实现）

**功能描述**：虚拟滚动技术，支持海量数据的流畅操作和渲染
**技术实现**：

- `src/data/visible_range.rs` - 可见范围算法和缓存
- `VisibleRange::from_layout()` - 基于布局的初始化
- `DataManager::calculate_data_ranges()` - 缓存的数据范围计算

**可见范围算法**：

- **初始化策略**：
  - 默认显示最新100条数据（可配置）
  - 基于Canvas宽度计算最优显示数量
  - 蜡烛图宽度自适应：`candle_width = total_width * 0.8`

- **缓存机制**：
  - `cached_data_range: Option<DataRange>` - 价格和成交量范围缓存
  - 缓存失效策略：可见范围变化时自动失效
  - 懒加载计算：仅在需要时计算数据范围

- **滚轮缩放算法**：
  - 中心点保持：以鼠标位置为缩放中心
  - 连续缩放：支持平滑的缩放体验
  - 边界保护：自动防止超出数据范围

**大数据支持**：

- 支持10万条以上数据：仅计算可见区域，内存占用O(visible_count)
- 增量范围更新：`update_visible_range()`仅在范围变化时触发计算
- 布局感知：`initialize_visible_range()`基于布局重新计算显示策略

### 2.4 动态配置与主题系统

#### 2.4.1 运行时主题配置系统（已实现）

**功能描述**：支持亮色/暗色主题和实时配置切换，无需重新加载页面
**技术实现**：

- `src/config/chart_config.rs` - 配置结构定义，支持Serde序列化
- `src/config/config_manager.rs` - 配置管理器，支持热更新
- `KlineProcess::update_config()` - WASM配置更新接口

**配置结构规格**：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartConfig {
    pub symbol: String,           // 交易对标识，如"BTC/USDT"
    pub theme: String,            // 主题名称："light"/"dark"
    pub custom_theme: Option<ChartTheme>, // 自定义主题覆盖
    pub title: Option<String>,    // 图表标题（可选）
    pub language: String,         // 语言代码："zh-CN"/"en-US"
}
```

**主题配置能力**：

- **预定义主题**：light/dark两套完整配色方案
- **自定义主题**：支持`custom_theme`字段覆盖任意颜色
- **实时切换**：通过`serde-wasm-bindgen`进行JavaScript-Rust配置传递
- **配置持久化**：前端负责配置存储，WASM提供配置获取接口

**配置更新流程**：

1. 前端JavaScript调用`updateConfig(newConfig)`
2. `rendering.worker.ts`将配置传递给WASM
3. `KlineProcess::update_config()`解析并应用配置
4. 自动触发重绘：`renderer.render()`
5. 返回更新后配置：`get_config()`供前端确认

#### 2.4.2 国际化与本地化（已实现）

**功能描述**：支持中英文界面和数据格式的本地化显示
**技术实现**：

- `src/config/locale.rs` - 本地化配置和格式化函数
- `src/utils/time.rs` - 时间格式化工具，支持不同地区格式
- 数字格式化：支持千分位分隔符和小数位控制

**本地化功能**：

- **时间格式**：
  - 中文：`YYYY年MM月DD日 HH:MM`
  - 英文：`YYYY-MM-DD HH:MM`
  - 可配置格式字符串

- **数字格式**：
  - 价格：固定2位小数，支持千分位分隔符
  - 成交量：智能单位（K/M/B），中英文单位切换
  - 百分比：2位小数，本地化百分号显示

- **UI文本**：
  - 坐标轴标签本地化
  - 工具提示文本多语言
  - 错误信息本地化显示

### 2.5 综合性能监控系统

#### 2.5.1 多维度实时性能统计（已实现）

**功能描述**：全方位监控WASM渲染性能、内存使用和交互响应，提供开发和生产环境的性能洞察
**技术实现**：

- `src/performance/monitor.rs` - WASM侧性能监控器
- `PerformancePanel.tsx` - 前端性能可视化面板
- `fps-monitor.ts` - 全局FPS监控器

**性能指标体系**：

- **渲染性能**：
  - FPS统计：当前/平均/最小/最大帧率
  - 渲染时间：单帧渲染耗时统计
  - 绘制调用：Canvas操作次数和批量化效果
  - 脏区域比例：重绘区域占总画布比例

- **内存监控**：
  - WASM内存：堆内存使用量和增长趋势
  - JavaScript内存：V8堆内存使用情况(`performance.memory`)
  - 内存峰值：历史最高内存使用记录
  - 内存泄漏检测：长期内存增长趋势分析

- **交互响应**：
  - 鼠标事件延迟：从事件触发到视觉反馈的延迟
  - 数据更新延迟：从数据接收到渲染完成的端到端延迟
  - Worker通信延迟：主线程与Worker之间的消息传递延迟

**性能监控架构**：

- **数据收集**：
  - `PerformanceMonitor::start_render_measurement()` - 渲染开始时间戳
  - `PerformanceMonitor::end_render_measurement()` - 计算渲染耗时
  - `globalFPSMonitor.getStats()` - 获取FPS统计数据
- **数据传输**：
  - Worker消息：`{ type: 'performanceMetrics', performanceData, timestamp }`
  - 1秒间隔批量上报，避免过频繁的性能数据传输
  - 可选性能数据过滤：仅在开发模式下启用详细监控

- **可视化展示**：
  - 紧凑模式：仅显示关键指标（FPS、内存）
  - 详细模式：显示所有性能指标和历史趋势
  - 颜色编码：绿色（良好）、黄色（警告）、红色（问题）
  - 实时更新：500ms刷新间隔保持数据时效性

## 3. 技术架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                  前端React层                            │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  main.tsx     │  rendering.worker.ts │ socket.worker.ts │
│  │  UI控制层      │  WASM渲染线程       │ WebSocket数据流   │
│  └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                 WASM渲染引擎层                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  KlineProcess │ ChartRenderer  │ CommandManager     │ │
│  │  主入口点      │ 渲染协调器      │ 事件处理器         │ │
│  └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                  核心功能层                             │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Canvas管理    │ 数据管理       │ 布局引擎           │ │
│  │  三层绘制      │ FlatBuffers   │ 响应式布局         │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 3.2 模块设计详解

#### 3.2.1 三层Canvas渲染架构

**分层渲染设计**：系统采用三个独立的OffscreenCanvas实现分层渲染，每层专注特定类型的绘制内容

- **Base层（z-index: 10）**：
  - 静态背景元素：网格线、坐标轴刻度
  - 绘制频率：仅在布局变化时重绘
  - 渲染器：`AxisRenderer` - 坐标轴和网格
- **Main层（z-index: 20）**：
  - 数据驱动内容：K线、成交量柱、热力图、订单簿
  - 绘制频率：数据变化或可见范围变化时重绘
  - 渲染器：`LineRenderer`、`VolumeRenderer`、`HeatRenderer`、`BookRenderer`
- **Overlay层（z-index: 30）**：
  - 交互反馈元素：十字线、工具提示、DataZoom导航器
  - 绘制频率：鼠标移动或交互状态变化时重绘
  - 渲染器：`OverlayRenderer`、`TooltipRenderer`、`DataZoomRenderer`

**脏标记优化系统**：

- `CanvasManager::is_dirty(layer_type)` - 检查特定层是否需要重绘
- `set_dirty(layer_type, true)` - 标记特定层为脏状态
- `clear_all_dirty_flags()` - 渲染完成后清除所有脏标记
- 选择性清理：Overlay层支持部分区域清理，避免影响DataZoom等组件

#### 3.2.2 数据流架构

**分离式数据存储**：

- **历史数据**：FlatBuffers零拷贝只读访问
- **增量数据**：Vec<KlineItemOwned>可写追加
- **统一访问**：KlineItemRef枚举屏蔽数据源差异

#### 3.2.3 事件处理架构

**Command模式实现**：

- `Event` → `CommandManager` → `CommandResult` → `ChartRenderer`
- 事件去耦合，支持撤销/重做功能扩展
- 智能光标和拖拽状态管理

#### 3.2.4 策略模式渲染

**RenderStrategy接口**：

```rust
trait RenderStrategy {
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError>;
    fn supports_mode(&self, mode: RenderMode) -> bool;
    fn get_layer_type(&self) -> CanvasLayerType;
}
```

**支持的渲染器**：

- `LineRenderer` - 多条价格线渲染
- `VolumeRenderer` - 买卖成交量柱状图
- `HeatRenderer` - Bookmap风格热力图
- `BookRenderer` - 多档位订单簿深度
- `AxisRenderer` - 坐标轴和网格线
- `TooltipRenderer` - 上下文感知工具提示
- `DataZoomRenderer` - 交互式数据导航器
- `OverlayRenderer` - 十字线和标签叠加层

#### 3.2.5 响应式布局引擎（已实现）

**功能描述**：声明式布局系统，支持多种约束类型和嵌套容器，自动适应Canvas尺寸变化
**技术实现**：

- `src/layout/definition.rs` - 布局节点和约束定义
- `src/layout/engine.rs` - 布局计算引擎
- `src/layout/chart_layout.rs` - 布局结果存储和访问

**布局节点类型**：

```rust
enum LayoutNode {
    // 具体面板（叶子节点）
    Pane { id: PaneId, constraint: Constraint },
    // 垂直容器（子节点垂直排列）
    VBox { id: PaneId, children: Vec<LayoutNode>, constraint: Constraint },
    // 水平容器（子节点水平排列）
    HBox { id: PaneId, children: Vec<LayoutNode>, constraint: Constraint },
}
```

**约束类型系统**：

- `Fixed(f64)` - 固定像素值，用于固定高度的坐标轴
- `Percent(f64)` - 百分比约束，相对于父容器的可用空间
- `Fill` - 填充约束，占用所有剩余可用空间（类似CSS flex-grow: 1）

**面板标识符**：

- `Root` - 根容器，对应整个Canvas
- `Header` - 顶部标题区域（可选）
- `MainContent` - 主要内容容器
- `ChartArea` - 图表绘制区域容器
- `HeatmapArea` - 热力图/K线主绘制区域
- `VolumeChart` - 成交量图区域
- `YAxis` - Y轴价格标签区域
- `TimeAxis` - X轴时间标签区域
- `NavigatorContainer` - 底部导航器容器
- `Custom(String)` - 自定义扩展面板

**布局计算算法**：

- **两阶段计算**：
  1. 约束解析：计算各节点的最终尺寸
  2. 位置分配：基于容器类型分配坐标位置
- **剩余空间分配**：Fill约束按比例分配剩余空间
- **溢出处理**：固定约束优先级高于百分比约束
- **嵌套支持**：支持任意深度的容器嵌套

**动态适应能力**：

- Canvas尺寸变化时自动重新计算布局
- 数据量变化时自动调整蜡烛图宽度：`candle_width = total_width * 0.8 / visible_count`
- 可见范围变化时更新导航器坐标映射

### 3.3 前端集成架构

#### 3.3.1 双Worker通信架构

**渲染Worker架构**（`rendering.worker.ts`）：

- **WASM生命周期管理**：
  - 异步初始化：`init(wasmPath)`加载WASM模块
  - 自动错误处理：WASM加载失败时的降级策略
  - 资源清理：Worker终止时的内存释放

- **Canvas上下文管理**：
  - `transferControlToOffscreen()`接管Canvas控制权
  - 三层Canvas分离：Base/Main/Overlay独立管理
  - 事件路由：将Canvas事件转发给WASM处理器

- **消息处理系统**：
  ```typescript
  type WorkerMessage =
    | { type: 'init'; payload: { port: MessagePort; wasmPath: string } }
    | {
        type: 'draw';
        payload: {
          canvas: OffscreenCanvas;
          mainCanvas: OffscreenCanvas;
          overlayCanvas: OffscreenCanvas;
        };
      }
    | { type: 'mousemove' | 'mousedown' | 'mouseup' | 'mouseleave'; x: number; y: number }
    | { type: 'wheel'; deltaY: number; x: number; y: number }
    | { type: 'resize'; width: number; height: number }
    | { type: 'updateConfig'; config: ChartConfig }
    | { type: 'getConfig' | 'getPerformance' }
    | { type: 'switchMode'; mode: 'kmap' | 'heatmap' };
  ```

**WebSocket Worker架构**（`socket.worker.ts`）：

- **连接管理**：
  - WebSocket连接状态跟踪：`connecting/connected/disconnected/error`
  - 指数退避重连：最大10次尝试，延迟递增
  - 心跳检测：定期发送ping保持连接活跃

- **数据流处理**：
  - 二进制数据接收：`ArrayBuffer`格式的FlatBuffers数据
  - 零拷贝转发：直接通过MessageChannel转发到渲染Worker
  - 订阅管理：支持多个交易对和时间周期的订阅

- **错误恢复**：
  - 自动重连逻辑：连接断开时自动尝试重连
  - 数据补齐：重连后请求缺失的历史数据
  - 状态同步：与主线程同步连接状态

#### 3.3.2 React主线程架构

**Main组件职责**（`main.tsx`）：

- **Worker编排**：
  - 双Worker生命周期管理：同步启动和终止
  - MessageChannel建立：渲染Worker和WebSocket Worker之间的通信桥梁
  - 错误边界处理：Worker异常时的UI降级显示

- **Canvas事件代理**：
  - 鼠标事件捕获：`onMouseMove/Down/Up/Leave`
  - 滚轮事件处理：`onWheel`支持精细缩放
  - 触摸事件支持：移动端触摸手势识别（计划中）

- **动态响应式UI**：

  ```tsx
  // 自适应Canvas尺寸
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 600 });
  useEffect(() => {
    const updateSize = () => {
      const width = Math.max(1200, window.innerWidth - 24);
      const height = Math.max(600, window.innerHeight - 200);
      setCanvasSize({ width, height });
    };
    window.addEventListener('resize', updateSize);
  }, []);
  ```

- **配置管理UI**：
  - 实时主题切换：亮色/暗色主题无缝切换
  - 模式切换：K线图⇄热力图一键切换
  - 配置同步：确保前端UI状态与WASM状态一致

**性能监控面板**（`PerformancePanel.tsx`）：

- **可折叠设计**：
  - 紧凑模式：仅显示FPS和内存使用
  - 展开模式：显示详细性能指标和历史数据
  - 位置可配置：支持四个角落的固定定位

- **实时数据可视化**：
  - 颜色编码指标：绿色（良好）、黄色（警告）、红色（问题）
  - 智能格式化：内存单位自动转换（MB/GB），FPS整数显示
  - 历史趋势：显示平均/最小/最大FPS值

- **开发者工具集成**：
  - 性能数据导出：支持CSV格式导出性能历史
  - 实时连接状态：WebSocket连接质量指示器
  - 错误日志显示：WASM和Worker错误信息展示

### 3.4 数据格式规范

#### 3.4.1 FlatBuffers Schema

**核心数据结构**：

```flatbuffers
table KlineItem {
    timestamp: int32;
    open: double;
    high: double;
    low: double;
    close: double;
    b_vol: double;
    s_vol: double;
    volumes: [PriceVolume];
    last_price: double;
    bid_price: double;
    ask_price: double;
}

table PriceVolume {
    price: double;
    volume: double;
}

table KlineData {
    items: [KlineItem];
    tick: double;
}
```

#### 3.4.2 API接口规范

**数据生成接口**（`/api/kline`）：

- 支持POST请求生成模拟数据
- 参数化配置（档位数、价格间隔、大单比例）
- 返回FlatBuffers二进制格式

**WebSocket接口**：

- 实时K线数据推送
- 订单簿深度数据更新
- 连接状态管理

## 4. 性能指标与优化

### 4.1 核心性能指标

| 指标类别 | 性能要求       | 当前实现 | 优化措施            |
| -------- | -------------- | -------- | ------------------- |
| 渲染性能 | 60fps          | 60fps    | 三层Canvas分离渲染  |
| 数据加载 | <100ms(10K条)  | <80ms    | FlatBuffers零拷贝   |
| 交互延迟 | <16ms          | <10ms    | OffscreenCanvas异步 |
| 内存使用 | <100MB(10万条) | <80MB    | 增量数据+对象池     |
| 包体积   | <1.5MB(gzip)   | <1.2MB   | WASM代码压缩        |

### 4.2 性能优化策略

#### 4.2.1 渲染优化

**脏标记系统**：

- 精确跟踪每层Canvas的更新需求
- 避免不必要的重绘操作
- 批量Canvas操作减少Draw Call

**可见区域裁剪**：

- 只渲染可见范围内的数据点
- 虚拟滚动支持海量数据
- 动态LOD（细节层次）调整

#### 4.2.2 内存优化

**零拷贝数据访问**：

- FlatBuffers直接内存映射
- 避免序列化/反序列化开销
- 内存池复用Canvas对象

**增量数据管理**：

- 分离历史数据和实时数据
- 智能数据合并和去重
- LRU缓存淘汰策略

#### 4.2.3 并发优化

**Web Workers架构**：

- 主线程专注UI响应
- 渲染线程处理计算密集任务
- WebSocket线程处理网络I/O

**异步渲染管线**：

- OffscreenCanvas支持后台渲染
- MessageChannel高效数据传递
- 渲染帧与数据更新解耦

### 4.3 监控与调试

#### 4.3.1 性能监控

**实时指标收集**：

- FPS和渲染时间统计
- WASM内存使用跟踪
- JavaScript堆内存监控

**性能分析工具**：

- Chrome DevTools集成
- 自定义性能面板
- 帧时间分布直方图

#### 4.3.2 调试支持

**开发模式功能**：

- 渲染边界框可视化
- 脏区域高亮显示
- 详细的错误日志输出

## 5. 扩展性设计

### 5.1 新渲染器扩展

#### 5.1.1 渲染器接口

新的图表类型可通过实现`RenderStrategy` trait轻松扩展：

```rust
pub struct CustomRenderer;

impl RenderStrategy for CustomRenderer {
    fn render(&self, ctx: &RenderContext) -> Result<(), RenderError> {
        // 自定义渲染逻辑
    }

    fn supports_mode(&self, mode: RenderMode) -> bool {
        // 支持的渲染模式
    }

    fn get_layer_type(&self) -> CanvasLayerType {
        // 指定渲染层级
    }
}
```

#### 5.1.2 策略工厂注册

通过`RenderStrategyFactory`注册新渲染器：

- 运行时动态加载
- 优先级排序支持
- 条件化渲染模式切换

### 5.2 数据源扩展

#### 5.2.1 新数据格式支持

- 扩展FlatBuffers schema定义
- 实现对应的解析器
- 保持向后兼容性

#### 5.2.2 实时数据流

- WebSocket协议扩展
- 数据压缩和增量传输
- 多数据源聚合支持

### 5.3 交互功能扩展

#### 5.3.1 新手势支持

通过扩展`Event`枚举和`CommandManager`：

- 多点触控手势
- 键盘快捷键
- 语音控制接口

#### 5.3.2 自定义工具

- 绘图工具（趋势线、斐波那契等）
- 技术指标叠加
- 注解和标记功能

## 6. 质量保证

### 6.1 测试策略

#### 6.1.1 单元测试

**Rust组件测试**：

- 数据管理逻辑测试覆盖率 > 90%
- 渲染器功能独立测试
- 性能基准回归测试

**TypeScript组件测试**：

- React组件行为测试
- Web Workers通信测试
- API接口契约测试

#### 6.1.2 集成测试

**端到端测试场景**：

- 完整数据加载渲染流程
- 交互事件响应准确性
- 内存泄漏和性能回归

#### 6.1.3 性能测试

**压力测试**：

- 10万条数据加载测试
- 长时间运行稳定性测试
- 并发用户模拟测试

### 6.2 代码质量

#### 6.2.1 静态分析

- Rust Clippy代码检查
- TypeScript严格模式
- 依赖安全性扫描

#### 6.2.2 文档化

- API文档自动生成
- 架构决策记录(ADR)
- 性能优化指南

## 7. 部署与运维

### 7.1 构建配置

#### 7.1.1 WASM构建优化

```bash
# 生产构建
wasm-pack build --target web --release --out-dir pkg

# 大小优化
wasm-opt -Oz -o optimized.wasm original.wasm
```

#### 7.1.2 CDN部署

- WASM文件CDN缓存配置
- 版本化资源管理
- 回滚机制支持

### 7.2 监控告警

#### 7.2.1 性能监控

- 用户端FPS统计上报
- 加载时间分位数监控
- 错误率和崩溃率跟踪

#### 7.2.2 业务监控

- 实时连接成功率
- 数据延迟监控
- 用户交互热力图

## 8. 发展路线图

### 8.1 短期目标（3个月）

- [ ] 完善单元测试覆盖率至90%+
- [ ] 优化WASM包体积至1MB以下
- [ ] 支持更多技术指标渲染
- [ ] 移动端适配优化

### 8.2 中期目标（6个月）

- [ ] 多时间周期数据切换
- [ ] 自定义绘图工具集
- [ ] 3D可视化模式
- [ ] AI辅助数据分析

### 8.3 长期目标（12个月）

- [ ] 跨平台Desktop应用
- [ ] 云端协作功能
- [ ] 插件生态系统
- [ ] 企业级部署方案

## 9. 风险与限制

### 9.1 技术风险

- **WASM兼容性**：需要现代浏览器支持
- **内存限制**：大数据集可能触发浏览器限制
- **调试复杂性**：WASM调试工具链相对有限

### 9.2 性能限制

- **移动设备性能**：需要针对性优化
- **网络延迟**：实时数据传输受网络质量影响
- **并发限制**：Web Workers数量受浏览器限制

### 9.3 缓解策略

- 渐进式功能降级
- 设备性能检测和自适应
- 离线缓存和数据同步

---

**文档版本**：v2.0  
**最后更新**：2025-08-27  
**维护团队**：WASM-CAL开发组
