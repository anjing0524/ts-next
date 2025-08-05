/**
 * Performance monitoring hook
 * 
 * Provides performance metrics collection and analysis
 */

import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store';

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface PerformanceMetrics {
  metrics: PerformanceMetric[];
  loading: boolean;
  error: string | null;
}

interface UsePerformanceOptions {
  enabled?: boolean;
  sampleRate?: number;
  maxMetrics?: number;
  autoReport?: boolean;
  reportInterval?: number;
}

export function usePerformance(options: UsePerformanceOptions = {}) {
  const {
    enabled = process.env.NODE_ENV === 'production',
    sampleRate = 0.1, // 10% sampling rate
    maxMetrics = 100,
    autoReport = true,
    reportInterval = 60000, // 1 minute
  } = options;

  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    metrics: [],
    loading: false,
    error: null,
  });

  const metricsRef = useRef<PerformanceMetric[]>([]);
  const reportTimerRef = useRef<NodeJS.Timeout | null>(null);

  const store = useAppStore();

  useEffect(() => {
    if (!enabled) return;

    // Initialize performance monitoring
    if ('performance' in window) {
      // Observe performance entries
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (Math.random() < sampleRate) {
            addMetric({
              name: entry.name,
              value: entry.duration || entry.startTime,
              unit: 'ms',
              timestamp: entry.startTime,
              metadata: {
                entryType: entry.entryType,
                initiatorType: (entry as any).initiatorType,
              },
            });
          }
        });
      });

      // Observe various performance metrics
      observer.observe({ entryTypes: ['measure', 'navigation', 'resource', 'paint'] });

      return () => {
        observer.disconnect();
      };
    }
  }, [enabled, sampleRate]);

  useEffect(() => {
    if (!autoReport || !enabled) return;

    // Set up automatic reporting
    reportTimerRef.current = setInterval(() => {
      reportMetrics();
    }, reportInterval);

    return () => {
      if (reportTimerRef.current) {
        clearInterval(reportTimerRef.current);
      }
    };
  }, [autoReport, enabled, reportInterval]);

  const addMetric = (metric: PerformanceMetric) => {
    const newMetrics = [...metricsRef.current, metric];
    
    // Keep only the most recent metrics
    if (newMetrics.length > maxMetrics) {
      newMetrics.splice(0, newMetrics.length - maxMetrics);
    }
    
    metricsRef.current = newMetrics;
    setMetrics(prev => ({ ...prev, metrics: newMetrics }));
  };

  const measureComponent = (name: string) => {
    const startTime = performance.now();
    
    return {
      end: () => {
        const endTime = performance.now();
        addMetric({
          name: `component_${name}`,
          value: endTime - startTime,
          unit: 'ms',
          timestamp: startTime,
        });
      },
    };
  };

  const measureAPI = (endpoint: string) => {
    const startTime = performance.now();
    
    return {
      end: (success: boolean = true) => {
        const endTime = performance.now();
        addMetric({
          name: `api_${endpoint}`,
          value: endTime - startTime,
          unit: 'ms',
          timestamp: startTime,
          metadata: { success, endpoint },
        });
      },
    };
  };

  const measureRender = (componentName: string) => {
    const startTime = performance.now();
    
    return {
      end: () => {
        const endTime = performance.now();
        addMetric({
          name: `render_${componentName}`,
          value: endTime - startTime,
          unit: 'ms',
          timestamp: startTime,
        });
      },
    };
  };

  const getMetrics = (filter?: (metric: PerformanceMetric) => boolean) => {
    const filteredMetrics = filter 
      ? metricsRef.current.filter(filter)
      : metricsRef.current;
    
    return {
      metrics: filteredMetrics,
      average: filteredMetrics.reduce((sum, m) => sum + m.value, 0) / filteredMetrics.length || 0,
      min: Math.min(...filteredMetrics.map(m => m.value)),
      max: Math.max(...filteredMetrics.map(m => m.value)),
      count: filteredMetrics.length,
    };
  };

  const getMetricsByName = (name: string) => {
    return getMetrics(metric => metric.name.includes(name));
  };

  const getMetricsByTimeRange = (startTime: number, endTime: number) => {
    return getMetrics(metric => 
      metric.timestamp >= startTime && metric.timestamp <= endTime
    );
  };

  const reportMetrics = async () => {
    if (metricsRef.current.length === 0) return;

    setMetrics(prev => ({ ...prev, loading: true }));

    try {
      // Group metrics by type
      const groupedMetrics = metricsRef.current.reduce((acc, metric) => {
        const type = metric.name.split('_')[0] || 'unknown';
        if (!acc[type]) {
          acc[type] = [];
        }
        acc[type].push(metric);
        return acc;
      }, {} as Record<string, PerformanceMetric[]>);

      // Calculate statistics for each type
      const report = Object.entries(groupedMetrics).map(([type, metrics]) => ({
        type,
        count: metrics.length,
        average: metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length,
        min: Math.min(...metrics.map(m => m.value)),
        max: Math.max(...metrics.map(m => m.value)),
        p95: calculatePercentile(metrics.map(m => m.value), 95),
        p99: calculatePercentile(metrics.map(m => m.value), 99),
      }));

      // Here you would send the report to your analytics service
      console.log('Performance Report:', report);
      
      // Clear metrics after reporting
      metricsRef.current = [];
      setMetrics(prev => ({ ...prev, metrics: [] }));

    } catch (error) {
      setMetrics(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to report metrics',
      }));
    } finally {
      setMetrics(prev => ({ ...prev, loading: false }));
    }
  };

  const calculatePercentile = (values: number[], percentile: number): number => {
    if (values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))] || 0;
  };

  const clearMetrics = () => {
    metricsRef.current = [];
    setMetrics(prev => ({ ...prev, metrics: [] }));
  };

  const exportMetrics = () => {
    return {
      metrics: metricsRef.current,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };
  };

  return {
    metrics: metrics.metrics,
    loading: metrics.loading,
    error: metrics.error,
    addMetric,
    measureComponent,
    measureAPI,
    measureRender,
    getMetrics,
    getMetricsByName,
    getMetricsByTimeRange,
    reportMetrics,
    clearMetrics,
    exportMetrics,
  };
}

// Higher-order component for performance monitoring
export function withPerformanceMonitoring<P extends object>(
  Component: React.ComponentType<P>,
  componentName: string
) {
  return (props: P) => {
    const { measureRender } = usePerformance();
    const measure = measureRender(componentName);
    
    useEffect(() => {
      measure.end();
    });

    return <Component {...props} />;
  };
}

// Hook for measuring component render time
export function useRenderTime(componentName: string) {
  const { measureRender } = usePerformance();
  const measureRef = useRef(measureRender(componentName));
  
  useEffect(() => {
    measureRef.current.end();
  });

  return null;
}

// Hook for measuring API calls
export function useAPIMeasurement() {
  const { measureAPI } = usePerformance();
  
  const measureCall = (endpoint: string) => {
    return measureAPI(endpoint);
  };

  return { measureCall };
}