/**
 * 认证模块统一导出
 * Authentication module exports
 * 
 * 提供 OAuth2 认证相关的工具类和服务
 * Provides OAuth2 authentication utilities and services
 */

// 认证相关工具类 (Authentication utilities)
export { JWTUtils } from './jwt-utils';
export { PKCEUtils } from './pkce-utils';
export { ScopeUtils } from './scope-utils';
export { AuthorizationUtils } from './authorization-utils';

// 密码工具函数 (Password utility functions)
export * from './passwordUtils';

// 类型定义 (Type definitions)
export type {
  JWTPayload,
  JWTOptions,
  TokenValidationResult,
  PKCEChallenge,
  ScopeValidationResult,
  PasswordHashResult,
} from './types'; 