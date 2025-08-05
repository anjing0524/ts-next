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

// 安全头部配置
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

// 内容安全策略
const contentSecurityPolicy = {
  default: "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  dashboard: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '),
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

// 检查令牌是否过期
function isTokenExpired(token: string): boolean {
  try {
    const payload = parseJwt(token);
    if (!payload || !payload.exp) return true;
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

// 设置安全头部
function setSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // 内容安全策略
  response.headers.set('Content-Security-Policy', contentSecurityPolicy.dashboard);

  // 严格传输安全（生产环境）
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  return response;
}

/**
 * 增强的中间件函数 - 处理路由保护、认证和安全头部
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 跳过静态资源和API路由（让专用安全中间件处理API安全）
  if (pathname.startsWith('/_next') || pathname.startsWith('/api/auth/secure')) {
    return NextResponse.next();
  }

  // 处理API安全路由（使用专用安全中间件）
  if (pathname.startsWith('/api/auth/')) {
    let response = NextResponse.next();
    response = setSecurityHeaders(response);
    return response;
  }

  // 检查是否为受保护路由
  const isProtectedRoute = Object.keys(routePermissionMap).some((route) =>
    pathname.startsWith(route)
  );
  const isAuthRoute = authRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // 获取令牌
  const accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;

  // 受保护路由逻辑
  if (isProtectedRoute) {
    if (!accessToken || isTokenExpired(accessToken)) {
      // 尝试使用刷新令牌
      if (refreshToken) {
        // 在实际应用中，这里应该调用刷新令牌API
        // 目前简化为重定向到登录
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
      }

      // 未登录，重定向到登录
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // 解析token，获取权限
    const payload = parseJwt(accessToken);
    const userPermissions: string[] = payload?.permissions || [];
    
    // 获取当前页面所需权限
    const requiredPermissions =
      Object.entries(routePermissionMap).find(([route]) =>
        pathname.startsWith(route)
      )?.[1] || [];
    
    // 权限不足，重定向/unauthorized
    const hasPermission =
      requiredPermissions.length === 0 ||
      requiredPermissions.some((p) =>
        userPermissions.includes(p)
      );
    
    if (!hasPermission) {
      const unauthorizedUrl = new URL('/unauthorized', request.url);
      return NextResponse.redirect(unauthorizedUrl);
    }
  }

  // 已登录用户访问认证路由，重定向到管理后台
  if (isAuthRoute && pathname !== '/auth/callback') {
    if (accessToken && !isTokenExpired(accessToken)) {
      const adminUrl = new URL('/admin', request.url);
      return NextResponse.redirect(adminUrl);
    }
  }

  // 为所有响应添加安全头部
  let response = NextResponse.next();
  response = setSecurityHeaders(response);

  // 为GET请求设置CSRF令牌
  if (request.method === 'GET') {
    const csrfToken = request.cookies.get('csrf_token')?.value;
    if (!csrfToken) {
      const newCSRFToken = generateCodeVerifier(); // 重用PKCE代码生成器
      const csrfCookie = `csrf_token=${newCSRFToken}; Max-Age=3600; Path=/; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
      response.headers.append('Set-Cookie', csrfCookie);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，除了：
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/auth/secure-* (让专用安全中间件处理)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};