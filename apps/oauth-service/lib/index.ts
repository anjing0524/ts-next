/**
 * OAuth Service 应用级统一导出
 * OAuth Service application-level exports
 * 
 * 提供应用特定的服务和重新导出共享模块
 * Provides application-specific services and re-exports shared modules
 */

// 重新导出共享模块 (Re-export shared modules)
export * from '@repo/lib';

// 应用特定的 OAuth2 相关模块 (Application-specific OAuth2 modules)
export * from './auth/oauth2';

// 应用特定的流程处理 (Application-specific flows)
export { storeAuthorizationCode, validateAuthorizationCode } from './auth/authorization-code-flow';
export { authenticateClient, grantClientCredentialsToken } from './auth/client-credentials-flow';

// 应用特定的工具类 (Application-specific utilities)
export { AuthorizationUtils } from './auth/utils';
export { ClientAuthUtils } from './auth/utils/client-auth-utils';

// OAuth2 错误类型 (OAuth2 error types)
export { OAuth2ErrorTypes } from './auth/oauth2-errors';

// 验证中间件 (Validation middleware)
export { withOAuthTokenValidation } from './auth/middleware/validation';

// 如果需要类型定义，请创建 types.ts 文件
// If type definitions are needed, please create types.ts file

// 类型定义 (Type definitions)
// 如果需要类型定义，请创建 types.ts 文件
// If type definitions are needed, please create types.ts file 