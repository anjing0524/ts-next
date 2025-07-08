export { A as AccessTokenPayload, I as IdTokenPayload, b as JWTUtils, R as RefreshTokenPayload, g as getUserIdFromRequest } from './jwt-utils-BXzO0_Pg.js';
export { AuthorizationUtils, JWTOptions, JWTPayload, PKCEChallenge, PKCEUtils, PasswordComplexitySchema, PasswordHashResult, SALT_ROUNDS, ScopeUtils, ScopeValidationResult, TokenValidationResult, checkPasswordHistory, generateSecurePassword } from './auth/index.js';
export { AuthContext, AuthOptions, AuthenticatedRequest, CORSOptions, RateLimitOptions, ValidationOptions, ValidationResult, authenticateBearer, getCORSOptionsFromEnv, requirePermission, validatePKCE, validateRedirectUri, validateRequest, withAuth, withCORS, withDefaultCORS, withEnvCORS, withIPRateLimit, withOAuthRateLimit, withRateLimit, withUserRateLimit, withValidation } from './middleware/index.js';
export { PermissionService } from './services/permission-service.js';
export { PermissionCheckResult, RBACService, UserPermissions } from './services/rbac-service.js';
export { AuthenticationError, AuthorizationError, BaseError, ConfigurationError, CryptoError, OAuth2Error, OAuth2ErrorCode, ResourceNotFoundError, TokenError, TokenExpiredError, TokenGenerationError, TokenRevocationError, TokenValidationError, ValidationError } from './errors.js';
export { errorResponse, generateRequestId, successResponse } from './apiResponse.js';
export { ApiError, ApiErrorResponse, ApiResponse } from './types/api.js';
export { prisma } from '@repo/database';
export { RateLimitConfig, RateLimitResult, RateLimitUtils, createRateLimit, createRequestRateLimit, defaultRateLimiter } from './utils/rate-limit-utils.js';
export { RouteHandler, handleError, logError, safeExecute, withErrorHandler, withErrorHandling } from './utils/error-handler.js';
export { getTimeWheelInstance } from './utils/time-wheel.js';
import 'jose';
import 'next/server';
import '@prisma/client';
import 'zod';

/**
 * packages/lib/src/utils.ts
 * Utility functions module unified exports
 */

/**
 * Validates if the given string is a valid email address.
 * @param email The string to validate.
 * @returns True if the email is valid, false otherwise.
 */
declare function isValidEmail(email: string): boolean;

/**
 * OAuth2配置管理类
 * 统一管理OAuth相关配置，支持环境变量覆盖
 * @author 架构团队
 * @since 2.0.0
 */
/**
 * OAuth客户端配置接口
 */
interface OAuthClientConfig {
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
}
/**
 * OAuth服务端配置接口
 */
interface OAuthServiceConfig {
    serviceUrl: string;
    issuer: string;
    jwksUri: string;
}
/**
 * OAuth2配置管理类
 * 提供统一的配置获取接口，支持环境变量和默认值
 */
declare class OAuthConfig {
    /**
     * 获取OAuth服务URL
     * @returns OAuth服务的基础URL
     */
    static getServiceUrl(): string;
    /**
     * 获取OAuth客户端配置
     * @returns 客户端配置对象
     */
    static getClientConfig(): OAuthClientConfig;
    /**
     * 获取OAuth服务端配置
     * @returns 服务端配置对象
     */
    static getServiceConfig(): OAuthServiceConfig;
    /**
     * 获取完整的授权端点URL
     * @returns 授权端点URL
     */
    static getAuthorizeUrl(): string;
    /**
     * 获取完整的令牌端点URL
     * @returns 令牌端点URL
     */
    static getTokenUrl(): string;
    /**
     * 获取完整的用户信息端点URL
     * @returns 用户信息端点URL
     */
    static getUserInfoUrl(): string;
    /**
     * 获取完整的令牌撤销端点URL
     * @returns 令牌撤销端点URL
     */
    static getRevokeUrl(): string;
    /**
     * 检查配置是否为开发环境
     * @returns 是否为开发环境
     */
    static isDevelopment(): boolean;
    /**
     * 检查配置是否为生产环境
     * @returns 是否为生产环境
     */
    static isProduction(): boolean;
}
/**
 * 默认配置常量
 */
declare const DEFAULT_OAUTH_CONFIG: {
    readonly SERVICE_URL: "http://localhost:3001/datamgr_flow";
    readonly CLIENT_ID: "auth-center-admin-client";
    readonly CLIENT_SECRET: "authcenteradminclientsecret";
    readonly REDIRECT_URI: "http://localhost:3002/auth/callback";
    readonly SCOPES: readonly ["openid", "profile", "admin:full_access"];
};

/**
 * @repo/lib 包根级导出
 * Root level exports for @repo/lib package
 *
 * 统一导出所有共享模块
 * Unified exports for all shared modules
 */

declare const LIB_VERSION = "1.0.0";

export { DEFAULT_OAUTH_CONFIG, LIB_VERSION, type OAuthClientConfig, OAuthConfig, type OAuthServiceConfig, isValidEmail };
