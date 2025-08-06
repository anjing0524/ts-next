'use client';

import React, { useState, useEffect, useRef } from 'react';
import { PerformanceMonitor, PerformanceMetrics } from '../performance-monitor';

interface PerformancePanelProps {
  monitor: PerformanceMonitor;
  visible?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

/**
 * 性能监控面板组件
 * 显示实时的FPS、内存使用、渲染时间等性能指标
 */
export const PerformancePanel: React.FC<PerformancePanelProps> = ({
  monitor,
  visible = true,
  position = 'top-right'
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) return;

    // 每500ms更新一次显示
    intervalRef.current = window.setInterval(() => {
      const currentMetrics = monitor.getMetrics();
      setMetrics(currentMetrics);
    }, 500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [monitor, visible]);

  if (!visible || !metrics) {
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
      minWidth: '120px',
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

  const getFpsColor = (fps: number) => {
    if (fps >= 55) return '#4ade80'; // 绿色 - 良好
    if (fps >= 30) return '#fbbf24'; // 黄色 - 一般
    return '#ef4444'; // 红色 - 差
  };

  const getMemoryColor = (percentage: number) => {
    if (percentage < 70) return '#4ade80'; // 绿色
    if (percentage < 85) return '#fbbf24'; // 黄色
    return '#ef4444'; // 红色
  };

  const getRenderTimeColor = (time: number) => {
    if (time < 16) return '#4ade80'; // 绿色 - 60fps
    if (time < 33) return '#fbbf24'; // 黄色 - 30fps
    return '#ef4444'; // 红色 - <30fps
  };

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
          <span style={{ color: getFpsColor(metrics.fps), fontWeight: 'bold' }}>
            {metrics.fps}
          </span>
        </div>
        
        {metrics.memory.total > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>内存:</span>
            <span style={{ color: getMemoryColor(metrics.memory.percentage) }}>
              {metrics.memory.used}MB ({metrics.memory.percentage}%)
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
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>渲染时间:</span>
            <span style={{ color: getRenderTimeColor(metrics.renderTime) }}>
              {metrics.renderTime.toFixed(1)}ms
            </span>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>事件延迟:</span>
            <span style={{ color: metrics.eventLatency > 16 ? '#fbbf24' : '#4ade80' }}>
              {metrics.eventLatency.toFixed(1)}ms
            </span>
          </div>
          
          {metrics.memory.total > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>总内存:</span>
              <span>{metrics.memory.total}MB</span>
            </div>
          )}
          
          <div style={{ 
            marginTop: '4px', 
            fontSize: '10px', 
            color: 'rgba(255, 255, 255, 0.6)' 
          }}>
            更新时间: {new Date(metrics.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 性能图表组件（可选的详细视图）
 */
interface PerformanceChartProps {
  monitor: PerformanceMonitor;
  width?: number;
  height?: number;
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({
  monitor,
  width = 300,
  height = 200
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [history, setHistory] = useState<any>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentHistory = monitor.getHistory();
      setHistory(currentHistory);
    }, 1000);

    return () => clearInterval(interval);
  }, [monitor]);

  useEffect(() => {
    if (!history || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清空画布
    ctx.clearRect(0, 0, width, height);
    
    // 绘制FPS曲线
    const fpsData = history.fps;
    if (fpsData.length > 1) {
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      fpsData.forEach((fps: number, index: number) => {
        const x = (index / (fpsData.length - 1)) * width;
        const y = height - (fps / 60) * height;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
    }
    
    // 绘制网格线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    // 水平网格线 (FPS)
    for (let i = 0; i <= 60; i += 15) {
      const y = height - (i / 60) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
  }, [history, width, height]);

  return (
    <div style={{ 
      backgroundColor: 'rgba(0, 0, 0, 0.8)', 
      padding: '10px', 
      borderRadius: '6px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    }}>
      <div style={{ color: 'white', fontSize: '12px', marginBottom: '8px' }}>
        FPS 历史曲线
      </div>
      <canvas 
        ref={canvasRef}
        width={width}
        height={height}
        style={{ border: '1px solid rgba(255, 255, 255, 0.2)' }}
      />
    </div>
  );
};