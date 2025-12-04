/**
 * 结构化日志管理器
 * 提供统一的日志接口，支持不同的日志级别和上下文传播
 */

import * as Sentry from '@sentry/nextjs';

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * 日志上下文接口
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  endpoint?: string;
  method?: string;
  [key: string]: any;
}

/**
 * 日志条目接口
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  data?: Record<string, any>;
  error?: Error | null;
}

/**
 * 结构化日志管理器
 */
class StructuredLogger {
  private context: LogContext = {};
  private isDevelopment = typeof window === 'undefined' ? process.env.NODE_ENV === 'development' : false;

  /**
   * 设置日志上下文（例如requestId、userId等）
   */
  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
    Sentry.setContext('logger', context);
  }

  /**
   * 获取当前上下文
   */
  getContext(): LogContext {
    return this.context;
  }

  /**
   * 清除上下文
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * 记录日志（内部实现）
   */
  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, any>,
    error?: Error | null
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      data,
      error,
    };

    // 输出到控制台（开发环境）
    if (this.isDevelopment) {
      const logFn = console[level] || console.log;
      const contextStr = Object.keys(this.context).length > 0 ? JSON.stringify(this.context) : '';
      const dataStr = data ? JSON.stringify(data) : '';

      logFn(
        `[${entry.timestamp}] [${level.toUpperCase()}] ${message}${
          contextStr ? ` | Context: ${contextStr}` : ''
        }${dataStr ? ` | Data: ${dataStr}` : ''}`,
        error
      );
    }

    // 关键事件发送到Sentry
    if (level === LogLevel.ERROR) {
      Sentry.captureException(error || new Error(message), {
        level: 'error',
        tags: { logger: 'true' },
        contexts: {
          log: {
            timestamp: entry.timestamp,
            level: entry.level,
            message: entry.message,
            ...(entry.context ? { context: entry.context } : {}),
            ...(entry.data ? { data: entry.data } : {}),
          } as Record<string, any>,
        },
      });
    } else if (level === LogLevel.WARN) {
      Sentry.captureMessage(message, 'warning');
    }

    // 为Sentry添加breadcrumb（用于追踪事件序列）
    Sentry.addBreadcrumb({
      level: level as Sentry.SeverityLevel,
      message,
      data: { ...data, ...this.context },
      category: 'logger',
    });
  }

  /**
   * DEBUG 级别日志
   */
  debug(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * INFO 级别日志
   */
  info(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * WARN 级别日志
   */
  warn(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * ERROR 级别日志（带错误对象）
   */
  error(message: string, error?: Error | null, data?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, data, error);
  }
}

/**
 * 导出单例日志器
 */
export const logger = new StructuredLogger();

/**
 * 日志作用域类（用于临时设置上下文）
 */
export class LogScope {
  private previousContext: LogContext;

  constructor(context: LogContext) {
    this.previousContext = logger.getContext();
    logger.setContext(context);
  }

  /**
   * 恢复之前的上下文
   */
  restore(): void {
    logger.setContext(this.previousContext);
  }
}
