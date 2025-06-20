/**
 * lib/auth/index.ts
 * 认证授权模块统一导出
 * Authentication & Authorization module unified exports
 */

// === OAuth2相关工具 (OAuth2 Related Utils) ===
export * from './oauth2';

// === 授权码流程 (Authorization Code Flow) ===
export * from './authorizationCodeFlow';

// === 客户端凭证流程 (Client Credentials Flow) ===
export * from './clientCredentialsFlow';

// === 密码工具 (Password Utils) ===
export * from './passwordUtils';

// === 中间件 (Middleware) ===
export * from './middleware';