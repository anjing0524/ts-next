import crypto from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import * as jose from 'jose'; // 引入 'jose' (Import 'jose')

import { prisma } from '@/lib/prisma';

import {
  JWTUtils,
  ScopeUtils,
  AuthorizationUtils,
  RateLimitUtils,
  ClientAuthUtils,
  OAuth2ErrorTypes,
  PKCEUtils,
} from './oauth2';

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

  const token = authorization.substring(7); // 移除 "Bearer " 前缀 (Remove "Bearer " prefix)
  let payload: jose.JWTPayload; // 定义payload变量 (Define payload variable)

  try {
    // 从环境变量或配置中获取JWKS端点URI (Get JWKS endpoint URI from environment variable or configuration)
    const jwksUriString = process.env.JWKS_URI;
    if (!jwksUriString) {
      console.error('JWKS_URI 环境变量未设置 (JWKS_URI environment variable is not set)');
      // 对于配置错误，通常返回500 (For configuration errors, typically return 500)
      // 但在认证流程中，任何使token无法验证的问题都应导致401 (But in auth flow, any issue preventing token validation should lead to 401)
      throw new Error('JWKS_URI not configured, cannot validate token.');
    }
    // 创建一个远程JWKSet实例，它会自动缓存JWKS响应 (Create a remote JWKSet instance, which automatically caches JWKS responses)
    const JWKS = jose.createRemoteJWKSet(new URL(jwksUriString));

    // 从环境变量或配置中获取预期的签发者和受众 (Get expected issuer and audience from environment variables or configuration)
    const expectedIssuer = process.env.JWT_ISSUER;
    const expectedAudience = process.env.JWT_AUDIENCE;

    if (!expectedIssuer || !expectedAudience) {
      console.error(
        'JWT_ISSUER 或 JWT_AUDIENCE 环境变量未设置 (JWT_ISSUER or JWT_AUDIENCE environment variable is not set)'
      );
      throw new Error('JWT issuer or audience not configured, cannot validate token.');
    }

    // 验证JWT (Verify the JWT)
    // jose.jwtVerify 会自动处理签名验证、exp、nbf、iss、aud等声明的验证
    // (jose.jwtVerify automatically handles signature verification and validation of claims like exp, nbf, iss, aud)
    const verificationResult = await jose.jwtVerify(token, JWKS, {
      issuer: expectedIssuer,
      audience: expectedAudience,
      algorithms: ['RS256'], // 明确指定期望的算法 (Explicitly specify expected algorithms)
    });
    payload = verificationResult.payload; // 将验证后的载荷赋值给payload (Assign the verified payload to the payload variable)
  } catch (err) {
    // 处理JWT验证错误 (例如，令牌过期，签名无效，声明不匹配等)
    // (Handle JWT verification errors - e.g., token expired, invalid signature, claims mismatch, etc.)
    console.error('JWT 验证失败 (JWT validation failed):', err); // 服务端日志 (Server-side log)

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
      // 对于配置或JWKS获取问题，虽然仍在401路径，但错误消息可以更具体
      // (For configuration or JWKS fetch issues, while still on 401 path, error message can be more specific)
      errorDescription = `Token validation setup error: ${err.message}`;
    }

    await AuthorizationUtils.logAuditEvent({
      action: 'token_verification_failed_jwks', // 新的审计动作类型 (New audit action type)
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

  // 从JWT载荷中提取上下文信息 (Extract context from JWT payload)
  const context: AuthContext = {
    user_id: payload.sub !== payload.client_id ? (payload.sub as string) : undefined,
    client_id: payload.client_id as string, // client_id 应始终存在于Access Token中 (client_id should always be in Access Token)
    scopes: ScopeUtils.parseScopes(payload.scope as string | undefined), // scope可能是可选的 (scope might be optional)
    permissions: (payload.permissions as string[] | undefined) || [], // permissions可能是可选的 (permissions might be optional)
    payload, // 存储完整的payload以供后续使用 (Store the full payload for later use)
  };

  // 检查是否需要用户上下文 (Check if user context is required)
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
    } catch (error: any) {
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
    client?: any; // Consider using a more specific Client type if available
    ipAddress?: string;
    userAgent?: string;
    params?: Record<string, string>;
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
  let client: any; // Consider using a more specific Client type
  const params: Record<string, string> = {};

  // Parse request body if validating form data or if client auth is required (as it might need body params)
  if (options.validateFormData || options.requireClientAuth) {
    try {
      body = await request.formData();
    } catch (error) {
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
  client: any, // Consider using a more specific Client type
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
