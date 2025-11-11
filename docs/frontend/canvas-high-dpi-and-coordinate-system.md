# 高 DPI（devicePixelRatio）适配方案与坐标系统一

文档日期：2025-08-21（UTC+8）

## 背景与目标
- 现状：在 Retina/HiDPI 屏幕上，K 线图与热力图存在轻微模糊、Tooltip 对齐偏差与 overlay 清理边界不一致等问题。
- 目标：
  1) 引入 devicePixelRatio（简称 DPR）统一渲染坐标系，保证高分屏清晰渲染；
  2) 统一 JS 主线程、Worker（rendering/socket）与 WASM 渲染层的尺寸与坐标计算口径；
  3) 明确 resize/清理与事件坐标的处理规范，消除模糊与偏移。

## 术语速查
- devicePixelRatio：显示设备“物理像素”和“CSS 像素”的比例，用来判断需要增加多少像素密度以获得更清晰的图像 <mcreference link="https://developer.mozilla.org/zh-CN/docs/Web/API/Window/devicePixelRatio" index="1">1</mcreference>
- setTransform(a,b,c,d,e,f)：设置 2D 上下文的变换矩阵，可用于缩放、旋转、平移与斜切；当 b、c 为 0 时，a、d 控制横纵缩放 <mcreference link="https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setTransform" index="2">2</mcreference>
- resetTransform()：将当前变换重置为单位矩阵，常用于在清理或绘制非变换内容前恢复默认坐标系 <mcreference link="https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/resetTransform" index="3">3</mcreference>
- OffscreenCanvas：将 <canvas> 控制权转移到离屏画布，可在 Worker 中进行渲染以避免阻塞主线程 <mcreference link="https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas" index="4">4</mcreference>

## 设计原则
- 逻辑坐标统一使用“CSS 像素”（下称 CSS 单位）；
- 画布物理尺寸（像素级 width/height 属性）= CSS 尺寸 × DPR；
- 2D 上下文统一设置 setTransform(DPR, 0, 0, DPR, 0, 0)，从而绘制与事件处理仍以 CSS 单位进行；
- 需要“按物理像素”操作（如整画布清理）时，先 resetTransform，再以物理尺寸执行 clearRect，然后恢复 setTransform。

## 架构与数据流
1) 页面主线程：
   - 计算并维护 cssWidth、cssHeight、dpr、pixelWidth=cssWidth*dpr、pixelHeight=cssHeight*dpr；
   - 初始化 Worker 时，发送 { cssWidth, cssHeight, pixelWidth, pixelHeight, dpr }；
   - 监听 DPR 或缩放变化（matchMedia/resolution 变化）并转发给 Worker 以触发重算 <mcreference link="https://developer.mozilla.org/zh-CN/docs/Web/API/Window/devicePixelRatio" index="1">1</mcreference> <mcreference link="https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio" index="5">5</mcreference>
2) rendering.worker：
   - 接收并缓存 dpr 与尺寸；
   - 设置 OffscreenCanvas 的 width/height 为像素尺寸（pixelWidth/Height）；
   - 调用 WASM：set_canvases(cssWidth, cssHeight, dpr) 与 handle_canvas_resize(cssWidth, cssHeight, dpr)。
3) wasm-cal（Rust）：
   - CanvasManager 保存 dpr；
   - 初始化与 resize 时：
     - 对 base/main/overlay 三层 OffscreenCanvasRenderingContext2D 调用 set_transform(dpr,0,0,dpr,0,0)；
     - 清理策略：reset_transform → clear_rect(0,0,pixelWidth,pixelHeight) → 恢复 set_transform（避免因缩放导致清理范围不一致） <mcreference link="https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/resetTransform" index="3">3</mcreference> <mcreference link="https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setTransform" index="2">2</mcreference>

## API 变更（消息约定）
- init/resize 消息：
  - from main → rendering.worker：{ cssWidth, cssHeight, pixelWidth, pixelHeight, dpr }
  - rendering.worker → wasm：set_canvases(cssWidth, cssHeight, dpr)、handle_canvas_resize(cssWidth, cssHeight, dpr)
- 事件坐标：
  - DOM 派发的鼠标/触控坐标为 CSS 单位，直接使用（无需 ×/÷ dpr），保证与绘制坐标一致；
  - 如需进行像素级命中测试，则显式转换：pixelX = cssX * dpr。

## 渲染与清理规范
- 统一缩放：ctx.setTransform(dpr, 0, 0, dpr, 0, 0) <mcreference link="https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setTransform" index="2">2</mcreference>
- 全画布清理：
  1) ctx.resetTransform() <mcreference link="https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/resetTransform" index="3">3</mcreference>
  2) ctx.clearRect(0, 0, pixelWidth, pixelHeight) <mcreference link="https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clearRect" index="6">6</mcreference>
  3) ctx.setTransform(dpr, 0, 0, dpr, 0, 0) <mcreference link="https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setTransform" index="2">2</mcreference>

## 兼容性与降级
- DPR 变化受页面缩放与多屏拖拽影响，应通过 matchMedia 或 window.devicePixelRatio 变更事件重算尺寸与重绘 <mcreference link="https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio" index="5">5</mcreference>
- OffscreenCanvas 支持良好，若在不支持环境中，可回退到主线程渲染（保持相同 dpr 策略） <mcreference link="https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas" index="4">4</mcreference>

## 测试计划（Jest）
- 单元测试：
  - computeCanvasPixelSize(cssRect,dpr)：输入多组 dpr（1,1.25,1.5,2,3）与尺寸，断言 pixelWidth/Height 精度与向 worker 的消息结构；
  - worker 编解码：init/resize 消息结构校验与 dpr 缓存；
  - wasm 封装桩：校验 set_canvases/handle_canvas_resize 的参数透传（cssWidth/Height 与 dpr）。
- 手动验证：
  - 不同 DPR 下的清晰度与对齐；
  - overlay 清理是否覆盖 datazoom 边界与右侧空白；
  - 拖拽到不同分辨率显示器或改变缩放后的重算与重绘。

## 验收标准
- 高分屏不模糊；
- Tooltip/十字线与图形命中对齐；
- resize 与清理无边界残留；
- 事件交互在不同 DPR 下无偏移。

---
参考资料：
1) MDN Window.devicePixelRatio <https://developer.mozilla.org/zh-CN/docs/Web/API/Window/devicePixelRatio>
2) MDN CanvasRenderingContext2D.setTransform <https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setTransform>
3) MDN CanvasRenderingContext2D.resetTransform <https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/resetTransform>
4) MDN OffscreenCanvas <https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas>
5) MDN Window: devicePixelRatio property <https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio>
6) MDN CanvasRenderingContext2D.clearRect <https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clearRect>