/**
 * 认证模块类型定义
 * Authentication module type definitions
 */

// JWT 相关类型
export interface JWTPayload {
  sub: string;
  iat: number;
  exp: number;
  aud?: string | string[];
  iss?: string;
  scope?: string;
  client_id?: string;
  user_id?: string;
  token_type?: string;
  jti?: string;
}

export interface JWTOptions {
  algorithm?: string;
  expiresIn?: string | number;
  audience?: string | string[];
  issuer?: string;
  subject?: string;
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
}

// PKCE 相关类型
export interface PKCEChallenge {
  codeChallenge: string;
  codeChallengeMethod: string;
  codeVerifier: string;
}

// 作用域验证结果
export interface ScopeValidationResult {
  valid: boolean;
  validScopes: string[];
  invalidScopes: string[];
}

// 密码哈希结果
export interface PasswordHashResult {
  hash: string;
  salt: string;
}
