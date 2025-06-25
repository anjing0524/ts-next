// 文件路径: lib/auth/middleware/index.ts
// File path: lib/auth/middleware/index.ts
// 描述: 中间件模块统一导出
// Description: Unified export for middleware modules

// Bearer认证中间件 (Bearer authentication middleware)
export {
  authenticateBearer,
  withAuth,
  requirePermission,
  type AuthenticatedRequest,
  type AuthContext,
  type AuthOptions,
} from './bearer-auth';

// CORS中间件 (CORS middleware)
export {
  withCORS,
  withDefaultCORS,
  withEnvCORS,
  getCORSOptionsFromEnv,
  type CORSOptions,
} from './cors';

// 速率限制中间件 (Rate limiting middleware)
export {
  withRateLimit,
  withOAuthRateLimit,
  withIPRateLimit,
  withUserRateLimit,
  type RateLimitOptions,
} from './rate-limit';

// OAuth验证中间件 (OAuth validation middleware)
export {
  validateOAuthRequest,
  validateOAuthScopes,
  validateOAuthRedirectUri,
  validateOAuthPKCE,
  withOAuthTokenValidation,
  withOAuthAuthorizeValidation,
  withOAuthRevokeValidation,
  withOAuthMiddleware,
  withOAuthEndpoint,
  withAuthEndpoint,
  withPublicEndpoint,
  withAdminEndpoint,
  type OAuthValidationOptions,
  type OAuthValidationResult,
  type OAuthMiddlewareOptions,
} from './validation';

// 便捷的组合中间件 (Convenient combined middleware)

/**
 * OAuth Token端点的完整中间件栈
 * Complete middleware stack for OAuth Token endpoint
 * 
 * @param handler - 处理函数
 * @returns 包装后的中间件函数
 */
export function withOAuthTokenEndpoint(
  handler: (request: NextRequest, context: any) => Promise<NextResponse>
) {
  return withCORS(
    withOAuthRateLimit(
      withOAuthTokenValidation(handler),
      60, // 每分钟60次请求 (60 requests per minute)
      60 * 1000 // 1分钟窗口 (1 minute window)
    )
  );
}

/**
 * OAuth Authorize端点的完整中间件栈
 * Complete middleware stack for OAuth Authorize endpoint
 * 
 * @param handler - 处理函数
 * @returns 包装后的中间件函数
 */
export function withOAuthAuthorizeEndpoint(
  handler: (request: NextRequest, context: any) => Promise<NextResponse>
) {
  return withCORS(
    withOAuthRateLimit(
      withOAuthAuthorizeValidation(handler),
      30, // 每分钟30次请求 (30 requests per minute)
      60 * 1000 // 1分钟窗口 (1 minute window)
    )
  );
}

/**
 * 受保护的API端点中间件栈
 * Protected API endpoint middleware stack
 * 
 * @param handler - 处理函数
 * @param options - 认证选项
 * @returns 包装后的中间件函数
 */
export function withProtectedEndpoint(
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>,
  options: AuthOptions = {}
) {
  return withCORS(
    withIPRateLimit(
      withAuth(handler, options),
      100, // 每15分钟100次请求 (100 requests per 15 minutes)
      15 * 60 * 1000 // 15分钟窗口 (15 minute window)
    )
  );
}

/**
 * 管理员API端点中间件栈
 * Admin API endpoint middleware stack
 * 
 * @param handler - 处理函数
 * @param requiredPermission - 必需的权限
 * @returns 包装后的中间件函数
 */
export function withAdminAPIEndpoint(
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>,
  requiredPermission: string
) {
  return withCORS(
    withIPRateLimit(
      withAuth(handler, {
        requiredPermissions: [requiredPermission],
        requireUserContext: true,
      }),
      50, // 每15分钟50次请求 (50 requests per 15 minutes)
      15 * 60 * 1000 // 15分钟窗口 (15 minute window)
    )
  );
}

// 重新导出必要的类型 (Re-export necessary types)
import type { NextRequest, NextResponse } from 'next/server';

// 导入必要的函数 (Import necessary functions)
import { withCORS } from './cors';
import { withOAuthRateLimit, withIPRateLimit } from './rate-limit';
import { withOAuthTokenValidation, withOAuthAuthorizeValidation } from './validation';
import { withAuth, type AuthContext, type AuthOptions } from './bearer-auth'; 