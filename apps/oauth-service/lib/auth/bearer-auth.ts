// apps/oauth-service/lib/auth/bearer-auth.ts
// 描述: OAuth 2.0 Bearer Token 认证的核心逻辑（oauth-service 内部实现）

import * as jose from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// 简单的内存缓存（仅用于请求级别）
const permissionCache = new Map<string, { permissions: string[]; timestamp: number }>();
const CACHE_TTL = 60000; // 1分钟缓存

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
 * @param request - Next.js 请求对象
 * @param options - 认证选项
 * @returns 认证结果
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

  // 获取用户权限（带简单缓存）
  const permissions: string[] = [];
  if (userId) {
    try {
      // 检查缓存
      const cached = permissionCache.get(userId);
      const now = Date.now();
      
      if (cached && now - cached.timestamp < CACHE_TTL) {
        permissions.push(...cached.permissions);
      } else {
        // 直接使用 Prisma 查询用户权限
        const user = await prisma.user.findUnique({
          where: { id: userId, isActive: true },
          include: {
            userRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (user) {
          // 收集所有权限（去重）
          const permissionSet = new Set<string>();
          user.userRoles.forEach((userRole) => {
            userRole.role.rolePermissions.forEach((rolePermission) => {
              permissionSet.add(rolePermission.permission.name);
            });
          });
          const userPermissions = Array.from(permissionSet);
          permissions.push(...userPermissions);
          
          // 更新缓存
          permissionCache.set(userId, {
            permissions: userPermissions,
            timestamp: now,
          });
        }
      }
    } catch (error) {
      console.error('Failed to get user permissions:', error);
      // 在权限获取失败时，继续处理但权限为空
    }
  }

  // 检查所需权限
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

  // 检查所需作用域
  if (options.requiredScopes && options.requiredScopes.length > 0) {
    const hasRequiredScopes = options.requiredScopes.every((s) =>
      scopes.includes(s)
    );
    if (!hasRequiredScopes) {
      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'insufficient_scope',
            error_description: `Required scope(s): ${options.requiredScopes.join(', ')}`,
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