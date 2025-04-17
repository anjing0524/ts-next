'use client';
import { useEffect, useRef, useState } from 'react';

export default function Main() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 定义画布尺寸
  const visibleCanvasHeight = 400; // 可见高度
  const visibleCanvasWidth = 1500; // 调整为实际需要的大小

  // 合并数据获取和Worker初始化到一个useEffect中
  useEffect(() => {
    const controller = new AbortController();

    const fetchAndDraw = async () => {
      try {
        const response = await fetch('/api/kline', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/octet-stream' },
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

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
            wasmPath: `${window.location.origin}/wasm-cal/kline_processor_bg.wasm`,
          },
          [arrayBuffer] // 关键点1：标记为Transferable
        );

        worker.onmessage = (e) => {
          switch (e.data.type) {
            case 'initialized':
              if (!canvasRef.current || !mainCanvasRef.current || !overlayCanvasRef.current) {
                throw new Error('Canvas元素未找到');
              }
              // 第二次传输：OffscreenCanvas (无复制)
              const offscreen = canvasRef.current.transferControlToOffscreen();
              const mainOffscreen = mainCanvasRef.current.transferControlToOffscreen();
              const overlayOffscreen = overlayCanvasRef.current.transferControlToOffscreen();

              [offscreen, mainOffscreen, overlayOffscreen].forEach((canvas) => {
                canvas.width = visibleCanvasWidth;
                canvas.height = visibleCanvasHeight;
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
              break;

            case 'drawComplete':
              setIsLoading(false);
              break;

            case 'error':
              setError(e.data.error);
              setIsLoading(false);
              break;
          }
        };
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
      controller.abort();
      workerRef.current?.terminate();
    };
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">K 线图 (Web Worker + OffscreenCanvas)</h2>
      {isLoading && (
        <div className="p-4 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mr-2" />
          正在加载和处理 K 线数据...
        </div>
      )}
      {error && <div className="p-4 text-red-600">错误: {error}</div>}
      {/* 新增容器并设置固定尺寸 */}
      <div className="relative w-[1500px] h-[400px] cursor-default m-0 border-0 p-0">
        <canvas ref={canvasRef} className="absolute top-0 left-0 m-0 border-0 p-0 z-10" />
        <canvas
          ref={mainCanvasRef}
          className="absolute top-0 left-0 w-full m-0 border-0 p-0 z-20 "
        />
        <canvas
          ref={overlayCanvasRef}
          className="absolute top-0 left-0 w-full m-0 border-0 p-0 z-30 "
        />
      </div>
    </div>
  );
}
