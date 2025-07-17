// apps/oauth-service/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { authenticateBearer, type AuthContext } from '@repo/lib/middleware';
import { permissionMap } from './lib/permission-map';

export const config = {
  matcher: '/api/v2/:path*',
};

/**
 * 从请求路径和方法中获取所需权限
 */
function getRequiredPermission(pathname: string, method: string): string | null {
  // 移除 /api/v2 前缀
  const cleanPath = pathname.replace('/api/v2', '');

  // 遍历权限映射表，找到匹配的路径
  for (const [pattern, methods] of Object.entries(permissionMap)) {
    if (matchPath(cleanPath, pattern)) {
      return methods[method as keyof typeof methods] || null;
    }
  }

  return null;
}

/**
 * 简单的路径匹配函数
 */
function matchPath(path: string, pattern: string): boolean {
  // 将模式转换为正则表达式
  const regexPattern = pattern
    .replace(/:[^/]+/g, '[^/]+') // 将 :param 替换为 [^/]+
    .replace(/\//g, '\\/'); // 转义斜杠

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * 记录审计日志（Edge Runtime兼容版本）
 */
function logAuditEvent(
  request: NextRequest,
  authContext: AuthContext,
  action: string,
  success: boolean,
  details?: Record<string, any>
) {
  try {
    const ipAddress =
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // 简化的日志记录，仅使用console.log
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId: authContext.user_id,
      actorType: 'API_CLIENT',
      actorId: authContext.client_id,
      action,
      resourceType: 'API_ENDPOINT',
      resourceId: request.url,
      ipAddress,
      userAgent,
      status: success ? 'SUCCESS' : 'FAILURE',
      details: details ? JSON.stringify(details) : undefined,
    };

    // 在Edge Runtime中，我们只能使用console.log记录日志
    console.log('AUDIT_LOG:', JSON.stringify(logEntry));
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = new URL(request.url);
  const method = request.method;

  // 跳过健康检查和公开端点
  if (
    pathname === '/api/v2/health' ||
    pathname === '/api/v2/test' ||
    pathname.startsWith('/api/v2/oauth/authorize') ||
    pathname.startsWith('/api/v2/oauth/consent') ||
    pathname.startsWith('/api/v2/oauth/token')
  ) {
    return NextResponse.next();
  }

  try {
    // 执行Bearer令牌认证
    const authResult = await authenticateBearer(request, {
      requireUserContext: true,
    });

    if (!authResult.success) {
      return authResult.response!;
    }

    if (!authResult.context) {
      return NextResponse.json(
        { error: 'server_error', message: 'Authentication context missing' },
        { status: 500 }
      );
    }

    const { context } = authResult;
    const requiredPermission = getRequiredPermission(pathname, method);

    // 如果需要权限检查
    if (requiredPermission) {
      const hasPermission = context.permissions.includes(requiredPermission);

      if (!hasPermission) {
        logAuditEvent(request, context, 'PERMISSION_DENIED', false, {
          requiredPermission,
          userPermissions: context.permissions,
        });

        return NextResponse.json(
          {
            error: 'insufficient_permissions',
            message: `Required permission: ${requiredPermission}`,
            requiredPermission,
            userPermissions: context.permissions,
          },
          { status: 403 }
        );
      }
    }

    // 记录成功的审计日志
    logAuditEvent(request, context, 'API_ACCESS', true, {
      method,
      pathname,
      requiredPermission,
    });

    // 将认证上下文添加到请求中，供后续处理使用
    const requestWithContext = request.clone();
    (requestWithContext as any).authContext = context;

    return NextResponse.next();
  } catch (error) {
    console.error('Middleware error:', error);

    return NextResponse.json(
      { error: 'server_error', message: 'Internal server error in middleware' },
      { status: 500 }
    );
  }
}
