/**
 * @repo/lib 客户端安全入口点
 * Client-safe entry point for @repo/lib package
 *
 * 只导出可以在浏览器环境中安全使用的模块
 * Exports only modules that are safe to use in a browser environment
 */

// 认证模块 (部分客户端安全的)
export * from './auth/shared'; 
export { OAuthConfig, DEFAULT_OAUTH_CONFIG, type OAuthClientConfig, type OAuthServiceConfig } from './config/oauth-config';

// 浏览器专用工具
export * from './browser';

// 类型定义 (通常是安全的)
export * from './types';


// 错误处理 (如果是自定义错误类，通常是安全的)
export * from './errors';

// API响应工具 (如果是纯函数，通常是安全的)
export { successResponse, errorResponse, generateRequestId } from './apiResponse';
