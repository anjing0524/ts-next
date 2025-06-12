import { NextResponse } from 'next/server';

import { jwtVerify, JWTPayload } from 'jose'; // Import JWTPayload for type hinting

import { AuthorizationUtils } from '@/lib/auth/oauth2'; // Import AuthorizationUtils
import logger from '@/utils/logger'; // Import logger

import type { NextRequest } from 'next/server';

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
  const isProtectedPath = protectedPaths.some((path) => pathname.startsWith(path));

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
    await AuthorizationUtils.logAuditEvent({
      action: 'middleware_config_error',
      resource: pathname,
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: false,
      errorMessage: 'JWT_ACCESS_TOKEN_SECRET is not set.',
      metadata: { attemptedPath: pathname },
    });
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect_uri', pathname);
    loginUrl.searchParams.set('error', 'configuration_error');
    return NextResponse.redirect(loginUrl);
  }

  let payload: JWTPayload | undefined = undefined; // Define payload here to access in catch
  try {
    // Use a type assertion for the return value of jwtVerify if needed,
    // or handle the payload type more explicitly.
    const verificationResult = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: issuer,
      audience: audience,
    });
    payload = verificationResult.payload; // Assign to outer scope payload
    logger.info(`[Middleware] Token verified successfully. Payload: ${JSON.stringify(payload)}`);

    // 3. Extract user scopes/permissions from JWT payload
    let userScopes: string[] = [];
    if (payload) {
      // Check if payload is defined
      if (Array.isArray(payload.permissions) && payload.permissions.length > 0) {
        userScopes = payload.permissions as string[];
      } else if (typeof payload.scope === 'string') {
        userScopes = payload.scope.split(' ');
      }
    }
    logger.info(`[Middleware] User scopes/permissions from token: ${JSON.stringify(userScopes)}`);

    // 4. Page-level permission check
    const isAdminPath = pathname.startsWith('/dashboard') || pathname.startsWith('/flow');

    if (isAdminPath) {
      const adminRequiredScopes: string[] = [
        'users:manage',
        'clients:manage',
        'permissions:manage',
      ];
      const hasAdminAccess = adminRequiredScopes.some((scope) => userScopes.includes(scope));

      if (hasAdminAccess) {
        logger.info(`[Middleware] User has required admin scope for ${pathname}. Allowing access.`);
        return NextResponse.next();
      } else {
        logger.warn(
          `[Middleware] User does NOT have required admin scope for ${pathname}. Redirecting to /unauthorized.`
        );
        await AuthorizationUtils.logAuditEvent({
          userId: payload?.sub || undefined,
          action: 'middleware_permission_denied',
          resource: pathname,
          ipAddress: request.ip || request.headers.get('x-forwarded-for') || undefined,
          userAgent: request.headers.get('user-agent') || undefined,
          success: false,
          errorMessage: `User does not have required admin scope. Required: ${adminRequiredScopes.join(' or ')}`,
          metadata: {
            requiredScopes: adminRequiredScopes,
            userScopes: userScopes,
            attemptedPath: pathname,
          },
        });
        const unauthorizedUrl = new URL('/unauthorized', request.url);
        unauthorizedUrl.searchParams.set('required_permission', adminRequiredScopes.join(' or '));
        unauthorizedUrl.searchParams.set('attempted_path', pathname);
        return NextResponse.redirect(unauthorizedUrl);
      }
    }

    // Example: Keep other page permission checks if needed for other routes.
    // For now, all other protected paths not /dashboard or /flow will be allowed if they pass token validation.
    // If more specific rules are needed for other paths, they can be added here.
    // For instance, if '/settings/profile' required 'profile:write':
    /*
    const pagePermissions: Record<string, string> = {
      '/settings/profile': 'profile:write',
    };
    let requiredPermission: string | undefined = undefined;
    let matchedPathKey: string | undefined = undefined;

    for (const pathPrefix in pagePermissions) {
      if (pathname.startsWith(pathPrefix)) {
        if (!matchedPathKey || pathPrefix.length > matchedPathKey.length) {
          requiredPermission = pagePermissions[pathPrefix];
          matchedPathKey = pathPrefix;
        }
      }
    }

    if (matchedPathKey) {
      logger.info(`[Middleware] Path ${pathname} requires specific permission: ${requiredPermission}`);
      if (requiredPermission && userScopes.includes(requiredPermission)) {
        logger.info(`[Middleware] User has required specific permission '${requiredPermission}' for ${pathname}. Allowing access.`);
        return NextResponse.next();
      } else {
        logger.warn(`[Middleware] User does NOT have required specific permission '${requiredPermission}' for ${pathname}. Redirecting to /unauthorized.`);
        const unauthorizedUrl = new URL('/unauthorized', request.url);
        unauthorizedUrl.searchParams.set('required_permission', requiredPermission);
        unauthorizedUrl.searchParams.set('attempted_path', pathname);
        return NextResponse.redirect(unauthorizedUrl);
      }
    }
    */

    // If the path is protected (by config.matcher) but not handled by admin check or other specific rules:
    if (isProtectedPath) {
      // This means it's a path like /dashboard/* or /flow/* but not specifically handled above.
      // Or another path defined in config.matcher that doesn't have a rule.
      // For now, we allow it if it wasn't caught by admin path logic.
      // You might want to deny by default if a path is in `protectedPaths` but has no explicit rule.
      logger.info(
        `[Middleware] Path ${pathname} is protected but has no specific rule after admin check. Allowing by default for now.`
      );
      return NextResponse.next();
    }

    // Fallback for any other case (should ideally not be reached if matcher is specific)
    logger.info(
      `[Middleware] Path ${pathname} does not require specific permissions or is not explicitly protected. Allowing.`
    );
    return NextResponse.next();
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
    logger.error(`[Middleware] Token verification failed: ${errorMessage}`, error);
    await AuthorizationUtils.logAuditEvent({
      userId: payload?.sub || undefined, // payload might be undefined if jwtVerify failed early
      action: 'middleware_invalid_token',
      resource: pathname,
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: false,
      errorMessage: `Token verification failed: ${errorMessage}`,
      metadata: { error: error.name, tokenUsed: token ? 'present' : 'absent' },
    });
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect_uri', pathname);
    loginUrl.searchParams.set('error', 'invalid_token');
    return NextResponse.redirect(loginUrl);
  }
}
