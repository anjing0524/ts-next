/**
 * WASM性能监控类型定义
 * 
 * 为K线图WASM模块的性能监控功能提供TypeScript类型支持
 */

/**
 * 渲染性能指标
 */
export interface RenderMetrics {
  /** 帧渲染时间 (毫秒) */
  frame_time_ms: number;
  /** 帧率 (FPS) */
  fps: number;
  /** 渲染的K线数量 */
  candles_rendered: number;
  /** 渲染的技术指标数量 */
  indicators_rendered: number;
  /** 画布绘制调用次数 */
  draw_calls: number;
}

/**
 * 内存使用指标
 */
export interface MemoryMetrics {
  /** WASM堆内存使用量 (字节) */
  heap_used: number;
  /** 数据缓存大小 (字节) */
  data_cache_size: number;
  /** 渲染缓存大小 (字节) */
  render_cache_size: number;
  /** 内存分配次数 */
  allocations: number;
}

/**
 * 性能快照
 */
export interface PerformanceSnapshot {
  /** 时间戳 */
  timestamp: number;
  /** 渲染指标 */
  render: RenderMetrics;
  /** 内存指标 */
  memory: MemoryMetrics;
  /** 监控持续时间 (毫秒) */
  duration_ms: number;
}

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  constructor();
  
  /** 启用监控 */
  enable(): void;
  
  /** 禁用监控 */
  disable(): void;
  
  /** 开始帧监控 */
  start_frame(): void;
  
  /** 结束帧监控 */
  end_frame(): void;
  
  /** 记录绘制调用 */
  record_draw_call(): void;
  
  /** 设置渲染的K线数量 */
  set_candles_rendered(count: number): void;
  
  /** 设置渲染的技术指标数量 */
  set_indicators_rendered(count: number): void;
  
  /** 获取当前FPS */
  get_fps(): number;
  
  /** 获取当前帧时间 */
  get_frame_time(): number;
  
  /** 获取内存使用量 */
  get_memory_usage(): number;
  
  /** 获取性能快照的JSON字符串 */
  get_snapshot_json(): string;
  
  /** 获取性能历史记录的JSON字符串 */
  get_history_json(): string;
  
  /** 清除历史记录 */
  clear_history(): void;
  
  /** 重置所有指标 */
  reset(): void;
}

/**
 * 带性能监控的K线图渲染器
 */
export class MonitoredKlineRenderer {
  constructor();
  
  /** 启用性能监控 */
  enable_monitoring(): void;
  
  /** 禁用性能监控 */
  disable_monitoring(): void;
  
  /** 渲染K线图（带性能监控） */
  render_with_monitoring(canvas: HTMLCanvasElement, data_json: string): void;
  
  /** 获取性能统计 */
  get_performance_stats(): string;
  
  /** 获取当前FPS */
  get_fps(): number;
  
  /** 获取内存使用量 */
  get_memory_usage(): number;
  
  /** 重置性能统计 */
  reset_performance(): void;
}

/**
 * 创建性能监控器
 */
export function create_performance_monitor(): PerformanceMonitor;

/**
 * 获取性能监控建议
 */
export function get_performance_recommendations(monitor: PerformanceMonitor): string;

/**
 * 性能监控配置
 */
export interface PerformanceConfig {
  /** 是否启用监控 */
  enabled: boolean;
  /** 最大历史记录数 */
  max_history: number;
  /** FPS警告阈值 */
  fps_warning_threshold: number;
  /** 内存警告阈值 (字节) */
  memory_warning_threshold: number;
  /** 帧时间警告阈值 (毫秒) */
  frame_time_warning_threshold: number;
}

/**
 * 性能监控事件
 */
export interface PerformanceEvent {
  /** 事件类型 */
  type: 'fps_warning' | 'memory_warning' | 'frame_time_warning' | 'performance_good';
  /** 事件时间戳 */
  timestamp: number;
  /** 事件数据 */
  data: PerformanceSnapshot;
  /** 事件消息 */
  message: string;
}

/**
 * 性能监控工具类
 */
export class PerformanceUtils {
  /**
   * 解析性能快照JSON
   */
  static parseSnapshot(json: string): PerformanceSnapshot;
  
  /**
   * 解析性能历史记录JSON
   */
  static parseHistory(json: string): PerformanceSnapshot[];
  
  /**
   * 计算平均FPS
   */
  static calculateAverageFPS(snapshots: PerformanceSnapshot[]): number;
  
  /**
   * 计算平均帧时间
   */
  static calculateAverageFrameTime(snapshots: PerformanceSnapshot[]): number;
  
  /**
   * 获取内存使用趋势
   */
  static getMemoryTrend(snapshots: PerformanceSnapshot[]): number[];
  
  /**
   * 检查性能警告
   */
  static checkPerformanceWarnings(
    snapshot: PerformanceSnapshot,
    config: PerformanceConfig
  ): PerformanceEvent[];
  
  /**
   * 格式化内存大小
   */
  static formatMemorySize(bytes: number): string;
  
  /**
   * 格式化FPS
   */
  static formatFPS(fps: number): string;
  
  /**
   * 格式化帧时间
   */
  static formatFrameTime(ms: number): string;
}