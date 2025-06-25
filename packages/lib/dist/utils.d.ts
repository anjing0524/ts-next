/**
 * packages/lib/src/utils.ts
 * Utility functions module unified exports
 */
export * from './utils/logger';
export * from './utils/error-handler';
export * from './utils/time-wheel';
export * from './utils/rate-limit-utils';
export type { RateLimitResult, RateLimitConfig } from './utils/rate-limit-utils';
/**
 * Validates if the given string is a valid email address.
 * @param email The string to validate.
 * @returns True if the email is valid, false otherwise.
 */
export declare function isValidEmail(email: string): boolean;
//# sourceMappingURL=utils.d.ts.map