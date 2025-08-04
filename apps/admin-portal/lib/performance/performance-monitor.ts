/**
 * Performance monitoring utilities
 * 
 * Provides performance monitoring for web vitals and custom metrics
 */

import { getCLS, getFID, getFCP, getLCP, getTTFB, Metric } from 'web-vitals';
import { useAppStore } from '@/store';

interface PerformanceConfig {
  enabled: boolean;
  sampleRate: number;
  reportEndpoint?: string;
  reportInterval: number;
  maxMetrics: number;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private config: PerformanceConfig;
  private metrics: Metric[] = [];
  private customMetrics: Array<{
    name: string;
    value: number;
    timestamp: number;
    metadata?: Record<string, any>;
  }> = [];
  private reportTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.config = {
      enabled: process.env.NODE_ENV === 'production',
      sampleRate: 0.1,
      reportInterval: 60000,
      maxMetrics: 100,
    };
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Initialize performance monitoring
   */
  initialize(config: Partial<PerformanceConfig> = {}) {
    this.config = { ...this.config, ...config };

    if (!this.config.enabled) return;

    // Initialize web vitals monitoring
    this.initializeWebVitals();

    // Initialize custom metrics
    this.initializeCustomMetrics();

    // Set up reporting
    this.setupReporting();

    // Set up performance observers
    this.setupObservers();
  }

  /**
   * Initialize web vitals monitoring
   */
  private initializeWebVitals() {
    if (typeof window === 'undefined') return;

    const vitals = [getCLS, getFID, getFCP, getLCP, getTTFB];

    vitals.forEach(getMetric => {
      getMetric((metric: Metric) => {
        if (Math.random() < this.config.sampleRate) {
          this.addWebVital(metric);
        }
      });
    });
  }

  /**
   * Initialize custom metrics collection
   */
  private initializeCustomMetrics() {
    if (typeof window === 'undefined') return;

    // Monitor page load time
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        this.addCustomMetric('page_load_time', navigation.loadEventEnd - navigation.startTime);
      }
    });

    // Monitor resource loading
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.entryType === 'resource') {
          const resourceEntry = entry as PerformanceResourceTiming;
          this.addCustomMetric('resource_load_time', resourceEntry.duration, {
            resourceType: resourceEntry.initiatorType,
            resourceName: resourceEntry.name,
          });
        }
      });
    });

    observer.observe({ entryTypes: ['resource'] });
  }

  /**
   * Setup performance observers
   */
  private setupObservers() {
    if (typeof window === 'undefined') return;

    // Long tasks observer
    if ('PerformanceLongTaskTiming' in window) {
      const longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          this.addCustomMetric('long_task', entry.duration, {
            name: entry.name,
            startTime: entry.startTime,
          });
        });
      });

      longTaskObserver.observe({ entryTypes: ['longtask'] });
    }

    // Layout shift observer
    if ('LayoutShift' in window) {
      const layoutShiftObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const layoutShift = entry as LayoutShift;
          if (layoutShift.hadRecentInput) {
            this.addCustomMetric('layout_shift', layoutShift.value);
          }
        });
      });

      layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
    }
  }

  /**
   * Setup periodic reporting
   */
  private setupReporting() {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
    }

    this.reportTimer = setInterval(() => {
      this.reportMetrics();
    }, this.config.reportInterval);
  }

  /**
   * Add web vital metric
   */
  private addWebVital(metric: Metric) {
    this.metrics.push(metric);
    
    // Keep only the most recent metrics
    if (this.metrics.length > this.config.maxMetrics) {
      this.metrics.splice(0, this.metrics.length - this.config.maxMetrics);
    }

    // Store in Zustand for potential UI display
    const store = useAppStore.getState();
    store.addNotification({
      type: 'info',
      message: `Performance: ${metric.name} = ${metric.value.toFixed(2)}`,
    });
  }

  /**
   * Add custom metric
   */
  addCustomMetric(
    name: string,
    value: number,
    metadata?: Record<string, any>
  ) {
    this.customMetrics.push({
      name,
      value,
      timestamp: Date.now(),
      metadata,
    });

    // Keep only the most recent metrics
    if (this.customMetrics.length > this.config.maxMetrics) {
      this.customMetrics.splice(0, this.customMetrics.length - this.config.maxMetrics);
    }
  }

  /**
   * Measure component render time
   */
  measureComponentRender(componentName: string): () => void {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      this.addCustomMetric(
        `component_render_${componentName}`,
        endTime - startTime,
        { componentName }
      );
    };
  }

  /**
   * Measure API call time
   */
  measureAPICall(endpoint: string): () => void {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      this.addCustomMetric(
        `api_call_${endpoint}`,
        endTime - startTime,
        { endpoint }
      );
    };
  }

  /**
   * Report metrics to server
   */
  private async reportMetrics() {
    if (this.metrics.length === 0 && this.customMetrics.length === 0) return;

    const report = {
      webVitals: this.metrics,
      customMetrics: this.customMetrics,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      screenSize: {
        width: window.screen.width,
        height: window.screen.height,
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      connection: navigator.connection ? {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
      } : null,
    };

    try {
      if (this.config.reportEndpoint) {
        await fetch(this.config.reportEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(report),
        });
      } else {
        console.log('Performance Report:', report);
      }

      // Clear metrics after reporting
      this.metrics = [];
      this.customMetrics = [];
    } catch (error) {
      console.error('Failed to report performance metrics:', error);
    }
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics() {
    return {
      webVitals: this.metrics,
      customMetrics: this.customMetrics,
    };
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary() {
    const webVitalsSummary = this.calculateSummary(this.metrics.map(m => m.value));
    const customMetricsSummary = this.calculateSummary(this.customMetrics.map(m => m.value));

    return {
      webVitals: webVitalsSummary,
      customMetrics: customMetricsSummary,
      totalWebVitals: this.metrics.length,
      totalCustomMetrics: this.customMetrics.length,
    };
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(values: number[]) {
    if (values.length === 0) {
      return {
        count: 0,
        average: 0,
        min: 0,
        max: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = values.slice().sort((a, b) => a - b);
    
    return {
      count: values.length,
      average: values.reduce((sum, val) => sum + val, 0) / values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: this.calculatePercentile(sorted, 95),
      p99: this.calculatePercentile(sorted, 99),
    };
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    this.metrics = [];
    this.customMetrics = [];
  }

  /**
   * Destroy performance monitor
   */
  destroy() {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }
    this.clearMetrics();
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();

// Initialize on module load
if (typeof window !== 'undefined') {
  performanceMonitor.initialize();
}