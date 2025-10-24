import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { generateCodeVerifier, generateCodeChallenge, generateRandomString } from '@repo/lib/browser';

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
 * 启动 OAuth 2.1 授权码流程（PKCE）
 * Initiate OAuth 2.1 Authorization Code Flow with PKCE
 */
async function initiateOAuthFlow(request: NextRequest, redirectPath: string): Promise<NextResponse> {
  // 生成 PKCE 参数
  const state = generateRandomString(32);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // 构建授权端点 URL
  const authorizeUrl = new URL(
    `${process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL}/api/v2/oauth/authorize`
  );

  authorizeUrl.searchParams.set('client_id', process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'auth-center-admin-client');
  authorizeUrl.searchParams.set(
    'redirect_uri',
    process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI || `${request.nextUrl.origin}/auth/callback`
  );
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'openid profile email');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  // 创建重定向响应
  const response = NextResponse.redirect(authorizeUrl);

  // 存储 OAuth state（用于 CSRF 防护）
  response.cookies.set('oauth_state', state, {
    httpOnly: false, // 客户端需要读取以进行验证
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 分钟
    path: '/'
  });

  // 存储 PKCE code_verifier（服务器端安全存储）
  response.cookies.set('oauth_code_verifier', codeVerifier, {
    httpOnly: true, // 仅服务器可访问
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 分钟
    path: '/'
  });

  // 存储原始请求路径，用于授权后重定向
  response.cookies.set('oauth_redirect_path', redirectPath, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/'
  });

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

      // 未登录，启动 OAuth 2.1 授权流程
      return await initiateOAuthFlow(request, pathname);
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