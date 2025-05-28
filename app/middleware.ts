import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import logger from '@/utils/logger'; // Import logger

// 1. Define a matcher to specify which routes it should apply to.
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/flow/:path*',
    // Add other specific top-level UI routes that need protection here
    // Example: '/settings/:path*'
  ],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Paths to protect
  const protectedPaths = ['/dashboard', '/flow'];
  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path));

  if (!isProtectedPath) {
    return NextResponse.next();
  }

  logger.info(`[Middleware] Request to protected path: ${pathname}`);

  // 2.a. Retrieve the JWT token
  let token: string | undefined = request.cookies.get('auth_token')?.value;
  logger.info(`[Middleware] Token from cookie: ${token ? 'found' : 'not found'}`);

  if (!token) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      logger.info(`[Middleware] Token from Authorization header: ${token ? 'found' : 'not found'}`);
    } else {
      logger.info('[Middleware] Authorization header not found or not Bearer');
    }
  }

  if (!token) {
    logger.info('[Middleware] Token not found, redirecting to login.');
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect_uri', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2.b. Use the logic from lib/auth/token-validation.ts
  // For now, let's assume verifyAuthToken needs to be adapted or its core logic used here.
  // We need JWT_ACCESS_TOKEN_SECRET, JWT_ISSUER, JWT_AUDIENCE
  const secret = process.env.JWT_ACCESS_TOKEN_SECRET;
  const issuer = process.env.JWT_ISSUER;
  const audience = process.env.JWT_AUDIENCE;

  if (!secret) {
    logger.error('[Middleware] JWT_ACCESS_TOKEN_SECRET is not set.');
    // In a real app, you might want to redirect to an error page or deny access
    // For now, let's redirect to login as if the token is invalid.
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect_uri', pathname);
    loginUrl.searchParams.set('error', 'configuration_error');
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      {
        issuer: issuer,
        audience: audience,
      }
    );
    // For objects like payload, stringify or log specific relevant properties.
    // Given the logger setup, stringifying is safer for now.
    logger.info(`[Middleware] Token verified successfully. Payload: ${JSON.stringify(payload)}`);

    // 3. Extract user permissions from JWT payload
    const userPermissions = (payload.permissions as string[]) || [];
    logger.info(`[Middleware] User permissions: ${JSON.stringify(userPermissions)}`);

    // 4. Page-level permission check
    const pagePermissions: Record<string, string> = {
      '/dashboard': 'page_dashboard:access',
      '/flow': 'page_flow:access',
      // Add other page-specific permissions here
      // e.g., '/settings/account': 'page_settings_account:access'
    };

    let requiredPermission: string | undefined = undefined;
    let matchedPathKey: string | undefined = undefined;

    // Find the most specific matching path prefix
    for (const pathPrefix in pagePermissions) {
      if (pathname.startsWith(pathPrefix)) {
        // Ensure that if we have a more specific match later, it takes precedence
        // e.g. /dashboard/settings (key: /dashboard/settings) vs /dashboard (key: /dashboard)
        if (!matchedPathKey || pathPrefix.length > matchedPathKey.length) {
          requiredPermission = pagePermissions[pathPrefix];
          matchedPathKey = pathPrefix;
        }
      }
    }

    if (matchedPathKey) { // A configured protected path
      logger.info(`[Middleware] Path ${pathname} requires permission: ${requiredPermission}`);
      if (requiredPermission && userPermissions.includes(requiredPermission)) {
        logger.info(`[Middleware] User has required permission '${requiredPermission}' for ${pathname}. Allowing access.`);
        // 2.d. If the token is valid and user has permission, allow the request to proceed.
        return NextResponse.next();
      } else {
        logger.warn(`[Middleware] User does NOT have required permission '${requiredPermission}' for ${pathname}. Redirecting to /unauthorized.`);
        const unauthorizedUrl = new URL('/unauthorized', request.url);
        unauthorizedUrl.searchParams.set('required_permission', requiredPermission || 'unknown');
        unauthorizedUrl.searchParams.set('attempted_path', pathname);
        return NextResponse.redirect(unauthorizedUrl);
      }
    } else if (isProtectedPath) {
      // Path is in protectedPaths but not configured in pagePermissions
      logger.warn(`[Middleware] Path ${pathname} is a protected path but has no specific permission configured. Denying access by default. Redirecting to /unauthorized.`);
      const unauthorizedUrl = new URL('/unauthorized', request.url);
      unauthorizedUrl.searchParams.set('error', 'unconfigured_protected_path');
      unauthorizedUrl.searchParams.set('attempted_path', pathname);
      return NextResponse.redirect(unauthorizedUrl);
    }

    // If not a specifically configured path and not caught by isProtectedPath earlier (e.g. root path if not excluded by matcher)
    // Or if it's a protected path that passed previous checks (which it shouldn't if logic is correct)
    // This part might be redundant given the initial isProtectedPath check, but acts as a fallback.
    logger.info(`[Middleware] Path ${pathname} does not require specific page permission or is not explicitly protected by page-level rules. Allowing.`);
    return NextResponse.next();

  } catch (error: any) { // Added 'any' type for error to access error.message
    // For errors, it's good to log the message and potentially the stack or entire error object (stringified).
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
    logger.error(`[Middleware] Token verification failed: ${errorMessage}`, error); // Winston can take error object as second param
    // 2.c. If the token is invalid, redirect the user to the /login page.
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect_uri', pathname);
    loginUrl.searchParams.set('error', 'invalid_token');
    return NextResponse.redirect(loginUrl);
  }
}
