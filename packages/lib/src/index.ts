/**
 * @repo/lib 包根级导出
 * Root level exports for @repo/lib package
 *
 * 统一导出所有共享模块
 * Unified exports for all shared modules
 */

// 认证模块 (Authentication modules)
export * from './auth';

// 中间件模块 (Middleware modules)
export * from './middleware';

// 服务模块 (Service modules)
export * from './services';

// 工具模块 (Utility modules)
export * from './utils';

// 错误处理 (Error handling)
export * from './errors';

// API响应工具 (API response utilities)
export type { ApiResponse } from './apiResponse';

// API响应工具函数
export { successResponse, errorResponse, generateRequestId } from './apiResponse';

// 类型定义 (Type definitions)
export * from './types';

// 版本信息 (Version info)
export const LIB_VERSION = '1.0.0';

// export * from './cache';       // Exports from ./src/cache.ts

// Re-export prisma from database package
export { prisma } from '@repo/database';

// OAuth配置管理
export {
  OAuthConfig,
  DEFAULT_OAUTH_CONFIG,
  type OAuthClientConfig,
  type OAuthServiceConfig,
} from './config/oauth-config';
