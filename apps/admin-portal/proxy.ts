/**
 * Next.js 16 Proxy Handler (替代 middleware.ts)
 * 运行在 Node.js Runtime，而不是 Edge Runtime
 * 提供更灵活的中间件功能
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { generateCodeVerifier, generateCodeChallenge, generateRandomString } from '@/lib/utils/browser';

// 定义路由配置
const protectedRoutes = ['/admin', '/profile'];
const authRoutes = ['/auth/callback'];
const publicRoutes = ['/health', '/api', '/login', '/oauth/consent'];

// 页面路径与所需权限静态映射表
const routePermissionMap: Record<string, string[]> = {
  '/admin': ['dashboard:view'],
  '/admin/users': ['menu:system:user:view', 'users:list'],
  '/admin/system/roles': ['menu:system:role:view', 'roles:list'],
  '/admin/system/permissions': ['menu:system:permission:view', 'permissions:list'],
  '/admin/system/clients': ['menu:system:client:view', 'clients:list'],
  '/admin/system/audits': ['menu:system:audit:view', 'audit:list'],
  '/admin/system/config': ['system:config:edit'],
};

// 安全头部配置
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

// 生成 CSP nonce（用于替代 unsafe-inline）
function generateNonce(): string {
  // 生成 128 位（16 字节）随机 nonce，Base64 编码
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    // Fallback for environments without crypto.getRandomValues
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Buffer.from(array).toString('base64');
}

// 内容安全策略（使用 nonce 替代 unsafe-inline）
function getContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    // script-src: 移除 unsafe-inline 和 unsafe-eval，使用 nonce
    // 保留 'self' 用于加载外部脚本文件
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // style-src: 移除 unsafe-inline，使用 nonce
    // 保留 'self' 用于加载外部样式文件
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

// 简单JWT解析（仅Base64解码，不校验签名，仅用于代理权限判断）
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

// 设置安全头部（包含 CSP nonce）
function setSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // 内容安全策略（使用 nonce）
  response.headers.set('Content-Security-Policy', getContentSecurityPolicy(nonce));

  // 严格传输安全（生产环境）
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // 将 nonce 存储在自定义头部中，供页面使用
  response.headers.set('X-CSP-Nonce', nonce);

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
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/'
  });

  // 存储 PKCE code_verifier
  response.cookies.set('oauth_code_verifier', codeVerifier, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
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
 * 增强的代理函数 - 处理路由保护、认证和安全头部
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 为每个请求生成唯一的 CSP nonce
  const nonce = generateNonce();

  // 跳过静态资源和某些API路由
  if (pathname.startsWith('/_next') || pathname.startsWith('/api/auth/secure')) {
    return NextResponse.next();
  }

  // 处理API安全路由
  if (pathname.startsWith('/api/auth/')) {
    let response = NextResponse.next();
    response = setSecurityHeaders(response, nonce);
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
      // 第三方客户端模式：直接启动 OAuth 授权流程
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

    // 权限不足，重定向到 unauthorized
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

  // OAuth 回调处理
  if (isAuthRoute && accessToken && !isTokenExpired(accessToken)) {
    // 用户已登录且访问 /auth/callback，重定向回管理后台
    const adminUrl = new URL('/admin', request.url);
    return NextResponse.redirect(adminUrl);
  }

  // 为所有响应添加安全头部（包含 CSP nonce）
  let response = NextResponse.next();
  response = setSecurityHeaders(response, nonce);

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

// proxy.ts 不需要 matcher 配置
// 所有请求边界都会通过 proxy handler
