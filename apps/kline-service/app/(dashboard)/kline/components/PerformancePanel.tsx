'use client';

import React, { useState, useEffect, useRef } from 'react';
import { globalFPSMonitor } from '../fps-monitor';

interface UnifiedPerformanceData {
  renderTime?: number;
  memoryUsage?: number; // in MB
  wasmMemoryUsage?: number; // in Bytes
  memory_metrics?: {
    used_mb?: number;
    percentage?: number;
  };
}

interface PerformanceState {
  performanceData: UnifiedPerformanceData | null;
  timestamp: number;
}

interface PerformancePanelProps {
  worker: Worker | null;
  visible?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

interface SSEStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastUpdate?: number;
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
  const [performanceState, setPerformanceState] = useState<PerformanceState | null>(null);
  const [jsMemory, setJsMemory] = useState<{ used: number; total: number } | null>(null);
  const [fpsData, setFpsData] = useState({ current: 0, average: 0, min: 0, max: 0 });
  const [isExpanded, setIsExpanded] = useState(false);
  const [sseStatus, setSSEStatus] = useState<SSEStatus>({ status: 'disconnected' });
  const intervalRef = useRef<number | null>(null);
  const fpsIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible || !worker) return;

    globalFPSMonitor.start();

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'performanceMetrics') {
        setPerformanceState({
          performanceData: event.data.performanceData,
          timestamp: event.data.timestamp
        });
      } else if (event.data.type === 'sseStatusUpdate') {
        setSSEStatus({ status: event.data.status, lastUpdate: Date.now() });
      } else if (event.data.type === 'realtimeDataUpdate') {
        setSSEStatus(prev => ({ ...prev, lastUpdate: event.data.timestamp }));
      }
    };

    worker.addEventListener('message', handleMessage);

    intervalRef.current = window.setInterval(() => {
      worker.postMessage({ type: 'getPerformance' });
      if ('memory' in performance) {
        const mem = (performance as any).memory;
        setJsMemory({
          used: Math.round(mem.usedJSHeapSize / 1024 / 1024 * 100) / 100,
          total: Math.round(mem.totalJSHeapSize / 1024 / 1024 * 100) / 100
        });
      }
    }, 1000);

    fpsIntervalRef.current = window.setInterval(() => {
      const stats = globalFPSMonitor.getStats();
      setFpsData({ current: stats.current, average: stats.average, min: stats.min, max: stats.max });
    }, 500);

    worker.postMessage({ type: 'getPerformance' });

    return () => {
      worker.removeEventListener('message', handleMessage);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (fpsIntervalRef.current) clearInterval(fpsIntervalRef.current);
      globalFPSMonitor.stop();
    };
  }, [worker, visible]);

  if (!visible || !performanceState) {
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
      case 'top-left': return { ...baseStyles, top: '10px', left: '10px' };
      case 'top-right': return { ...baseStyles, top: '10px', right: '10px' };
      case 'bottom-left': return { ...baseStyles, bottom: '10px', left: '10px' };
      case 'bottom-right': return { ...baseStyles, bottom: '10px', right: '10px' };
      default: return { ...baseStyles, top: '10px', right: '10px' };
    }
  };

  const getFrameTimeColor = (frameTime: number) => {
    if (frameTime < 16) return '#4ade80';
    if (frameTime < 33) return '#fbbf24';
    return '#ef4444';
  };

  const getMemoryColor = (percentage: number) => {
    if (percentage < 70) return '#4ade80';
    if (percentage < 85) return '#fbbf24';
    return '#ef4444';
  };

  const getSSEStatusColor = (status: string) => {
    const colors: { [key: string]: string } = { connected: '#4ade80', connecting: '#fbbf24', error: '#ef4444', disconnected: '#9ca3af' };
    return colors[status] || '#9ca3af';
  };

  const getSSEStatusText = (status: string) => {
    const texts: { [key: string]: string } = { connected: '已连接', connecting: '连接中', error: '连接错误', disconnected: '未连接' };
    return texts[status] || '未知';
  };

  const { performanceData: perfData } = performanceState;
  const frameTime = perfData?.renderTime || 0;
  const wasmMemoryUsed = perfData?.wasmMemoryUsage ? (perfData.wasmMemoryUsage / 1024 / 1024).toFixed(2) : '0.00';

  return (
    <div style={getPositionStyles()}>
      <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isExpanded ? '8px' : '0' }} onClick={() => setIsExpanded(!isExpanded)}>
        <span style={{ fontWeight: 'bold' }}>性能监控</span>
        <span style={{ marginLeft: '8px', fontSize: '10px' }}>{isExpanded ? '▼' : '▶'}</span>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>FPS:</span>
          <span style={{ color: getFrameTimeColor(frameTime), fontWeight: 'bold' }}>{Math.round(fpsData.current)}</span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>WASM内存:</span>
          <span>{wasmMemoryUsed}MB</span>
        </div>
        
        {jsMemory && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>JS内存:</span>
            <span style={{ color: getMemoryColor((jsMemory.used / jsMemory.total) * 100) }}>{jsMemory.used.toFixed(2)}MB</span>
          </div>
        )}
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>实时连接:</span>
          <span style={{ color: getSSEStatusColor(sseStatus.status) }}>{getSSEStatusText(sseStatus.status)}</span>
        </div>
      </div>

      {isExpanded && (
        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.2)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {frameTime > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>渲染时间:</span>
              <span style={{ color: getFrameTimeColor(frameTime) }}>{frameTime.toFixed(1)}ms</span>
            </div>
          )}
          
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>平均/最小/最大FPS:</span>
            <span>
              {fpsData.average.toFixed(1)} / {fpsData.min} / {fpsData.max}
            </span>
          </div>
          
          {jsMemory && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>JS总内存:</span>
              <span>{jsMemory.total.toFixed(2)}MB</span>
            </div>
          )}
          
          {sseStatus.lastUpdate && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>最后数据:</span>
              <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.8)' }}>{new Date(sseStatus.lastUpdate).toLocaleTimeString()}</span>
            </div>
          )}
          
          <div style={{ marginTop: '4px', fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)' }}>
            性能更新: {new Date(performanceState.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
};