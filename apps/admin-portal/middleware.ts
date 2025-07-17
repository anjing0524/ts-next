import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { generateCodeVerifier, generateCodeChallenge } from '@repo/lib/browser';

// 定义路由配置
const protectedRoutes = ['/admin', '/profile', '/oauth/consent'];
const authRoutes = ['/login', '/auth/callback'];
const publicRoutes = ['/health', '/api'];

// 页面路径与所需权限静态映射表（可根据实际页面和文档补充）
const routePermissionMap: Record<string, string[]> = {
  '/admin': ['dashboard:view'],
  '/admin/users': ['menu:system:user:view', 'users:list'],
  '/admin/system/roles': ['menu:system:role:view', 'roles:list'],
  '/admin/system/permissions': ['menu:system:permission:view', 'permissions:list'],
  '/admin/system/clients': ['menu:system:client:view', 'clients:list'],
  '/admin/system/audits': ['menu:system:audit:view', 'audit:list'],
  '/admin/system/config': ['system:config:edit'],
  // ...可继续补充其它页面
};

// 简单JWT解析（仅Base64解码，不校验签名，仅用于中间件权限判断）
function parseJwt(token: string): any {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

/**
 * 中间件函数 - 处理路由保护和认证
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 跳过静态资源和API路由
  if (pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // 检查是否为受保护路由
  const isProtectedRoute = Object.keys(routePermissionMap).some((route) =>
    pathname.startsWith(route)
  );
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  // 受保护路由逻辑
  if (isProtectedRoute) {
    const token = request.cookies.get('access_token')?.value;
    if (!token) {
      // 未登录，重定向到登录
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
    // 解析token，获取权限
    const payload = parseJwt(token);
    const userPermissions: string[] = payload?.permissions || [];
    // 获取当前页面所需权限
    const requiredPermissions =
      Object.entries(routePermissionMap).find(([route]) => pathname.startsWith(route))?.[1] || [];
    // 权限不足，重定向/unauthorized
    const hasPermission =
      requiredPermissions.length === 0 ||
      requiredPermissions.some((p) => userPermissions.includes(p));
    if (!hasPermission) {
      const unauthorizedUrl = new URL('/unauthorized', request.url);
      return NextResponse.redirect(unauthorizedUrl);
    }
  }
  // 已登录用户访问认证路由，重定向到管理后台
  if (isAuthRoute && pathname !== '/auth/callback') {
    const token = request.cookies.get('access_token')?.value;
    if (token) {
      const adminUrl = new URL('/admin', request.url);
      return NextResponse.redirect(adminUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，除了：
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
