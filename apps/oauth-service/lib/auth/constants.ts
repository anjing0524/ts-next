/**
 * OAuth2 错误代码常量
 * OAuth 2.0 standard error code constants
 * 这些常量用于在发生错误时，向客户端返回标准化的错误信息
 * These constants are used to return standardized error information to clients when errors occur
 */
export const OAuth2ErrorTypes = {
  INVALID_REQUEST: 'invalid_request',
  INVALID_CLIENT: 'invalid_client',
  INVALID_GRANT: 'invalid_grant',
  UNAUTHORIZED_CLIENT: 'unauthorized_client',
  UNSUPPORTED_GRANT_TYPE: 'unsupported_grant_type',
  INVALID_SCOPE: 'invalid_scope',
  ACCESS_DENIED: 'access_denied',
  UNSUPPORTED_RESPONSE_TYPE: 'unsupported_response_type',
  SERVER_ERROR: 'server_error',
  TEMPORARILY_UNAVAILABLE: 'temporarily_unavailable',
} as const; // 'as const' 将对象的属性变为只读，并将其类型推断为字面量类型

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