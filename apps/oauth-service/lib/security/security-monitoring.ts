/**
 * 安全监控服务
 * 监控和记录安全相关事件
 */

import { NextRequest } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 安全事件类型
 */
export enum SecurityEventType {
  // 认证事件
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGIN_BLOCKED = 'login_blocked',
  LOGOUT = 'logout',
  
  // 令牌事件
  TOKEN_ISSUED = 'token_issued',
  TOKEN_REFRESHED = 'token_refreshed',
  TOKEN_REVOKED = 'token_revoked',
  TOKEN_INVALID = 'token_invalid',
  TOKEN_EXPIRED = 'token_expired',
  
  // 授权事件
  AUTHORIZATION_SUCCESS = 'authorization_success',
  AUTHORIZATION_FAILURE = 'authorization_failure',
  INSUFFICIENT_PERMISSIONS = 'insufficient_permissions',
  
  // 客户端事件
  CLIENT_AUTHENTICATION_SUCCESS = 'client_auth_success',
  CLIENT_AUTHENTICATION_FAILURE = 'client_auth_failure',
  CLIENT_RATE_LIMIT_EXCEEDED = 'client_rate_limit_exceeded',
  
  // 管理事件
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',
  USER_DELETED = 'user_deleted',
  ROLE_ASSIGNED = 'role_assigned',
  ROLE_REMOVED = 'role_removed',
  PERMISSION_CHANGED = 'permission_changed',
  
  // 系统事件
  KEY_ROTATION = 'key_rotation',
  CONFIGURATION_CHANGED = 'configuration_changed',
  SECURITY_ALERT = 'security_alert',
}

/**
 * 安全事件严重级别
 */
export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * 安全事件接口
 */
export interface SecurityEvent {
  /**
   * 事件ID
   */
  id: string;
  /**
   * 事件类型
   */
  type: SecurityEventType;
  /**
   * 严重级别
   */
  severity: SecuritySeverity;
  /**
   * 时间戳
   */
  timestamp: Date;
  /**
   * 用户ID（如果适用）
   */
  userId?: string;
  /**
   * 客户端ID
   */
  clientId?: string;
  /**
   * IP地址
   */
  ipAddress?: string;
  /**
   * 用户代理
   */
  userAgent?: string;
  /**
   * 事件描述
   */
  description: string;
  /**
   * 详细信息
   */
  details?: Record<string, any>;
  /**
   * 会话ID
   */
  sessionId?: string;
  /**
   * 资源类型
   */
  resourceType?: string;
  /**
   * 资源ID
   */
  resourceId?: string;
  /**
   * 是否已处理
   */
  processed?: boolean;
}

/**
 * 安全监控配置
 */
export interface SecurityMonitoringConfig {
  /**
   * 是否启用监控
   */
  enabled?: boolean;
  /**
   * 是否记录到数据库
   */
  logToDatabase?: boolean;
  /**
   * 是否记录到文件
   */
  logToFile?: boolean;
  /**
   * 日志文件路径
   */
  logFilePath?: string;
  /**
   * 是否发送警报
   */
  enableAlerts?: boolean;
  /**
   * 警报阈值（每分钟事件数）
   */
  alertThreshold?: number;
  /**
   * 警报接收者
   */
  alertRecipients?: string[];
}

/**
 * 安全监控服务类
 */
export class SecurityMonitoringService {
  private events: SecurityEvent[] = [];
  private eventCounts = new Map<string, number>();
  private config: Required<SecurityMonitoringConfig>;
  private alertTimers = new Map<string, NodeJS.Timeout>();
  
  constructor(config: SecurityMonitoringConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      logToDatabase: config.logToDatabase ?? true,
      logToFile: config.logToFile ?? false,
      logFilePath: config.logFilePath ?? './logs/security.log',
      enableAlerts: config.enableAlerts ?? true,
      alertThreshold: config.alertThreshold ?? 10,
      alertRecipients: config.alertRecipients ?? [],
    };
    
    // 确保日志目录存在
    if (this.config.logToFile && this.config.logFilePath) {
      const logDir = path.dirname(this.config.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
  }
  
  /**
   * 记录安全事件
   */
  async logEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    
    const securityEvent: SecurityEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date(),
    };
    
    // 添加到内存
    this.events.push(securityEvent);
    
    // 只保留最近的 10000 条事件
    if (this.events.length > 10000) {
      this.events = this.events.slice(-10000);
    }
    
    // 更新计数器
    const minuteKey = this.getMinuteKey(securityEvent.timestamp);
    this.eventCounts.set(minuteKey, (this.eventCounts.get(minuteKey) || 0) + 1);
    
    // 记录到文件
    if (this.config.logToFile) {
      await this.logToFile(securityEvent);
    }
    
    // 记录到数据库
    if (this.config.logToDatabase) {
      await this.logToDatabase(securityEvent);
    }
    
    // 检查是否需要发送警报
    if (this.config.enableAlerts) {
      this.checkAlerts(securityEvent);
    }
    
    // 控制台输出
    console.log(`[Security] ${securityEvent.type}:`, {
      severity: securityEvent.severity,
      userId: securityEvent.userId,
      clientId: securityEvent.clientId,
      ipAddress: securityEvent.ipAddress,
      description: securityEvent.description,
    });
  }
  
  /**
   * 记录认证成功事件
   */
  async logLoginSuccess(
    userId: string,
    clientId?: string,
    request?: NextRequest
  ): Promise<void> {
    await this.logEvent({
      type: SecurityEventType.LOGIN_SUCCESS,
      severity: SecuritySeverity.LOW,
      userId,
      clientId,
      ipAddress: this.getIpAddress(request),
      userAgent: this.getUserAgent(request),
      description: 'User login successful',
      sessionId: this.getSessionId(request),
    });
  }
  
  /**
   * 记录认证失败事件
   */
  async logLoginFailure(
    username: string,
    reason: string,
    request?: NextRequest
  ): Promise<void> {
    await this.logEvent({
      type: SecurityEventType.LOGIN_FAILURE,
      severity: SecuritySeverity.MEDIUM,
      clientId: this.getClientId(request),
      ipAddress: this.getIpAddress(request),
      userAgent: this.getUserAgent(request),
      description: `Login failed for user ${username}: ${reason}`,
      details: { username, reason },
    });
  }
  
  /**
   * 记录令牌颁发事件
   */
  async logTokenIssued(
    userId: string,
    clientId: string,
    scopes: string,
    request?: NextRequest
  ): Promise<void> {
    await this.logEvent({
      type: SecurityEventType.TOKEN_ISSUED,
      severity: SecuritySeverity.LOW,
      userId,
      clientId,
      ipAddress: this.getIpAddress(request),
      userAgent: this.getUserAgent(request),
      description: 'Access token issued',
      details: { scopes },
    });
  }
  
  /**
   * 记录权限不足事件
   */
  async logInsufficientPermissions(
    userId: string,
    requiredPermissions: string[],
    request?: NextRequest
  ): Promise<void> {
    await this.logEvent({
      type: SecurityEventType.INSUFFICIENT_PERMISSIONS,
      severity: SecuritySeverity.HIGH,
      userId,
      clientId: this.getClientId(request),
      ipAddress: this.getIpAddress(request),
      userAgent: this.getUserAgent(request),
      description: 'User attempted to access resource without sufficient permissions',
      details: { requiredPermissions },
    });
  }
  
  /**
   * 记录可疑活动
   */
  async logSuspiciousActivity(
    description: string,
    severity: SecuritySeverity,
    details?: Record<string, any>,
    request?: NextRequest
  ): Promise<void> {
    await this.logEvent({
      type: SecurityEventType.SECURITY_ALERT,
      severity,
      clientId: this.getClientId(request),
      ipAddress: this.getIpAddress(request),
      userAgent: this.getUserAgent(request),
      description,
      details,
    });
  }
  
  /**
   * 获取事件统计
   */
  getStats(timeRange?: { start: Date; end: Date }) {
    let events = this.events;
    
    if (timeRange) {
      events = events.filter(e => 
        e.timestamp >= timeRange.start && e.timestamp <= timeRange.end
      );
    }
    
    const stats = {
      totalEvents: events.length,
      byType: new Map<SecurityEventType, number>(),
      bySeverity: new Map<SecuritySeverity, number>(),
      byHour: new Map<string, number>(),
    };
    
    for (const event of events) {
      // 按类型统计
      stats.byType.set(
        event.type,
        (stats.byType.get(event.type) || 0) + 1
      );
      
      // 按严重级别统计
      stats.bySeverity.set(
        event.severity,
        (stats.bySeverity.get(event.severity) || 0) + 1
      );
      
      // 按小时统计
      const hourKey = this.getHourKey(event.timestamp);
      stats.byHour.set(
        hourKey,
        (stats.byHour.get(hourKey) || 0) + 1
      );
    }
    
    return {
      ...stats,
      byType: Object.fromEntries(stats.byType),
      bySeverity: Object.fromEntries(stats.bySeverity),
      byHour: Object.fromEntries(stats.byHour),
    };
  }
  
  /**
   * 获取最近的事件
   */
  getRecentEvents(limit: number = 100): SecurityEvent[] {
    return this.events
      .slice(-limit)
      .reverse();
  }
  
  /**
   * 生成事件ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * 获取分钟键
   */
  private getMinuteKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
  }
  
  /**
   * 获取小时键
   */
  private getHourKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
  }
  
  /**
   * 获取IP地址
   */
  private getIpAddress(request?: NextRequest): string {
    if (!request) return 'unknown';
    return (
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown'
    );
  }
  
  /**
   * 获取用户代理
   */
  private getUserAgent(request?: NextRequest): string {
    if (!request) return 'unknown';
    return request.headers.get('user-agent') || 'unknown';
  }
  
  /**
   * 获取客户端ID
   */
  private getClientId(request?: NextRequest): string {
    if (!request) return 'unknown';
    // 从请求中提取客户端ID，这里简化处理
    return request.headers.get('x-client-id') || 'unknown';
  }
  
  /**
   * 获取会话ID
   */
  private getSessionId(request?: NextRequest): string {
    if (!request) return 'unknown';
    // 从请求中提取会话ID，这里简化处理
    return request.headers.get('x-session-id') || 'unknown';
  }
  
  /**
   * 记录到文件
   */
  private async logToFile(event: SecurityEvent): Promise<void> {
    const logLine = JSON.stringify(event) + '\n';
    fs.appendFile(this.config.logFilePath, logLine, (err) => {
      if (err) {
        console.error('Failed to write security log:', err);
      }
    });
  }
  
  /**
   * 记录到数据库
   */
  private async logToDatabase(_event: SecurityEvent): Promise<void> {
    // 这里应该记录到数据库，简化实现
    // 实际项目中可以使用 Prisma 或其他 ORM
  }
  
  /**
   * 检查警报
   */
  private checkAlerts(event: SecurityEvent): Promise<void> {
    const minuteKey = this.getMinuteKey(event.timestamp);
    const count = this.eventCounts.get(minuteKey) || 0;
    
    if (count >= this.config.alertThreshold) {
      // 防止重复发送警报
      if (!this.alertTimers.has(minuteKey)) {
        const timer = setTimeout(() => {
          this.sendAlert(event.type, count);
          this.alertTimers.delete(minuteKey);
        }, 60000); // 1分钟后才能再次发送
        
        this.alertTimers.set(minuteKey, timer);
      }
    }
    
    return Promise.resolve();
  }
  
  /**
   * 发送警报
   */
  private async sendAlert(eventType: SecurityEventType, count: number): Promise<void> {
    const alert = {
      type: 'security_alert',
      eventType,
      count,
      threshold: this.config.alertThreshold,
      timestamp: new Date(),
      message: `High frequency of ${eventType} events detected`,
    };
    
    console.error('[Security Alert]', alert);
    
    // 这里可以集成邮件、Slack、短信等通知方式
    for (const recipient of this.config.alertRecipients) {
      // 发送警报给接收者
      console.log(`[Alert] Sending to ${recipient}:`, alert);
    }
  }
}

/**
 * 全局安全监控服务实例
 */
let globalSecurityMonitor: SecurityMonitoringService | null = null;

/**
 * 获取安全监控服务实例
 */
export function getSecurityMonitor(): SecurityMonitoringService {
  if (!globalSecurityMonitor) {
    globalSecurityMonitor = new SecurityMonitoringService();
  }
  return globalSecurityMonitor;
}

/**
 * 初始化安全监控服务
 */
export function initializeSecurityMonitoring(config?: SecurityMonitoringConfig): SecurityMonitoringService {
  globalSecurityMonitor = new SecurityMonitoringService(config);
  return globalSecurityMonitor;
}