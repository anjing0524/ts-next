// 文件路径: lib/auth/middleware/bearer-auth.ts
// File path: lib/auth/middleware/bearer-auth.ts
// 描述: OAuth 2.0 Bearer Token 认证中间件
// Description: OAuth 2.0 Bearer Token Authentication Middleware

import { prisma } from '@repo/database/client';
import * as jose from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { PermissionService, RBACService } from '../services';

// 实例化真实权限服务 (Instantiate actual PermissionService)
const permissionServiceInstance = new PermissionService(prisma);

/**
 * 为 requirePermission 定义请求类型扩展
 * Define request type extension for requirePermission
 * 这允许我们将用户信息附加到 NextRequest
 * This allows attaching user info to NextRequest
 */
export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: string; // 通常是 'sub' claim (Usually the 'sub' claim)
    userId?: string; // 'sub' claim, often aliased as userId for internal consistency
    username?: string; // 可选，可能在令牌中 (Optional, might be in token)
    clientId?: string; // 'client_id' claim from token
    permissions?: string[]; // 'permissions' claim from token
    [key: string]: any; // 允许其他声明 (Allow other claims)
  };
}

/**
 * 认证上下文接口
 * Authentication context interface
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
 * Authentication options interface
 */
export interface AuthOptions {
  requiredScopes?: string[];
  requiredPermissions?: string[];
  allowPublicAccess?: boolean;
  requireUserContext?: boolean;
}

/**
 * OAuth 2.0 Bearer Token 认证中间件
 * OAuth 2.0 Bearer Token Authentication Middleware
 *
 * @param request - Next.js请求对象
 * @param options - 认证选项
 * @returns 认证结果，包含成功状态、上下文和可能的响应
 */
export async function authenticateBearer(
  request: NextRequest,
  options: AuthOptions = {}
): Promise<{
  success: boolean;
  context?: AuthContext;
  response?: NextResponse;
}> {
  // 从请求头中获取 Authorization 信息
  // Token extraction from the Authorization header
  const authorization = request.headers.get('authorization');

  // 如果 Authorization 头不存在或格式不正确 (例如，不是以 "Bearer " 开头)
  // If the Authorization header is missing or not correctly formatted
  if (!authorization || !authorization.startsWith('Bearer ')) {
    // 如果允许公共访问，则直接返回成功
    // If public access is allowed, return success directly
    if (options.allowPublicAccess) {
      return { success: true };
    }

    // 否则，返回401未授权错误
    // Otherwise, return a 401 Unauthorized error
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

  // 提取JWT令牌字符串 (移除 "Bearer " 前缀)
  // Extract the JWT string by removing the "Bearer " prefix
  const token = authorization.substring(7);
  let jwtValidatedPayload: jose.JWTPayload;

  try {
    // 步骤 1: 获取JWKS (JSON Web Key Set) URI
    // Step 1: Get JWKS (JSON Web Key Set) URI
    const jwksUriString = process.env.JWKS_URI;
    if (!jwksUriString) {
      console.error('JWKS_URI 环境变量未设置 (JWKS_URI environment variable is not set)');
      throw new Error('JWKS_URI not configured, cannot validate token.');
    }

    // 步骤 2: 创建远程JWKSet实例
    // Step 2: Create a remote JWKSet instance
    const JWKS = jose.createRemoteJWKSet(new URL(jwksUriString));

    // 步骤 3: 获取预期的签发者 (Issuer) 和受众 (Audience)
    // Step 3: Get the expected Issuer and Audience
    const expectedIssuer = process.env.JWT_ISSUER;
    const expectedAudience = process.env.JWT_AUDIENCE;

    if (!expectedIssuer || !expectedAudience) {
      console.error(
        'JWT_ISSUER 或 JWT_AUDIENCE 环境变量未设置 (JWT_ISSUER or JWT_AUDIENCE environment variable is not set)'
      );
      throw new Error('JWT issuer or audience not configured, cannot validate token.');
    }

    // 步骤 4: 验证JWT
    // Step 4: Verify the JWT
    const verificationResult = await jose.jwtVerify(token, JWKS, {
      issuer: expectedIssuer,
      audience: expectedAudience,
      algorithms: ['RS256'],
    });
    jwtValidatedPayload = verificationResult.payload;
  } catch (err) {
    // 步骤 5: 处理JWT验证过程中发生的各种错误
    // Step 5: Handle various errors that occur during JWT validation
    console.error('JWT 验证失败 (JWT validation failed):', err);

    let errorDescription = 'Token validation failed';
    if (err instanceof jose.errors.JWTExpired) {
      errorDescription = `Token expired at ${new Date((err.payload.exp as number) * 1000).toISOString()}`;
    } else if (err instanceof jose.errors.JWTClaimValidationFailed) {
      errorDescription = `Token claim validation failed: ${err.claim} ${err.reason}`;
    } else if (
      err instanceof jose.errors.JOSENotSupported ||
      err instanceof jose.errors.JWKInvalid
    ) {
      errorDescription = 'Invalid token algorithm or key issue.';
    } else if (
      err instanceof Error &&
      (err.message.includes('JWKS') || err.message.includes('configured'))
    ) {
      errorDescription = `Token validation setup error: ${err.message}`;
    }

    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'invalid_token',
          error_description: errorDescription,
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

  // 步骤 6: 从JWT载荷中提取用户和客户端信息
  // Step 6: Extract user and client information from JWT payload
  const userId = jwtValidatedPayload.sub as string;
  const clientId = jwtValidatedPayload.client_id as string;
  const scopes = (jwtValidatedPayload.scope as string)?.split(' ') || [];
  const permissions = (jwtValidatedPayload.permissions as string[]) || [];

  // 步骤 7: 验证必需的作用域
  // Step 7: Validate required scopes
  if (options.requiredScopes && options.requiredScopes.length > 0) {
    const hasRequiredScopes = options.requiredScopes.every((scope) => scopes.includes(scope));
    if (!hasRequiredScopes) {
      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'insufficient_scope',
            error_description: `Required scope(s): ${options.requiredScopes.join(', ')}`,
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

  // 步骤 8: 验证必需的权限
  // Step 8: Validate required permissions
  if (options.requiredPermissions && options.requiredPermissions.length > 0) {
    const userPermissions = await RBACService.getUserPermissions(userId);
    if (!userPermissions) {
      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'access_denied',
            error_description: 'User not found or has no permissions.',
          },
          { status: 403 }
        ),
      };
    }

    const hasRequiredPermissions = options.requiredPermissions.every((permission) =>
      userPermissions.permissions.includes(permission)
    );

    if (!hasRequiredPermissions) {
      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'insufficient_permissions',
            error_description: `Required permission(s): ${options.requiredPermissions.join(', ')}`,
          },
          {
            status: 403,
            headers: {
              'WWW-Authenticate': 'Bearer realm="API"',
            },
          }
        ),
      };
    }
  }

  // 步骤 9: 构建认证上下文
  // Step 9: Build authentication context
  const authContext: AuthContext = {
    user_id: userId,
    client_id: clientId,
    scopes,
    permissions,
    tokenPayload: jwtValidatedPayload,
  };

  // 步骤 10: 如果需要用户上下文，从数据库获取用户信息
  // Step 10: If user context is required, fetch user information from database
  if (options.requireUserContext && userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId, isActive: true },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          avatar: true,
        },
      });

      if (user) {
        authContext.user = {
          id: user.id,
          username: user.username || undefined,
          firstName: user.firstName || undefined,
          lastName: user.lastName || undefined,
          avatar: user.avatar || undefined,
        };
      }
    } catch (error) {
      console.error('获取用户信息失败 (Failed to fetch user information):', error);
      // 继续处理，但不设置用户上下文
      // Continue processing but don't set user context
    }
  }

  return {
    success: true,
    context: authContext,
  };
}

/**
 * 包装一个 API 路由处理器，为其添加 Bearer Token 认证和权限检查。
 * Wraps an API route handler to add Bearer Token authentication and permission checks.
 * 支持 Next.js 动态路由 (Dynamic Routes)。
 * Supports Next.js Dynamic Routes.
 *
 * @param handler - 要包装的 API 处理器。它将接收 `request`, `authContext`, 和 `routeContext`。
 *                  The API handler to wrap. It will receive `request`, `authContext`, and `routeContext`.
 * @param options - 认证选项，如 `requiredPermissions`。
 *                  Authentication options, like `requiredPermissions`.
 * @returns 一个新的 API 路由处理器，该处理器会先执行认证，然后调用原始处理器。
 *          A new API route handler that first performs authentication and then calls the original handler.
 */
export function withAuth<T extends { params?: any }>(
  handler: (
    request: NextRequest,
    context: { authContext: AuthContext; params: T['params'] }
  ) => Promise<NextResponse>,
  options: AuthOptions = {}
) {
  return async function authMiddleware(
    request: NextRequest,
    routeContext?: T
  ): Promise<NextResponse> {
    const { success, context: authContext, response } = await authenticateBearer(request, options);

    if (!success || !authContext) {
      return response || new NextResponse('Unauthorized', { status: 401 });
    }

    // 将认证上下文和路由参数合并到一个对象中传递给处理器
    // Combine auth context and route params into a single object for the handler
    const combinedContext = {
      authContext,
      params: routeContext?.params,
    };

    return handler(request, combinedContext);
  };
}

/**
 * 权限检查中间件
 * Permission check middleware
 *
 * @param requiredPermission - 必需的权限
 * @returns 权限检查中间件函数
 */
export function requirePermission(requiredPermission: string) {
  return function permissionMiddleware(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (request: NextRequest, ...args: any[]) {
      try {
        // 从请求中提取用户信息
        // Extract user information from request
        const authResult = await authenticateBearer(request, {
          allowPublicAccess: false,
          requireUserContext: true,
        });

        if (!authResult.success || !authResult.context) {
          return NextResponse.json(
            {
              success: false,
              message: '认证失败，无法验证权限 (Authentication failed, cannot verify permissions)',
              error: 'AUTHENTICATION_FAILED',
            },
            { status: 401 }
          );
        }

        const { user_id: userId } = authResult.context;

        if (!userId) {
          return NextResponse.json(
            {
              success: false,
              message: '用户ID缺失，无法验证权限 (User ID missing, cannot verify permissions)',
              error: 'USER_ID_MISSING',
            },
            { status: 401 }
          );
        }

        // 使用权限服务检查权限
        // Use permission service to check permissions
        const hasPermission = await permissionServiceInstance.checkPermission(
          userId,
          requiredPermission
        );

        if (!hasPermission) {
          return NextResponse.json(
            {
              success: false,
              message: `权限不足，需要权限: ${requiredPermission} (Insufficient permissions, required: ${requiredPermission})`,
              error: 'INSUFFICIENT_PERMISSIONS',
              requiredPermission,
            },
            { status: 403 }
          );
        }

        // 权限验证通过，执行原始方法
        // Permission verified, execute original method
        return originalMethod.apply(this, [request, ...args]);
      } catch (error) {
        console.error('权限检查过程中发生错误 (Error during permission check):', error);
        return NextResponse.json(
          {
            success: false,
            message: '权限检查失败 (Permission check failed)',
            error: 'PERMISSION_CHECK_ERROR',
          },
          { status: 500 }
        );
      }
    };

    return descriptor;
  };
}
