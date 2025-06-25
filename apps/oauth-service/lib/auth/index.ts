/**
 * OAuth2 认证授权模块统一导出
 * OAuth2 Authentication & Authorization Module Exports
 * @author 认证团队
 * @since 1.0.0
 */

// PKCE 相关功能 - 重新导出PKCEUtils的静态方法
// PKCE functionality - re-export PKCEUtils static methods
import { PKCEUtils } from '@repo/lib';

export const generateCodeVerifier = PKCEUtils.generateCodeVerifier;
export const generateCodeChallenge = PKCEUtils.generateCodeChallenge;
export const verifyCodeChallenge = PKCEUtils.verifyCodeChallenge;
export const isValidCodeVerifier = PKCEUtils.validateCodeVerifier;
export const isSupportedChallengeMethod = PKCEUtils.isSupportedChallengeMethod;
export const validatePKCEParams = PKCEUtils.validatePKCEParams;

// OAuth2 错误处理已统一到 @repo/lib/errors
// OAuth2 error handling has been unified in @repo/lib/errors
// 请使用 import { OAuth2ErrorCode, OAuth2Error } from '@repo/lib/errors'
// Please use import { OAuth2ErrorCode, OAuth2Error } from '@repo/lib/errors'

// OAuth2 类型定义（OAuth2ErrorCode已移至@repo/lib/errors）
export {
  ClientType,
  GrantType,
  ResponseType,
  TokenEndpointAuthMethod
} from './types';

export type {
  AuthContext,
  AuthenticatedRequest
} from './types';

// OAuth2 认证中间件已移至 @repo/lib/middleware
// OAuth2 authentication middleware has been moved to @repo/lib/middleware
// 请使用 import { // authenticateBearer 已移至 @repo/lib/middleware, withAuth, withCORS } from '@repo/lib/middleware'
// Please use import { // authenticateBearer 已移至 @repo/lib/middleware, withAuth, withCORS } from '@repo/lib/middleware'

// OAuth2 业务逻辑函数 (OAuth2 Business Logic Functions)
export { storeAuthorizationCode, validateAuthorizationCode } from './authorization-code-flow';
export { authenticateClient, grantClientCredentialsToken } from './client-credentials-flow';
export type { AuthenticatedClient } from './client-credentials-flow'; 