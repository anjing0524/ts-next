// apps/admin-portal/src/lib/auth/token-storage.ts
// DEPRECATED: 使用新的增强型令牌存储
// 此文件仅用于向后兼容，实际功能已迁移到 enhanced-token-storage.ts

import { TokenStorageBackwardCompat } from './token-storage-backward-compat';

// 重新导出向后兼容的实现
export const TokenStorage = TokenStorageBackwardCompat;

// 保留类定义以支持命名导入
export { TokenStorageBackwardCompat };
