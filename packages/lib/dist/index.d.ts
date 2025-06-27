/**
 * @repo/lib 包根级导出
 * Root level exports for @repo/lib package
 *
 * 统一导出所有共享模块
 * Unified exports for all shared modules
 */
export * from './auth';
export * from './middleware';
export * from './services';
export * from './utils';
export * from './errors';
export type { ApiResponse } from './apiResponse';
export { successResponse, errorResponse, generateRequestId } from './apiResponse';
export * from './types';
export declare const LIB_VERSION = "1.0.0";
export { prisma } from '@repo/database';
export { OAuthConfig, DEFAULT_OAUTH_CONFIG, type OAuthClientConfig, type OAuthServiceConfig, } from './config/oauth-config';
//# sourceMappingURL=index.d.ts.map