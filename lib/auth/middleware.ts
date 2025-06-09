import { NextRequest, NextResponse } from 'next/server';
import { JWTUtils, ScopeUtils, AuthorizationUtils, RateLimitUtils, ClientAuthUtils, OAuth2ErrorTypes, PKCEUtils } from './oauth2';
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
      skipRateLimit = false
    } = options;

    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
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
              errorMessage: 'Rate limit exceeded'
            });
          }

          return NextResponse.json(
            { 
              error: 'rate_limit_exceeded',
              error_description: 'Too many requests. Please try again later.' 
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
              error_description: 'Authentication required' 
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
          success: true
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
          errorMessage
        });
      }

      console.error(`OAuth middleware error in ${new URL(request.url).pathname}:`, error);

      return NextResponse.json(
        { 
          error: 'server_error',
          error_description: 'An unexpected error occurred' 
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
  return withOAuthMiddleware(
    withCORS(handler),
    {
      auditAction,
      maxRequests: 60, // OAuth端点的默认速率限制
      windowMs: 60000, // 1分钟窗口
      ...options
    }
  );
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
  return withOAuthMiddleware(
    withCORS(handler),
    {
      auditAction,
      maxRequests: 10, // 认证端点更严格的速率限制
      windowMs: 60000,
      ...options
    }
  );
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
  return withOAuthMiddleware(
    withCORS(handler),
    {
      auditAction,
      maxRequests: 200, // 公共端点更宽松的限制
      windowMs: 60000,
      ...options
    }
  );
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
  return withOAuthMiddleware(
    withCORS(handler),
    {
      auditAction,
      requireAuth: true,
      maxRequests: 30,
      windowMs: 60000,
      ...options
    }
  );
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
            error_description: 'Rate limit exceeded'
          },
          { status: 429 }
        )
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
      const actionType = options.requireClientAuth ? 
        `${options.auditAction || 'oauth_request'}_client_auth_parse_failure` :
        `${options.auditAction || 'oauth_request'}_parse_error`;

      await AuthorizationUtils.logAuditEvent({
        action: actionType,
        resource: request.url,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Failed to parse request body for client authentication or form data validation',
      });

      return {
        success: false,
        response: NextResponse.json(
          {
            error: OAuth2ErrorTypes.INVALID_REQUEST,
            error_description: 'Failed to parse request body. Ensure it is application/x-www-form-urlencoded.'
          },
          { status: 400 }
        )
      };
    }
  } else if (request.method === "POST" || request.method === "PUT" || request.method === "PATCH") {
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
    const missingParams = options.requiredParams.filter(param => !params[param]);
    
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
            error_description: `Missing required parameters: ${missingParams.join(', ')}`
          },
          { status: 400 }
        )
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
              error_description: `Invalid parameter: ${param}`
            },
            { status: 400 }
          )
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
        errorMessage: 'Client authentication requires form data which was not available or parsable.',
      });
      return {
        success: false,
        response: NextResponse.json(
            {
                error: OAuth2ErrorTypes.INVALID_REQUEST,
                error_description: 'Client authentication requires form data body.'
            }, 
            { status: 400 }
        )
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
        response: NextResponse.json(clientAuth.error, { status: 401 })
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
      params
    }
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
        invalidScopes: scopeValidation.invalidScopes 
      },
    });

    return {
      valid: false,
      response: NextResponse.json(
        {
          error: OAuth2ErrorTypes.INVALID_SCOPE,
          error_description: `Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`
        },
        { status: 400 }
      )
    };
  }

  return {
    valid: true,
    validScopes: requestedScopes // If all are valid, requestedScopes are the valid ones
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
          error_description: 'Invalid redirect_uri'
        },
        { status: 400 }
      )
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
): { valid: boolean; response?: NextResponse; pkceData?: { codeChallenge: string; codeChallengeMethod: string; } } {
  if (required && !codeChallenge) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: OAuth2ErrorTypes.INVALID_REQUEST,
          error_description: 'PKCE is required for this client'
        },
        { status: 400 }
      )
    };
  }

  if (codeChallenge) {
    if (!codeChallengeMethod || codeChallengeMethod !== 'S256') {
      return {
        valid: false,
        response: NextResponse.json(
          {
            error: OAuth2ErrorTypes.INVALID_REQUEST,
            error_description: 'code_challenge_method must be S256'
          },
          { status: 400 }
        )
      };
    }
    // Assuming PKCEUtils.validateCodeChallenge is available
    if (!PKCEUtils.validateCodeChallenge(codeChallenge)) {
      return {
        valid: false,
        response: NextResponse.json(
          {
            error: OAuth2ErrorTypes.INVALID_REQUEST,
            error_description: 'Invalid code_challenge format'
          },
          { status: 400 }
        )
      };
    }

    return {
      valid: true,
      pkceData: {
        codeChallenge,
        codeChallengeMethod
      }
    };
  }

  return { valid: true };
}

/**
 * 高级中间件装饰器 - OAuth令牌端点
 */
export function withOAuthTokenValidation(
  handler: (request: NextRequest, context: OAuthValidationResult['context']) => Promise<NextResponse>
) {
  return async function(request: NextRequest): Promise<NextResponse> {
    // First validation: basic parameters and grant_type
    const initialValidation = await validateOAuthRequest(request, {
      rateLimit: {
        maxRequests: 100,
        windowMs: 60000,
        keyType: 'ip'
      },
      requireClientAuth: true,
      auditAction: 'token_request',
      validateFormData: true,
      requiredParams: ['grant_type'],
      paramValidation: {
        grant_type: (value) => ['authorization_code', 'refresh_token', 'client_credentials', 'password'].includes(value)
      }
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
      const missingParams = grantSpecificRequiredParams.filter(param => !initialValidation.context!.params![param]);
      
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
            error_description: `Missing required parameters for ${grantType}: ${missingParams.join(', ')}`
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
  handler: (request: NextRequest, context: OAuthValidationResult['context']) => Promise<NextResponse>
) {
  return async function(request: NextRequest): Promise<NextResponse> {
    const validation = await validateOAuthRequest(request, {
      rateLimit: {
        maxRequests: 50,
        windowMs: 60000,
        keyType: 'ip'
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
        response_type: (value) => value === 'code'
        // client_id and redirect_uri will be validated further within the handler typically
      }
    });

    if (!validation.success || !validation.context) {
      return validation.response!;
    }
    
    // Additional validation for client based on validated client_id from params
    const client = await prisma.client.findUnique({ 
      where: { clientId: validation.context.params?.client_id } 
    });

    if (!client) {
      return NextResponse.json({ error: OAuth2ErrorTypes.INVALID_CLIENT, error_description: "Client not found" }, { status: 401 });
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
  handler: (request: NextRequest, context: OAuthValidationResult['context']) => Promise<NextResponse>
) {
  return async function(request: NextRequest): Promise<NextResponse> {
    const validation = await validateOAuthRequest(request, {
      rateLimit: {
        maxRequests: 50,
        windowMs: 60000,
        keyType: 'ip'
      },
      requireClientAuth: true, // Token revocation requires client auth
      auditAction: 'token_revocation',
      validateFormData: true,
      requiredParams: ['token']
    });

    if (!validation.success || !validation.context) {
      return validation.response!;
    }

    return handler(request, validation.context);
  };
}