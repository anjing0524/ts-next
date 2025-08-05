/**
 * packages/lib/src/utils.ts
 * Utility functions module unified exports
 */

// === 日志工具 (Logger Utils) ===
export * from './utils/logger';

// === 错误处理 (Error Handling) ===
export * from './utils/error-handler';

// === 时间轮工具 (Time Wheel Utils) ===
export * from './utils';

// === MySQL 客户端工具 (MySQL Client Utils) ===
// mysql-client已迁移到@repo/database包

// 导出速率限制工具 (Export rate limiting utilities)
export * from './utils/rate-limit-utils';
export type { RateLimitResult, RateLimitConfig } from './utils/rate-limit-utils';

/**
 * Validates if the given string is a valid email address.
 * @param email The string to validate.
 * @returns True if the email is valid, false otherwise.
 */
export function isValidEmail(email: string): boolean {
  if (!email) {
    return false;
  }
  // A common, reasonably effective regex for email validation.
  // For production, consider more comprehensive validation or a library if needed.
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
