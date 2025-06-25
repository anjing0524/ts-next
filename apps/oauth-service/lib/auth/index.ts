/**
 * OAuth2 认证授权模块统一导出
 * OAuth2 Authentication & Authorization Module Exports
 * @author 认证团队
 * @since 1.0.0
 */

// PKCE 相关功能 - 重新导出PKCEUtils的静态方法
// PKCE functionality - re-export PKCEUtils static methods
import { PKCEUtils } from '@repo/lib';
export type { PKCEValidationResult } from '@repo/lib';

export const generateCodeVerifier = PKCEUtils.generateCodeVerifier;
export const generateCodeChallenge = PKCEUtils.generateCodeChallenge;
export const verifyCodeChallenge = PKCEUtils.verifyCodeChallenge;
export const isValidCodeVerifier = PKCEUtils.validateCodeVerifier;
export const isSupportedChallengeMethod = PKCEUtils.isSupportedChallengeMethod;
export const validatePKCEParams = PKCEUtils.validatePKCEParams;

// OAuth2 错误处理
export {
  OAuth2ErrorTypes,
  createOAuth2ErrorResponse,
  type OAuth2ErrorResponse
} from './oauth2-errors';

// OAuth2 类型定义
export {
  OAuth2ErrorCode,
  ClientType,
  GrantType,
  ResponseType,
  TokenEndpointAuthMethod
} from './types';

export type {
  AuthContext,
  AuthenticatedRequest
} from './types';

// OAuth2 认证中间件
export {
  authenticateBearer,
  withAuth,
  withCORS,
  withOAuthMiddleware,
  withOAuthEndpoint,
  withAuthEndpoint,
  withPublicEndpoint,
  withAdminEndpoint,
  requirePermission,
  validateOAuthRequest,
  validateOAuthScopes,
  validateOAuthRedirectUri,
  validateOAuthPKCE,
  withOAuthTokenValidation,
  withOAuthAuthorizeValidation,
  withOAuthRevokeValidation,
  type OAuthMiddlewareOptions,
  type OAuthValidationOptions,
  type OAuthValidationResult
} from './middleware/index'; 