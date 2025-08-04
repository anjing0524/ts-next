/**
 * OAuth2 错误定义已统一到 @repo/lib/errors 中
 * OAuth2 error definitions have been unified in @repo/lib/errors
 * 请使用 import { OAuth2ErrorCode } from '@repo/lib/errors'
 * Please use import { OAuth2ErrorCode } from '@repo/lib/errors'
 */

/**
 * 默认配置常量
 * Default configuration constants
 */
export const DefaultConfig = {
  ACCESS_TOKEN_TTL: 3600, // 1小时 (1 hour)
  REFRESH_TOKEN_TTL_DAYS: 30, // 30天 (30 days)
  AUTH_CODE_TTL: 600, // 10分钟 (10 minutes)
  RATE_LIMIT_MAX_REQUESTS: 100,
  RATE_LIMIT_WINDOW_MS: 60000, // 1分钟 (1 minute)
} as const;

/**
 * Cookie安全配置常量
 * Cookie security configuration constants
 */
export const CookieSecurityConfig = {
  HTTP_ONLY: true, // 防止XSS攻击
  SECURE: process.env.NODE_ENV === 'production', // 生产环境强制HTTPS
  SAME_SITE: 'lax' as const, // CSRF防护
  ACCESS_TOKEN_MAX_AGE: 3600, // 1小时
  REFRESH_TOKEN_MAX_AGE: 2592000, // 30天
  PATH: '/',
} as const;

/**
 * 环境变量配置键
 * Environment variable configuration keys
 */
export const EnvConfigKeys = {
  COOKIE_SECURE: 'COOKIE_SECURE',
  COOKIE_SAMESITE: 'COOKIE_SAMESITE',
  COOKIE_MAX_AGE: 'COOKIE_MAX_AGE',
  ACCESS_TOKEN_MAX_AGE: 'ACCESS_TOKEN_MAX_AGE',
  REFRESH_TOKEN_MAX_AGE: 'REFRESH_TOKEN_MAX_AGE',
} as const;

/**
 * 支持的授权类型
 * Supported grant types
 */
export const SupportedGrantTypes = {
  AUTHORIZATION_CODE: 'authorization_code',
  CLIENT_CREDENTIALS: 'client_credentials',
  REFRESH_TOKEN: 'refresh_token',
} as const;

/**
 * 支持的响应类型
 * Supported response types
 */
export const SupportedResponseTypes = {
  CODE: 'code',
} as const;

/**
 * PKCE 相关常量
 * PKCE related constants
 */
export const PKCEConstants = {
  CODE_CHALLENGE_METHOD_S256: 'S256',
  CODE_VERIFIER_MIN_LENGTH: 43,
  CODE_VERIFIER_MAX_LENGTH: 128,
} as const;
