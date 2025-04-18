### Design 金融数据分析系统

1. **数据获取层**

   - 支持多源数据接入：REST API、WebSocket、SSE、本地文件系统
   - 数据预处理与规范化：统一数据格式，支持增量更新
   - 采用 FlatBuffers 进行高效序列化，减少内存占用和序列化开销
   - 实现数据缓存机制，避免重复请求

2. **数据处理层**

   - 采用共享内存方式将序列化数据传递至 WebWorker 中的 WASM 模块
   - 实现数据处理任务队列，支持优先级调度
   - 添加处理进度反馈机制，提升用户体验
   - 支持增量计算，避免全量重新计算

3. **数据分析层**

   - WASM 模块内实现高性能数据分析算法
   - 支持常用技术指标计算：MA、MACD、KDJ、RSI 等（暂时未实现）
   - 实现自定义指标系统，允许用户定义分析逻辑（暂时未实现）
   - 分析结果缓存机制，提高重复查询效率

4. **数据可视化层**

   - 三层 Canvas 架构：背景层、数据层、交互层
   - 实现图表组件化，支持多种图表类型：K线图、面积图、柱状图等
   - 优化渲染性能：视口渲染、图形合并、离屏渲染
   - 支持丰富交互：缩放、平移、十字光标、提示框
   - 背景层绘制：网格、背景色、坐标系、图例、时间轴等静态元素
   - 数据层绘制：K线、成交量、指标值（如果有）、成交量分买卖饼图指标等
   - 交互层处理：鼠标事件、手势操作、datazoom缩放、tooltip 等，创建透明的交互热区，捕捉鼠标事件（点击、Hover、拖拽等），并触发图表的交互逻辑（如提示框、数据缩放、图例筛选）。

5. **系统架构优化**
   - 模块化设计，降低耦合度
   - 实现状态管理，支持撤销/重做操作
   - 添加错误处理与恢复机制
   - 支持配置持久化，保存用户偏好设置
