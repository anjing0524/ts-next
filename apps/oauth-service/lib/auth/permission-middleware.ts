/**
 * 权限验证中间件
 * 用于在 API 端点中验证用户权限
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateBearer, type AuthContext } from './bearer-auth';
import { permissionMap } from '../permission-map';

/**
 * 权限验证选项
 */
export interface PermissionMiddlewareOptions {
  /**
   * 是否需要认证
   */
  requireAuth?: boolean;
  /**
   * 所需权限（可选）
   */
  requiredPermissions?: string[];
  /**
   * 所需角色（可选）
   */
  requiredRoles?: string[];
  /**
   * 自定义权限检查函数（可选）
   */
  customCheck?: (_context: AuthContext) => Promise<boolean> | boolean;
}

/**
 * 创建权限验证中间件
 */
export function withPermission(options: PermissionMiddlewareOptions = {}) {
  const {
    requireAuth = true,
    requiredPermissions = [],
    requiredRoles = [],
    customCheck
  } = options;

  return async function middleware(request: NextRequest, handler: (req: NextRequest, _context: AuthContext) => Promise<NextResponse>) {
    // 如果不需要认证，直接调用处理器
    if (!requireAuth) {
      return handler(request, {} as AuthContext);
    }

    // 进行 Bearer Token 认证
    const authResult = await authenticateBearer(request, {
      requiredPermissions,
      allowPublicAccess: false
    });

    if (!authResult.success) {
      return authResult.response!;
    }

    const context = authResult.context!;

    // 检查角色（如果需要）
    if (requiredRoles.length > 0) {
      // 从数据库获取用户角色
      // 注意：这里需要实现获取用户角色的逻辑
      // const userRoles = await getUserRoles(context.user_id!);
      // const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));
      // if (!hasRequiredRole) {
      //   return NextResponse.json(
      //     { error: 'insufficient_roles', error_description: `Required role(s): ${requiredRoles.join(', ')}` },
      //     { status: 403 }
      //   );
      // }
    }

    // 自定义权限检查
    if (customCheck) {
      const hasCustomPermission = await customCheck(context);
      if (!hasCustomPermission) {
        return NextResponse.json(
          { error: 'access_denied', error_description: 'Custom permission check failed' },
          { status: 403 }
        );
      }
    }

    // 权限验证通过，调用处理器
    return handler(request, context);
  };
}

/**
 * 路径权限验证中间件
 * 根据请求路径和方法自动验证权限
 */
export function withPathPermission(handler: (req: NextRequest, _context: AuthContext) => Promise<NextResponse>) {
  return async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    const method = request.method;

    // 获取所需权限
    const requiredPermission = getRequiredPermission(pathname, method);

    if (!requiredPermission) {
      // 如果没有配置权限要求，允许访问
      return handler(request, {} as AuthContext);
    }

    // 使用权限验证中间件
    return withPermission({
      requiredPermissions: [requiredPermission]
    })(request, handler);
  };
}

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
 * 获取当前用户权限信息的辅助函数
 */
export async function getUserPermissionsFromToken(request: NextRequest): Promise<string[]> {
  const authResult = await authenticateBearer(request, {
    allowPublicAccess: true
  });

  if (authResult.success && authResult.context) {
    return authResult.context.permissions;
  }

  return [];
}

/**
 * 检查用户是否有特定权限的辅助函数
 */
export async function hasPermission(request: NextRequest, permission: string): Promise<boolean> {
  const permissions = await getUserPermissionsFromToken(request);
  return permissions.includes(permission);
}