import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 1. Specify protected and public routes
const protectedRoutes = ['/admin', '/profile']; // Add any other protected routes
const publicRoutes = ['/login', '/auth/callback', '/api/v2/health'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get('access_token')?.value;

  // Redirect root path to /admin if authenticated, otherwise to /login
  if (pathname === '/') {
    const targetUrl = accessToken ? '/admin' : '/login';
    const absoluteURL = new URL(targetUrl, request.nextUrl.origin);
    return NextResponse.redirect(absoluteURL.toString());
  }

  // 2. Check if the user is trying to access a protected route
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

  if (isProtectedRoute && !accessToken) {
    // 3. Redirect to login page if not authenticated
    const absoluteURL = new URL('/login', request.nextUrl.origin);
    return NextResponse.redirect(absoluteURL.toString());
  }

  // 4. If the user is authenticated and tries to access login, redirect to dashboard
  if (accessToken && pathname.startsWith('/login')) {
    const absoluteURL = new URL('/admin', request.nextUrl.origin);
    return NextResponse.redirect(absoluteURL.toString());
  }

  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
