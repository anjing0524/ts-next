/**
 * 性能监控模块
 * 提供FPS、内存使用、渲染性能等指标的实时监控
 */

export interface PerformanceMetrics {
  fps: number;
  memory: {
    used: number; // MB
    total: number; // MB
    percentage: number;
  };
  renderTime: number; // ms
  eventLatency: number; // ms
  timestamp: number;
}

export interface PerformanceConfig {
  enabled: boolean;
  updateInterval: number; // ms
  maxSamples: number;
  onUpdate?: (metrics: PerformanceMetrics) => void;
}

/**
 * 性能监控器类
 */
export class PerformanceMonitor {
  private config: PerformanceConfig;
  private isRunning = false;
  private intervalId: number | null = null;
  
  // FPS 计算相关
  private frameCount = 0;
  private lastFpsTime = 0;
  private currentFps = 0;
  private fpsHistory: number[] = [];
  
  // 渲染时间统计
  private renderStartTime = 0;
  private renderTimes: number[] = [];
  
  // 事件延迟统计
  private eventStartTime = 0;
  private eventLatencies: number[] = [];
  
  // 内存监控
  private memoryHistory: { used: number; total: number; timestamp: number }[] = [];

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = {
      enabled: true,
      updateInterval: 1000, // 每秒更新一次
      maxSamples: 60, // 保留60个样本
      ...config,
    };
  }

  /**
   * 开始性能监控
   */
  start(): void {
    if (!this.config.enabled || this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.lastFpsTime = performance.now();
    
    // 启动定时器收集指标
    this.intervalId = window.setInterval(() => {
      this.collectMetrics();
    }, this.config.updateInterval);

    console.log('[PerformanceMonitor] 性能监控已启动');
  }

  /**
   * 停止性能监控
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('[PerformanceMonitor] 性能监控已停止');
  }

  /**
   * 记录帧开始（用于FPS计算）
   */
  frameStart(): void {
    if (!this.isRunning) return;
    
    this.frameCount++;
    const now = performance.now();
    
    // 每秒计算一次FPS
    if (now - this.lastFpsTime >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
      this.addToHistory(this.fpsHistory, this.currentFps);
      
      this.frameCount = 0;
      this.lastFpsTime = now;
    }
  }

  /**
   * 记录渲染开始时间
   */
  renderStart(): void {
    if (!this.isRunning) return;
    this.renderStartTime = performance.now();
  }

  /**
   * 记录渲染结束时间
   */
  renderEnd(): void {
    if (!this.isRunning || this.renderStartTime === 0) return;
    
    const renderTime = performance.now() - this.renderStartTime;
    this.addToHistory(this.renderTimes, renderTime);
    this.renderStartTime = 0;
  }

  /**
   * 记录事件开始时间
   */
  eventStart(): void {
    if (!this.isRunning) return;
    this.eventStartTime = performance.now();
  }

  /**
   * 记录事件结束时间
   */
  eventEnd(): void {
    if (!this.isRunning || this.eventStartTime === 0) return;
    
    const latency = performance.now() - this.eventStartTime;
    this.addToHistory(this.eventLatencies, latency);
    this.eventStartTime = 0;
  }

  /**
   * 获取当前性能指标
   */
  getMetrics(): PerformanceMetrics {
    const memory = this.getMemoryInfo();
    
    return {
      fps: this.currentFps,
      memory,
      renderTime: this.getAverage(this.renderTimes),
      eventLatency: this.getAverage(this.eventLatencies),
      timestamp: Date.now(),
    };
  }

  /**
   * 获取历史数据
   */
  getHistory() {
    return {
      fps: [...this.fpsHistory],
      renderTimes: [...this.renderTimes],
      eventLatencies: [...this.eventLatencies],
      memory: [...this.memoryHistory],
    };
  }

  /**
   * 重置所有统计数据
   */
  reset(): void {
    this.frameCount = 0;
    this.currentFps = 0;
    this.fpsHistory = [];
    this.renderTimes = [];
    this.eventLatencies = [];
    this.memoryHistory = [];
    this.lastFpsTime = performance.now();
    
    console.log('[PerformanceMonitor] 统计数据已重置');
  }

  /**
   * 收集性能指标
   */
  private collectMetrics(): void {
    const metrics = this.getMetrics();
    
    // 记录内存历史
    this.memoryHistory.push({
      used: metrics.memory.used,
      total: metrics.memory.total,
      timestamp: metrics.timestamp,
    });
    
    // 限制历史记录数量
    if (this.memoryHistory.length > this.config.maxSamples) {
      this.memoryHistory.shift();
    }
    
    // 调用回调函数
    if (this.config.onUpdate) {
      this.config.onUpdate(metrics);
    }
  }

  /**
   * 获取内存信息
   */
  private getMemoryInfo() {
    // 尝试获取内存信息（仅在支持的浏览器中可用）
    const memory = (performance as any).memory;
    
    if (memory) {
      const used = Math.round(memory.usedJSHeapSize / 1024 / 1024 * 100) / 100;
      const total = Math.round(memory.totalJSHeapSize / 1024 / 1024 * 100) / 100;
      const percentage = Math.round((used / total) * 100);
      
      return { used, total, percentage };
    }
    
    // 如果不支持，返回默认值
    return { used: 0, total: 0, percentage: 0 };
  }

  /**
   * 添加数据到历史记录
   */
  private addToHistory(history: number[], value: number): void {
    history.push(value);
    if (history.length > this.config.maxSamples) {
      history.shift();
    }
  }

  /**
   * 计算数组平均值
   */
  private getAverage(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return Math.round((sum / values.length) * 100) / 100;
  }
}

/**
 * 创建全局性能监控实例
 */
export const createPerformanceMonitor = (config?: Partial<PerformanceConfig>) => {
  return new PerformanceMonitor(config);
};

/**
 * 性能监控装饰器（用于自动测量函数执行时间）
 */
export function measurePerformance(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;
  
  descriptor.value = function (...args: any[]) {
    const start = performance.now();
    const result = method.apply(this, args);
    const end = performance.now();
    
    console.log(`[Performance] ${propertyName} 执行时间: ${(end - start).toFixed(2)}ms`);
    
    return result;
  };
  
  return descriptor;
}