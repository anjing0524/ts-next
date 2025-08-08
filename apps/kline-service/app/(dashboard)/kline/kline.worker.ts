'use client';
// kline.worker.ts - Web Worker 用于处理 WASM 和 Canvas 操作
import init, { KlineProcess, PerformanceMonitor } from '../../../public/wasm-cal/kline_processor';

// 定义消息类型
interface InitMessage {
  type: 'init';
  buffer: ArrayBuffer;
  wasmPath: string;
}

interface DrawMessage {
  type: 'draw';
  canvas: OffscreenCanvas;
  mainCanvas: OffscreenCanvas;
  overlayCanvas: OffscreenCanvas;
}

interface MouseMoveMessage {
  type: 'mousemove';
  x: number;
  y: number;
}

interface MouseDownMessage {
  type: 'mousedown';
  x: number;
  y: number;
}

interface MouseUpMessage {
  type: 'mouseup';
  x: number;
  y: number;
}

interface MouseDragMessage {
  type: 'mousedrag';
  x: number;
  y: number;
}

interface GetCursorStyleMessage {
  type: 'getCursorStyle';
  x: number;
  y: number;
}

interface MouseLeaveMessage {
  type: 'mouseleave';
}

interface WheelMessage {
  type: 'wheel';
  deltaY: number;
  x: number;
  y: number;
  isDragging?: boolean; // 添加可选的拖动状态标志
}


interface SwitchModeMessage {
  type: 'switchMode';
  mode: string;
}

interface ResizeMessage {
  type: 'resize';
  width: number;
  height: number;
}

interface UpdateConfigMessage {
  type: 'updateConfig';
  config: any;
}

interface GetConfigMessage {
  type: 'getConfig';
}

interface GetPerformanceMessage {
  type: 'getPerformance';
}

type WorkerMessage =
  | InitMessage
  | DrawMessage
  | MouseMoveMessage
  | MouseDownMessage
  | MouseUpMessage
  | MouseDragMessage
  | MouseLeaveMessage
  | WheelMessage
  | GetCursorStyleMessage
  | SwitchModeMessage
  | ResizeMessage
  | UpdateConfigMessage
  | GetConfigMessage
  | GetPerformanceMessage;

// 存储处理器实例
let processorRef: KlineProcess | null = null;
let wasmMemory: WebAssembly.Memory | null = null;
let isInitializing = false;
let pendingDrawRequest: DrawMessage | null = null;

// 性能监控器实例
let performanceMonitor: PerformanceMonitor | null = null;

// 处理来自主线程的消息
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { data } = event;

  try {
    switch (data.type) {
      case 'test':
        console.log('[Worker] 收到测试消息，Worker 正常工作');
        self.postMessage({ type: 'test-response', message: 'Worker is working!' });
        break;
      case 'init':
        await handleInit(data);
        break;
      case 'draw':
        // 如果正在初始化，存储绘制请求
        if (isInitializing) {
          pendingDrawRequest = data;
          return;
        }
        await handleDraw(data);
        break;
      case 'mousemove':
        if (!processorRef) return;
        // 只处理鼠标移动逻辑，不获取光标样式
        processorRef.handle_mouse_move(data.x, data.y);
        break;
      case 'mousedown':
        if (!processorRef) return;
        // 调用WASM中的鼠标按下处理函数
        const isHandled = processorRef.handle_mouse_down(data.x, data.y);
        // 通知主线程鼠标按下事件是否被处理
        self.postMessage({
          type: 'mousedownHandled',
          handled: isHandled,
        });
        break;
      case 'mouseup':
        if (!processorRef) return;
        // 调用WASM中的鼠标释放处理函数
        // 处理canvas外的情况，如果坐标为-1，说明是canvas外的事件
        const isOutsideCanvas = data.x === -1 && data.y === -1;
        let isDragEnd;
        
        if (isOutsideCanvas) {
          // 对于canvas外的事件，首先发送mouseleave
          processorRef.handle_mouse_leave();
          // 然后处理鼠标抬起，使用最后一个有效位置或特殊值
          isDragEnd = processorRef.handle_mouse_up(data.x, data.y);
        } else {
          // 正常处理canvas内的鼠标抬起
          isDragEnd = processorRef.handle_mouse_up(data.x, data.y);
        }
        
        // 通知主线程鼠标释放事件处理结果
        self.postMessage({
          type: 'mouseupHandled',
          isDragEnd: isDragEnd,
        });
        break;
      case 'mousedrag':
        if (!processorRef) return;
        // 调用WASM中的鼠标拖动处理函数
        processorRef.handle_mouse_drag(data.x, data.y);
        break;
      case 'mouseleave':
        if (!processorRef) return;
        // 调用WASM中的鼠标离开处理函数，返回是否需要重绘
        const needsRedraw = processorRef.handle_mouse_leave();
        // 通知主线程鼠标离开处理结果
        self.postMessage({
          type: 'mouseleaveHandled',
          needsRedraw: needsRedraw
        });
        break;
      case 'wheel':
        if (!processorRef) return;
        // 传递滚轮事件到WASM，包括拖动状态
        processorRef.handle_wheel(data.deltaY, data.x, data.y);
        break;
      case 'getCursorStyle':
        if (!processorRef) return;
        try {
          const cursorStyle = processorRef.get_cursor_style(data.x, data.y);
          self.postMessage({
            type: 'cursorStyle',
            style: cursorStyle,
          });
        } catch (err) {
          console.error('[Worker] 获取光标样式错误:', err);
          // 出错时使用默认样式
          self.postMessage({
            type: 'cursorStyle',
            style: 'default',
          });
        }
        break;
      case 'switchMode':
        if (!processorRef) return;
        try {
          processorRef.set_render_mode(data.mode);
          processorRef.draw_all(); // 重绘图表
          self.postMessage({
            type: 'modeChanged',
            mode: data.mode,
          });
        } catch (err) {
          console.error('[Worker] 切换模式失败:', err);
        }
        break;
      case 'resize':
        if (!processorRef) {
          console.warn('[Worker] resize消息收到，但processorRef未初始化');
          return;
        }
        try {
          console.log('[Worker] 收到resize消息，通知WASM环境:', { width: data.width, height: data.height });
          processorRef.handle_canvas_resize(data.width, data.height);
          console.log('[Worker] WASM环境Canvas尺寸更新完成');
        } catch (err) {
          console.error('[Worker] 处理画布大小改变失败:', err);
        }
        break;
      case 'updateConfig':
        if (!processorRef) return;
        try {
          // 使用新的 update_config 方法（serde-wasm-bindgen）
          processorRef.update_config(data.config);
          self.postMessage({
            type: 'configUpdated',
            config: data.config,
          });
        } catch (err) {
          console.error('[Worker] 更新配置失败:', err);
        }
        break;
      case 'getConfig':
        if (!processorRef) return;
        try {
          // 使用新的 get_config 方法，直接返回 JavaScript 对象
          const config = processorRef.get_config();
          self.postMessage({
            type: 'configUpdated',
            config: config, // 已经是 JavaScript 对象，无需 JSON.parse
          });
        } catch (err) {
          console.error('[Worker] 获取配置失败:', err);
        }
        break;
      case 'getPerformance':
        console.log('[Worker] 收到性能数据请求');
        try {
          let performanceData = null;
          
          // 从独立的PerformanceMonitor获取性能数据
          if (performanceMonitor) {
            try {
              // 使用统一的性能统计方法
              const statsJson = performanceMonitor.get_performance_stats();
              console.log('[Worker] 原始性能数据:', statsJson);
              if (statsJson) {
                performanceData = JSON.parse(statsJson);
                console.log('[Worker] 解析后性能数据:', performanceData);
              }
            } catch (perfErr) {
              console.warn('[Worker] 获取性能数据失败:', perfErr);
              performanceData = null;
            }
          } else {
            console.warn('[Worker] 性能监控器未初始化');
            performanceData = null;
          }
          
          // 直接发送WASM性能数据，不需要重复计算
          // performanceData已包含所有必要信息：renderTime、memoryUsage、memoryPercentage
          self.postMessage({
            type: 'performanceMetrics',
            performanceData,
            wasmMemory: performanceData ? {
              used: Math.round(performanceData.memoryUsage * 100) / 100, // MB
              total: wasmMemory ? Math.round(wasmMemory.buffer.byteLength / 1024 / 1024 * 100) / 100 : performanceData.memoryUsage
            } : null,
            timestamp: Date.now()
          });
        } catch (err) {
          console.error('[Worker] 获取性能指标失败:', err);
        }
        break;
      default:
        console.error('Worker 收到未知类型的消息');
    }
  } catch (error) {
    console.error('[Worker] 处理消息失败:', error);
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
};

// 初始化 WASM 和数据
async function handleInit(message: InitMessage) {
  if (isInitializing) {
    console.warn('[Worker] 已经在初始化中，忽略重复请求');
    return;
  }

  isInitializing = true;

  try {
    console.log('[Worker] 开始初始化 WASM 模块');
    console.log('[Worker] 接收到的数据:', { 
      arrayBufferSize: message.buffer.byteLength,
      wasmPath: message.wasmPath 
    });
    console.time('[Worker] 完整初始化流程');
    console.log('[Worker] 开始初始化 WASM...');

    // 1. 初始化 WASM 模块
    console.time('[Worker] 加载 WASM 模块');
    console.log('[Worker] 正在加载 WASM 模块...');
    await init({ module_or_path: message.wasmPath });
    console.log('[Worker] WASM 模块加载成功');
    console.timeEnd('[Worker] 加载 WASM 模块');

    // 2. 准备数据
    const buf = new Uint8Array(message.buffer);
    console.log(`[Worker] 收到数据: ${buf.length} 字节`);

    // 3. 分配足够的内存
    const pageSize = 65536; // 64KB per page
    const requiredPages = Math.ceil(buf.length / pageSize);
    console.log(`[Worker] 数据需要 ${requiredPages} WASM 内存页`);

    console.time('[Worker] 分配 WASM 内存');
    wasmMemory = new WebAssembly.Memory({
      initial: requiredPages + 2, // 额外分配两页内存作为缓冲
      maximum: Math.max((requiredPages + 2) * 2, 1024),
      shared: false, // 不使用共享内存，保持兼容性
    });
    console.timeEnd('[Worker] 分配 WASM 内存');

    // 4. 复制数据到 WASM 内存
    console.time('[Worker] 复制数据到 WASM 内存');
    const wasmMemoryView = new Uint8Array(wasmMemory.buffer, 0, buf.length);
    wasmMemoryView.set(buf);
    console.timeEnd('[Worker] 复制数据到 WASM 内存');

    // 5. 创建处理器实例
    console.time('[Worker] 创建 KlineProcess 实例');
    console.log('[Worker] 正在创建 KlineProcess 实例，数据大小:', buf.length);
    try {
        processorRef = new KlineProcess(buf);
        console.log('[Worker] KlineProcess 实例创建成功');
    } catch (error) {
        console.error('[Worker] KlineProcess 实例创建失败:', error);
        throw error;
    }
    console.timeEnd('[Worker] 创建 KlineProcess 实例');

    // 6. 初始化性能监控（统一管理）
    if (!performanceMonitor) {
      console.log('[Worker] 初始化性能监控器...');
      performanceMonitor = new PerformanceMonitor();
      performanceMonitor.init_monitor(); // 使用新的初始化方法
      console.log('[Worker] 性能监控器初始化完成');
    } else {
      console.log('[Worker] 性能监控器已存在');
    }

    console.timeEnd('[Worker] 完整初始化流程');

    // 通知主线程初始化完成
    self.postMessage({ type: 'initialized' });

    // 处理待处理的绘制请求
    if (pendingDrawRequest) {
      await handleDraw(pendingDrawRequest);
      pendingDrawRequest = null;
    }
  } catch (error) {
    console.error('[Worker] 初始化失败:', error);
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    isInitializing = false;
  }
}

// 处理绘图请求
async function handleDraw(message: DrawMessage) {
  if (!processorRef) {
    throw new Error('处理器未初始化');
  }

  const { canvas, mainCanvas, overlayCanvas } = message;

  try {
    // 开始渲染性能测量
    if (performanceMonitor) {
      performanceMonitor.start_render_measurement();
    }

    console.time('[Worker] 设置 Canvas');
    // 设置 Canvas 到处理器
    processorRef.set_canvases(canvas, mainCanvas, overlayCanvas);
    console.timeEnd('[Worker] 设置 Canvas');

    // 新增：设置标题
    processorRef.update_config({ title: '期货/SR' });

    // 绘制 K 线图
    console.time('[Worker] 绘制 K 线图');
    const renderStart = performance.now();
    processorRef.draw_all();
    const renderEnd = performance.now();
    console.timeEnd('[Worker] 绘制 K 线图');

    // 结束渲染性能测量
    if (performanceMonitor) {
      performanceMonitor.end_render_measurement();
    }

    // 通知主线程绘制完成
    self.postMessage({ type: 'drawComplete' });
  } catch (error) {
    console.error('[Worker] 绘制失败:', error);
    throw error;
  }
}

// 清理资源
function cleanup() {
  if (processorRef) {
    console.log('[Worker] 释放 KlineProcess');
    processorRef.free();
    processorRef = null;
  }
  if (performanceMonitor) {
    console.log('[Worker] 释放 PerformanceMonitor');
    performanceMonitor.free();
    performanceMonitor = null;
  }
  wasmMemory = null;
  pendingDrawRequest = null;
}

// 监听关闭事件
self.addEventListener('close', () => {
  cleanup();
});
