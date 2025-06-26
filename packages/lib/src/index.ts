/**
 * @repo/lib 包根级导出
 * Root level exports for @repo/lib package
 *
 * 统一导出所有共享模块
 * Unified exports for all shared modules
 */

// 认证模块 (Authentication module)
export * from './auth';

// 服务模块 (Services module)
export * from './services';

// 工具模块 (Utils module)
export * from './utils';

// 通用中间件 (Common middleware)
export * from './middleware';

// 中间件模块 (Middleware module)
// export * from './middleware';

// 版本信息 (Version info)
export const LIB_VERSION = '1.0.0';

export * from './types'; // Exports from ./src/types.ts (barrel for ./src/types/*)
export * from './errors'; // Exports from ./src/errors.ts
// export * from './cache';       // Exports from ./src/cache.ts

// Re-export prisma from database package
export { prisma } from '@repo/database';
