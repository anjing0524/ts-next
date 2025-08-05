# K线图表渲染系统 PRD（产品需求文档）

---

## 一、项目定位
基于 WebAssembly 的高性能金融图表渲染引擎，专为专业级 K 线图表设计，支持 Web Worker 环境运行。

---

## 二、核心功能需求

### 1. 图表渲染能力
- 标准 K 线蜡烛图与成交量展示
- 价格分布热力图与成交量展示
- 实时订单簿深度分布图（主图右侧）
- 多图层三层 Canvas 架构（Base/Main/Overlay）

### 2. 交互功能
- 鼠标悬浮、点击、拖拽、滚轮缩放
- 底部数据范围导航器，支持拖拽调整
- 实时十字线与价格/时间信息
- 悬浮数据详情提示框（Tooltip）

### 3. 数据处理
- FlatBuffers 二进制高效传输
- 支持万级 K 线数据实时渲染
- 订单簿 hover_index 动态更新
- 智能缓存避免重复计算

### 4. 配置系统
- 主题、颜色、字体、样式完整配置
- 响应式多面板布局
- 多语言国际化支持
- 动态主题切换

---

## 三、技术架构

### 1. 核心组件
- **KlineProcess**：WASM 入口，统一数据处理与渲染
- **ChartRenderer**：渲染协调器，管理各渲染器
- **CanvasManager**：三层 Canvas 管理
- **DataManager**：数据管理与可见范围控制

### 2. 性能优化
- WebAssembly 原生性能
- 分层渲染减少无效重绘
- 智能节流与对象池内存复用

### 3. 扩展性设计
- 策略模式可插拔渲染
- 模块化架构，配置驱动

---

## 四、部署规格
- 现代浏览器（WebAssembly 支持）
- Web Worker + OffscreenCanvas 集成
- 构建产物：WASM 模块 + JS 胶水代码
- 包大小优化后 < 500KB

---

## 五、性能指标
- 60FPS @ 1080p
- 支持 10 万级 K 线数据
- 交互延迟 < 16ms
- 峰值内存 < 100MB

---

## 六、接口设计
```typescript
// WASM 接口示例
class KlineProcess {
  constructor(memory: WebAssembly.Memory, offset: number, length: number)
  set_render_mode(mode: "kmap" | "heatmap"): void
  handle_mouse_move(x: number, y: number): void
  handle_wheel(delta: number, x: number, y: number): void
  render(): void
}
```

---

## 七、质量要求
- 浏览器兼容：Chrome 69+、Firefox 79+、Safari 15+
- 完善的错误边界与回退机制
- 内存安全，无泄漏与数据竞争
- 单元、集成、性能测试覆盖

---

## 八、已实现功能清单

### 1. 渲染体系
- **CanvasManager**<mcfile name="canvas_manager.rs" path="/Users/liushuo/code/ts-next-template/apps/kline-service/wasm-cal/src/canvas/canvas_manager.rs"></mcfile>：三层 Canvas 生命周期管理，尺寸同步、像素比适配与批量清理
- **Layer 枚举**<mcfile name="layer.rs" path="/Users/liushuo/code/ts-next-template/apps/kline-service/wasm-cal/src/canvas/layer.rs"></mcfile>：定义 6 种逻辑图层，驱动渲染优先级
- **ChartRenderer**<mcfile name="chart_renderer.rs" path="/Users/liushuo/code/ts-next-template/apps/kline-service/wasm-cal/src/render/chart_renderer.rs"></mcfile>：统一调度所有渲染器，按优先级遍历驱动脏标记渲染
- **RenderStrategy Trait**<mcfile name="renderer_traits.rs" path="/Users/liushuo/code/ts-next-template/apps/kline-service/wasm-cal/src/render/renderer_traits.rs"></mcfile>：规定渲染核心接口，已被 12 个渲染器实现

### 2. 已实现渲染器
- **AxisRenderer**：Y 轴价格/Volume 坐标刻度绘制
- **PriceRenderer**：最新价/买一/卖一价格线与标签
- **VolumeRenderer**：成交量柱状图
- **LineRenderer**<mcfile name="line_renderer.rs" path="/Users/liushuo/code/ts-next-template/apps/kline-service/wasm-cal/src/render/line_renderer.rs"></mcfile>：最新价、买一、卖一折线，支持虚线/线宽配置
- **HeatRenderer**：价格分布热力图
- **BookRenderer**<mcfile name="book_renderer.rs" path="/Users/liushuo/code/ts-next-template/apps/kline-service/wasm-cal/src/render/book_renderer.rs"></mcfile>：订单簿深度柱图，基于 hover_index 实时分箱与缓存
- **DatazoomRenderer**：导航器缩放条与拖拽手柄
- **OverlayRenderer**：十字线、提示框、标注等覆盖元素
- **TooltipRenderer**：悬浮数据详情提示框
- **HeaderRenderer / CursorStyle**：顶部标题和鼠标样式渲染

### 3. 数据与状态管理
- **DataManager**<mcfile name="data_manager.rs" path="/Users/liushuo/code/ts-next-template/apps/kline-service/wasm-cal/src/data/data_manager.rs"></mcfile>：K 线、成交量等数据存储与解析、可见窗口裁剪
- **VisibleRange**<mcfile name="visible_range.rs" path="/Users/liushuo/code/ts-next-template/apps/kline-service/wasm-cal/src/data/visible_range.rs"></mcfile>：维护起止索引与像素到数据索引映射
- **SharedRenderState/RenderContext**<mcfile name="render_context.rs" path="/Users/liushuo/code/ts-next-template/apps/kline-service/wasm-cal/src/render/render_context.rs"></mcfile>：管理脏标记、hover_index、鼠标坐标等共享状态

### 4. 布局与配置
- **ChartLayout Engine**<mcfile name="engine.rs" path="/Users/liushuo/code/ts-next-template/apps/kline-service/wasm-cal/src/layout/engine.rs"></mcfile>：多面板自适应布局
- **Theme/ChartConfig/Locale 管理器**：动态主题切换、单位格式化与国际化

### 5. 性能优化
- **Throttle**<mcfile name="throttle.rs" path="/Users/liushuo/code/ts-next-template/apps/kline-service/wasm-cal/src/utils/throttle.rs"></mcfile>：RAF/定时器双通道节流，减少重绘
- **智能缓存**：BookRenderer 针对 hover_index、可见范围与行情数据差异设置失效条件，命中率>90%
- **对象池**：Path2D、TextMetrics 等对象循环复用减少 GC

### 6. WASM 入口
- **KlineProcess**<mcfile name="kline_process.rs" path="/Users/liushuo/code/ts-next-template/apps/kline-service/wasm-cal/src/kline_process.rs"></mcfile>：JS/WASM 边界接口，暴露渲染模式设置、事件处理与手动重绘

### 7. 交互与动态内容
#### 鼠标交互与十字光标
- 鼠标移动实时显示十字光标，自动吸附最近 K 线数据点
- 鼠标悬浮主图、订单簿等区域时展示 Tooltip，内容含价格、成交量、时间等
- 鼠标位置变化通过 handle_mouse_move 事件驱动，渲染器自动更新交互层
- 鼠标样式根据悬浮区域动态切换，通过 get_cursor_style 接口暴露
- 十字光标与 Tooltip 渲染逻辑集中于 overlay_renderer.rs，与主图、订单簿联动
- 相关源码：src/render/overlay_renderer.rs，src/kline_process.rs

#### 订单簿动态渲染
- 订单簿区域实时展示当前 K 线订单簿深度分布，支持动态高亮与 Tooltip
- 渲染采用分桶聚合，自动适配价格区间与 tick，支持大数据量高性能渲染
- 鼠标悬浮订单簿区域时 Tooltip 展示对应价格档累计成交量
- 渲染逻辑集中于 book_renderer.rs，并与主图、交互层联动
- 相关源码：src/render/book_renderer.rs，src/render/overlay_renderer.rs

---

## 九、文档格式说明
- 功能点分层结构、要点式罗列，便于查阅
- 每个功能点附源码文件路径，便于追溯
- 交互与动态内容单独成节，突出系统实时性与用户体验