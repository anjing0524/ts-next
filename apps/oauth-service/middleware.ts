// apps/oauth-service/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { authenticateBearer, type AuthContext } from './lib/auth/bearer-auth';
import { permissionMap } from './lib/permission-map';
// 确保应用初始化模块被加载
import './lib/app-init';

export const config = {
  matcher: ['/api/v2/((?!health$).*)'],
  runtime: 'nodejs',
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
function matchPath(requestPath: string, pattern: string): boolean {
  // 将模式转换为正则表达式
  const regexPattern = pattern
    .replace(/\/\*/g, '/.*') // 将 /* 转换为 /.*
    .replace(/\//g, '\\/') // 转义斜杠
    .replace(/\*/g, '.*'); // 将 * 转换为 .*

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(requestPath);
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
  const pathname = request.nextUrl.pathname;
  const method = request.method;

  // 跳过不需要认证的路径
  const publicPaths = [
    '/api/v2/oauth/authorize',
    '/api/v2/oauth/token',
    '/api/v2/oauth/userinfo',
    '/api/v2/oauth/revoke',
    '/api/v2/oauth/introspect',
    '/api/v2/health',
  ];

  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // 获取所需权限
  const requiredPermission = getRequiredPermission(pathname, method);

  if (!requiredPermission) {
    // 如果没有配置权限要求，允许访问
    return NextResponse.next();
  }

  try {
    // 进行Bearer Token认证
    const authResult = await authenticateBearer(request, {
      requiredPermissions: [requiredPermission],
    });

    if (!authResult.success) {
      // 记录认证失败的审计日志
      const tempContext: AuthContext = {
        client_id: 'unknown',
        scopes: [],
        permissions: [],
        tokenPayload: {},
      };
      logAuditEvent(request, tempContext, `ACCESS_${method}_${pathname}`, false, {
        reason: 'authentication_failed',
        requiredPermission,
      });
      
      return authResult.response!;
    }

    // 记录成功访问的审计日志
    if (authResult.context) {
      logAuditEvent(request, authResult.context, `ACCESS_${method}_${pathname}`, true, {
        requiredPermission,
      });
    }

    // 权限验证通过，继续处理请求
    return NextResponse.next();
  } catch (error) {
    console.error('中间件错误:', error);
    
    return NextResponse.json(
      { 
        error: 'server_error', 
        error_description: '服务器内部错误' 
      },
      { status: 500 }
    );
  }
}
