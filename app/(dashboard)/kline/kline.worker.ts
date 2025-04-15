'use client';
// kline.worker.ts - Web Worker 用于处理 WASM 和 Canvas 操作
import init, { KlineProcess } from '@/wasm-cal/pkg/kline_processor';

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

interface MouseLeaveMessage {
  type: 'mouseleave';
}

type WorkerMessage = InitMessage | DrawMessage | MouseMoveMessage | MouseLeaveMessage;

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

  const { canvas } = message;

  try {
    console.time('[Worker] 设置 Canvas');
    // 创建离屏 Canvas
    const offscreenMain = new OffscreenCanvas(canvas.width, canvas.height);
    const offscreenOverlay = new OffscreenCanvas(canvas.width, canvas.height);

    // 设置 Canvas 到处理器
    processorRef.set_canvases(canvas, offscreenMain, offscreenOverlay);
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
