# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Kline-Service 开发者指南

## 服务概述

Kline-Service 是一个基于 Next.js 和 WebAssembly 的高性能金融图表服务，专注于 K 线图（蜡烛图）的实时渲染和交互。该服务利用 Rust/WASM 技术栈实现近原生的性能表现，支持大规模金融数据的可视化展示。

- **服务端口**: 3003
- **技术栈**: Next.js + TypeScript + React + WebAssembly + Rust
- **主要功能**: K线图渲染、交互式图表、热图展示、实时数据更新

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    前端层 (Next.js)                      │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  React Components    │  Web Worker    │  Canvas API   │ │
│  │  - Main.tsx          │  - kline.worker.ts            │ │
│  │  - Interactive UI    │  - WASM Bridge                │ │
│  └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                  WebAssembly 层                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Rust/WASM 引擎      │  渲染管线      │  内存管理   │ │
│  │  - KlineProcess      │  - 三层Canvas  │  - 对象池   │ │
│  │  - SIMD 优化         │  - 批量渲染    │  - 缓存策略 │ │
│  └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                   数据层                                 │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  FlatBuffers         │  API路由       │  模拟数据   │ │
│  │  - Schema定义        │  - /api/kline  │  - 生成器   │ │
│  │  - 零拷贝序列化      │  - POST接口    │  - 10K条    │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 核心目录结构

```
kline-service/
├── app/
│   └── (dashboard)/
│       └── kline/
│           ├── page.tsx          # 页面路由
│           ├── main.tsx          # 主React组件
│           ├── kline.worker.ts   # Web Worker 处理WASM通信
│           └── components/       # UI组件
├── api/
│   └── kline/
│       └── route.ts              # 数据API端点
├── public/
│   └── wasm-cal/                 # 编译后的WASM文件
├── wasm-cal/                     # Rust源代码
│   ├── src/
│   │   ├── lib.rs               # WASM入口点
│   │   ├── kline_process.rs     # 主处理器
│   │   ├── canvas/              # Canvas管理层
│   │   ├── render/              # 渲染器实现
│   │   ├── data/                # 数据管理
│   │   └── utils/               # 工具函数
│   ├── build.sh                 # 构建脚本
│   └── Cargo.toml               # Rust依赖配置
├── schemas/
│   └── kline.fbs                # FlatBuffers模式定义
└── generated/                   # FlatBuffers生成代码
```

## 技术特性

### 1. 高性能渲染引擎
- **三层Canvas架构**: Base(背景)、Main(K线数据)、Overlay(交互层)
- **Web Worker + OffscreenCanvas**: 避免主线程阻塞
- **SIMD优化**: 向量化数学计算，性能提升4-8倍
- **增量渲染**: 只重绘变化区域，减少70%无效绘制

### 2. 智能缓存系统
- **分层缓存**: 背景网格、坐标轴预渲染
- **对象池管理**: 复用Canvas对象和内存缓冲区
- **脏区域检测**: 精确计算需要重绘的区域
- **内存压缩**: FlatBuffers二进制格式，减少75%数据传输

### 3. 交互式用户体验
- **实时鼠标跟踪**: 十字线、提示信息
- **平滑缩放**: 鼠标滚轮、拖拽操作
- **多模式切换**: K线图 ↔ 热图显示
- **60FPS性能**: 优化的渲染管线确保流畅交互

## 核心命令

### 开发环境
```bash
# 安装依赖
pnpm install

# 启动开发服务（端口3003）
pnpm dev

# 或启动特定服务
pnpm --filter=kline-service dev

# 构建项目
pnpm build

# 启动生产服务
pnpm start
```

### WASM 构建
```bash
# 进入 WASM 目录
cd wasm-cal

# 构建并复制到 public 目录
./build.sh

# 或手动构建
wasm-pack build --target web --out-dir pkg --release
```

### 数据生成
```bash
# 生成 FlatBuffers 代码
pnpm flatc:generate

# 代码检查和格式化
pnpm lint
pnpm type-check
pnpm format
```

## 数据格式与API

### FlatBuffers模式 (schemas/kline.fbs)
```
namespace Kline;

table PriceVolume {
    price: double;
    volume: double;
}

table KlineItem {
    timestamp: int32;    // 时间戳(秒)
    open: double;       // 开盘价
    high: double;       // 最高价
    low: double;        // 最低价
    close: double;      // 收盘价
    b_vol: double;      // 买方成交量
    s_vol: double;      // 卖方成交量
    volumes: [PriceVolume]; // 价格订单量
    last_price: double; // 最新成交价
    bid_price: double;  // 买一价
    ask_price: double;  // 卖一价
}

table KlineData {
    items: [KlineItem];
    tick: double;        // 最小变动价位
}

root_type KlineData;
file_identifier "KLI1";
```

### API端点

#### POST /api/kline
生成模拟K线数据并返回FlatBuffers二进制格式。

**请求参数**:
- `numLevels`: 价格档位数 (默认30)
- `tickSize`: 价格间隔 (默认5)
- `largeOrderRatio`: 大单比例 (默认0.1)

**响应格式**: FlatBuffers二进制 (`application/octet-stream`)

**示例**:
```typescript
const response = await fetch('/api/kline', {
  method: 'POST',
  headers: { 'Content-Type': 'application/octet-stream' }
});
const buffer = await response.arrayBuffer();
```

## WASM集成架构

### 核心组件

#### 1. KlineProcess (WASM入口)
```rust
#[wasm_bindgen]
pub struct KlineProcess {
    core: ChartCore,  // 应用核心
}
```

#### 2. 三层Canvas管理
```rust
pub struct CanvasManager {
    base_ctx: OffscreenCanvasRenderingContext2d,   // 背景层
    main_ctx: OffscreenCanvasRenderingContext2d,   // 数据层
    overlay_ctx: OffscreenCanvasRenderingContext2d, // 交互层
}
```

#### 3. 渲染器系统
```rust
trait Renderer {
    fn render(&self, ctx: &Context, data: &Data) -> Result<(), JsValue>;
    fn layer_type(&self) -> CanvasLayer;
}

// 具体渲染器
- CandleRenderer    // K线渲染
- VolumeRenderer    // 成交量渲染
- AxisRenderer      // 坐标轴渲染
- OverlayRenderer   // 交互覆盖层
```

### 性能优化策略

#### 内存管理
- **对象池**: 复用临时对象减少GC压力
- **内存池**: 预分配内存块避免频繁分配
- **零拷贝**: FlatBuffers直接内存访问

#### 渲染优化
- **批量绘制**: Path2D批量路径操作
- **脏矩形**: 只重绘变化区域
- **SIMD计算**: 向量化数学运算
- **缓存策略**: 静态内容预渲染

#### 交互优化
- **Web Worker**: 避免主线程阻塞
- **OffscreenCanvas**: 独立渲染上下文
- **节流处理**: 平滑的鼠标/滚轮响应

## 前端React组件

### Main组件 (main.tsx)
主要功能：
- Web Worker生命周期管理
- Canvas事件处理
- 数据获取与传输
- 性能监控

### Web Worker (kline.worker.ts)
职责：
- WASM模块初始化
- 数据传递与内存管理
- Canvas上下文设置
- 事件路由到WASM

### 交互事件处理流程
```
用户交互 → React事件 → Web Worker → WASM处理 → Canvas更新
```

## 环境配置

### 环境变量
```bash
# .env.local
NEXT_PUBLIC_BASE_PATH=""  # 部署路径前缀
```

### Rust/WASM依赖
```toml
# wasm-cal/Cargo.toml
[dependencies]
wasm-bindgen = "0.2.100"
web-sys = { version = "0.3.77", features = ["OffscreenCanvas", "CanvasRenderingContext2d"] }
flatbuffers = "25.2.10"
js-sys = "0.3.77"
```

### 前端依赖
```json
{
  "lightweight-charts": "^5.0.4",
  "flatbuffers": "^25.2.10",
  "@repo/ui": "workspace:*"
}
```

## 测试策略

### 单元测试
```bash
# Rust单元测试
cd wasm-cal && cargo test

# TypeScript单元测试
pnpm test
```

### 集成测试
- WASM与JavaScript互操作测试
- Canvas渲染结果验证
- 性能基准测试

### 端到端测试
```bash
# Playwright E2E测试
pnpm e2e
```

## 性能指标

### 基准测试结果
- **数据加载**: 10,000条记录 < 100ms
- **渲染性能**: 60FPS @ 1920x1080
- **内存使用**: < 50MB (10K条数据)
- **交互延迟**: < 16ms (鼠标响应)

### 优化目标
- 支持100,000条数据实时渲染
- 60FPS流畅交互
- 内存使用控制在100MB以内
- 首屏加载时间 < 2秒

## 部署与构建

### 生产构建
```bash
# 完整构建流程
pnpm build

# 仅构建WASM
cd wasm-cal && ./build.sh

# 优化WASM大小
wasm-opt -Oz -o pkg/wasm_cal_bg.wasm pkg/wasm_cal_bg.wasm
```

### CDN配置
```nginx
# Nginx配置示例
location /wasm-cal/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header Cross-Origin-Embedder-Policy "require-corp";
    add_header Cross-Origin-Opener-Policy "same-origin";
}
```

## 故障排除

### 常见问题

#### WASM加载失败
```bash
# 检查路径
ls -la public/wasm-cal/
# 应该包含: kline_processor.js, kline_processor_bg.wasm

# 重新构建
cd wasm-cal && ./build.sh
```

#### Canvas渲染异常
- 检查浏览器是否支持OffscreenCanvas
- 验证Web Worker权限
- 确认内存分配是否成功

#### 性能问题
- 使用Chrome DevTools Performance面板
- 监控Web Worker消息频率
- 检查内存泄漏

### 调试工具
```typescript
// 性能监控
const perfMonitor = {
  fps: 0,
  renderTime: 0,
  memoryUsage: 0
};

// WASM调试日志
console.log = wasm_bindgen::console_log!;
```

## 扩展开发

### 添加新渲染器
1. 创建新的渲染器结构体实现 `Renderer` trait
2. 在 `RendererFactory` 中注册
3. 更新前端模式切换UI

### 自定义数据源
1. 实现新的数据解析器
2. 扩展FlatBuffers schema
3. 更新API端点数据生成逻辑

### 性能调优
- 调整对象池大小
- 优化脏区域算法
- 配置SIMD编译选项

## 最佳实践

### 代码规范
- 遵循Rust编码规范 (cargo fmt, clippy)
- TypeScript严格模式
- 完整的错误处理
- 性能监控集成

### 安全考虑
- WASM内存边界检查
- 输入数据验证
- 防止XSS攻击
- 资源清理

### 监控与告警
- FPS监控
- 内存使用警报
- 错误日志收集
- 性能回归测试

## 相关资源

- [WebAssembly官方文档](https://webassembly.org/)
- [Rust WASM Book](https://rustwasm.github.io/docs/book/)
- [OffscreenCanvas API](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [FlatBuffers指南](https://google.github.io/flatbuffers/)

## 开发注意事项

1. **性能优化**: 
   - 使用Transferable对象避免内存复制
   - Web Worker处理计算密集型任务
   - OffscreenCanvas实现独立渲染

2. **内存管理**:
   - WASM内存预分配和共享
   - 及时释放KlineProcess实例
   - 避免内存泄漏

3. **调试技巧**:
   - 使用Chrome DevTools Performance面板
   - 检查WASM内存使用
   - 监控FPS和渲染时间

4. **错误处理**:
   - 全局错误捕获
   - Worker错误边界
   - Canvas兼容性检查

### 环境配置

```bash
# .env.local
NEXT_PUBLIC_BASE_PATH=""  # 部署路径前缀
```

### 性能指标目标
- 数据加载: 10,000条记录 < 100ms
- 渲染性能: 60FPS @ 1920x1080
- 内存使用: < 50MB (10K条数据)
- 交互延迟: < 16ms

### 常见问题排查

1. **WASM加载失败**: 检查public/wasm-cal/目录文件
2. **Canvas渲染异常**: 验证OffscreenCanvas支持
3. **性能问题**: 使用DevTools监控Web Worker消息频率

## 沟通指南

- 保持对话为中文，不确定的内容要向我确认