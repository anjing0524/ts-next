/**
 * @fileoverview
 * 这个文件作为 oauth-service 内部 lib 目录的入口点。
 * (This file serves as the entry point for the internal lib directory of oauth-service.)
 * 
 * 它重新导出共享的或特定于此应用的服务和工具类，以简化导入路径。
 * (It re-exports shared or app-specific services and utilities to simplify import paths.)
 * 
 * @deprecated 请直接从 `@repo/lib/*` 或具体模块导入，以获得更好的模块解析和类型推断。
 * (Please import directly from `@repo/lib/*` or specific modules for better module resolution and type inference.)
 */

// 应用特定的服务 (Application-specific services)
export { ClientService } from './services/client-service';

// 应用特定的类型定义 (Application-specific type definitions)
export * from './auth/types';

// 注意：共享功能请直接从 @repo/lib 导入
// Note: For shared functionality, import directly from @repo/lib
// 例如：import { JWTUtils, ScopeUtils, PKCEUtils } from '@repo/lib';
// 中间件：import { withOAuthTokenValidation } from '@repo/lib/middleware'; 