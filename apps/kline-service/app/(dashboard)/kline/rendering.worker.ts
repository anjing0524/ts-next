'use client';
// @/apps/kline-service/app/(dashboard)/kline/rendering.worker.ts

// Import WASM module statically
import init, {
  KlineProcess,
  PerformanceMonitor,
} from '../../../public/wasm-cal/kline_processor.js';

let processorRef: KlineProcess | null = null;
let performanceMonitor: PerformanceMonitor | null = null;
let isWasmInitialized = false;
let isCanvasSet = false;
let socketPort: MessagePort | null = null;
let isDragging = false;

self.onmessage = async (event: MessageEvent) => {
  const { type, ...data } = event.data;

  if (!isWasmInitialized && type !== 'init') {
    console.warn('[RenderingWorker] WASM not initialized, ignoring message:', type);
    return;
  }

  try {
    switch (type) {
      case 'init':
        await handleInitFromMain(event.data);
        break;
      case 'draw':
        await handleDraw(event.data);
        break;
      case 'mousemove':
        if (!processorRef) return;
        if (isDragging) {
          processorRef.handle_mouse_drag(data.x, data.y);
        } else {
          processorRef.handle_mouse_move(data.x, data.y);
        }
        const style = processorRef.get_cursor_style(data.x, data.y);
        self.postMessage({ type: 'cursorStyle', style });
        break;
      case 'mousedown':
        if (!processorRef) return;
        const cursor = processorRef.get_cursor_style(data.x, data.y);
        if (cursor === 'ew-resize' || cursor === 'grab') {
          isDragging = true;
        }
        processorRef.handle_mouse_down(data.x, data.y);
        break;
      case 'mouseup':
        if (!processorRef) return;
        isDragging = false;
        processorRef.handle_mouse_up(data.x, data.y);
        break;
      case 'mouseleave':
        if (!processorRef) return;
        isDragging = false;
        processorRef.handle_mouse_leave();
        break;
      case 'wheel':
        if (!processorRef) return;
        processorRef.handle_wheel(data.deltaY, data.x, data.y);
        break;
      case 'resize':
        if (!processorRef) return;
        processorRef.handle_canvas_resize(data.width, data.height);
        break;
      case 'updateConfig':
        if (!processorRef) return;
        processorRef.update_config(data.config);
        const newConfig = processorRef.get_config();
        self.postMessage({ type: 'configUpdated', config: newConfig });
        break;
      case 'getConfig':
        if (!processorRef) return;
        const config = processorRef.get_config();
        self.postMessage({ type: 'configUpdated', config });
        break;
      case 'getPerformance':
        if (performanceMonitor) {
          const statsJson = performanceMonitor.get_performance_stats();
          const performanceData = JSON.parse(statsJson);
          self.postMessage({ type: 'performanceMetrics', performanceData, timestamp: Date.now() });
        }
        break;
      case 'switchMode':
        if (!processorRef) return;
        console.log(`[RenderingWorker] Switching mode to: ${data.mode}`);
        processorRef.set_render_mode(data.mode);
        break;
      default:
        console.warn(`[RenderingWorker] Unknown message type from main thread: ${type}`);
    }
  } catch (error) {
    console.error(`[RenderingWorker] Error handling message from main thread (type: ${type}):`, error);
    self.postMessage({ type: 'error', error: (error as Error).message });
  }
};

async function handleSocketMessage(event: MessageEvent) {
  const { type, payload } = event.data;
  if (type !== 'process_data') {
    console.warn(`[RenderingWorker] Unknown message type from socket worker: ${type}`);
    return;
  }

  try {
    const dataArray = new Uint8Array(payload);
    console.log('[RenderingWorker] Received data from socket worker:', dataArray);
    performanceMonitor?.start_render_measurement();

    if (!processorRef) {
      console.log(`[RenderingWorker] First data chunk received (size: ${dataArray.byteLength}). Initializing WASM processor.`);
      processorRef = new KlineProcess(dataArray);
      console.log('[RenderingWorker] WASM processor initialized with initial data.');
      self.postMessage({ type: 'initialized' });
    } else {
      console.log(`[RenderingWorker] Appending data chunk (size: ${dataArray.byteLength}).`);
      processorRef.append_data(dataArray);
      console.log('[RenderingWorker] Data appended to WASM processor.');
    }

    if (isCanvasSet) {
      console.log('[RenderingWorker] Canvas is set, drawing all...');
      processorRef.draw_all();
      console.log('[RenderingWorker] draw_all() called.');
    }
    
    performanceMonitor?.end_render_measurement();
    self.postMessage({ type: 'data_updated', timestamp: Date.now() });

  } catch (error) {
    console.error('[RenderingWorker] Error processing data from socket worker:', error);
    self.postMessage({ type: 'error', error: (error as Error).message });
  }
}

async function handleInitFromMain(message: any) {
  if (isWasmInitialized) return;
  const { port, wasmPath } = message.payload;
  if (!port) {
    throw new Error('[RenderingWorker] Missing MessagePort from main thread during init');
  }
  socketPort = port as MessagePort;
  socketPort.onmessage = handleSocketMessage;

  try {
    const wasmBgPath = wasmPath || `${self.location.origin}/wasm-cal/kline_processor_bg.wasm`;
    await init(wasmBgPath);
    isWasmInitialized = true;
    performanceMonitor = new PerformanceMonitor();
    performanceMonitor.init_monitor();
    console.log('[RenderingWorker] WASM module loaded and ready.');
  } catch (e) {
    console.error('[RenderingWorker] WASM initialization failed:', e);
    self.postMessage({ type: 'error', error: `WASM initialization failed: ${e}` });
  }
}

async function handleDraw(message: any) {
  if (!processorRef) {
    self.postMessage({ type: 'error', error: 'WASM processor is not initialized.' });
    return;
  }
  const { canvas, mainCanvas, overlayCanvas } = message.payload;
  try {
    performanceMonitor?.start_render_measurement();
    processorRef.set_canvases(canvas, mainCanvas, overlayCanvas);
    isCanvasSet = true;
    processorRef.draw_all();
    performanceMonitor?.end_render_measurement();
    self.postMessage({ type: 'drawComplete' });
  } catch (error) {
    console.error('[RenderingWorker] Error during drawing operation:', error);
    self.postMessage({ type: 'error', error: (error as Error).message });
  }
}

function cleanup() {
  if (processorRef) {
    processorRef.free();
    processorRef = null;
  }
  if (performanceMonitor) {
    performanceMonitor.free();
    performanceMonitor = null;
  }
  if (socketPort) {
    socketPort.close();
  }
  console.log('[RenderingWorker] Cleaned up resources.');
}

self.addEventListener('close', cleanup);

// Export to satisfy ES module requirements
export default {};
