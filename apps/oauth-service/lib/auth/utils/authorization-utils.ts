import * as crypto from 'crypto';
import { prisma } from '@repo/database';
import { permissionServiceInstance as permissionService } from '../../services/permissionService';

/**
 * 授权工具类 - 提供OAuth2授权相关的功能
 * Authorization utility class - provides OAuth2 authorization related functions
 */
export class AuthorizationUtils {
  /**
   * 验证提供的redirect_uri是否在客户端注册的redirect_uris列表中
   * Validates if the provided redirect_uri is in the client's list of registered redirect_uris
   * 
   * @param redirectUri - 要验证的重定向URI (Redirect URI to validate)
   * @param registeredUris - 客户端注册的URI列表 (List of registered URIs for the client)
   * @returns 是否有效 (Whether it's valid)
   */
  static validateRedirectUri(redirectUri: string, registeredUris: string[]): boolean {
    return registeredUris.includes(redirectUri);
  }

  /**
   * 验证response_type是否是服务器支持的类型
   * Validates if the response_type is supported by the server
   * 
   * @param responseType - 响应类型 (Response type)
   * @param supportedTypes - 支持的类型列表 (List of supported types)
   * @returns 是否支持 (Whether it's supported)
   */
  static validateResponseType(responseType: string, supportedTypes: string[] = ['code']): boolean {
    return supportedTypes.includes(responseType);
  }

  /**
   * 生成一个随机的state参数值
   * Generates a random state parameter value
   * 
   * @returns 随机state值 (Random state value)
   */
  static generateState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * 生成一个随机的nonce参数值（主要用于OpenID Connect）
   * Generates a random nonce parameter value (mainly for OpenID Connect)
   * 
   * @returns 随机nonce值 (Random nonce value)
   */
  static generateNonce(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * 生成一个安全的随机授权码
   * Generates a secure random Authorization Code
   * 
   * @returns 授权码 (Authorization code)
   */
  static generateAuthorizationCode(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * 记录审计事件到数据库
   * Logs an audit event to the database
   * 
   * @param event - 审计事件信息 (Audit event information)
   */
  static async logAuditEvent(event: {
    userId?: string;
    clientId?: string;
    action: string;
    resource?: string;
    ipAddress?: string;
    userAgent?: string;
    success?: boolean;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
    // 额外的向后兼容参数（会被忽略）
    // Additional backward-compatible parameters (will be ignored)
    actorType?: string;
    actorId?: string;
    status?: string;
    details?: string;
  }): Promise<void> {
    try {
      // 处理actorType和actorId的逻辑
      // Handle actorType and actorId logic
      let actorType: 'USER' | 'CLIENT' | 'SYSTEM' = 'SYSTEM';
      let actorId: string = 'system';
      
      if (event.userId) {
        actorType = 'USER';
        actorId = event.userId;
      } else if (event.clientId) {
        actorType = 'CLIENT';
        // 获取客户端信息以获取clientId
        // Get client info to obtain clientId
        const clientForActorId = await prisma.oAuthClient.findUnique({
          where: { id: event.clientId },
          select: { clientId: true }
        });
        actorId = clientForActorId ? clientForActorId.clientId : event.clientId;
      }

      // 推断success值，如果没有提供
      // Infer success value if not provided
      let success = event.success;
      if (success === undefined) {
        if (event.status) {
          success = event.status === 'SUCCESS';
        } else {
          success = !event.errorMessage; // 没有错误消息就认为成功
        }
      }

      // 创建审计日志
      // Create audit log
      await prisma.auditLog.create({
        data: {
          action: event.action,
          actorType,
          actorId: actorId || 'unknown', // 确保不为null (Ensure not null)
          status: success ? 'SUCCESS' : 'FAILURE',
          ipAddress: event.ipAddress || null,
          userAgent: event.userAgent || null, // 修复类型问题：允许null值 (Fix type issue: allow null values)
          details: this.buildDetailsJson(event) || undefined, // 修复类型问题：使用undefined而不是null
        },
      });
    } catch (error: any) {
      console.error('Failed to log audit event:', error);
      // 不抛出错误，避免影响主要业务流程
      // Don't throw error to avoid affecting main business flow
    }
  }

  /**
   * 构建审计日志的details JSON字段
   * Builds the details JSON field for audit logs
   * 
   * @param event - 事件信息 (Event information)
   * @returns JSON字符串或null (JSON string or null)
   */
  private static buildDetailsJson(event: {
    errorMessage?: string;
    metadata?: Record<string, unknown>;
    details?: string;
  }): string | null {
    let detailsObj: Record<string, any> = {};

    // 合并metadata
    if (event.metadata) {
      detailsObj = { ...detailsObj, ...event.metadata };
    }

    // 添加errorMessage
    if (event.errorMessage) {
      detailsObj.errorMessage = event.errorMessage;
    }

    // 如果有直接传入的details字符串，尝试解析并合并
    if (event.details) {
      try {
        const parsedDetails = JSON.parse(event.details);
        detailsObj = { ...detailsObj, ...parsedDetails };
      } catch {
        // 如果解析失败，将其作为raw字段
        detailsObj.rawDetails = event.details;
      }
    }

    return Object.keys(detailsObj).length > 0 ? JSON.stringify(detailsObj) : null;
  }

  /**
   * 获取用户权限
   * Gets user permissions
   * 
   * @param userId - 用户ID (User ID)
   * @returns 权限列表 (List of permissions)
   */
  static async getUserPermissions(userId: string): Promise<string[]> {
    try {
      const permissionsSet = await permissionService.getUserEffectivePermissions(userId);
      return Array.from(permissionsSet);
    } catch (error: any) {
      console.error('Error getting user permissions:', error);
      return [];
    }
  }
} 