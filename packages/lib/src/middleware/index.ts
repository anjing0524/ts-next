/**
 * 通用中间件导出
 */

// CORS中间件
export {
  withCORS,
  withDefaultCORS,
  withEnvCORS,
  getCORSOptionsFromEnv,
  type CORSOptions,
} from './cors';

// 速率限制中间件
export {
  withRateLimit,
  withOAuthRateLimit,
  withIPRateLimit,
  withUserRateLimit,
  type RateLimitOptions,
} from './rate-limit';

// 基础验证中间件
export {
  validateRequest,
  validateRedirectUri,
  validatePKCE,
  withValidation,
  type ValidationOptions,
  type ValidationResult,
} from './validation';
