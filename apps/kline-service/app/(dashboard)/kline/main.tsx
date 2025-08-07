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
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''; // 使用环境变量

  // Canvas引用
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);

  // 状态管理
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('default');
  const [isDragging, setIsDragging] = useState(false);
  const [config, setConfig] = useState<any>(null); // 存储当前配置
  const [showPerformancePanel, setShowPerformancePanel] = useState(true);
  
  // 跟踪Canvas是否已移交给Worker
  const canvasTransferredRef = useRef(false);

  // 定义画布尺寸常量 - 使用视口尺寸
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 600 });

  // 监听窗口大小变化，动态调整Canvas尺寸
  useEffect(() => {
    const updateCanvasSize = () => {
      // 简化计算，直接使用视口尺寸减去固定的边距
      const padding = 24; // 总边距
      const headerHeight = 200; // 控制面板和按钮的总高度

      const width = window.innerWidth - padding;
      const height = window.innerHeight - headerHeight;

      const finalWidth = Math.max(1200, Math.round(width));
      const finalHeight = Math.max(600, Math.round(height));

      console.log('🎯 Canvas尺寸计算:', {
        视口尺寸: `${window.innerWidth}x${window.innerHeight}`,
        计算尺寸: `${width}x${height}`,
        最终尺寸: `${finalWidth}x${finalHeight}`,
        宽高比: (finalWidth / finalHeight).toFixed(2),
      });

      setCanvasSize({
        width: finalWidth,
        height: finalHeight,
      });
    };

    // 初始化尺寸
    console.log('[Canvas] 组件挂载，开始计算Canvas尺寸');
    updateCanvasSize();

    // 强制触发一次resize事件
    setTimeout(() => {
      console.log('[Canvas] 延迟触发resize事件');
      updateCanvasSize();
    }, 100);

    // 监听窗口大小变化
    window.addEventListener('resize', updateCanvasSize);

    return () => {
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, []);

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

  // 监听canvasSize变化，通知Worker和WASM环境
  useEffect(() => {
    if (!workerRef.current) return;

    console.log('[Main] Canvas尺寸变化，通知Worker:', canvasSize);

    // 发送resize消息给Worker，Worker会通知WASM环境
    sendMessageToWorker({
      type: 'resize',
      width: canvasSize.width,
      height: canvasSize.height,
    });
  }, [canvasSize, sendMessageToWorker]);

  // 鼠标移动和样式获取函数已移除防抖处理，直接使用sendMessageToWorker以提高响应速度

  // 设置Worker消息处理函数
  const setupWorkerMessageHandler = useCallback(
    (worker: Worker) => {
      // 使用消息类型映射优化消息处理
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageHandlers: Record<string, (data: any) => void> = {
        initialized: () => {
          // 添加延迟确保Canvas元素完全准备好
          setTimeout(() => {
            if (!canvasRef.current || !mainCanvasRef.current || !overlayCanvasRef.current) {
              setError('Canvas元素未找到');
              setIsLoading(false);
              return;
            }

            // 检查Canvas是否已经移交给Worker
            if (canvasTransferredRef.current) {
              console.warn('⚠️ Canvas已经移交给Worker，跳过重复移交');
              return;
            }

            try {
              // 第二次传输：OffscreenCanvas (无复制)
              const offscreen = canvasRef.current.transferControlToOffscreen();
              const mainOffscreen = mainCanvasRef.current.transferControlToOffscreen();
              const overlayOffscreen = overlayCanvasRef.current.transferControlToOffscreen();

              // 标记Canvas已移交
              canvasTransferredRef.current = true;

              // 获取当前Canvas尺寸（从DOM元素获取，避免状态依赖）
              const currentWidth = canvasRef.current.width || 1200;
              const currentHeight = canvasRef.current.height || 600;

              console.log('🔧 Canvas初始化尺寸:', {
                获取尺寸: `${currentWidth}x${currentHeight}`,
                Canvas已移交: canvasTransferredRef.current
              });

              [offscreen, mainOffscreen, overlayOffscreen].forEach((canvas) => {
                canvas.width = currentWidth;
                canvas.height = currentHeight;
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
            } catch (error) {
              console.error('Canvas初始化失败:', error);
              setError(`Canvas初始化失败: ${error instanceof Error ? error.message : '未知错误'}`);
              setIsLoading(false);
            }
          }, 10); // 延迟10ms确保Canvas元素完全准备好
        },
        drawComplete: () => {
          setIsLoading(false);
        },
        error: (data) => {
          setError(data.error);
          setIsLoading(false);
        },
        cursorStyle: (data) => {
          // 直接使用从WASM返回的cursor style字符串
          // 这些字符串现在来自CursorStyle枚举的to_string()方法
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
        mouseleaveHandled: (data) => {
          // 处理鼠标离开事件的结果
          if (data.needsRedraw) {
            // 如果需要重绘，可以在这里执行任何必要的UI更新
            // 例如，可以重置拖动状态
            setIsDragging(false);
          }
        },
        configUpdated: (data) => {
          // 处理配置更新
          setConfig(data.config);
          console.log('配置已更新:', data.config);
        },
        modeChanged: (data) => {
          // 处理模式切换
          console.log('模式已切换:', data.mode);
        },
        performanceMetrics: (data) => {
          // 处理性能指标数据，由PerformancePanel组件直接监听Worker消息
          console.log('[Main] 接收到性能数据:', data.performanceData);
          console.log('[Main] WASM内存数据:', data.wasmMemory);
          // 这里不需要特殊处理，只是为了避免"未处理的消息类型"警告
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
    [] // 移除canvasSize依赖，避免Canvas重复移交
  );

  // 合并数据获取和Worker初始化到一个useEffect中
  useEffect(() => {
    const controller = new AbortController();
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
      // 重置Canvas移交状态
      canvasTransferredRef.current = false;
    };
  }, [setupWorkerMessageHandler]);

  // 监听canvasSize变化，向Worker发送resize消息
  useEffect(() => {
    // 只有在Canvas已移交且Worker存在时才发送resize消息
    if (canvasTransferredRef.current && workerRef.current && !isLoading) {
      console.log('📏 Canvas尺寸变化，通知Worker:', canvasSize);
      workerRef.current.postMessage({
        type: 'resize',
        width: canvasSize.width,
        height: canvasSize.height,
      });
    }
  }, [canvasSize, isLoading]);

  // 使用useCallback优化鼠标移动事件处理函数，移除防抖以提高响应速度
  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const coords = getMouseCoordinates(e);
      if (!coords) return;

      // 发送鼠标移动消息，Worker会自动返回光标样式
      sendMessageToWorker({
        type: 'mousemove',
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

    // 记录鼠标已离开canvas，但不立即重置isDragging状态
    // 让window事件处理程序来管理拖动结束
  }, [sendMessageToWorker]);

  // 处理滚轮事件 - 无节流
  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLCanvasElement>) => {
      // 无论是否在拖动状态，都发送滚轮事件到Worker
      sendMessageToWorker({
        type: 'wheel',
        deltaY: e.deltaY,
        x: e.nativeEvent.offsetX,
        y: e.nativeEvent.offsetY,
        isDragging: isDragging, // 添加拖动状态标志
      });
    },
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

  // 处理点击事件 - 已移除，模式切换通过按钮完成
  const handleClick = useCallback(() => {
    // 模式切换功能已迁移到React层按钮
    // Canvas点击事件不再用于模式切换
  }, []);

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

  // 添加全局鼠标事件处理
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 处理全局鼠标释放事件，用于捕获canvas外的释放
    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (isDragging) {
        // 当在canvas外释放鼠标时，需要通知worker结束拖动
        sendMessageToWorker({
          type: 'mouseup',
          x: -1, // 使用-1表示canvas外的位置
          y: -1,
        });

        // 直接重置拖动状态
        setIsDragging(false);
      }
    };

    // 在拖动状态下处理全局鼠标移动
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging && canvasRef.current) {
        // 获取canvas位置
        const rect = canvasRef.current.getBoundingClientRect();

        // 计算相对于canvas的坐标
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 判断鼠标是否在canvas内
        const isInCanvas = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;

        if (isInCanvas) {
          // 如果在canvas内，发送正常的拖动事件
          sendMessageToWorker({
            type: 'mousedrag',
            x: x,
            y: y,
          });
        }
      }
    };

    // 添加全局事件监听器
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('mousemove', handleGlobalMouseMove);

    return () => {
      // 清理事件监听器
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isDragging, sendMessageToWorker]);

  // 添加窗口大小改变处理
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 使用防抖处理窗口大小改变事件
    const handleResize = () => {
      if (canvasRef.current) {
        // 获取当前的 canvas 尺寸
        const width = canvasRef.current.width;
        const height = canvasRef.current.height;

        // 通知 Worker 画布大小改变
        sendMessageToWorker({
          type: 'resize',
          width,
          height,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [sendMessageToWorker]);

  // 添加模式切换函数
  const switchMode = useCallback(
    (mode: string) => {
      sendMessageToWorker({
        type: 'switchMode',
        mode: mode,
      });
    },
    [sendMessageToWorker]
  );

  // 使用新的 serde-wasm-bindgen API 更新配置
  const updateChartConfig = useCallback((newConfig: any) => {
    if (workerRef.current) {
      // 直接发送配置对象，无需 JSON.stringify
      workerRef.current.postMessage({
        type: 'updateConfig',
        config: newConfig,
      });
    }
  }, []);

  // 获取当前配置
  const getCurrentConfig = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({
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

      {/* Canvas容器 - 响应式尺寸，充分利用屏幕空间 */}
      <div className="flex-grow flex min-h-0">
        <div
          className="relative m-0 border-0 p-0 shadow-lg rounded-lg overflow-hidden bg-white w-full h-full"
          style={{
            cursor: cursorStyle,
            width: `${canvasSize.width}px`,
            height: `${canvasSize.height}px`,
          }}
        >
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="absolute top-0 left-0 w-full h-full m-0 border-0 p-0 z-10"
          />
          <canvas
            ref={mainCanvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="absolute top-0 left-0 w-full h-full m-0 border-0 p-0 z-20"
          />
          <canvas
            onMouseMove={isDragging ? handleMouseDrag : handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            ref={overlayCanvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="absolute top-0 left-0 w-full h-full m-0 border-0 p-0 z-30"
          />

          {/* 性能监控面板 */}
          {workerRef.current && (
            <PerformancePanel
              worker={workerRef.current}
              visible={showPerformancePanel}
              position="top-right"
            />
          )}
        </div>
      </div>
    </div>
  );
}
