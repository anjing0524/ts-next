'use client';
// kline.worker.ts - Web Worker 用于处理 WASM 和 Canvas 操作
import init, { KlineProcess } from '../../../public/wasm-cal/kline_processor';

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

interface ClickMessage {
  type: 'click';
  x: number;
  y: number;
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
  | ClickMessage;

// 存储处理器实例
let processorRef: KlineProcess | null = null;
let wasmMemory: WebAssembly.Memory | null = null;
let isInitializing = false;
let pendingDrawRequest: DrawMessage | null = null;

// 处理来自主线程的消息
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { data } = event;

  try {
    switch (data.type) {
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
          needsRedraw: needsRedraw,
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
      case 'click':
        if (!processorRef) return;
        // 调用WASM中的点击处理函数
        const wasModeChanged = processorRef.handle_click(data.x, data.y);
        // 通知主线程点击事件是否被处理（导致了模式切换）
        self.postMessage({
          type: 'clickHandled',
          modeChanged: wasModeChanged,
        });
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
    console.time('[Worker] 完整初始化流程');
    console.log('[Worker] 开始初始化 WASM...');

    // 1. 初始化 WASM 模块
    console.time('[Worker] 加载 WASM 模块');
    await init({ module_or_path: message.wasmPath });
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
    processorRef = new KlineProcess(wasmMemory, 0, buf.length);
    console.timeEnd('[Worker] 创建 KlineProcess 实例');

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
    console.time('[Worker] 设置 Canvas');
    // 设置 Canvas 到处理器
    processorRef.set_canvases(canvas, mainCanvas, overlayCanvas);
    console.timeEnd('[Worker] 设置 Canvas');

    // 绘制 K 线图
    console.time('[Worker] 绘制 K 线图');
    processorRef.draw_all();
    console.timeEnd('[Worker] 绘制 K 线图');

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
  wasmMemory = null;
  pendingDrawRequest = null;
}

// 监听关闭事件
self.addEventListener('close', () => {
  cleanup();
});
