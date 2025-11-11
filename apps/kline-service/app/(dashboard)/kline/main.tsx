'use client';
import {
  useEffect,
  useRef,
  useState,
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
} from 'react';
import { PerformancePanel } from './components/PerformancePanel';

export default function Main() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderingWorkerRef = useRef<Worker | null>(null);
  const socketWorkerRef = useRef<Worker | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('default');
  const [isDragging, setIsDragging] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [showPerformancePanel, setShowPerformancePanel] = useState(true);
  
  const [isWSConnected, setIsWSConnected] = useState(false);
  const [wsStatus, setWSStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error' | 'snapshot_received' | 'recovering_data' | 'recovered'>('disconnected');
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  
  const canvasTransferredRef = useRef(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 600 });

  useEffect(() => {
    const updateCanvasSize = () => {
      const padding = 24;
      const headerHeight = 200;
      const width = window.innerWidth - padding;
      const height = window.innerHeight - headerHeight;
      const finalWidth = Math.max(1200, Math.round(width));
      const finalHeight = Math.max(600, Math.round(height));
      setCanvasSize({ width: finalWidth, height: finalHeight });
    };
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  const sendMessageToRenderingWorker = useCallback((message: unknown) => {
    renderingWorkerRef.current?.postMessage(message);
  }, []);

  // 添加模式切换函数
  const switchMode = useCallback(
    (mode: string) => {
      sendMessageToRenderingWorker({
        type: 'switchMode',
        mode: mode,
      });
    },
    [sendMessageToRenderingWorker]
  );

  // 使用新的 serde-wasm-bindgen API 更新配置
  const updateChartConfig = useCallback((newConfig: any) => {
    if (renderingWorkerRef.current) {
      // 直接发送配置对象，无需 JSON.stringify
      renderingWorkerRef.current.postMessage({
        type: 'updateConfig',
        config: newConfig,
      });
    }
  }, []);

  // 获取当前配置
  const getCurrentConfig = useCallback(() => {
    if (renderingWorkerRef.current) {
      renderingWorkerRef.current.postMessage({
        type: 'getConfig',
      });
    }
  }, []);

  // 示例：切换主题
  const switchTheme = useCallback(
    (themeName: string) => {
      const newConfig = {
        ...(config || {}),
        theme: themeName,
      };
      updateChartConfig(newConfig);
    },
    [config, updateChartConfig]
  );

  const setupRenderingWorkerMessageHandler = useCallback(
    (worker: Worker) => {
      const messageHandlers: Record<string, (data: any) => void> = {
        initialized: () => {
          setTimeout(() => {
            if (!canvasRef.current || !mainCanvasRef.current || !overlayCanvasRef.current || canvasTransferredRef.current) return;
            try {
              const offscreen = canvasRef.current.transferControlToOffscreen();
              const mainOffscreen = mainCanvasRef.current.transferControlToOffscreen();
              const overlayOffscreen = overlayCanvasRef.current.transferControlToOffscreen();
              canvasTransferredRef.current = true;
              worker.postMessage(
                { type: 'draw', payload: { canvas: offscreen, mainCanvas: mainOffscreen, overlayCanvas: overlayOffscreen } },
                [offscreen, mainOffscreen, overlayOffscreen]
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Canvas移交失败');
              setIsLoading(false);
            }
          }, 10);
        },
        drawComplete: () => setIsLoading(false),
        error: (data) => {
          setError(data.error);
          setIsLoading(false);
        },
        cursorStyle: (data) => setCursorStyle(data.style),
        configUpdated: (data) => setConfig(data.config),
        data_updated: (data) => setLastUpdateTime(new Date(data.timestamp)),
        performanceMetrics: () => {},
      };
      worker.onmessage = (e) => {
        messageHandlers[e.data.type]?.(e.data);
      };
    },
    []
  );

  const setupSocketWorkerMessageHandler = useCallback(
    (worker: Worker) => {
      const messageHandlers: Record<string, (data: any) => void> = {
        status: (data) => {
          setWSStatus(data.payload);
          setIsWSConnected(data.payload === 'connected');
          if (['connected', 'error', 'recovered'].includes(data.payload)) {
            setLastUpdateTime(new Date());
          }
        },
        snapshot_received: () => setIsLoading(false),
      };
      worker.onmessage = (e) => {
        messageHandlers[e.data.type]?.(e.data);
      };
    },
    []
  );

  useEffect(() => {
    const renderingWorker = new Worker(new URL('./rendering.worker.ts', import.meta.url), { type: 'module' });
    renderingWorkerRef.current = renderingWorker;

    const socketWorker = new Worker(new URL('./socket.worker.ts', import.meta.url), { type: 'module' });
    socketWorkerRef.current = socketWorker;

    const { port1, port2 } = new MessageChannel();

    // The worker will now handle its own WASM initialization.
    const wasmPath = `${window.location.origin}${basePath}/wasm-cal/kline_processor_bg.wasm`;
    renderingWorker.postMessage({ type: 'init', payload: { port: port1, wasmPath } }, [port1]);
    socketWorker.postMessage({ type: 'init', payload: { port: port2 } }, [port2]);

    setupRenderingWorkerMessageHandler(renderingWorker);
    setupSocketWorkerMessageHandler(socketWorker);

    socketWorker.postMessage({
      type: 'connect',
      payload: { url: 'ws://localhost:3004', subscription: { symbol: 'BTC/USDT', interval: '1m' } },
    });

    return () => {
      renderingWorker.terminate();
      socketWorker.terminate();
      canvasTransferredRef.current = false;
    };
  }, [basePath, setupRenderingWorkerMessageHandler, setupSocketWorkerMessageHandler]);

  useEffect(() => {
    if (canvasTransferredRef.current && renderingWorkerRef.current) {
      sendMessageToRenderingWorker({ type: 'resize', ...canvasSize });
    }
  }, [canvasSize, sendMessageToRenderingWorker]);

  const handleMouseEvent = useCallback((type: string, e: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = overlayCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    sendMessageToRenderingWorker({ type, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, [sendMessageToRenderingWorker]);

  const handleWheelEvent = useCallback((e: ReactWheelEvent<HTMLCanvasElement>) => {
    const rect = overlayCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    sendMessageToRenderingWorker({ type: 'wheel', deltaY: e.deltaY, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, [sendMessageToRenderingWorker]);

  const handleMouseLeaveEvent = useCallback(() => {
    sendMessageToRenderingWorker({ type: 'mouseleave' });
  }, [sendMessageToRenderingWorker]);

  return (
    <div className="min-h-screen max-h-screen overflow-hidden px-3 py-2 flex flex-col bg-gray-50">
      {/* 控制面板 - 紧凑布局 */}
      <div className="mb-3 p-3 bg-gray-100 rounded flex-shrink-0">
        <h3 className="text-base font-medium mb-2">配置管理与性能监控</h3>
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            onClick={getCurrentConfig}
            className="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm"
          >
            获取配置
          </button>
          <button
            onClick={() => switchTheme('light')}
            className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm"
          >
            亮色主题
          </button>
          <button
            onClick={() => updateChartConfig({ symbol: 'ETH/USDT', theme: 'dark' })}
            className="px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 text-sm"
          >
            ETH/暗色主题
          </button>

          <button
            onClick={() => setShowPerformancePanel(!showPerformancePanel)}
            className={`px-3 py-1 rounded transition-colors text-sm ${
              showPerformancePanel
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
            }`}
          >
            {showPerformancePanel ? '隐藏性能监控' : '显示性能监控'}
          </button>
        </div>

        {/* 显示当前配置 */}
        {config && (
          <div className="mt-2 text-xs bg-white p-2 rounded max-h-20 overflow-auto">
            <strong>当前配置:</strong> {JSON.stringify(config, null, 2)}
          </div>
        )}
      </div>

      {/* 图表模式切换按钮 - 紧凑布局 */}
      <div className="mb-2 flex space-x-2 flex-shrink-0">
        <button
          onClick={() => switchMode('kmap')}
          className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          K线图
        </button>
        <button
          onClick={() => switchMode('heatmap')}
          className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
        >
          热图
        </button>
      </div>
      {isLoading && (
        <div className="p-4 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mr-2" />
          正在加载和处理 K 线数据...
        </div>
      )}
      {error && <div className="p-4 text-red-600">错误: {error}</div>}
      <div className="flex-grow flex min-h-0">
        <div
          className="relative m-0 border-0 p-0 shadow-lg rounded-lg overflow-hidden bg-white w-full h-full"
          style={{ cursor: cursorStyle, width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }}
        >
          <canvas ref={canvasRef} {...canvasSize} className="absolute top-0 left-0 w-full h-full m-0 border-0 p-0 z-10" />
          <canvas ref={mainCanvasRef} {...canvasSize} className="absolute top-0 left-0 w-full h-full m-0 border-0 p-0 z-20" />
          <canvas
            onMouseMove={(e) => handleMouseEvent('mousemove', e)}
            onMouseLeave={handleMouseLeaveEvent}
            onWheel={handleWheelEvent}
            onMouseDown={(e) => handleMouseEvent('mousedown', e)}
            onMouseUp={(e) => handleMouseEvent('mouseup', e)}
            ref={overlayCanvasRef}
            {...canvasSize}
            className="absolute top-0 left-0 w-full h-full m-0 border-0 p-0 z-30"
          />
          {renderingWorkerRef.current && (
            <PerformancePanel worker={renderingWorkerRef.current} visible={showPerformancePanel} position="top-right" />
          )}
        </div>
      </div>
    </div>
  );
}
