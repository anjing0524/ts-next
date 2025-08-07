'use client';

import React, { useState, useEffect, useRef } from 'react';
import { globalFPSMonitor } from '../fps-monitor';

interface UnifiedPerformanceData {
  fps?: number;
  renderTime?: number;
  memoryUsage?: number;
  memoryPercentage?: number;

  memory_metrics?: {
    used_mb?: number;
    percentage?: number;
  };
}

interface PerformanceData {
  performanceData: UnifiedPerformanceData | null;
  wasmMemory: { used: number; total: number } | null;
  timestamp: number;
}

interface PerformancePanelProps {
  worker: Worker | null;
  visible?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

/**
 * 性能监控面板组件
 * 显示WASM性能指标、渲染统计和内存使用情况
 */
export const PerformancePanel: React.FC<PerformancePanelProps> = ({
  worker,
  visible = true,
  position = 'top-right'
}) => {
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [jsMemory, setJsMemory] = useState<{ used: number; total: number } | null>(null);
  const [fpsData, setFpsData] = useState({ current: 0, average: 0, min: 0, max: 0 });
  const [isExpanded, setIsExpanded] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const fpsIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible || !worker) return;

    // 启动FPS监控器
    globalFPSMonitor.start();

    // 监听Worker的性能数据消息
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'performanceMetrics') {
        console.log('[PerformancePanel] 接收到性能数据:', event.data.performanceData);
        console.log('[PerformancePanel] WASM内存数据:', event.data.wasmMemory);
        setPerformanceData({
          performanceData: event.data.performanceData,
          wasmMemory: event.data.wasmMemory,
          timestamp: event.data.timestamp
        });
      }
    };

    worker.addEventListener('message', handleMessage);

    // 每1秒请求一次性能数据
    intervalRef.current = window.setInterval(() => {
      console.log('[PerformancePanel] 发送性能数据请求');
      worker.postMessage({ type: 'getPerformance' });
      
      // 获取JS内存信息
      if ('memory' in performance) {
        const mem = (performance as any).memory;
        setJsMemory({
          used: Math.round(mem.usedJSHeapSize / 1024 / 1024 * 100) / 100,
          total: Math.round(mem.totalJSHeapSize / 1024 / 1024 * 100) / 100
        });
      }
    }, 1000);

    // 每500ms更新一次FPS数据
    fpsIntervalRef.current = window.setInterval(() => {
      const stats = globalFPSMonitor.getStats();
      setFpsData({
        current: stats.current,
        average: Math.round(stats.average * 10) / 10,
        min: stats.min,
        max: stats.max
      });
    }, 500);

    // 立即请求一次
    console.log('[PerformancePanel] 发送初始性能数据请求');
    worker.postMessage({ type: 'getPerformance' });

    return () => {
      worker.removeEventListener('message', handleMessage);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (fpsIntervalRef.current) {
        clearInterval(fpsIntervalRef.current);
      }
      globalFPSMonitor.stop();
    };
  }, [worker, visible]);

  if (!visible || !performanceData) {
    return null;
  }

  const getPositionStyles = () => {
    const baseStyles = {
      position: 'fixed' as const,
      zIndex: 9999,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '8px 12px',
      borderRadius: '6px',
      fontSize: '12px',
      fontFamily: 'monospace',
      minWidth: '160px',
      backdropFilter: 'blur(4px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
    };

    switch (position) {
      case 'top-left':
        return { ...baseStyles, top: '10px', left: '10px' };
      case 'top-right':
        return { ...baseStyles, top: '10px', right: '10px' };
      case 'bottom-left':
        return { ...baseStyles, bottom: '10px', left: '10px' };
      case 'bottom-right':
        return { ...baseStyles, bottom: '10px', right: '10px' };
      default:
        return { ...baseStyles, top: '10px', right: '10px' };
    }
  };

  const getFrameTimeColor = (frameTime: number) => {
    if (frameTime < 16) return '#4ade80'; // 绿色 - 60fps
    if (frameTime < 33) return '#fbbf24'; // 黄色 - 30fps
    return '#ef4444'; // 红色 - <30fps
  };

  const getMemoryColor = (used: number, total: number) => {
    const percentage = total > 0 ? (used / total) * 100 : 0;
    if (percentage < 70) return '#4ade80'; // 绿色
    if (percentage < 85) return '#fbbf24'; // 黄色
    return '#ef4444'; // 红色
  };

  const { performanceData: perfData, wasmMemory } = performanceData;
  
  // FPS数据来自JS端测量，渲染时间来自WASM
  const fps = fpsData?.current || 0;
  const frameTime = perfData?.renderTime || 0;

  return (
    <div style={getPositionStyles()}>
      <div 
        style={{ 
          cursor: 'pointer', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: isExpanded ? '8px' : '0'
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span style={{ fontWeight: 'bold' }}>性能监控</span>
        <span style={{ marginLeft: '8px', fontSize: '10px' }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </div>
      
      {/* 基础指标 - 始终显示 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>FPS:</span>
          <span style={{ color: getFrameTimeColor(frameTime), fontWeight: 'bold' }}>
            {fps > 0 ? Math.round(fps) : '等待数据...'}
          </span>
        </div>
        
        {wasmMemory && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>WASM内存:</span>
            <span style={{ color: getMemoryColor(wasmMemory.used, wasmMemory.total) }}>
              {wasmMemory.used}MB
            </span>
          </div>
        )}
        
        {jsMemory && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>JS内存:</span>
            <span style={{ color: getMemoryColor(jsMemory.used, jsMemory.total) }}>
              {jsMemory.used}MB
            </span>
          </div>
        )}
      </div>

      {/* 详细指标 - 展开时显示 */}
      {isExpanded && (
        <div style={{ 
          marginTop: '8px', 
          paddingTop: '8px', 
          borderTop: '1px solid rgba(255, 255, 255, 0.2)',
          display: 'flex', 
          flexDirection: 'column', 
          gap: '4px' 
        }}>
          {frameTime > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>渲染时间:</span>
              <span style={{ color: getFrameTimeColor(frameTime) }}>
                {frameTime.toFixed(1)}ms
              </span>
            </div>
          )}
          
          {fpsData && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>平均FPS:</span>
                <span style={{ color: getFrameTimeColor(1000/fpsData.average) }}>
                  {fpsData.average.toFixed(1)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>最小/最大FPS:</span>
                <span>
                  <span style={{ color: getFrameTimeColor(1000/fpsData.min) }}>{fpsData.min}</span>
                  <span style={{ color: 'rgba(255, 255, 255, 0.6)', margin: '0 4px' }}>/</span>
                  <span style={{ color: getFrameTimeColor(1000/fpsData.max) }}>{fpsData.max}</span>
                </span>
              </div>
            </>
          )}
          
          {/* 移除了未被实际使用的计数器字段的显示：
              - draw_calls: 没有代码实际更新此值
              - candles_rendered: 没有代码实际更新此值  
              - indicators_rendered: 没有代码实际更新此值
          */}
          
          {perfData?.memory_metrics?.used_mb && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>WASM内存详情:</span>
              <span>{perfData.memory_metrics.used_mb.toFixed(1)}MB ({perfData.memory_metrics.percentage?.toFixed(1)}%)</span>
            </div>
          )}
          
          {jsMemory && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>JS总内存:</span>
              <span>{jsMemory.total}MB</span>
            </div>
          )}
          
          <div style={{ 
            marginTop: '4px', 
            fontSize: '10px', 
            color: 'rgba(255, 255, 255, 0.6)' 
          }}>
            更新时间: {new Date(performanceData.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
};