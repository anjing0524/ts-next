// 文件路径: lib/auth/middleware/validation.ts
// File path: lib/auth/middleware/validation.ts
// 描述: OAuth 验证中间件
// Description: OAuth Validation Middleware

import { NextRequest, NextResponse } from 'next/server';
import { OAuthClient as Client } from '@prisma/client';
import { 
  ScopeUtils,
  AuthorizationUtils,
  RateLimitUtils,
  ClientAuthUtils,
  PKCEUtils,
} from '../utils';
import { OAuth2ErrorTypes, createOAuth2ErrorResponse } from '../oauth2-errors';

/**
 * OAuth验证选项接口
 * OAuth validation options interface
 */
export interface OAuthValidationOptions {
  /** 速率限制配置 (Rate limit configuration) */
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
    keyType: 'ip' | 'client';
  };
  /** 是否需要客户端认证 (Require client authentication) */
  requireClientAuth?: boolean;
  /** 审计日志动作名称 (Audit log action name) */
  auditAction?: string;
  /** 是否验证请求体格式 (Validate form data format) */
  validateFormData?: boolean;
  /** 必需的请求参数 (Required request parameters) */
  requiredParams?: string[];
  /** 可选的请求参数验证规则 (Optional parameter validation rules) */
  paramValidation?: Record<string, (value: string) => boolean>;
}

/**
 * OAuth验证结果接口
 * OAuth validation result interface
 */
export interface OAuthValidationResult {
  success: boolean;
  response?: NextResponse;
  context?: {
    body?: FormData;
    client?: Client;
    ipAddress?: string;
    userAgent?: string;
    params?: Record<string, string>;
  };
}

/**
 * OAuth中间件选项接口
 * OAuth middleware options interface
 */
export interface OAuthMiddlewareOptions {
  rateLimitKey?: string;
  maxRequests?: number;
  windowMs?: number;
  requireAuth?: boolean;
  auditAction?: string;
  skipRateLimit?: boolean;
}

/**
 * OAuth请求验证函数
 * OAuth request validation function
 * 
 * @param request - Next.js请求对象
 * @param options - 验证选项
 * @returns 验证结果
 */
export async function validateOAuthRequest(
  request: NextRequest,
  options: OAuthValidationOptions = {}
): Promise<OAuthValidationResult> {
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  // 速率限制检查 (Rate limit check)
  if (options.rateLimit) {
    const { maxRequests, windowMs, keyType } = options.rateLimit;
    const rateLimitKey = RateLimitUtils.getRateLimitKey(request, keyType);

    const rateLimitResult = await RateLimitUtils.checkRateLimit(rateLimitKey, maxRequests, windowMs);
    if (!rateLimitResult.allowed) {
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
            error: 'temporarily_unavailable',
            error_description: 'Rate limit exceeded',
          },
          { status: 429 }
        ),
      };
    }
  }

  let body: FormData | undefined;
  let client: Client | undefined;
  const params: Record<string, string> = {};

  // 解析请求体 (Parse request body)
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
        errorMessage: 'Failed to parse request body for client authentication or form data validation',
      });

      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'invalid_request',
            error_description: 'Failed to parse request body. Ensure it is application/x-www-form-urlencoded.',
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
  // Extract parameters (from query string or form data)
  if (options.requiredParams || options.paramValidation) {
    const { searchParams } = new URL(request.url);

    // 从query parameters提取 (Extract from query parameters)
    for (const [key, value] of searchParams.entries()) {
      params[key] = value;
    }

    // 从form data提取（如果存在）(Extract from form data if exists)
    if (body) {
      for (const [key, value] of body.entries()) {
        params[key] = value as string;
      }
    }
  }

  // 验证必需参数 (Validate required parameters)
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
            error: 'invalid_request',
            error_description: `Missing required parameters: ${missingParams.join(', ')}`,
          },
          { status: 400 }
        ),
      };
    }
  }

  // 自定义参数验证 (Custom parameter validation)
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
              error: 'invalid_request',
              error_description: `Invalid parameter: ${param}`,
            },
            { status: 400 }
          ),
        };
      }
    }
  }

  // 客户端认证 (Client authentication)
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
            error: 'invalid_request',
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
 * OAuth作用域验证函数
 * OAuth scope validation function
 * 
 * @param requestedScopes - 请求的作用域
 * @param client - 客户端信息
 * @param options - 验证选项
 * @returns 验证结果
 */
export async function validateOAuthScopes(
  requestedScopes: string[],
  client: Client,
  options: {
    auditAction?: string;
    ipAddress?: string;
    userAgent?: string;
  } = {}
): Promise<{ valid: boolean; response?: NextResponse; validScopes?: string[] }> {
  const scopeValidation = await ScopeUtils.validateScopes(requestedScopes, client);

  if (!scopeValidation.valid) {
    await AuthorizationUtils.logAuditEvent({
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
          error: 'invalid_scope',
          error_description: `Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`,
        },
        { status: 400 }
      ),
    };
  }

  return {
    valid: true,
    validScopes: scopeValidation.validScopes,
  };
}

/**
 * OAuth重定向URI验证函数
 * OAuth redirect URI validation function
 * 
 * @param redirectUri - 重定向URI
 * @param registeredUris - 注册的URI列表
 * @returns 验证结果
 */
export function validateOAuthRedirectUri(
  redirectUri: string,
  registeredUris: string[]
): { valid: boolean; response?: NextResponse } {
  if (!AuthorizationUtils.validateRedirectUri(redirectUri, registeredUris)) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Invalid redirect_uri parameter',
        },
        { status: 400 }
      ),
    };
  }

  return { valid: true };
}

/**
 * OAuth PKCE验证函数
 * OAuth PKCE validation function
 * 
 * @param codeChallenge - 代码挑战
 * @param codeChallengeMethod - 代码挑战方法
 * @param required - 是否必需
 * @returns 验证结果
 */
export function validateOAuthPKCE(
  codeChallenge?: string,
  codeChallengeMethod?: string,
  required = false
): {
  valid: boolean;
  response?: NextResponse;
  pkceData?: { codeChallenge: string; codeChallengeMethod: string };
} {
  // 如果不是必需的且没有提供，则跳过验证
  // If not required and not provided, skip validation
  if (!required && !codeChallenge) {
    return { valid: true };
  }

  // 如果是必需的但没有提供
  // If required but not provided
  if (required && !codeChallenge) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'PKCE code_challenge is required for this client',
        },
        { status: 400 }
      ),
    };
  }

  // 验证代码挑战格式
  // Validate code challenge format
  if (codeChallenge && !PKCEUtils.isValidCodeChallenge(codeChallenge)) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Invalid code_challenge format',
        },
        { status: 400 }
      ),
    };
  }

  // 验证代码挑战方法
  // Validate code challenge method
  const method = codeChallengeMethod || 'plain';
  if (!['plain', 'S256'].includes(method)) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Unsupported code_challenge_method',
        },
        { status: 400 }
      ),
    };
  }

  return {
    valid: true,
    pkceData: {
      codeChallenge: codeChallenge!,
      codeChallengeMethod: method,
    },
  };
}

/**
 * OAuth Token验证中间件
 * OAuth Token validation middleware
 * 
 * @param handler - 处理函数
 * @returns 包装后的中间件函数
 */
export function withOAuthTokenValidation(
  handler: (
    request: NextRequest,
    context: OAuthValidationResult['context']
  ) => Promise<NextResponse>
) {
  return async function tokenValidationMiddleware(request: NextRequest): Promise<NextResponse> {
    const validationResult = await validateOAuthRequest(request, {
      requireClientAuth: true,
      auditAction: 'oauth_token_request',
      validateFormData: true,
      requiredParams: ['grant_type'],
      paramValidation: {
        grant_type: (value) => ['authorization_code', 'client_credentials', 'refresh_token'].includes(value),
      },
    });

    if (!validationResult.success) {
      return validationResult.response!;
    }

    return handler(request, validationResult.context);
  };
}

/**
 * OAuth Authorize验证中间件
 * OAuth Authorize validation middleware
 * 
 * @param handler - 处理函数
 * @returns 包装后的中间件函数
 */
export function withOAuthAuthorizeValidation(
  handler: (
    request: NextRequest,
    context: OAuthValidationResult['context']
  ) => Promise<NextResponse>
) {
  return async function authorizeValidationMiddleware(request: NextRequest): Promise<NextResponse> {
    const validationResult = await validateOAuthRequest(request, {
      requireClientAuth: false, // 授权端点不需要客户端认证 (Authorize endpoint doesn't require client auth)
      auditAction: 'oauth_authorize_request',
      validateFormData: false,
      requiredParams: ['response_type', 'client_id'],
      paramValidation: {
        response_type: (value) => ['code', 'token'].includes(value),
        client_id: (value) => value.length > 0,
      },
    });

    if (!validationResult.success) {
      return validationResult.response!;
    }

    return handler(request, validationResult.context);
  };
}

/**
 * OAuth Revoke验证中间件
 * OAuth Revoke validation middleware
 * 
 * @param handler - 处理函数
 * @returns 包装后的中间件函数
 */
export function withOAuthRevokeValidation(
  handler: (
    request: NextRequest,
    context: OAuthValidationResult['context']
  ) => Promise<NextResponse>
) {
  return async function revokeValidationMiddleware(request: NextRequest): Promise<NextResponse> {
    const validationResult = await validateOAuthRequest(request, {
      requireClientAuth: true,
      auditAction: 'oauth_revoke_request',
      validateFormData: true,
      requiredParams: ['token'],
      paramValidation: {
        token: (value) => value.length > 0,
        token_type_hint: (value) => ['access_token', 'refresh_token'].includes(value),
      },
    });

    if (!validationResult.success) {
      return validationResult.response!;
    }

    return handler(request, validationResult.context);
  };
}

/**
 * OAuth中间件通用包装器
 * OAuth middleware generic wrapper
 * 
 * @param handler - 处理函数
 * @param options - 中间件选项
 * @returns 包装后的中间件函数
 */
export function withOAuthMiddleware(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: OAuthMiddlewareOptions = {}
) {
  return async function middlewareHandler(request: NextRequest): Promise<NextResponse> {
    // 速率限制检查 (Rate limit check)
    if (!options.skipRateLimit) {
      const maxRequests = options.maxRequests || 100;
      const windowMs = options.windowMs || 15 * 60 * 1000; // 15分钟 (15 minutes)
      const rateLimitKey = options.rateLimitKey || `rate_limit:${request.ip || 'unknown'}`;

      const rateLimitResult = await RateLimitUtils.checkRateLimit(rateLimitKey, maxRequests, windowMs);
      if (!rateLimitResult.allowed) {
        return NextResponse.json(
          {
            error: 'temporarily_unavailable',
            error_description: 'Rate limit exceeded',
          },
          { status: 429 }
        );
      }
    }

    // 审计日志 (Audit logging)
    if (options.auditAction) {
      const ipAddress = request.headers.get('x-forwarded-for') || undefined;
      const userAgent = request.headers.get('user-agent') || undefined;

      await AuthorizationUtils.logAuditEvent({
        action: options.auditAction,
        resource: request.url,
        ipAddress,
        userAgent,
        success: true,
      });
    }

    return handler(request);
  };
}

/**
 * OAuth端点中间件
 * OAuth endpoint middleware
 * 
 * @param handler - 处理函数
 * @param auditAction - 审计动作
 * @param options - 中间件选项
 * @returns 包装后的中间件函数
 */
export function withOAuthEndpoint(
  handler: (request: NextRequest) => Promise<NextResponse>,
  auditAction: string,
  options: Partial<OAuthMiddlewareOptions> = {}
) {
  return withOAuthMiddleware(handler, {
    auditAction,
    maxRequests: 60,
    windowMs: 60 * 1000, // 1分钟 (1 minute)
    ...options,
  });
}

/**
 * 认证端点中间件
 * Auth endpoint middleware
 * 
 * @param handler - 处理函数
 * @param auditAction - 审计动作
 * @param options - 中间件选项
 * @returns 包装后的中间件函数
 */
export function withAuthEndpoint(
  handler: (request: NextRequest) => Promise<NextResponse>,
  auditAction: string,
  options: Partial<OAuthMiddlewareOptions> = {}
) {
  return withOAuthMiddleware(handler, {
    auditAction,
    requireAuth: true,
    maxRequests: 100,
    windowMs: 15 * 60 * 1000, // 15分钟 (15 minutes)
    ...options,
  });
}

/**
 * 公共端点中间件
 * Public endpoint middleware
 * 
 * @param handler - 处理函数
 * @param auditAction - 审计动作
 * @param options - 中间件选项
 * @returns 包装后的中间件函数
 */
export function withPublicEndpoint(
  handler: (request: NextRequest) => Promise<NextResponse>,
  auditAction: string,
  options: Partial<OAuthMiddlewareOptions> = {}
) {
  return withOAuthMiddleware(handler, {
    auditAction,
    requireAuth: false,
    maxRequests: 200,
    windowMs: 15 * 60 * 1000, // 15分钟 (15 minutes)
    ...options,
  });
}

/**
 * 管理员端点中间件
 * Admin endpoint middleware
 * 
 * @param handler - 处理函数
 * @param auditAction - 审计动作
 * @param options - 中间件选项
 * @returns 包装后的中间件函数
 */
export function withAdminEndpoint(
  handler: (request: NextRequest) => Promise<NextResponse>,
  auditAction: string,
  options: Partial<OAuthMiddlewareOptions> = {}
) {
  return withOAuthMiddleware(handler, {
    auditAction,
    requireAuth: true,
    maxRequests: 50,
    windowMs: 15 * 60 * 1000, // 15分钟 (15 minutes)
    ...options,
  });
} 