import { NextRequest, NextResponse } from 'next/server';

/**
 * 为 requirePermission 定义请求类型扩展
 * Define request type extension for requirePermission
 * 这允许我们将用户信息附加到 NextRequest
 * This allows attaching user info to NextRequest
 */
interface AuthenticatedRequest extends NextRequest {
    user?: {
        id: string;
        userId?: string;
        username?: string;
        clientId?: string;
        permissions?: string[];
        [key: string]: any;
    };
}
/**
 * 认证上下文接口
 * Authentication context interface
 */
interface AuthContext {
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
interface AuthOptions {
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
declare function authenticateBearer(request: NextRequest, options?: AuthOptions): Promise<{
    success: boolean;
    context?: AuthContext;
    response?: NextResponse;
}>;
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
declare function withAuth<T extends {
    params?: any;
}>(handler: (request: NextRequest, context: {
    authContext: AuthContext;
    params: T['params'];
}) => Promise<NextResponse>, options?: AuthOptions): (request: NextRequest, routeContext?: T) => Promise<NextResponse>;
/**
 * 权限检查中间件
 * Permission check middleware
 *
 * @param requiredPermission - 必需的权限
 * @returns 权限检查中间件函数
 */
declare function requirePermission(requiredPermission: string): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;

/**
 * CORS中间件配置选项
 * CORS middleware configuration options
 */
interface CORSOptions {
    /** 允许的源域名 (Allowed origins) */
    allowedOrigins?: string[];
    /** 允许的HTTP方法 (Allowed HTTP methods) */
    allowedMethods?: string[];
    /** 允许的请求头 (Allowed headers) */
    allowedHeaders?: string[];
    /** 是否允许携带凭证 (Allow credentials) */
    allowCredentials?: boolean;
    /** 预检请求缓存时间 (Preflight cache time) */
    maxAge?: number;
}
/**
 * CORS中间件包装器
 * CORS middleware wrapper
 *
 * @param handler - 处理函数
 * @param options - CORS配置选项
 * @returns 包装后的中间件函数
 */
declare function withCORS(handler: (request: NextRequest) => Promise<NextResponse>, options?: CORSOptions): (request: NextRequest) => Promise<NextResponse>;
/**
 * 简化的CORS中间件，使用默认配置
 * Simplified CORS middleware with default configuration
 *
 * @param handler - 处理函数
 * @returns 包装后的中间件函数
 */
declare function withDefaultCORS(handler: (request: NextRequest) => Promise<NextResponse>): (request: NextRequest) => Promise<NextResponse>;
/**
 * 获取环境变量中配置的CORS选项
 * Get CORS options from environment variables
 *
 * @returns CORS配置选项
 */
declare function getCORSOptionsFromEnv(): CORSOptions;
/**
 * 环境配置的CORS中间件
 * Environment-configured CORS middleware
 *
 * @param handler - 处理函数
 * @returns 包装后的中间件函数
 */
declare function withEnvCORS(handler: (request: NextRequest) => Promise<NextResponse>): (request: NextRequest) => Promise<NextResponse>;

/**
 * 速率限制选项接口
 * Rate limit options interface
 */
interface RateLimitOptions {
    /** 时间窗口内最大请求数 (Maximum requests per time window) */
    maxRequests: number;
    /** 时间窗口大小(毫秒) (Time window size in milliseconds) */
    windowMs: number;
    /** 速率限制键类型 (Rate limit key type) */
    keyType: 'ip' | 'client' | 'user' | 'custom';
    /** 自定义键生成函数 (Custom key generator function) */
    keyGenerator?: (request: NextRequest) => string;
    /** 超出限制时的响应消息 (Response message when limit exceeded) */
    message?: string;
    /** 是否包含剩余请求数头部 (Include remaining requests headers) */
    includeHeaders?: boolean;
    /** 是否跳过速率限制 (Skip rate limiting) */
    skip?: (request: NextRequest) => boolean;
    /** 自定义错误响应 (Custom error response) */
    onLimitReached?: (request: NextRequest, retryAfter: number) => NextResponse;
}
/**
 * 速率限制中间件
 * Rate limiting middleware
 *
 * @param handler - 处理函数
 * @param options - 速率限制选项
 * @returns 包装后的中间件函数
 */
declare function withRateLimit(handler: (request: NextRequest) => Promise<NextResponse>, options?: Partial<RateLimitOptions>): (request: NextRequest) => Promise<NextResponse>;
/**
 * OAuth端点速率限制中间件
 * OAuth endpoint rate limiting middleware
 *
 * @param handler - 处理函数
 * @param maxRequests - 最大请求数
 * @param windowMs - 时间窗口
 * @returns 包装后的中间件函数
 */
declare function withOAuthRateLimit(handler: (request: NextRequest) => Promise<NextResponse>, maxRequests?: number, windowMs?: number): (request: NextRequest) => Promise<NextResponse>;
/**
 * 基于IP的速率限制中间件
 * IP-based rate limiting middleware
 *
 * @param handler - 处理函数
 * @param maxRequests - 最大请求数
 * @param windowMs - 时间窗口
 * @returns 包装后的中间件函数
 */
declare function withIPRateLimit(handler: (request: NextRequest) => Promise<NextResponse>, maxRequests?: number, windowMs?: number): (request: NextRequest) => Promise<NextResponse>;
/**
 * 基于用户的速率限制中间件
 * User-based rate limiting middleware
 *
 * @param handler - 处理函数
 * @param maxRequests - 最大请求数
 * @param windowMs - 时间窗口
 * @returns 包装后的中间件函数
 */
declare function withUserRateLimit(handler: (request: NextRequest) => Promise<NextResponse>, maxRequests?: number, windowMs?: number): (request: NextRequest) => Promise<NextResponse>;

/**
 * 基础验证选项接口
 * Basic validation options interface
 */
interface ValidationOptions {
    /** 速率限制配置 (Rate limit configuration) */
    rateLimit?: {
        maxRequests: number;
        windowMs: number;
        keyType: 'ip' | 'client';
    };
    /** 是否验证请求体格式 (Validate form data format) */
    validateFormData?: boolean;
    /** 必需的请求参数 (Required request parameters) */
    requiredParams?: string[];
    /** 可选的请求参数验证规则 (Optional parameter validation rules) */
    paramValidation?: Record<string, (value: string) => boolean>;
}
/**
 * 验证结果接口
 * Validation result interface
 */
interface ValidationResult {
    success: boolean;
    response?: NextResponse;
    context?: {
        body?: FormData;
        ipAddress?: string;
        userAgent?: string;
        params?: Record<string, string>;
    };
}
/**
 * 基础请求验证函数
 * Basic request validation function
 *
 * @param request - Next.js请求对象
 * @param options - 验证选项
 * @returns 验证结果
 */
declare function validateRequest(request: NextRequest, options?: ValidationOptions): Promise<ValidationResult>;
/**
 * OAuth重定向URI验证函数
 * OAuth redirect URI validation function
 *
 * @param redirectUri - 重定向URI
 * @param registeredUris - 注册的URI列表
 * @returns 验证结果
 */
declare function validateRedirectUri(redirectUri: string, registeredUris: string[]): {
    valid: boolean;
    response?: NextResponse;
};
/**
 * OAuth PKCE验证函数
 * OAuth PKCE validation function
 *
 * @param codeChallenge - 代码挑战
 * @param codeChallengeMethod - 代码挑战方法
 * @param required - 是否必需
 * @returns 验证结果
 */
declare function validatePKCE(codeChallenge?: string, codeChallengeMethod?: string, required?: boolean): {
    valid: boolean;
    response?: NextResponse;
    pkceData?: {
        codeChallenge: string;
        codeChallengeMethod: string;
    };
};
/**
 * 基础验证中间件包装器
 * Basic validation middleware wrapper
 *
 * @param handler - 处理函数
 * @param options - 验证选项
 * @returns 包装后的中间件函数
 */
declare function withValidation(handler: (request: NextRequest, context: ValidationResult['context']) => Promise<NextResponse>, options?: ValidationOptions): (request: NextRequest) => Promise<NextResponse>;

export { type AuthContext, type AuthOptions, type AuthenticatedRequest, type CORSOptions, type RateLimitOptions, type ValidationOptions, type ValidationResult, authenticateBearer, getCORSOptionsFromEnv, requirePermission, validatePKCE, validateRedirectUri, validateRequest, withAuth, withCORS, withDefaultCORS, withEnvCORS, withIPRateLimit, withOAuthRateLimit, withRateLimit, withUserRateLimit, withValidation };
