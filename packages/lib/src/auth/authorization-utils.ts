import * as crypto from 'crypto';
import { prisma } from '@repo/database';
import { RBACService } from '../services/rbac-service';

// ===== 函数实现区域 (Function implementations) =====

/**
 * 验证提供的redirect_uri是否在客户端注册的redirect_uris列表中
 * Validates if the provided redirect_uri is in the client's list of registered redirect_uris
 */
export function validateRedirectUri(redirectUri: string, registeredUris: string[]): boolean {
  return registeredUris.includes(redirectUri);
}

/**
 * 验证response_type是否是服务器支持的类型
 * Validates if the response_type is supported by the server
 */
export function validateResponseType(
  responseType: string,
  supportedTypes: string[] = ['code']
): boolean {
  return supportedTypes.includes(responseType);
}

/** 生成随机state */
export function generateState(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** 生成随机nonce (主要用于OIDC) */
export function generateNonce(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** 生成安全的授权码 */
export function generateAuthorizationCode(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 记录审计事件到数据库 (Logs an audit event)
 */
export async function logAuditEvent(event: {
  userId?: string;
  clientId?: string;
  action: string;
  resource?: string;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  actorType?: string;
  actorId?: string;
  status?: string;
  details?: string;
}): Promise<void> {
  try {
    let actorType: 'USER' | 'CLIENT' | 'SYSTEM' = 'SYSTEM';
    let actorId: string = 'system';

    if (event.userId) {
      actorType = 'USER';
      actorId = event.userId;
    } else if (event.clientId) {
      actorType = 'CLIENT';
      const clientForActorId = await prisma.oAuthClient.findUnique({
        where: { id: event.clientId },
        select: { clientId: true },
      });
      actorId = clientForActorId ? clientForActorId.clientId : event.clientId;
    }

    let success = event.success;
    if (success === undefined) {
      success = event.status ? event.status === 'SUCCESS' : !event.errorMessage;
    }

    await prisma.auditLog.create({
      data: {
        action: event.action,
        actorType,
        actorId: actorId || 'system',
        status: success ? 'SUCCESS' : 'FAILURE',
        ipAddress: event.ipAddress || null,
        userAgent: event.userAgent || null,
        details: buildDetailsJson(event) || undefined,
      },
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
}

/** 获取用户权限 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  try {
    const userPermissions = await RBACService.getUserPermissions(userId);
    const permissions = userPermissions?.permissions || [];
    const permissionsSet = new Set(permissions.filter((p): p is string => typeof p === 'string'));
    return Array.from(permissionsSet);
  } catch (error) {
    console.error('Error getting user permissions:', error);
    return [];
  }
}

// ===== 兼容旧调用：导出同名对象 =====
/**
 * 为了兼容旧代码中 AuthorizationUtils.method 的调用，
 * 这里导出一个与之前类同名的常量对象。
 */
export const AuthorizationUtils = {
  validateRedirectUri,
  validateResponseType,
  generateState,
  generateNonce,
  generateAuthorizationCode,
  logAuditEvent,
  getUserPermissions,
} as const;

// ===== 私有辅助函数 =====
function buildDetailsJson(event: {
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  details?: string;
}): string | null {
  let detailsObj: Record<string, any> = {};

  if (event.metadata) {
    detailsObj = { ...detailsObj, ...event.metadata };
  }

  if (event.errorMessage) {
    detailsObj.errorMessage = event.errorMessage;
  }

  if (event.details) {
    try {
      const parsedDetails = JSON.parse(event.details);
      detailsObj = { ...detailsObj, ...parsedDetails };
    } catch {
      detailsObj.rawDetails = event.details;
    }
  }

  return Object.keys(detailsObj).length > 0 ? JSON.stringify(detailsObj) : null;
}
