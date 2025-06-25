// 文件路径: lib/auth/utils/index.ts
// File path: lib/auth/utils/index.ts
// 描述: 工具类统一导出
// Description: Unified export for utility classes

// 客户端认证工具类 (Client authentication utilities)
export * from './client-auth-utils';

// 重新导出常用类型 (Re-export common types)
export type { OAuthClient } from '@prisma/client';

// === 重要说明 ===
// 以下工具类已迁移到 @repo/lib，请直接从那里导入：
// The following utilities have been moved to @repo/lib, please import directly from there:
//
// 认证相关工具 (Authentication utilities):
// import { AuthorizationUtils, JWTUtils, PKCEUtils, ScopeUtils } from '@repo/lib';
//
// 通用工具 (General utilities):
// import { isValidEmail, RateLimitUtils } from '@repo/lib';
//
// 服务 (Services):
// import { RBACService, PermissionService } from '@repo/lib';
//
// 中间件 (Middleware):
// import { bearerAuth, corsMiddleware } from '@repo/lib';

// 本地工具类 (Local utilities)
export { ClientAuthUtils } from './client-auth-utils'; 