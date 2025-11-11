# WASM-CAL 高性能K线图渲染引擎 - 设计与实现文档

## 项目概述

WASM-CAL是基于WebAssembly和Rust的高性能K线图渲染引擎，依托WebAssembly的近原生性能与Rust的内存安全特性，为金融数据可视化提供企业级解决方案。

## 核心目标

- **性能指标**: 目标帧率60fps（最低30fps），峰值内存≤50MB，初始化时间<100ms，数据处理延迟<16ms
- **设计原则**: 职责分离、类型系统驱动（Rust Trait）、单线程优化（Rc<RefCell<T>>）、边界内存安全

## 当前实现状态

### ✅ 已实现架构

- **渲染策略模式框架**（RenderStrategy trait + RenderStrategyFactory）
- **渲染器解耦架构**（ChartRenderer使用策略工厂，完全解耦）
- **Canvas批处理优化**（RenderBatch + CandleBatch）
- **布局系统实现**（ChartLayout + LayoutEngine + Templates）
- **数据管理与可见范围计算**（DataManager + VisibleRange）
- **事件系统实现**（支持拖拽、滚轮、点击等交互）
- **配置管理系统**（ChartConfig + Theme + Locale + ConfigManager）
- **高级渲染特性**（热图渲染、订单簿深度图、数据缩放）
- **交互式工具提示系统**（TooltipRenderer）
- **时间轴和坐标轴优化**（AxisRenderer）
- **价格线和成交量渲染器**（PriceRenderer + VolumeRenderer）
- **性能监控与基准测试**（完整基准测试框架）

### 参考架构文档（最新）
- 《wasm-cal 渲染与事件流架构说明（2025-08-18）》<mcfile name="wasm-cal-render-events.md" path="/Users/liushuo/code/ts-next-template/apps/kline-service/wasm-cal/docs/architecture/wasm-cal-render-events.md"></mcfile>

## 架构设计

### 核心模块架构

```
wasm-cal/src/
├── canvas/          # Canvas管理层
│   ├── base_canvas.rs    # 基础Canvas封装
│   ├── canvas_manager.rs # 三层Canvas管理器
│   └── layer.rs          # Canvas层定义
├── config/          # 配置管理
│   ├── chart_config.rs   # 图表配置
│   ├── theme.rs          # 主题配置
│   ├── locale.rs         # 本地化配置
│   └── manager.rs        # 配置管理器
├── data/            # 数据管理
│   ├── data_manager.rs   # 数据管理器
│   └── visible_range.rs  # 可见范围计算
├── layout/          # 布局系统
│   ├── chart_layout.rs   # 图表布局
│   ├── engine.rs         # 布局引擎
│   ├── mapper.rs         # 坐标映射
│   └── templates.rs      # 布局模板
├── render/          # 渲染系统
│   ├── chart_renderer.rs # 主渲染器
│   ├── renderer_traits.rs # 渲染器trait
│   ├── render_context.rs # 渲染上下文
│   ├── strategy/         # 渲染策略
│   │   ├── render_strategy.rs
│   │   └── strategy_factory.rs
│   ├── advanced/         # 高级渲染
│   │   └── render_batch.rs
│   └── 具体渲染器/        # 各功能渲染器
├── utils/           # 工具模块
│   ├── error.rs          # 错误处理
│   ├── time.rs           # 时间处理
│   └── throttle.rs       # 节流控制
└── kline_process.rs # 主处理器
```

### 渲染架构

**三层Canvas设计**:
- Base层：背景网格和静态元素
- Main层：K线数据、成交量、价格线
- Overlay层：交互层、工具提示、十字线

**渲染策略模式**:
- 通过`RenderStrategy` trait定义渲染接口
- `StrategyFactory`负责创建具体渲染策略
- 支持运行时切换渲染模式（K线图/热图/订单簿）

**批处理优化**:
- `RenderBatch`集中管理Canvas绘制调用
- `CandleBatch`优化K线批量渲染
- 减少Canvas状态切换开销

### 数据流架构

**数据管道**:
```
FlatBuffers二进制 → DataManager → VisibleRange → 渲染器 → Canvas
```

**内存管理**:
- 单次数据拷贝原则
- Rc<RefCell<T>>状态共享
- 对象池复用临时对象

### 配置系统

**分层配置**:
- ChartConfig：核心图表配置
- Theme：视觉主题配置
- Locale：本地化配置
- ConfigManager：运行时配置管理

## 技术特性

### 性能优化
- **60FPS渲染**：优化的渲染管线确保流畅交互
- **增量渲染**：只重绘变化区域
- **内存压缩**：FlatBuffers二进制格式
- **SIMD优化**：向量化数学计算

### 交互体验
- **实时鼠标跟踪**：十字线、提示信息
- **平滑缩放**：鼠标滚轮、拖拽操作
- **多模式切换**：K线图 ↔ 热图显示

### 扩展性
- **模块化设计**：各组件职责清晰，易于扩展
- **策略模式**：支持新的渲染模式无缝接入
- **配置驱动**：通过配置控制大部分行为

## 开发指南

### 构建命令
```bash
# 构建WASM模块
cd wasm-cal && ./build.sh

# 开发构建
wasm-pack build --target web --out-dir pkg --dev

# 生产构建
wasm-pack build --target web --out-dir pkg --release
```

### 测试策略
- **单元测试**：Rust模块级测试
- **集成测试**：WASM-JS互操作测试
- **性能基准**：渲染性能监控

_最后更新时间: 2025-08-18_
_文档版本: v3.0_
_状态: 已实现架构文档_