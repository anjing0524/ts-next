/**
 * lib/index.ts
 * 主导出文件 - 统一导出所有工具函数和模块
 * Main export file - unified exports for all utility functions and modules
 */

// === 核心工具函数 (Core Utilities) ===
export * from './utils/logger';
export * from './utils/error-handler';
export * from './utils/time-wheel';

// === 认证授权模块 (Authentication & Authorization) ===
export * from './auth/oauth2';
export * from './auth/authorizationCodeFlow';
export * from './auth/clientCredentialsFlow';
export * from './auth/passwordUtils';
export * from './auth/middleware';

// === 缓存模块 (Cache Module) ===
export * from './cache';

// === 服务模块 (Services) ===
export * from './services/permissionService';

// === API相关 (API Related) ===
export * from './api/apiResponse';

// === 错误处理 (Error Handling) ===
export * from './errors';

// === 数据库实例 (Database Instances) ===
export * from './instance/mysql-client';
export * from './instance/time-wheel';

// === Prisma客户端 (Prisma Client) ===
export { prisma } from './prisma';

// === 通用工具 (General Utils) ===
export * from './utils';
