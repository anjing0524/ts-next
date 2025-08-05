/**
 * 性能监控中间件
 * 监控 API 响应时间、数据库查询性能等
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * 性能指标接口
 */
export interface PerformanceMetrics {
  /**
   * 响应时间（毫秒）
   */
  responseTime: number;
  /**
   * 数据库查询时间（毫秒）
   */
  dbTime: number;
  /**
   * 缓存命中次数
   */
  cacheHits: number;
  /**
   * 缓存未命中次数
   */
  cacheMisses: number;
  /**
   * 查询次数
   */
  queryCount: number;
  /**
   * 请求大小（字节）
   */
  requestSize: number;
  /**
   * 响应大小（字节）
   */
  responseSize: number;
  /**
   * 状态码
   */
  statusCode: number;
  /**
   * 端点路径
   */
  endpoint: string;
  /**
   * 方法
   */
  method: string;
  /**
   * 时间戳
   */
  timestamp: Date;
}

/**
 * 性能监控配置
 */
export interface PerformanceMonitorConfig {
  /**
   * 是否启用性能监控
   */
  enabled?: boolean;
  /**
   * 慢查询阈值（毫秒）
   */
  slowQueryThreshold?: number;
  /**
   * 是否记录请求/响应体
   */
  logPayloads?: boolean;
  /**
   * 采样率（0-1）
   */
  sampleRate?: number;
  /**
   * 自定义指标收集器
   */
  customCollector?: (_metrics: PerformanceMetrics) => void;
}

/**
 * 性能监控中间件类
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private config: Required<PerformanceMonitorConfig>;
  
  constructor(config: PerformanceMonitorConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      slowQueryThreshold: config.slowQueryThreshold ?? 1000,
      logPayloads: config.logPayloads ?? false,
      sampleRate: config.sampleRate ?? 1,
      customCollector: config.customCollector ?? this.defaultCollector,
    };
  }
  
  /**
   * 默认指标收集器
   */
  private defaultCollector(_metrics: PerformanceMetrics): void {
    // 记录到控制台
    if (_metrics.responseTime > this.config.slowQueryThreshold) {
      console.warn(`[Performance] Slow request detected:`, {
        endpoint: _metrics.endpoint,
        method: _metrics.method,
        responseTime: `${_metrics.responseTime}ms`,
        dbTime: `${_metrics.dbTime}ms`,
        queryCount: _metrics.queryCount,
      });
    }
    
    // 保存到内存（在生产环境中应该发送到监控系统）
    this.metrics.push(_metrics);
    
    // 只保留最近的 1000 条记录
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }
  
  /**
   * 创建中间件
   */
  middleware() {
    return async (request: NextRequest, handler: (_req: NextRequest) => Promise<NextResponse>) => {
      if (!this.config.enabled || Math.random() > this.config.sampleRate) {
        return handler(request);
      }
      
      const startTime = Date.now();
      const url = request.nextUrl;
      const endpoint = `${url.pathname}${url.search}`;
      
      // 创建性能指标
      const metrics: PerformanceMetrics = {
        responseTime: 0,
        dbTime: 0,
        cacheHits: 0,
        cacheMisses: 0,
        queryCount: 0,
        requestSize: 0,
        responseSize: 0,
        statusCode: 0,
        endpoint,
        method: request.method,
        timestamp: new Date(),
      };
      
      // 获取请求大小
      const contentLength = request.headers.get('content-length');
      if (contentLength) {
        metrics.requestSize = parseInt(contentLength, 10);
      }
      
      // 拦截 Prisma 查询（这里使用简化版本）
      const originalQuery = this.prismaQueryInterceptor(metrics);
      
      try {
        // 执行请求
        const response = await handler(request);
        
        // 计算响应时间
        metrics.responseTime = Date.now() - startTime;
        metrics.statusCode = response.status;
        
        // 获取响应大小
        const responseContentLength = response.headers.get('content-length');
        if (responseContentLength) {
          metrics.responseSize = parseInt(responseContentLength, 10);
        }
        
        // 收集指标
        this.config.customCollector(metrics);
        
        // 添加性能头（仅在开发环境）
        if (process.env.NODE_ENV === 'development') {
          const newHeaders = new Headers(response.headers);
          newHeaders.set('X-Response-Time', `${metrics.responseTime}ms`);
          newHeaders.set('X-DB-Time', `${metrics.dbTime}ms`);
          newHeaders.set('X-Query-Count', metrics.queryCount.toString());
          
          // 创建新的响应对象
          return new NextResponse(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        }
        
        return response;
      } catch (error) {
        metrics.responseTime = Date.now() - startTime;
        metrics.statusCode = 500;
        this.config.customCollector(metrics);
        throw error;
      } finally {
        // 恢复原始查询方法
        this.restorePrismaQuery(originalQuery);
      }
    };
  }
  
  /**
   * Prisma 查询拦截器（简化实现）
   */
  private prismaQueryInterceptor(_metrics: PerformanceMetrics): any {
    // 这是一个简化的实现
    // 实际项目中可能需要使用 Prisma 中间件
    return {
      // 这里应该保存原始的 Prisma 查询方法
      // 并替换为带计时的版本
    };
  }
  
  /**
   * 恢复 Prisma 查询
   */
  private restorePrismaQuery(_original: any): void {
    // 恢复原始的 Prisma 查询方法
  }
  
  /**
   * 获取性能指标
   */
  getMetrics(limit?: number): PerformanceMetrics[] {
    const metrics = [...this.metrics].sort((a, b) => 
      b.timestamp.getTime() - a.timestamp.getTime()
    );
    
    return limit ? metrics.slice(0, limit) : metrics;
  }
  
  /**
   * 获取性能统计
   */
  getStats() {
    const metrics = this.metrics;
    
    if (metrics.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        slowRequests: 0,
        errorRate: 0,
      };
    }
    
    const totalRequests = metrics.length;
    const totalResponseTime = metrics.reduce((sum, m) => sum + m.responseTime, 0);
    const averageResponseTime = totalResponseTime / totalRequests;
    const slowRequests = metrics.filter(m => m.responseTime > this.config.slowQueryThreshold).length;
    const errorRequests = metrics.filter(m => m.statusCode >= 400).length;
    const errorRate = errorRequests / totalRequests;
    
    return {
      totalRequests,
      averageResponseTime: Math.round(averageResponseTime),
      slowRequests,
      errorRate: Math.round(errorRate * 10000) / 100, // 保留两位小数
    };
  }
  
  /**
   * 重置指标
   */
  reset(): void {
    this.metrics = [];
  }
}

/**
 * 创建性能监控中间件
 */
export function withPerformanceMonitoring(
  handler: (_req: NextRequest) => Promise<NextResponse>,
  config?: PerformanceMonitorConfig
) {
  const monitor = new PerformanceMonitor(config);
  return (request: NextRequest) => monitor.middleware()(request, handler);
}

/**
 * 全局性能监控实例
 */
export const globalPerformanceMonitor = new PerformanceMonitor({
  enabled: true,
  slowQueryThreshold: 1000,
  sampleRate: 0.1, // 采样10%的请求
});