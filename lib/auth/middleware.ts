import { NextRequest, NextResponse } from 'next/server';
import { JWTUtils, ScopeUtils, AuthorizationUtils } from './oauth2';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export interface AuthContext {
  user_id?: string;
  client_id: string;
  scopes: string[];
  permissions: string[];
  payload: any;
}

export interface AuthOptions {
  requiredScopes?: string[];
  requiredPermissions?: string[];
  allowPublicAccess?: boolean;
  requireUserContext?: boolean;
}

/**
 * OAuth 2.0 Bearer Token Authentication Middleware
 */
export async function authenticateBearer(
  request: NextRequest,
  options: AuthOptions = {}
): Promise<{
  success: boolean;
  context?: AuthContext;
  response?: NextResponse;
}> {
  const authorization = request.headers.get('authorization');
  
  if (!authorization || !authorization.startsWith('Bearer ')) {
    if (options.allowPublicAccess) {
      return { success: true };
    }
    
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'invalid_token',
          error_description: 'Missing or invalid authorization header',
        },
        { 
          status: 401,
          headers: {
            'WWW-Authenticate': 'Bearer realm="API"',
          },
        }
      ),
    };
  }

  const token = authorization.substring(7); // Remove "Bearer " prefix
  
  // Verify JWT token
  const verification = await JWTUtils.verifyAccessToken(token);
  
  if (!verification.valid) {
    await AuthorizationUtils.logAuditEvent({
      action: 'token_verification_failed',
      resource: request.url,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: false,
      errorMessage: verification.error,
    });

    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'invalid_token',
          error_description: verification.error || 'Token verification failed',
        },
        { 
          status: 401,
          headers: {
            'WWW-Authenticate': 'Bearer realm="API"',
          },
        }
      ),
    };
  }

  const payload = verification.payload!;
  
  // Check if token exists in database and is not revoked
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const accessToken = await prisma.accessToken.findFirst({
    where: {
      tokenHash: tokenHash,
      revoked: false,
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  if (!accessToken) {
    await AuthorizationUtils.logAuditEvent({
      action: 'revoked_token_used',
      resource: request.url,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: false,
      errorMessage: 'Token not found or revoked',
    });

    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'invalid_token',
          error_description: 'Token has been revoked or is invalid',
        },
        { 
          status: 401,
          headers: {
            'WWW-Authenticate': 'Bearer realm="API"',
          },
        }
      ),
    };
  }

  // Extract context from token
  const context: AuthContext = {
    user_id: payload.sub !== payload.client_id ? payload.sub as string : undefined,
    client_id: payload.client_id as string,
    scopes: ScopeUtils.parseScopes(payload.scope as string),
    permissions: (payload.permissions as string[]) || [],
    payload,
  };

  // Check if user context is required
  if (options.requireUserContext && !context.user_id) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'insufficient_scope',
          error_description: 'User context required for this endpoint',
        },
        { status: 403 }
      ),
    };
  }

  // Check required scopes
  if (options.requiredScopes && options.requiredScopes.length > 0) {
    const hasRequiredScopes = ScopeUtils.hasAllScopes(context.scopes, options.requiredScopes);
    
    if (!hasRequiredScopes) {
      await AuthorizationUtils.logAuditEvent({
        userId: context.user_id,
        clientId: context.client_id,
        action: 'insufficient_scope',
        resource: request.url,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: `Required scopes: ${options.requiredScopes.join(', ')}`,
        metadata: {
          userScopes: context.scopes,
          requiredScopes: options.requiredScopes,
        },
      });

      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'insufficient_scope',
            error_description: `Required scopes: ${options.requiredScopes.join(' ')}`,
            scope: options.requiredScopes.join(' '),
          },
          { 
            status: 403,
            headers: {
              'WWW-Authenticate': `Bearer realm="API", scope="${options.requiredScopes.join(' ')}"`,
            },
          }
        ),
      };
    }
  }

  // Check required permissions
  if (options.requiredPermissions && options.requiredPermissions.length > 0) {
    const hasRequiredPermissions = options.requiredPermissions.every(permission =>
      context.permissions.includes(permission)
    );

    if (!hasRequiredPermissions) {
      await AuthorizationUtils.logAuditEvent({
        userId: context.user_id,
        clientId: context.client_id,
        action: 'insufficient_permissions',
        resource: request.url,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: `Required permissions: ${options.requiredPermissions.join(', ')}`,
        metadata: {
          userPermissions: context.permissions,
          requiredPermissions: options.requiredPermissions,
        },
      });

      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'forbidden',
            error_description: 'Insufficient permissions for this resource',
          },
          { status: 403 }
        ),
      };
    }
  }

  // Log successful authentication
  await AuthorizationUtils.logAuditEvent({
    userId: context.user_id,
    clientId: context.client_id,
    action: 'api_access',
    resource: request.url,
    ipAddress: request.headers.get('x-forwarded-for') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
    success: true,
    metadata: {
      scopes: context.scopes,
      permissions: context.permissions,
    },
  });

  return { success: true, context };
}

/**
 * Convenience function to create authenticated API handlers
 */
export function withAuth(
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>,
  options: AuthOptions = {}
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const auth = await authenticateBearer(request, options);
    
    if (!auth.success) {
      return auth.response!;
    }
    
    return handler(request, auth.context!);
  };
}

/**
 * Check if user has specific resource permission
 */
export async function hasResourcePermission(
  userId: string,
  resourceName: string,
  permissionName: string
): Promise<boolean> {
  const permission = await prisma.userResourcePermission.findFirst({
    where: {
      userId,
      isActive: true,
      resource: {
        name: resourceName,
        isActive: true,
      },
      permission: {
        name: permissionName,
        isActive: true,
      },
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });

  return !!permission;
}

/**
 * Get user's permissions for a specific resource
 */
export async function getUserResourcePermissions(
  userId: string,
  resourceName: string
): Promise<string[]> {
  const permissions = await prisma.userResourcePermission.findMany({
    where: {
      userId,
      isActive: true,
      resource: {
        name: resourceName,
        isActive: true,
      },
      permission: {
        isActive: true,
      },
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    include: {
      permission: true,
    },
  });

  return permissions.map(p => p.permission.name);
}

/**
 * CORS middleware for OAuth2 endpoints
 */
export function withCORS(handler: (request: NextRequest) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const response = await handler(request);
    
    // Add CORS headers to response
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    return response;
  };
}