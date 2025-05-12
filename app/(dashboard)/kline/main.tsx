'use client';
import {
  useEffect,
  useRef,
  useState,
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
} from 'react';

// 节流函数工具
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return function (...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export default function Main() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/datamgr_flow'; // 使用环境变量

  // Canvas引用
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);

  // 性能监控引用
  const perfRef = useRef<{
    lastFrameTime: number;
    frameCount: number;
    fps: number;
  }>({ lastFrameTime: 0, frameCount: 0, fps: 0 });

  // 状态管理
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('default');
  const [isDragging, setIsDragging] = useState(false);
  const [fps, setFps] = useState(0); // 添加FPS状态

  // 定义画布尺寸常量
  const CANVAS_HEIGHT = 800; // 可见高度
  const CANVAS_WIDTH = 1800; // 可见宽度

  // 创建一个通用的获取鼠标坐标的函数
  const getMouseCoordinates = useCallback((e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!overlayCanvasRef.current) return null;

    const rect = overlayCanvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  // 创建一个通用的发送消息给Worker的函数
  const sendMessageToWorker = useCallback((message: unknown) => {
    if (!workerRef.current) return;
    workerRef.current.postMessage(message);
  }, []);

  // 鼠标移动和样式获取函数已移除防抖处理，直接使用sendMessageToWorker以提高响应速度

  // 设置Worker消息处理函数
  const setupWorkerMessageHandler = useCallback(
    (worker: Worker) => {
      // 使用消息类型映射优化消息处理
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageHandlers: Record<string, (data: any) => void> = {
        initialized: () => {
          if (!canvasRef.current || !mainCanvasRef.current || !overlayCanvasRef.current) {
            setError('Canvas元素未找到');
            setIsLoading(false);
            return;
          }
          // 第二次传输：OffscreenCanvas (无复制)
          const offscreen = canvasRef.current.transferControlToOffscreen();
          const mainOffscreen = mainCanvasRef.current.transferControlToOffscreen();
          const overlayOffscreen = overlayCanvasRef.current.transferControlToOffscreen();

          [offscreen, mainOffscreen, overlayOffscreen].forEach((canvas) => {
            canvas.width = CANVAS_WIDTH;
            canvas.height = CANVAS_HEIGHT;
          });
          worker.postMessage(
            {
              type: 'draw',
              canvas: offscreen,
              mainCanvas: mainOffscreen, // 添加 mainCanvas
              overlayCanvas: overlayOffscreen, // 添加 overlayCanvas
            },
            [offscreen, mainOffscreen, overlayOffscreen] // 标记为Transferable
          );
        },
        drawComplete: () => {
          setIsLoading(false);
        },
        error: (data) => {
          setError(data.error);
          setIsLoading(false);
        },
        cursorStyle: (data) => {
          setCursorStyle(data.style);
        },
        mousedownHandled: (data) => {
          if (data.handled) {
            setIsDragging(true);
          }
        },
        mouseupHandled: (data) => {
          if (data.isDragEnd) {
            setIsDragging(false);
          }
        },
        clickHandled: (data) => {
          // 点击事件导致了模式切换，可以在这里执行任何额外操作
          if (data.modeChanged) {
            console.log('图表模式已切换');
          }
        },
        performanceMetrics: (data) => {
          // 可以添加从Worker接收性能指标的处理
          if (data.renderTime) {
            console.log(`渲染时间: ${data.renderTime}ms`);
          }
        },
      };

      worker.onmessage = (e) => {
        try {
          const handler = messageHandlers[e.data.type];
          if (handler) {
            handler(e.data);
          } else {
            console.warn(`未处理的消息类型: ${e.data.type}`);
          }
        } catch (err) {
          console.error('Worker消息处理错误:', err);
          setError(`Worker消息处理错误: ${err instanceof Error ? err.message : '未知错误'}`);
          setIsLoading(false);
        }
      };
    },
    [CANVAS_WIDTH, CANVAS_HEIGHT]
  );

  // 添加性能监控函数
  const updatePerformanceMetrics = useCallback(() => {
    const now = performance.now();
    const perf = perfRef.current;

    perf.frameCount++;

    // 每秒更新一次FPS
    if (now - perf.lastFrameTime >= 1000) {
      perf.fps = Math.round((perf.frameCount * 1000) / (now - perf.lastFrameTime));
      perf.frameCount = 0;
      perf.lastFrameTime = now;
      setFps(perf.fps);
    }

    // 请求下一帧更新
    requestAnimationFrame(updatePerformanceMetrics);
  }, []);

  // 合并数据获取和Worker初始化到一个useEffect中
  useEffect(() => {
    const controller = new AbortController();
    const animationFrameId = requestAnimationFrame(updatePerformanceMetrics);
    let wasmPath = '';

    // 在客户端设置 wasmPath
    if (typeof window !== 'undefined') {
      wasmPath = `${window.location.origin}${basePath}/wasm-cal/kline_processor_bg.wasm`;
    }

    const fetchAndDraw = async () => {
      try {
        // 获取数据
        const response = await fetch(`${basePath}/api/kline`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/octet-stream' },
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        // 创建Worker
        const worker = new Worker(new URL('./kline.worker.ts', import.meta.url), {
          type: 'module',
        });
        workerRef.current = worker; // 保存worker引用

        // 添加错误监听
        worker.onerror = (e) => {
          setError(`Worker错误: ${e.message}`);
          setIsLoading(false);
        };

        const arrayBuffer = await response.arrayBuffer();

        // 第一次传输：原始数据到Worker (无复制)
        worker.postMessage(
          {
            type: 'init',
            buffer: arrayBuffer,
            wasmPath,
          },
          [arrayBuffer] // 关键点1：标记为Transferable
        );

        // 设置Worker消息处理函数
        setupWorkerMessageHandler(worker);
      } catch (err) {
        const { name, message } = err as { name: string; message: string };
        if (name !== 'AbortError') {
          setError(message);
          setIsLoading(false);
        }
      }
    };

    fetchAndDraw();

    return () => {
      // 清理资源
      controller.abort();
      if (workerRef.current) {
        try {
          workerRef.current.terminate();
          workerRef.current = null;
        } catch (err) {
          console.error('终止Worker时出错:', err);
        }
      }
      // 取消性能监控
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [setupWorkerMessageHandler, updatePerformanceMetrics]);

  // 使用useCallback优化鼠标移动事件处理函数，移除防抖以提高响应速度
  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const coords = getMouseCoordinates(e);
      if (!coords) return;

      // 直接发送鼠标移动消息，不使用防抖
      sendMessageToWorker({
        type: 'mousemove',
        x: coords.x,
        y: coords.y,
      });

      // 直接发送获取鼠标样式消息，不使用防抖
      sendMessageToWorker({
        type: 'getCursorStyle',
        x: coords.x,
        y: coords.y,
      });
    },
    [getMouseCoordinates, sendMessageToWorker]
  );

  // 处理鼠标离开事件
  const handleMouseLeave = useCallback(() => {
    sendMessageToWorker({
      type: 'mouseleave',
    });
  }, [sendMessageToWorker]);

  // 处理滚轮事件 - 使用节流优化
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleWheel = useCallback(
    throttle((e: ReactWheelEvent<HTMLCanvasElement>) => {
      // 无论是否在拖动状态，都发送滚轮事件到Worker
      sendMessageToWorker({
        type: 'wheel',
        deltaY: e.deltaY,
        x: e.nativeEvent.offsetX,
        y: e.nativeEvent.offsetY,
        isDragging: isDragging, // 添加拖动状态标志
      });
    }, 20), // 20ms的节流时间，平衡响应性和性能
    [sendMessageToWorker, isDragging] // 添加isDragging作为依赖项
  );

  // 处理鼠标按下事件
  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const coords = getMouseCoordinates(e);
      if (!coords) return;

      sendMessageToWorker({
        type: 'mousedown',
        x: coords.x,
        y: coords.y,
      });
    },
    [getMouseCoordinates, sendMessageToWorker]
  );

  // 处理鼠标释放事件
  const handleMouseUp = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const coords = getMouseCoordinates(e);
      if (!coords) return;

      sendMessageToWorker({
        type: 'mouseup',
        x: coords.x,
        y: coords.y,
      });
    },
    [getMouseCoordinates, sendMessageToWorker]
  );

  // 处理鼠标拖动事件
  const handleMouseDrag = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const coords = getMouseCoordinates(e);
      if (!coords) return;

      sendMessageToWorker({
        type: 'mousedrag',
        x: coords.x,
        y: coords.y,
      });
    },
    [getMouseCoordinates, sendMessageToWorker]
  );

  // 处理点击事件
  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const coords = getMouseCoordinates(e);
      if (!coords) return;

      sendMessageToWorker({
        type: 'click',
        x: coords.x,
        y: coords.y,
      });
    },
    [getMouseCoordinates, sendMessageToWorker]
  );

  // 添加错误边界处理函数
  const handleError = useCallback((err: Error) => {
    console.error('K线图渲染错误:', err);
    setError(`渲染错误: ${err.message}`);
    setIsLoading(false);
  }, []);

  // 使用useEffect添加全局错误处理
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleGlobalError = (event: ErrorEvent) => {
      if (event.message.includes('Worker') || event.message.includes('Canvas')) {
        handleError(new Error(`全局错误: ${event.message}`));
        event.preventDefault();
      }
    };

    window.addEventListener('error', handleGlobalError);

    return () => {
      window.removeEventListener('error', handleGlobalError);
    };
  }, [handleError]);

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">K 线图 (Web Worker + OffscreenCanvas)</h2>
      {/* 显示性能指标 */}
      <div className="text-sm text-gray-600 mb-2">性能: {fps} FPS</div>
      {isLoading && (
        <div className="p-4 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mr-2" />
          正在加载和处理 K 线数据...
        </div>
      )}
      {error && <div className="p-4 text-red-600">错误: {error}</div>}
      {/* 新增容器并设置固定尺寸 */}
      <div
        className="relative m-0 border-0 p-0"
        style={{ cursor: cursorStyle, width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px` }}
      >
        <canvas ref={canvasRef} className="absolute top-0 left-0 m-0 border-0 p-0 z-10" />
        <canvas
          ref={mainCanvasRef}
          className="absolute top-0 left-0 w-full m-0 border-0 p-0 z-20 "
        />
        <canvas
          onMouseMove={isDragging ? handleMouseDrag : handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          ref={overlayCanvasRef}
          className="absolute top-0 left-0 w-full m-0 border-0 p-0 z-30 "
        />
      </div>
    </div>
  );
}
