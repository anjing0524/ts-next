# K 线图渲染系统（WASM-CAL）PRD

## 项目定位

WASM-CAL 是一个基于 WebAssembly + Rust 的高性能 K 线图表渲染系统，目标是在浏览器端实现接近原生应用的渲染性能和流畅交互体验。

## 核心功能需求

- 支持 K 线、成交量、价格线等基本图表元素的渲染
- 支持数据缩放（DataZoom）、滚轮缩放、拖拽平移
- 支持光标样式智能切换（默认、左右伸缩、平移等）
- 支持订单簿深度图、热力图等高级渲染
- 支持多语言与主题切换
- 支持增量数据更新与实时渲染

## 技术架构

- 渲染核心：Canvas 2D + 批处理渲染优化
- 语言与运行时：Rust + wasm-bindgen + wasm-pack
- 状态与数据：Rc<RefCell<T>> 共享状态、DataManager 可见范围
- 事件系统：捕获鼠标、滚轮、键盘事件，分发至 Command 层与 Render 层
- 模块化与扩展：策略模式渲染、独立渲染器模块

### 参考架构文档
- 《wasm-cal 渲染与事件流架构说明（2025-08-18）》<mcfile name="wasm-cal-render-events.md" path="/Users/liushuo/code/ts-next-template/apps/kline-service/wasm-cal/docs/architecture/wasm-cal-render-events.md"></mcfile>

## 部署规格

- 目标平台：现代浏览器（Chrome、Firefox、Safari）
- 构建产物：WASM 包 + JS Glue Code
- 包体积控制：小于 1.5MB（gzip 后）

## 性能指标

- 初始渲染时间：< 100ms（数据量 1000 条）
- 交互响应延迟：< 16ms
- 帧率：60fps（一般场景），不低于 30fps（极端场景）

## 接口设计

- Web API：通过 wasm-bindgen 暴露渲染器与配置接口
- 数据接口：支持 JSON/FlatBuffers 二进制数据输入

## 质量要求

- 单元测试覆盖率：> 80%
- 端到端交互测试：覆盖主要交互路径（缩放、拖拽、光标切换）

## 已实现功能清单

- 渲染器：K 线图、成交量图、价格线
- 交互：DataZoom、滚轮缩放、鼠标拖拽
- 其他：主题与本地化配置、工具提示