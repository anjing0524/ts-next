import {
  authenticateBearer,
  getCORSOptionsFromEnv,
  isValidEmail,
  requirePermission,
  validatePKCE,
  validateRedirectUri,
  validateRequest,
  withAuth,
  withCORS,
  withDefaultCORS,
  withEnvCORS,
  withIPRateLimit,
  withOAuthRateLimit,
  withRateLimit,
  withUserRateLimit,
  withValidation
} from "./chunk-J6AUQBGH.js";
import {
  RateLimitUtils,
  createRateLimit,
  createRequestRateLimit,
  defaultRateLimiter
} from "./chunk-QHAE2ODG.js";
import {
  getTimeWheelInstance
} from "./chunk-XDDOLORQ.js";
import {
  PermissionService
} from "./chunk-SXSNMYWH.js";
import {
  errorResponse,
  generateRequestId,
  successResponse
} from "./chunk-T754J6SC.js";
import {
  handleError,
  logError,
  safeExecute,
  withErrorHandler,
  withErrorHandling
} from "./chunk-2ZJ4ODNT.js";
import "./chunk-73TYBV5Q.js";
import {
  AuthenticationError,
  AuthorizationError,
  BaseError,
  ConfigurationError,
  CryptoError,
  OAuth2Error,
  OAuth2ErrorCode,
  ResourceNotFoundError,
  TokenError,
  TokenExpiredError,
  TokenGenerationError,
  TokenRevocationError,
  TokenValidationError,
  ValidationError
} from "./chunk-TYU2ECFL.js";
import {
  AuthorizationUtils,
  PKCEUtils,
  PasswordComplexitySchema,
  SALT_ROUNDS,
  ScopeUtils,
  checkPasswordHistory,
  generateSecurePassword
} from "./chunk-6TTHARAS.js";
import {
  RBACService
} from "./chunk-ED3FTDWD.js";
import {
  JWTUtils,
  getUserIdFromRequest
} from "./chunk-2B7PSWQZ.js";

// src/index.ts
import { prisma } from "@repo/database";

// src/config/oauth-config.ts
var OAuthConfig = class {
  /**
   * 获取OAuth服务URL
   * @returns OAuth服务的基础URL
   */
  static getServiceUrl() {
    return process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || "http://localhost:3001/datamgr_flow";
  }
  /**
   * 获取OAuth客户端配置
   * @returns 客户端配置对象
   */
  static getClientConfig() {
    const getRedirectUri = () => {
      if (typeof window !== "undefined") {
        return `${window.location.origin}/auth/callback`;
      }
      return process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI || "http://localhost:3002/auth/callback";
    };
    return {
      clientId: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || "auth-center-admin-client",
      clientSecret: process.env.OAUTH_CLIENT_SECRET || "authcenteradminclientsecret",
      redirectUri: getRedirectUri()
    };
  }
  /**
   * 获取OAuth服务端配置
   * @returns 服务端配置对象
   */
  static getServiceConfig() {
    const serviceUrl = this.getServiceUrl();
    return {
      serviceUrl,
      issuer: process.env.JWT_ISSUER || serviceUrl,
      jwksUri: `${serviceUrl}/.well-known/jwks.json`
    };
  }
  /**
   * 获取完整的授权端点URL
   * @returns 授权端点URL
   */
  static getAuthorizeUrl() {
    return `${this.getServiceUrl()}/api/v2/oauth/authorize`;
  }
  /**
   * 获取完整的令牌端点URL
   * @returns 令牌端点URL
   */
  static getTokenUrl() {
    return `${this.getServiceUrl()}/api/v2/oauth/token`;
  }
  /**
   * 获取完整的用户信息端点URL
   * @returns 用户信息端点URL
   */
  static getUserInfoUrl() {
    return `${this.getServiceUrl()}/api/v2/oauth/userinfo`;
  }
  /**
   * 获取完整的令牌撤销端点URL
   * @returns 令牌撤销端点URL
   */
  static getRevokeUrl() {
    return `${this.getServiceUrl()}/api/v2/oauth/revoke`;
  }
  /**
   * 检查配置是否为开发环境
   * @returns 是否为开发环境
   */
  static isDevelopment() {
    return process.env.NODE_ENV === "development";
  }
  /**
   * 检查配置是否为生产环境
   * @returns 是否为生产环境
   */
  static isProduction() {
    return process.env.NODE_ENV === "production";
  }
};
var DEFAULT_OAUTH_CONFIG = {
  SERVICE_URL: "http://localhost:3001/datamgr_flow",
  CLIENT_ID: "auth-center-admin-client",
  CLIENT_SECRET: "authcenteradminclientsecret",
  REDIRECT_URI: "http://localhost:3002/auth/callback",
  SCOPES: ["openid", "profile", "admin:full_access"]
};

// src/index.ts
var LIB_VERSION = "1.0.0";
export {
  AuthenticationError,
  AuthorizationError,
  AuthorizationUtils,
  BaseError,
  ConfigurationError,
  CryptoError,
  DEFAULT_OAUTH_CONFIG,
  JWTUtils,
  LIB_VERSION,
  OAuth2Error,
  OAuth2ErrorCode,
  OAuthConfig,
  PKCEUtils,
  PasswordComplexitySchema,
  PermissionService,
  RBACService,
  RateLimitUtils,
  ResourceNotFoundError,
  SALT_ROUNDS,
  ScopeUtils,
  TokenError,
  TokenExpiredError,
  TokenGenerationError,
  TokenRevocationError,
  TokenValidationError,
  ValidationError,
  authenticateBearer,
  checkPasswordHistory,
  createRateLimit,
  createRequestRateLimit,
  defaultRateLimiter,
  errorResponse,
  generateRequestId,
  generateSecurePassword,
  getCORSOptionsFromEnv,
  getTimeWheelInstance,
  getUserIdFromRequest,
  handleError,
  isValidEmail,
  logError,
  prisma,
  requirePermission,
  safeExecute,
  successResponse,
  validatePKCE,
  validateRedirectUri,
  validateRequest,
  withAuth,
  withCORS,
  withDefaultCORS,
  withEnvCORS,
  withErrorHandler,
  withErrorHandling,
  withIPRateLimit,
  withOAuthRateLimit,
  withRateLimit,
  withUserRateLimit,
  withValidation
};
//# sourceMappingURL=index.js.map