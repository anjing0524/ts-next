import { NextRequest, NextResponse, NextFetchEvent } from 'next/server';
import type { NextApiRequest, NextApiResponse } from 'next'; // For type hints if used with older Next.js API routes

import { Client, User as PrismaUser } from '@prisma/client'; // PrismaUser for request augmentation
import * as jose from 'jose'; // 引入 'jose' (Import 'jose')

import { prisma } from '@repo/database/client';

import {
  ScopeUtils,
  AuthorizationUtils,
  RateLimitUtils,
  ClientAuthUtils,
  OAuth2ErrorTypes,
  PKCEUtils,
} from './oauth2';
// import { verifyV2SessionAccessToken, V2AccessTokenPayload } from './v2AuthUtils'; // REMOVED: No longer using V2 session tokens here
import { RBACService as PermissionService } from '@repo/lib/services/rbacService'; // 使用真实的权限服务 (Using actual PermissionService)

// 实例化真实权限服务 (Instantiate actual PermissionService)
const permissionServiceInstance = new PermissionService();


// 为 requirePermission 定义请求类型扩展 (Define request type extension for requirePermission)
// 这允许我们将用户信息附加到 NextRequest (This allows attaching user info to NextRequest)
export interface AuthenticatedRequest extends NextRequest {
  user?: { // 基于标准OAuth Access Token的载荷结构调整 (Adjusted based on standard OAuth Access Token payload structure)
    id: string; // 通常是 'sub' claim (Usually the 'sub' claim)
    userId?: string; // 'sub' claim, often aliased as userId for internal consistency
    username?: string; // 可选，可能在令牌中 (Optional, might be in token)
    clientId?: string; // 'client_id' claim from token
    permissions?: string[]; // 'permissions' claim from token
    [key: string]: any; // 允许其他声明 (Allow other claims)
  };
}


export interface AuthContext {
  user_id?: string;
  client_id: string;
  scopes: string[];
  permissions: string[];
  tokenPayload: Record<string, unknown>; // Renamed from payload
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
  // 从请求头中获取 Authorization 信息
  // (Token extraction from the Authorization header)
  const authorization = request.headers.get('authorization');

  // 如果 Authorization 头不存在或格式不正确 (例如，不是以 "Bearer " 开头)
  // (If the Authorization header is missing or not correctly formatted (e.g., does not start with "Bearer "))
  if (!authorization || !authorization.startsWith('Bearer ')) {
    // 如果允许公共访问，则直接返回成功
    // (If public access is allowed, return success directly)
    if (options.allowPublicAccess) {
      return { success: true };
    }

    // 否则，返回401未授权错误
    // (Otherwise, return a 401 Unauthorized error)
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
            'WWW-Authenticate': 'Bearer realm="API"', // WWW-Authenticate 头指示客户端如何进行认证
          },
        }
      ),
    };
  }

  // 提取JWT令牌字符串 (移除 "Bearer " 前缀)
  // (Extract the JWT string by removing the "Bearer " prefix)
  const token = authorization.substring(7);
  let jwtValidatedPayload: jose.JWTPayload; // 用于存储验证后的JWT载荷 (To store the validated JWT payload)

  try {
    // 步骤 1: 获取JWKS (JSON Web Key Set) URI
    // (Step 1: Get JWKS (JSON Web Key Set) URI)
    // JWKS URI 通常存储在环境变量中，用于获取公钥以验证JWT签名
    // (The JWKS URI is typically stored in an environment variable and is used to fetch public keys for JWT signature verification)
    const jwksUriString = process.env.JWKS_URI;
    if (!jwksUriString) {
      console.error('JWKS_URI 环境变量未设置 (JWKS_URI environment variable is not set)');
      // 配置错误，无法继续验证令牌
      // (Configuration error, cannot proceed with token validation)
      throw new Error('JWKS_URI not configured, cannot validate token.');
    }

    // 步骤 2: 创建远程JWKSet实例
    // (Step 2: Create a remote JWKSet instance)
    // jose.createRemoteJWKSet 用于从指定的URI获取JWKS。
    // 它会自动处理JWKS的获取、缓存和刷新，这对于性能和可靠性非常重要。
    // (jose.createRemoteJWKSet is used to fetch the JWKS from the specified URI.)
    // (It automatically handles fetching, caching, and refreshing of the JWKS, which is important for performance and reliability.)
    const JWKS = jose.createRemoteJWKSet(new URL(jwksUriString));

    // 步骤 3: 获取预期的签发者 (Issuer) 和受众 (Audience)
    // (Step 3: Get the expected Issuer and Audience)
    // 这些值也通常存储在环境变量中，用于验证JWT中的 'iss' 和 'aud' 声明
    // (These values are also typically stored in environment variables and are used to validate the 'iss' and 'aud' claims in the JWT)
    const expectedIssuer = process.env.JWT_ISSUER;
    const expectedAudience = process.env.JWT_AUDIENCE;

    if (!expectedIssuer || !expectedAudience) {
      console.error(
        'JWT_ISSUER 或 JWT_AUDIENCE 环境变量未设置 (JWT_ISSUER or JWT_AUDIENCE environment variable is not set)'
      );
      // 配置错误，无法继续验证令牌
      // (Configuration error, cannot proceed with token validation)
      throw new Error('JWT issuer or audience not configured, cannot validate token.');
    }

    // 步骤 4: 验证JWT
    // (Step 4: Verify the JWT)
    // jose.jwtVerify 函数执行以下关键验证:
    // 1. 签名验证: 使用从JWKS获取的公钥验证JWT的签名是否有效。
    // 2. 标准声明验证:
    //    - 'exp' (Expiration Time): 检查令牌是否已过期。
    //    - 'nbf' (Not Before): 检查令牌是否已生效。
    //    - 'iss' (Issuer): 检查令牌的签发者是否与预期匹配 (expectedIssuer)。
    //    - 'aud' (Audience): 检查令牌的受众是否与预期匹配 (expectedAudience)。
    // 3. 算法验证: 确保令牌使用的签名算法与期望的算法列表 ('RS256') 中的一个匹配。
    // (The jose.jwtVerify function performs the following key validations:)
    // (1. Signature Verification: Verifies if the JWT's signature is valid using the public key obtained from JWKS.)
    // (2. Standard Claim Validation:)
    // (   - 'exp' (Expiration Time): Checks if the token has expired.)
    // (   - 'nbf' (Not Before): Checks if the token is already active.)
    // (   - 'iss' (Issuer): Checks if the token's issuer matches the expectedIssuer.)
    // (   - 'aud' (Audience): Checks if the token's audience matches the expectedAudience.)
    // (3. Algorithm Verification: Ensures the signing algorithm used by the token matches one from the expected list (e.g., 'RS256').)
    const verificationResult = await jose.jwtVerify(token, JWKS, {
      issuer: expectedIssuer,
      audience: expectedAudience,
      algorithms: ['RS256'], // 明确指定期望的签名算法 (Explicitly specify the expected signing algorithm)
    });
    jwtValidatedPayload = verificationResult.payload; // 将验证成功后的JWT载荷赋值给 jwtValidatedPayload
                                         // (Assign the successfully validated JWT payload to jwtValidatedPayload)
  } catch (err) {
    // 步骤 5: 处理JWT验证过程中发生的各种错误
    // (Step 5: Handle various errors that occur during JWT validation)
    // 例如: 令牌过期、签名无效、声明不匹配 (iss, aud)、JWKS获取失败等
    // (For example: token expired, invalid signature, claims mismatch (iss, aud), JWKS fetch failure, etc.)
    console.error('JWT 验证失败 (JWT validation failed):', err); // 在服务端记录详细错误日志 (Log detailed error on the server-side)

    let errorDescription = 'Token validation failed'; // 默认错误描述 (Default error description)
    // 根据错误类型提供更具体的错误信息
    // (Provide more specific error messages based on the error type)
    if (err instanceof jose.errors.JWTExpired) {
      // JWT已过期 (JWT has expired)
      errorDescription = `Token expired at ${new Date((err.payload.exp as number) * 1000).toISOString()}`;
    } else if (err instanceof jose.errors.JWTClaimValidationFailed) {
      // JWT声明验证失败 (e.g., 'iss' or 'aud' mismatch)
      // (JWT claim validation failed (e.g., 'iss' or 'aud' mismatch))
      errorDescription = `Token claim validation failed: ${err.claim} ${err.reason}`;
    } else if (
      err instanceof jose.errors.JOSENotSupported || // 例如，不支持的算法 (e.g., unsupported algorithm)
      err instanceof jose.errors.JWKInvalid // JWK无效 (JWK is invalid)
    ) {
      errorDescription = 'Invalid token algorithm or key issue.';
    } else if (
      err instanceof Error &&
      (err.message.includes('JWKS') || err.message.includes('configured'))
    ) {
      // JWKS URI配置错误或获取JWKS失败
      // (JWKS URI configuration error or failure to fetch JWKS)
      errorDescription = `Token validation setup error: ${err.message}`;
    }
    // 其他类型的 jose 错误 (如签名验证失败 jose.errors.JWSSignatureVerificationFailed) 会被通用错误消息捕获
    // (Other types of jose errors (like signature verification failure jose.errors.JWSSignatureVerificationFailed) will be caught by the generic error message)

    // 记录失败的认证尝试事件 (Log the failed authentication attempt event)
    await AuthorizationUtils.logAuditEvent({
      action: 'token_verification_failed_jwks',
      resource: request.url,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: false,
      errorMessage: errorDescription, // 使用处理过的错误描述 (Use processed error description)
    });

    return {
      success: false,
      response: NextResponse.json(
        { error: 'invalid_token', error_description: errorDescription },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="API"' } }
      ),
    };
  }

  // [现有数据库令牌检查 - 待评估]
  // [Existing DB Token Check - To Be Evaluated]
  // 下面的数据库查找用于检查令牌是否在数据库中存在且未被撤销。
  // (The database lookup below was used to check if the token exists in the DB and is not revoked.)
  // 对于自包含的JWT (特别是短期的)，此检查可能不是必需的，如果:
  // (For self-contained JWTs (especially short-lived ones), this check might not be strictly necessary if:)
  //   1. JWT签名和声明 (exp, iss, aud) 已成功验证。
  //      (JWT signature and claims (exp, iss, aud) have been successfully validated.)
  //   2. 快速撤销列表 (如Redis实现的JTI黑名单) 用于处理显式撤销。
  //      (A fast revocation list (e.g., a Redis-based JTI blacklist) is used for explicit revocations.)
  // 暂时注释掉此部分以依赖JWT声明，但如果需要即时DB级撤销检查，则应重新评估此策略。
  // (Temporarily commenting this out to rely on JWT claims. This strategy should be re-evaluated if immediate DB-level revocation checks are required.)
  // const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  // const accessTokenRecord = await prisma.accessToken.findFirst({
  //   where: {
  //     // tokenHash: tokenHash, // 或者直接使用 jti 如果 tokenHash 不是必需的 (Or use jti directly if tokenHash is not necessary)
  //     // jti: payload.jti, // 使用JWT的jti进行查找 (Use JWT's jti for lookup)
  //     revoked: false,
  //     // expiresAt: { gt: new Date() }, // JWT 'exp' 声明已经检查过了 (JWT 'exp' claim has already been checked by jwtVerify)
  //   },
  // });
  // if (!accessTokenRecord) {
  //   await AuthorizationUtils.logAuditEvent({
  //     action: 'revoked_token_used_db_check', // 新的审计动作类型 (New audit action type)
  //     resource: request.url,
  //     userId: payload.sub !== payload.client_id ? payload.sub as string : undefined,
  //     clientId: payload.client_id as string,
  //     ipAddress: request.headers.get('x-forwarded-for') || undefined,
  //     userAgent: request.headers.get('user-agent') || undefined,
  //     success: false,
  //     errorMessage: 'Token not found in DB or marked as revoked (post-JWKS validation)',
  //   });
  //   return {
  //     success: false,
  //     response: NextResponse.json(
  //       { error: 'invalid_token', error_description: 'Token is invalid or has been revoked (DB check)' },
  //       { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="API"' } }
  //     ),
  //   };
  // }

  // 步骤 6: 从成功验证的JWT载荷中提取信息并构建 AuthContext
  // (Step 6: Extract information from the successfully validated JWT payload and construct AuthContext)
  const context: AuthContext = {
    // 'sub' (Subject) 声明通常代表用户ID。如果 'sub' 与 'client_id' 不同，则认为是用户ID。
    // (The 'sub' (Subject) claim usually represents the user ID. If 'sub' is different from 'client_id', it's considered the user ID.)
    user_id: jwtValidatedPayload.sub !== jwtValidatedPayload.client_id ? (jwtValidatedPayload.sub as string) : undefined,

    // 'client_id' 声明代表进行调用的客户端应用程序。
    // (The 'client_id' claim represents the client application making the call.)
    client_id: jwtValidatedPayload.client_id as string, // Access Token 中应始终包含 client_id (client_id should always be present in an Access Token)

    // 'scope' 声明（如果存在）定义了授予此令牌的范围。
    // (The 'scope' claim (if present) defines the scopes granted to this token.)
    scopes: ScopeUtils.parseScopes(jwtValidatedPayload.scope as string | undefined), // scope 可能是空格分隔的字符串，需要解析 (scope might be a space-separated string and needs parsing)

    // 'permissions' 声明（如果存在且是数组）定义了授予此令牌的直接权限。
    // (The 'permissions' claim (if present and is an array) defines direct permissions granted to this token.)
    permissions: (jwtValidatedPayload.permissions as string[] | undefined) || [], // permissions 可能是可选的，默认为空数组 (permissions might be optional, default to an empty array)

    // 存储完整的已验证JWT载荷，以供后续可能的高级检查或使用。
    // (Store the complete validated JWT payload for potential advanced checks or usage later.)
    tokenPayload: jwtValidatedPayload,
  };

  // 检查是否需要用户上下文 (Check if user context is required for this specific route/action)
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
    const hasRequiredPermissions = options.requiredPermissions.every((permission) =>
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

// 移除了 hasResourcePermission 和 getUserResourcePermissions 函数，因为它们依赖了不存在的 UserResourcePermission 模型。
// 当前的RBAC模型不支持用户直接关联到特定资源实例的权限，权限应通过角色赋予。
// (Removed hasResourcePermission and getUserResourcePermissions functions as they depended on the non-existent UserResourcePermission model.
// The current RBAC model does not support direct user association with permissions on specific resource instances; permissions should be granted via roles.)

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

/**
 * OAuth统一中间件 - 集中管理速率限制、审计日志、错误处理
 * OAuth Unified Middleware - Centralized rate limiting, audit logging, error handling
 */
export interface OAuthMiddlewareOptions {
  rateLimitKey?: string;
  maxRequests?: number;
  windowMs?: number;
  requireAuth?: boolean;
  auditAction?: string;
  skipRateLimit?: boolean;
}

export function withOAuthMiddleware(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: OAuthMiddlewareOptions = {}
) {
  return async function middlewareHandler(request: NextRequest): Promise<NextResponse> {
    const {
      rateLimitKey = 'default',
      maxRequests = 100,
      windowMs = 60000,
      requireAuth = false,
      auditAction,
      skipRateLimit = false,
    } = options;

    const ipAddress =
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    try {
      // 1. 速率限制检查
      if (!skipRateLimit) {
        const limitKey = RateLimitUtils.getRateLimitKey(request, rateLimitKey as 'ip' | 'client');
        if (RateLimitUtils.isRateLimited(limitKey, maxRequests, windowMs)) {
          // 记录速率限制事件
          if (auditAction) {
            await AuthorizationUtils.logAuditEvent({
              action: `${auditAction}_rate_limited`,
              resource: new URL(request.url).pathname,
              ipAddress,
              userAgent,
              success: false,
              errorMessage: 'Rate limit exceeded',
            });
          }

          return NextResponse.json(
            {
              error: 'rate_limit_exceeded',
              error_description: 'Too many requests. Please try again later.',
            },
            { status: 429 }
          );
        }
      }

      // 2. 身份验证检查（如果需要）
      if (requireAuth) {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
          return NextResponse.json(
            {
              error: 'unauthorized',
              error_description: 'Authentication required',
            },
            { status: 401 }
          );
        }
      }

      // 3. 执行实际的处理函数
      const response = await handler(request);

      // 4. 记录成功的审计日志
      if (auditAction && response.status < 400) {
        await AuthorizationUtils.logAuditEvent({
          action: auditAction,
          resource: new URL(request.url).pathname,
          ipAddress,
          userAgent,
          success: true,
        });
      }

      return response;
    } catch (error: unknown) {
      // 5. 错误处理和审计日志
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (auditAction) {
        await AuthorizationUtils.logAuditEvent({
          action: `${auditAction}_error`,
          resource: new URL(request.url).pathname,
          ipAddress,
          userAgent,
          success: false,
          errorMessage,
        });
      }

      console.error(`OAuth middleware error in ${new URL(request.url).pathname}:`, error);

      return NextResponse.json(
        {
          error: 'server_error',
          error_description: 'An unexpected error occurred',
        },
        { status: 500 }
      );
    }
  };
}

/**
 * 专门用于OAuth端点的中间件
 * Specialized middleware for OAuth endpoints
 */
export function withOAuthEndpoint(
  handler: (request: NextRequest) => Promise<NextResponse>,
  auditAction: string,
  options: Partial<OAuthMiddlewareOptions> = {}
) {
  return withOAuthMiddleware(withCORS(handler), {
    auditAction,
    maxRequests: 60, // OAuth端点的默认速率限制
    windowMs: 60000, // 1分钟窗口
    ...options,
  });
}

/**
 * 用于认证端点的中间件
 * Middleware for authentication endpoints
 */
export function withAuthEndpoint(
  handler: (request: NextRequest) => Promise<NextResponse>,
  auditAction: string,
  options: Partial<OAuthMiddlewareOptions> = {}
) {
  return withOAuthMiddleware(withCORS(handler), {
    auditAction,
    maxRequests: 10, // 认证端点更严格的速率限制
    windowMs: 60000,
    ...options,
  });
}

/**
 * 用于公共API端点的中间件
 * Middleware for public API endpoints
 */
export function withPublicEndpoint(
  handler: (request: NextRequest) => Promise<NextResponse>,
  auditAction: string,
  options: Partial<OAuthMiddlewareOptions> = {}
) {
  return withOAuthMiddleware(withCORS(handler), {
    auditAction,
    maxRequests: 200, // 公共端点更宽松的限制
    windowMs: 60000,
    ...options,
  });
}

/**
 * 用于管理员端点的中间件
 * Middleware for admin endpoints
 */
export function withAdminEndpoint(
  handler: (request: NextRequest) => Promise<NextResponse>,
  auditAction: string,
  options: Partial<OAuthMiddlewareOptions> = {}
) {
  return withOAuthMiddleware(withCORS(handler), {
    auditAction,
    requireAuth: true,
    maxRequests: 30,
    windowMs: 60000,
    ...options,
  });
}

/**
 * 通用OAuth 2.0验证中间件选项
 */
export interface OAuthValidationOptions {
  /** 速率限制配置 */
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
    keyType: 'ip' | 'client'; // Changed from 'ip' | 'client' | 'user'
  };
  /** 是否需要客户端认证 */
  requireClientAuth?: boolean;
  /** 审计日志动作名称 */
  auditAction?: string;
  /** 是否验证请求体格式 */
  validateFormData?: boolean;
  /** 必需的请求参数 */
  requiredParams?: string[];
  /** 可选的请求参数验证规则 */
  paramValidation?: Record<string, (value: string) => boolean>;
}

/**
 * OAuth 2.0验证中间件响应
 */
export interface OAuthValidationResult {
  success: boolean;
  response?: NextResponse;
  context?: {
    body?: FormData;
    client?: Client; // Consider using a more specific Client type if available
    ipAddress?: string;
    userAgent?: string;
    params?: Record<string, string>;
  };
}


/**
 * 高阶函数 (Higher-Order Function - HOF) 用于创建需要特定权限的路由处理器。
 * (HOF to create route handlers that require specific permissions for Admin/Internal UI using OAuth tokens.)
 *
 * @param requiredPermission - 需要的权限名称 (The name of the required permission, e.g., "user:create")
 * @returns 一个包装函数，它接收实际的路由处理器并返回一个新的、受保护的处理器
 *          (A wrapper function that takes the actual route handler and returns a new, protected handler)
 */
// requirePermission HOF (Higher-Order Function) 的主要作用是:
// 1. 确保请求来自经过身份验证的用户 (通过验证JWT)。
// 2. 检查该用户是否具有执行操作所需的特定权限。
// 3. 如果身份验证失败或用户缺少权限，则拒绝访问。
// 4. 如果验证通过且权限满足，则将用户信息附加到请求对象，并执行实际的路由处理器。
// (The main roles of the requirePermission HOF are:)
// (1. Ensure the request comes from an authenticated user (by validating the JWT).)
// (2. Check if this user has the specific permission required to perform the action.)
// (3. Deny access if authentication fails or the user lacks the permission.)
// (4. If validation passes and permission is met, attach user information to the request object and execute the actual route handler.)
export function requirePermission(requiredPermission: string) {
  // 返回一个接收实际处理器的函数
  // (Return a function that accepts the actual handler)
  return function <T extends (request: NextRequest, ...args: any[]) => Promise<Response | NextResponse>>(
    actualHandler: T
  ) {
    // 返回最终的异步请求处理函数
    // (Return the final async request handler function)
    return async function (request: NextRequest, ...args: any[]): Promise<Response | NextResponse> {
      // 从请求头中提取 Authorization Bearer Token
      // (Extract Authorization Bearer Token from request headers)
      const authHeader = request.headers.get('Authorization');

      if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
        // 如果没有提供Token或格式不正确，返回401未授权
        // (If no token is provided or it's incorrectly formatted, return 401 Unauthorized)
        return NextResponse.json({ message: '未授权: 缺少或无效的 Authorization header (Unauthorized: Missing or invalid Authorization header)' }, { status: 401 });
      }

      const token = authHeader.substring(7); // 提取 "Bearer " 后的令牌部分 (Extract the token part after "Bearer ")
      if (!token) {
        // 如果令牌为空，返回401未授权
        // (If the token is empty, return 401 Unauthorized)
        return NextResponse.json({ message: '未授权: 缺少令牌 (Unauthorized: Missing token)' }, { status: 401 });
      }

      let oauthTokenPayload: jose.JWTPayload;
      try {
        // **JWT 验证逻辑**
        // (JWT Validation Logic)
        // 此处重复了 `authenticateBearer` 中的部分JWT验证逻辑。
        // 理想情况下，如果 `authenticateBearer` (或类似的全局认证中间件) 能保证在 `requirePermission` 之前运行，
        // 并且已经验证了JWT并将结果 (如用户ID和权限) 附加到请求对象 (例如 `request.user`)，
        // 那么这里的重新验证可能是多余的。可以考虑在未来的重构中优化这一点，以避免重复验证。
        // (This section repeats some JWT validation logic found in `authenticateBearer`.)
        // (Ideally, if `authenticateBearer` (or a similar global authentication middleware) is guaranteed to run before `requirePermission`
        // and has already validated the JWT and attached the results (like user ID and permissions) to the request object (e.g., `request.user`),
        // then the re-validation here might be redundant. This could be optimized in future refactoring to avoid duplicate validation.)

        // 获取JWKS URI用于获取公钥
        // (Get JWKS URI to fetch public keys)
        const jwksUriString = process.env.JWKS_URI;
        if (!jwksUriString) {
          console.error('JWKS_URI 环境变量未设置 (JWKS_URI environment variable is not set)');
          throw new Error('认证服务配置错误 (Authentication service configuration error).');
        }
        // 创建远程JWKSet实例，用于获取和缓存公钥
        // (Create a remote JWKSet instance for fetching and caching public keys)
        const JWKS = jose.createRemoteJWKSet(new URL(jwksUriString));

        // 获取预期的JWT签发者和受众
        // (Get the expected JWT issuer and audience)
        const expectedIssuer = process.env.JWT_ISSUER;
        const expectedAudience = process.env.JWT_AUDIENCE;
        if (!expectedIssuer || !expectedAudience) {
          console.error('JWT_ISSUER 或 JWT_AUDIENCE 环境变量未设置 (JWT_ISSUER or JWT_AUDIENCE environment variable is not set)');
          throw new Error('认证服务配置错误 (Authentication service configuration error).');
        }

        // 使用 jose.jwtVerify 验证令牌签名、有效期、签发者和受众
        // (Use jose.jwtVerify to validate the token's signature, expiration, issuer, and audience)
        const { payload } = await jose.jwtVerify(token, JWKS, {
          issuer: expectedIssuer,
          audience: expectedAudience,
          algorithms: ['RS256'], // 假设管理后台使用的OAuth令牌是RS256 (Assuming OAuth tokens for admin UI use RS256)
        });
        oauthTokenPayload = payload; // 存储验证后的载荷 (Store the validated payload)
      } catch (error: any) {
        // 如果JWT验证失败 (例如，过期、签名无效、声明不匹配)
        // (If JWT validation fails (e.g., expired, invalid signature, claims mismatch))
        console.warn('requirePermission: OAuth Access Token 验证失败 (OAuth Access Token verification failed).', error.message);
        return NextResponse.json({ message: `未授权: ${error.message || '无效的OAuth令牌 (Invalid OAuth token)'}` }, { status: 401 });
      }

      // 从JWT载荷中提取用户ID ('sub' 声明)
      // (Extract user ID ('sub' claim) from the JWT payload)
      const userId = oauthTokenPayload.sub;
      if (!userId || typeof userId !== 'string') {
        // 如果用户ID无效，返回401
        // (If the user ID is invalid, return 401)
        return NextResponse.json({ message: '未授权: 无效的令牌载荷 (无效的sub声明) (Unauthorized: Invalid token payload (missing or invalid sub claim for user ID))' }, { status: 401 });
      }

      // **权限检查逻辑**
      // (Permission Checking Logic)
      let hasPermission = false;
      // 尝试从令牌的 'permissions' 声明中获取权限列表
      // (Try to get the list of permissions from the 'permissions' claim in the token)
      const tokenPermissions = oauthTokenPayload.permissions as string[] | undefined;

      if (tokenPermissions && Array.isArray(tokenPermissions)) {
        // 1. 如果令牌中直接包含 'permissions' 声明，则基于此声明检查权限。
        //    这是一种常见的做法，可以将权限信息直接嵌入到JWT中，避免额外的数据库查询。
        // (1. If the token directly contains a 'permissions' claim, check permission based on this claim.)
        // (   This is a common practice to embed permission information directly into the JWT, avoiding additional database queries.)
        hasPermission = tokenPermissions.includes(requiredPermission);
        console.log(`requirePermission: 用户 '${userId}' 通过令牌声明检查权限 '${requiredPermission}'。结果: ${hasPermission} (User '${userId}' checking permission '${requiredPermission}' via token claims. Result: ${hasPermission})`);
      } else {
        // 2. 如果令牌中没有 'permissions' 声明，则回退到通过 PermissionService (通常是查询数据库) 来检查用户权限。
        //    这提供了更大的灵活性，允许在不重新签发JWT的情况下更改用户权限。
        // (2. If the token does not have a 'permissions' claim, fall back to checking user permissions via PermissionService (typically by querying the database).)
        // (   This provides greater flexibility, allowing changes to user permissions without reissuing JWTs.)
        console.log(`requirePermission: 用户 '${userId}' 的令牌中无 'permissions' 声明。通过 PermissionService 检查权限 '${requiredPermission}'。(No 'permissions' claim in token for user '${userId}'. Checking permission '${requiredPermission}' via PermissionService.)`);
        hasPermission = await permissionServiceInstance.checkPermission(userId, requiredPermission);
      }

      if (!hasPermission) {
        // 如果用户没有所需权限，返回403禁止访问
        // (If the user does not have the required permission, return 403 Forbidden)
        console.warn(`requirePermission: 用户 ${userId} 无权限 '${requiredPermission}'。(User ${userId} does not have permission '${requiredPermission}'.)`);
        return NextResponse.json(
          { message: `禁止访问: 您没有 '${requiredPermission}' 权限访问此资源。(Forbidden: You do not have permission '${requiredPermission}' to access this resource.)` },
          { status: 403 }
        );
      }

      // 将用户信息（从JWT中提取）和权限附加到请求对象，以便后续的处理器可以使用。
      // (Attach user information (extracted from JWT) and permissions to the request object so that subsequent handlers can use it.)
      request.user = {
        id: userId, // 'sub' 声明作为主要用户标识符 (The 'sub' claim as the primary user identifier)
        userId: userId, // 为内部一致性明确添加userId (Explicitly add userId for internal consistency)
        username: oauthTokenPayload.username as string || oauthTokenPayload.preferred_username as string || undefined, // 从 'username' 或 'preferred_username' 声明获取用户名 (Get username from 'username' or 'preferred_username' claim)
        clientId: oauthTokenPayload.client_id as string || undefined, // 从 'client_id' 声明获取客户端ID (Get client ID from 'client_id' claim)
        permissions: tokenPermissions || [], // 使用令牌中的权限列表，如果不存在则为空数组 (Use the permission list from the token, or an empty array if not present)
        ...oauthTokenPayload // 附加所有其他JWT声明到 request.user，以备不时之需 (Attach all other JWT claims to request.user for potential use)
      };

      // 如果用户通过身份验证且拥有所需权限，则执行实际的路由处理器。
      // (If the user is authenticated and has the required permission, execute the actual route handler.)
      // The 'args' will correctly pass { params } for dynamic routes.
      return actualHandler(request, ...args);
    };
  };
}


/**
 * 通用OAuth 2.0验证中间件
 * 整合了速率限制、客户端认证、参数验证等常见模式
 */
export async function validateOAuthRequest(
  request: NextRequest,
  options: OAuthValidationOptions = {}
): Promise<OAuthValidationResult> {
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  // 速率限制检查
  if (options.rateLimit) {
    const { maxRequests, windowMs, keyType } = options.rateLimit;
    const rateLimitKey = RateLimitUtils.getRateLimitKey(request, keyType);

    if (RateLimitUtils.isRateLimited(rateLimitKey, maxRequests, windowMs)) {
      await AuthorizationUtils.logAuditEvent({
        action: options.auditAction || 'rate_limit_exceeded',
        resource: request.url,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Rate limit exceeded',
      });

      return {
        success: false,
        response: NextResponse.json(
          {
            error: OAuth2ErrorTypes.TEMPORARILY_UNAVAILABLE,
            error_description: 'Rate limit exceeded',
          },
          { status: 429 }
        ),
      };
    }
  }

  let body: FormData | undefined;
  let client: Client | undefined; // Consider using a more specific Client type
  const params: Record<string, string> = {};

  // Parse request body if validating form data or if client auth is required (as it might need body params)
  if (options.validateFormData || options.requireClientAuth) {
    try {
      body = await request.formData();
    } catch {
      const actionType = options.requireClientAuth
        ? `${options.auditAction || 'oauth_request'}_client_auth_parse_failure`
        : `${options.auditAction || 'oauth_request'}_parse_error`;

      await AuthorizationUtils.logAuditEvent({
        action: actionType,
        resource: request.url,
        ipAddress,
        userAgent,
        success: false,
        errorMessage:
          'Failed to parse request body for client authentication or form data validation',
      });

      return {
        success: false,
        response: NextResponse.json(
          {
            error: OAuth2ErrorTypes.INVALID_REQUEST,
            error_description:
              'Failed to parse request body. Ensure it is application/x-www-form-urlencoded.',
          },
          { status: 400 }
        ),
      };
    }
  } else if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    const contentType = request.headers.get('content-type');
    if (contentType && contentType.includes('application/x-www-form-urlencoded')) {
      try {
        body = await request.formData();
      } catch (error) {
        console.warn('OAuthMiddleware: Failed to parse form data (not strictly required):', error);
      }
    }
  }

  // 提取参数（从query string或form data）
  if (options.requiredParams || options.paramValidation) {
    const { searchParams } = new URL(request.url);

    // 从query parameters提取
    for (const [key, value] of searchParams.entries()) {
      params[key] = value;
    }

    // 从form data提取（如果存在）
    if (body) {
      for (const [key, value] of body.entries()) {
        params[key] = value as string;
      }
    }
  }

  // 验证必需参数
  if (options.requiredParams) {
    const missingParams = options.requiredParams.filter((param) => !params[param]);

    if (missingParams.length > 0) {
      await AuthorizationUtils.logAuditEvent({
        action: `${options.auditAction || 'oauth_request'}_missing_params`,
        resource: request.url,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: `Missing required parameters: ${missingParams.join(', ')}`,
      });

      return {
        success: false,
        response: NextResponse.json(
          {
            error: OAuth2ErrorTypes.INVALID_REQUEST,
            error_description: `Missing required parameters: ${missingParams.join(', ')}`,
          },
          { status: 400 }
        ),
      };
    }
  }

  // 自定义参数验证
  if (options.paramValidation) {
    for (const [param, validator] of Object.entries(options.paramValidation)) {
      const value = params[param];
      if (value && !validator(value)) {
        await AuthorizationUtils.logAuditEvent({
          action: `${options.auditAction || 'oauth_request'}_invalid_param`,
          resource: request.url,
          ipAddress,
          userAgent,
          success: false,
          errorMessage: `Invalid parameter: ${param}`,
          metadata: { [param]: value },
        });

        return {
          success: false,
          response: NextResponse.json(
            {
              error: OAuth2ErrorTypes.INVALID_REQUEST,
              error_description: `Invalid parameter: ${param}`,
            },
            { status: 400 }
          ),
        };
      }
    }
  }

  // 客户端认证
  if (options.requireClientAuth) {
    if (!body) {
      await AuthorizationUtils.logAuditEvent({
        action: `${options.auditAction || 'oauth_request'}_client_auth_failed`,
        resource: request.url,
        ipAddress,
        userAgent,
        success: false,
        errorMessage:
          'Client authentication requires form data which was not available or parsable.',
      });
      return {
        success: false,
        response: NextResponse.json(
          {
            error: OAuth2ErrorTypes.INVALID_REQUEST,
            error_description: 'Client authentication requires form data body.',
          },
          { status: 400 }
        ),
      };
    }
    const clientAuth = await ClientAuthUtils.authenticateClient(request, body);

    if (!clientAuth.client) {
      await AuthorizationUtils.logAuditEvent({
        action: `${options.auditAction || 'oauth_request'}_client_auth_failed`,
        resource: request.url,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: clientAuth.error?.error_description,
      });

      return {
        success: false,
        response: NextResponse.json(clientAuth.error, { status: 401 }),
      };
    }

    client = clientAuth.client;
  }

  return {
    success: true,
    context: {
      body,
      client,
      ipAddress,
      userAgent,
      params,
    },
  };
}

/**
 * 作用域验证中间件 (from oauth-middleware.ts)
 */
export async function validateOAuthScopes( // Renamed to avoid conflict if a different validateScopes exists
  requestedScopes: string[],
  client: Client, // Consider using a more specific Client type
  options: {
    auditAction?: string;
    ipAddress?: string;
    userAgent?: string;
  } = {}
): Promise<{ valid: boolean; response?: NextResponse; validScopes?: string[] }> {
  // Assuming ScopeUtils.validateScopes is available (it's imported)
  const scopeValidation = await ScopeUtils.validateScopes(requestedScopes, client);

  if (!scopeValidation.valid) {
    await AuthorizationUtils.logAuditEvent({
      // clientId should be client.id if client is a Prisma model instance
      clientId: client && typeof client.id === 'string' ? client.id : undefined,
      action: options.auditAction || 'invalid_scope',
      resource: 'scope_validation',
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      success: false,
      errorMessage: `Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`,
      metadata: {
        requestedScopes,
        invalidScopes: scopeValidation.invalidScopes,
      },
    });

    return {
      valid: false,
      response: NextResponse.json(
        {
          error: OAuth2ErrorTypes.INVALID_SCOPE,
          error_description: `Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`,
        },
        { status: 400 }
      ),
    };
  }

  return {
    valid: true,
    validScopes: requestedScopes, // If all are valid, requestedScopes are the valid ones
  };
}

/**
 * 重定向URI验证中间件 (from oauth-middleware.ts)
 */
export function validateOAuthRedirectUri( // Renamed
  redirectUri: string,
  registeredUris: string[]
): { valid: boolean; response?: NextResponse } {
  // Assuming AuthorizationUtils.validateRedirectUri is available
  if (!AuthorizationUtils.validateRedirectUri(redirectUri, registeredUris)) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: OAuth2ErrorTypes.INVALID_REQUEST,
          error_description: 'Invalid redirect_uri',
        },
        { status: 400 }
      ),
    };
  }

  return { valid: true };
}

/**
 * PKCE验证中间件 (from oauth-middleware.ts)
 */
export function validateOAuthPKCE( // Renamed
  codeChallenge?: string,
  codeChallengeMethod?: string,
  required = false
): {
  valid: boolean;
  response?: NextResponse;
  pkceData?: { codeChallenge: string; codeChallengeMethod: string };
} {
  if (required && !codeChallenge) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: OAuth2ErrorTypes.INVALID_REQUEST,
          error_description: 'PKCE is required for this client',
        },
        { status: 400 }
      ),
    };
  }

  if (codeChallenge) {
    if (!codeChallengeMethod || codeChallengeMethod !== 'S256') {
      return {
        valid: false,
        response: NextResponse.json(
          {
            error: OAuth2ErrorTypes.INVALID_REQUEST,
            error_description: 'code_challenge_method must be S256',
          },
          { status: 400 }
        ),
      };
    }
    // Assuming PKCEUtils.validateCodeChallenge is available
    if (!PKCEUtils.validateCodeChallenge(codeChallenge)) {
      return {
        valid: false,
        response: NextResponse.json(
          {
            error: OAuth2ErrorTypes.INVALID_REQUEST,
            error_description: 'Invalid code_challenge format',
          },
          { status: 400 }
        ),
      };
    }

    return {
      valid: true,
      pkceData: {
        codeChallenge,
        codeChallengeMethod,
      },
    };
  }

  return { valid: true };
}

/**
 * 高级中间件装饰器 - OAuth令牌端点
 */
export function withOAuthTokenValidation(
  handler: (
    request: NextRequest,
    context: OAuthValidationResult['context']
  ) => Promise<NextResponse>
) {
  return async function (request: NextRequest): Promise<NextResponse> {
    // First validation: basic parameters and grant_type
    const initialValidation = await validateOAuthRequest(request, {
      rateLimit: {
        maxRequests: 100,
        windowMs: 60000,
        keyType: 'ip',
      },
      requireClientAuth: true,
      auditAction: 'token_request',
      validateFormData: true,
      requiredParams: ['grant_type'],
      paramValidation: {
        grant_type: (value) =>
          ['authorization_code', 'refresh_token', 'client_credentials', 'password'].includes(value),
      },
    });

    if (!initialValidation.success || !initialValidation.context) {
      return initialValidation.response!;
    }

    // Second validation: grant_type specific parameters
    const grantType = initialValidation.context.params?.grant_type;
    let grantSpecificRequiredParams: string[] = [];

    switch (grantType) {
      case 'authorization_code':
        grantSpecificRequiredParams = ['code', 'redirect_uri'];
        break;
      case 'refresh_token':
        grantSpecificRequiredParams = ['refresh_token'];
        break;
      case 'client_credentials':
        // No additional parameters required beyond client auth
        break;
      case 'password':
        grantSpecificRequiredParams = ['username', 'password'];
        break;
    }

    if (grantSpecificRequiredParams.length > 0) {
      const missingParams = grantSpecificRequiredParams.filter(
        (param) => !initialValidation.context!.params![param]
      );

      if (missingParams.length > 0) {
        await AuthorizationUtils.logAuditEvent({
          clientId: initialValidation.context.client?.id,
          action: 'token_request_missing_grant_params',
          resource: 'oauth/token',
          ipAddress: initialValidation.context.ipAddress,
          userAgent: initialValidation.context.userAgent,
          success: false,
          errorMessage: `Missing required parameters for ${grantType}: ${missingParams.join(', ')}`,
        });

        return NextResponse.json(
          {
            error: OAuth2ErrorTypes.INVALID_REQUEST,
            error_description: `Missing required parameters for ${grantType}: ${missingParams.join(', ')}`,
          },
          { status: 400 }
        );
      }
    }

    return handler(request, initialValidation.context);
  };
}

/**
 * 高级中间件装饰器 - OAuth授权端点
 */
export function withOAuthAuthorizeValidation(
  handler: (
    request: NextRequest,
    context: OAuthValidationResult['context']
  ) => Promise<NextResponse>
) {
  return async function (request: NextRequest): Promise<NextResponse> {
    const validation = await validateOAuthRequest(request, {
      rateLimit: {
        maxRequests: 50,
        windowMs: 60000,
        keyType: 'ip',
      },
      auditAction: 'authorization_request',
      // Note: client_id is often in query for authorize, but authenticateClient expects it in body for some flows.
      // This setup assumes client_id will be in params map correctly.
      // Client authentication for authorize endpoint might not use form body (e.g. public clients).
      // Setting requireClientAuth: false here if client_id is from query.
      // Or, validateOAuthRequest needs to be smarter about where client_id comes from for 'authorize'.
      // For now, assuming client_id is primarily from query for /authorize, so client auth might not be via body.
      // However, OAuth spec allows client auth for /authorize for confidential clients.
      // This part needs careful review based on how ClientAuthUtils.authenticateClient is used/expected.
      // For simplicity here, let's assume client_id is validated via parameters.
      // requireClientAuth: false, // Or true if client auth for /authorize must happen via body.
      validateFormData: false, // Authorize typically uses query params
      requiredParams: ['client_id', 'redirect_uri', 'response_type'],
      paramValidation: {
        response_type: (value) => value === 'code',
        // client_id and redirect_uri will be validated further within the handler typically
      },
    });

    if (!validation.success || !validation.context) {
      return validation.response!;
    }

    // Additional validation for client based on validated client_id from params
    const client = await prisma.client.findUnique({
      where: { clientId: validation.context.params?.client_id },
    });

    if (!client) {
      return NextResponse.json(
        { error: OAuth2ErrorTypes.INVALID_CLIENT, error_description: 'Client not found' },
        { status: 401 }
      );
    }
    validation.context.client = client; // Add client to context

    // Validate redirect_uri against this specific client
    const redirectUriValidation = validateOAuthRedirectUri(
      validation.context.params?.redirect_uri || '',
      client.redirectUris ? JSON.parse(client.redirectUris as string) : []
    );
    if (!redirectUriValidation.valid) {
      return redirectUriValidation.response!;
    }

    return handler(request, validation.context);
  };
}

/**
 * 高级中间件装饰器 - OAuth令牌撤销端点
 */
export function withOAuthRevokeValidation(
  handler: (
    request: NextRequest,
    context: OAuthValidationResult['context']
  ) => Promise<NextResponse>
) {
  return async function (request: NextRequest): Promise<NextResponse> {
    const validation = await validateOAuthRequest(request, {
      rateLimit: {
        maxRequests: 50,
        windowMs: 60000,
        keyType: 'ip',
      },
      requireClientAuth: true, // Token revocation requires client auth
      auditAction: 'token_revocation',
      validateFormData: true,
      requiredParams: ['token'],
    });

    if (!validation.success || !validation.context) {
      return validation.response!;
    }

    return handler(request, validation.context);
  };
}
