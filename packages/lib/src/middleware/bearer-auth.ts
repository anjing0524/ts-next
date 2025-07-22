// 文件路径: lib/auth/middleware/bearer-auth.ts
// 描述: OAuth 2.0 Bearer Token 认证的核心逻辑

import { prisma } from '@repo/database/client';
import * as jose from 'jose';
import { NextRequest, NextResponse } from 'next/server';
// import { RBACService } from '../../../../apps/oauth-service/lib/auth/services/rbac-service';
// 临时注释掉RBACService导入，避免循环依赖

/**
 * 认证上下文接口
 */
export interface AuthContext {
  user_id?: string;
  client_id: string;
  scopes: string[];
  permissions: string[];
  tokenPayload: Record<string, unknown>;
  user?: {
    id: string;
    username?: string;
    email?: string;
    [key: string]: any;
  };
}

/**
 * 认证选项接口
 */
export interface AuthOptions {
  requiredScopes?: string[];
  requiredPermissions?: string[];
  allowPublicAccess?: boolean;
  requireUserContext?: boolean;
}

/**
 * OAuth 2.0 Bearer Token 认证的核心函数
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
          headers: { 'WWW-Authenticate': 'Bearer realm="API"' },
        }
      ),
    };
  }

  const token = authorization.substring(7);
  let jwtValidatedPayload: jose.JWTPayload;

  try {
    const jwksUriString = process.env.JWKS_URI;
    if (!jwksUriString) {
      throw new Error('JWKS_URI not configured, cannot validate token.');
    }

    const JWKS = jose.createRemoteJWKSet(new URL(jwksUriString));
    const expectedIssuer = process.env.JWT_ISSUER;
    const expectedAudience = process.env.JWT_AUDIENCE;

    if (!expectedIssuer || !expectedAudience) {
      throw new Error('JWT issuer or audience not configured, cannot validate token.');
    }

    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: expectedIssuer,
      audience: expectedAudience,
      algorithms: ['RS256'],
    });
    jwtValidatedPayload = payload;
  } catch (err: any) {
    let errorDescription = 'Token validation failed';
    if (err instanceof jose.errors.JWTExpired) {
      errorDescription = `Token expired at ${new Date((err.payload.exp as number) * 1000).toISOString()}`;
    } else if (err instanceof jose.errors.JWTClaimValidationFailed) {
      errorDescription = `Token claim validation failed: ${err.claim} ${err.reason}`;
    }
    return {
      success: false,
      response: NextResponse.json(
        { error: 'invalid_token', error_description: errorDescription },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="API"' } }
      ),
    };
  }

  const userId = jwtValidatedPayload.sub as string;
  const clientId = jwtValidatedPayload.client_id as string;
  const scopes = (jwtValidatedPayload.scope as string)?.split(' ') || [];

  // 临时注释掉RBACService调用，避免循环依赖
  // const userPermissions = await RBACService.getUserPermissions(userId);
  // const permissions = userPermissions ? userPermissions.permissions : [];
  const permissions: string[] = []; // 临时返回空权限数组

  if (options.requiredPermissions && options.requiredPermissions.length > 0) {
    const hasRequiredPermissions = options.requiredPermissions.every((p) =>
      permissions.includes(p)
    );
    if (!hasRequiredPermissions) {
      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'insufficient_permissions',
            error_description: `Required permission(s): ${options.requiredPermissions.join(', ')}`,
          },
          { status: 403 }
        ),
      };
    }
  }

  const authContext: AuthContext = {
    user_id: userId,
    client_id: clientId,
    scopes,
    permissions,
    tokenPayload: jwtValidatedPayload,
  };

  return { success: true, context: authContext };
}
