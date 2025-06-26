/**
 * 通用中间件导出
 * Common middleware exports
 *
 * 这些中间件具有高度通用性，可在所有服务中复用
 * These middleware are highly reusable across all services
 */

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

// 基础验证中间件 (Basic validation middleware)
export {
  validateRequest,
  validateRedirectUri,
  validatePKCE,
  withValidation,
  type ValidationOptions,
  type ValidationResult,
} from './validation';
