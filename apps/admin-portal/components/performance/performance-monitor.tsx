/**
 * PerformanceMonitor - Performance monitoring component
 * 
 * Features:
 * - Page load time tracking
 * - API response time monitoring
 * - Memory usage monitoring
 * - Performance metrics collection
 * - Development mode performance insights
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui';
import { Button } from '@repo/ui';
import { BarChart3, Clock, Database, Zap } from 'lucide-react';

interface PerformanceMetrics {
  pageLoadTime: number;
  apiResponseTimes: { [key: string]: number };
  memoryUsage: {
    used: number;
    total: number;
    limit: number;
  };
  renderTimes: { [key: string]: number };
  lastUpdated: number;
}

export function PerformanceMonitor() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    pageLoadTime: 0,
    apiResponseTimes: {},
    memoryUsage: { used: 0, total: 0, limit: 0 },
    renderTimes: {},
    lastUpdated: Date.now(),
  });
  const [isVisible, setIsVisible] = useState(false);

  // 收集性能指标
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 页面加载时间
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const pageLoadTime = navigation ? navigation.loadEventEnd - navigation.loadEventStart : 0;

    // 内存使用情况
    const updateMemoryUsage = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        setMetrics(prev => ({
          ...prev,
          memoryUsage: {
            used: memory.usedJSHeapSize,
            total: memory.totalJSHeapSize,
            limit: memory.jsHeapSizeLimit,
          },
        }));
      }
    };

    // 初始化指标
    setMetrics(prev => ({
      ...prev,
      pageLoadTime,
      lastUpdated: Date.now(),
    }));

    updateMemoryUsage();

    // 定期更新内存使用情况
    const memoryInterval = setInterval(updateMemoryUsage, 5000);

    // 监听API响应时间
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const start = performance.now();
      try {
        const response = await originalFetch(...args);
        const end = performance.now();
        const duration = end - start;
        
        // 只记录API请求
        const url = args[0] as string;
        if (url.includes('/api/')) {
          const apiName = url.split('/api/')[1] || url;
          setMetrics(prev => ({
            ...prev,
            apiResponseTimes: {
              ...prev.apiResponseTimes,
              [apiName]: duration,
            },
          }));
        }
        
        return response;
      } catch (error) {
        const end = performance.now();
        const duration = end - start;
        
        const url = args[0] as string;
        if (url.includes('/api/')) {
          const apiName = url.split('/api/')[1] || url;
          setMetrics(prev => ({
            ...prev,
            apiResponseTimes: {
              ...prev.apiResponseTimes,
              [apiName]: duration,
            },
          }));
        }
        
        throw error;
      }
    };

    return () => {
      clearInterval(memoryInterval);
      window.fetch = originalFetch;
    };
  }, []);

  // 格式化字节数
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 格式化时间
  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // 获取性能等级
  const getPerformanceLevel = (time: number): 'good' | 'warning' | 'poor' => {
    if (time < 200) return 'good';
    if (time < 1000) return 'warning';
    return 'poor';
  };

  // 获取性能颜色
  const getPerformanceColor = (level: 'good' | 'warning' | 'poor'): string => {
    switch (level) {
      case 'good': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'poor': return 'text-red-600';
    }
  };

  // 清除API响应时间记录
  const clearApiMetrics = () => {
    setMetrics(prev => ({
      ...prev,
      apiResponseTimes: {},
    }));
  };

  if (process.env.NODE_ENV !== 'development' || !isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <Card className="w-96 shadow-xl border border-gray-200">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>性能监控</span>
            </CardTitle>
            <Button
              onClick={() => setIsVisible(false)}
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
            >
              ×
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 页面加载时间 */}
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-xs text-gray-600">
              <Clock className="h-3 w-3" />
              <span>页面加载时间</span>
            </div>
            <div className="text-sm font-medium">
              {formatTime(metrics.pageLoadTime)}
            </div>
          </div>

          {/* 内存使用情况 */}
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-xs text-gray-600">
              <Database className="h-3 w-3" />
              <span>内存使用</span>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-500">
                已使用: {formatBytes(metrics.memoryUsage.used)}
              </div>
              <div className="text-xs text-gray-500">
                总分配: {formatBytes(metrics.memoryUsage.total)}
              </div>
              <div className="text-xs text-gray-500">
                限制: {formatBytes(metrics.memoryUsage.limit)}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{
                    width: `${(metrics.memoryUsage.used / metrics.memoryUsage.limit) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* API响应时间 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs text-gray-600">
                <Zap className="h-3 w-3" />
                <span>API响应时间</span>
              </div>
              <Button
                onClick={clearApiMetrics}
                size="sm"
                variant="ghost"
                className="h-6 text-xs px-2 py-0"
              >
                清除
              </Button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {Object.entries(metrics.apiResponseTimes).map(([api, time]) => {
                const level = getPerformanceLevel(time);
                const colorClass = getPerformanceColor(level);
                return (
                  <div key={api} className="flex justify-between items-center text-xs">
                    <span className="text-gray-600 truncate max-w-48">{api}</span>
                    <span className={`font-medium ${colorClass}`}>
                      {formatTime(time)}
                    </span>
                  </div>
                );
              })}
              {Object.keys(metrics.apiResponseTimes).length === 0 && (
                <div className="text-xs text-gray-400 text-center py-2">
                  暂无API调用记录
                </div>
              )}
            </div>
          </div>

          {/* 最后更新时间 */}
          <div className="text-xs text-gray-400 text-center pt-2 border-t">
            最后更新: {new Date(metrics.lastUpdated).toLocaleTimeString()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// 开发环境下显示性能监控按钮
export function PerformanceMonitorToggle() {
  const [isVisible, setIsVisible] = useState(false);

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <>
      <Button
        onClick={() => setIsVisible(!isVisible)}
        size="sm"
        variant="outline"
        className="fixed bottom-4 left-4 z-40 bg-white shadow-md"
      >
        <BarChart3 className="h-4 w-4 mr-1" />
        性能
      </Button>
      {isVisible && <PerformanceMonitor />}
    </>
  );
}