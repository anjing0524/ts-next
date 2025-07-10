import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { generateCodeVerifier, generateCodeChallenge } from '@repo/lib/browser';

// 定义路由配置
const protectedRoutes = ['/admin', '/profile', '/oauth/consent'];
const authRoutes = ['/login', '/auth/callback'];
const publicRoutes = ['/health', '/api'];

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
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some(route => pathname.startsWith(route));

  // 如果是受保护路由，检查认证状态
  if (isProtectedRoute) {
    const token = request.cookies.get('access_token')?.value;
    
    if (!token) {
      // 重定向到登录页面
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 如果是认证路由且已登录，重定向到管理后台
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
