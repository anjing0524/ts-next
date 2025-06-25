/**
 * 认证模块统一导出
 * Authentication module exports
 *
 * 提供 OAuth2 认证相关的工具类和服务
 * Provides OAuth2 authentication utilities and services
 */
export { JWTUtils } from './jwt-utils';
export { PKCEUtils } from './pkce-utils';
export { ScopeUtils } from './scope-utils';
export { AuthorizationUtils } from './authorization-utils';
export * from './password-utils';
export type { JWTPayload, JWTOptions, TokenValidationResult, PKCEChallenge, ScopeValidationResult, PasswordHashResult, } from './types';
export type { RefreshTokenPayload, AccessTokenPayload, IdTokenPayload, } from './jwt-utils';
//# sourceMappingURL=index.d.ts.map