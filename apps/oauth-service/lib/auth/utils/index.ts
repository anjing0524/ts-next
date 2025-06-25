// 文件路径: lib/auth/utils/index.ts
// File path: lib/auth/utils/index.ts
// 描述: 工具类统一导出
// Description: Unified export for utility classes

// 客户端认证工具类 (Client authentication utilities)
export * from './client-auth-utils';

// 授权工具类 (Authorization utilities) - 已迁移到 @repo/lib
// Authorization utilities - moved to @repo/lib
// 请使用: import { AuthorizationUtils } from '@/lib/auth/utils';
// Please use: import { AuthorizationUtils } from '@/lib/auth/utils';

// 重新导出常用类型 (Re-export common types)
export type { OAuthClient } from '@prisma/client';

// 以下工具类已迁移到 @repo/lib，请直接从那里导入
// The following utilities have been moved to @repo/lib, please import directly from there:
// - JWTUtils: import { JWTUtils } from '@repo/lib/auth';
// - RateLimitUtils: import { RateLimitUtils } from '@repo/lib/utils/rate-limit-utils';
// - ScopeUtils: import { ScopeUtils } from '@repo/lib/auth';
// - PKCEUtils: import { PKCEUtils } from '@repo/lib/auth';

// 认证工具类统一导出
// Authentication utilities unified exports

export { ClientAuthUtils } from './client-auth-utils';

// 重新导出 AuthorizationUtils
export { AuthorizationUtils } from '../../../../../packages/lib/src/auth/authorization-utils'; 