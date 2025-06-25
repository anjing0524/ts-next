// 导入 Node.js 内置的 crypto 模块，用于加密操作
import crypto from 'crypto';

// 导入 Next.js 服务器相关的类型
import { NextRequest } from 'next/server';

// 导入 Prisma 客户端生成的类型，用于与数据库交互
import { User, OAuthClient as Client } from '@prisma/client';
// 导入 date-fns 库中的函数，用于日期和时间的操作，例如计算令牌的过期时间。
// Import functions from date-fns library for date and time operations, e.g., calculating token expiration.
import { addHours, addDays } from 'date-fns';
// 导入 jose 库，用于处理 JWT (JSON Web Tokens) 的签名、验证和编解码。
// Import jose library for handling JWT (JSON Web Tokens) signing, verification, and decoding.
import * as jose from 'jose';

// 导入共享的 Prisma 客户端实例。
// Import shared Prisma client instance.
import { prisma } from 'lib/prisma';
// 导入权限服务，用于获取用户权限等。
// Import PermissionService for fetching user permissions, etc.
import { permissionServiceInstance as permissionService } from 'lib/services/permissionService';
// 导入自定义错误类 (Import custom error classes)
import { OAuth2Error, OAuth2ErrorCode, ConfigurationError, BaseError } from '../errors';

// 导入并re-export工具类 (Import and re-export utility classes)
import { JWTUtils } from './utils/jwt-utils';
import { ClientAuthUtils } from './utils/client-auth-utils';
import { AuthorizationUtils } from './utils/authorization-utils';
import { RateLimitUtils } from './utils/rate-limit-utils';
export { JWTUtils } from './utils/jwt-utils';
export { ClientAuthUtils } from './utils/client-auth-utils';
export { AuthorizationUtils } from './utils/authorization-utils';
export { RateLimitUtils } from './utils/rate-limit-utils';
export type { RefreshTokenPayload } from './utils/jwt-utils';

// OAuth 2.0 标准错误代码常量。 (OAuth 2.0 standard error code constants.)
// 这些常量用于在发生错误时，向客户端返回标准化的错误信息。 (These constants are used to return standardized error information to clients when errors occur.)
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
} as const; // 'as const' 将对象的属性变为只读，并将其类型推断为字面量类型。 ('as const' makes object properties readonly and infers their types as literal types.)

/**
 * PKCE (Proof Key for Code Exchange) 工具类。
 * (PKCE (Proof Key for Code Exchange) utility class.)
 * PKCE (RFC 7636) 是一种用于增强 OAuth 2.0 公共客户端 (如移动应用和单页应用) 安全性的机制，
 * (PKCE (RFC 7636) is a mechanism to enhance the security of OAuth 2.0 public clients (like mobile apps and SPAs),)
 * 主要用于防止授权码拦截攻击。
 * (primarily used to prevent authorization code interception attacks.)
 */
export class PKCEUtils {
  /**
   * 生成一个符合 RFC 7636 规范的随机 code_verifier。
   * (Generates a random code_verifier compliant with RFC 7636.)
   * @returns 返回一个 Base64URL 编码的随机字符串，长度通常为43-128个字符。
   * (Returns a Base64URL encoded random string, typically 43-128 characters long.)
   */
  static generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * 根据给定的 code_verifier 和指定的转换方法 (默认为 S256) 生成 code_challenge。
   * (Generates a code_challenge from a given code_verifier and specified transformation method (defaults to S256).)
   * @param verifier - 客户端生成的 code_verifier。 (Client-generated code_verifier.)
   * @returns 返回计算得到的 code_challenge (Base64URL 编码)。 (Returns the calculated code_challenge (Base64URL encoded).)
   */
  static generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * 验证提供的 code_verifier 是否与预期的 code_challenge 匹配。
   * (Verifies if the provided code_verifier matches the expected code_challenge.)
   * @param verifier - 客户端在令牌请求中提供的 code_verifier。 (code_verifier provided by the client in the token request.)
   * @param challenge - 授权服务器在授权请求阶段存储的 code_challenge。 (code_challenge stored by the authorization server during the authorization request phase.)
   * @param method - 生成 code_challenge 时使用的方法，默认为 'S256'。目前通常只支持 'S256'。
   * (Method used to generate code_challenge, defaults to 'S256'. Currently, typically only 'S256' is supported.)
   * @returns 如果验证成功则返回 true，否则返回 false。 (Returns true if verification is successful, false otherwise.)
   */
  static verifyCodeChallenge(
    verifier: string,
    challenge: string,
    method: string = 'S256'
  ): boolean {
    if (method !== 'S256') {
      console.warn(`PKCEUtils: Unsupported code_challenge_method: ${method}`);
      return false;
    }
    const calculatedChallenge = this.generateCodeChallenge(verifier);
    return calculatedChallenge === challenge;
  }

  /**
   * 验证 code_challenge 字符串的格式是否符合 RFC 7636 规范。
   * (Validates if the code_challenge string format complies with RFC 7636.)
   * @param challenge - 要验证的 code_challenge 字符串。 (The code_challenge string to validate.)
   * @returns 如果格式有效则返回 true，否则返回 false。 (Returns true if the format is valid, false otherwise.)
   */
  static validateCodeChallenge(challenge: string): boolean {
    return /^[A-Za-z0-9\-._~]{43,128}$/.test(challenge);
  }

  /**
   * 验证 code_verifier 字符串的格式是否符合 RFC 7636 规范。
   * (Validates if the code_verifier string format complies with RFC 7636.)
   * @param verifier - 要验证的 code_verifier 字符串。 (The code_verifier string to validate.)
   * @returns 如果格式有效则返回 true，否则返回 false。 (Returns true if the format is valid, false otherwise.)
   */
  static validateCodeVerifier(verifier: string): boolean {
    return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
  }
}

/**
 * Scope (权限范围) 工具类。
 * (Scope utility class.)
 * Scope 用于定义客户端可以请求访问哪些受保护资源的权限。
 * (Scope is used to define permissions a client can request to access protected resources.)
 */
export class ScopeUtils {
  /**
   * 将以空格分隔的 scope 字符串解析为字符串数组。
   * (Parses a space-separated scope string into an array of strings.)
   * @param scopeString - 包含一个或多个 scope 的字符串。 (String containing one or more scopes.)
   * @returns 返回一个包含各个 scope 的字符串数组。 (Returns an array of strings, each being a scope.)
   */
  static parseScopes(scopeString?: string): string[] {
    if (!scopeString) return [];
    return scopeString.split(' ').filter((s) => s.length > 0);
  }

  /**
   * 将 scope 字符串数组格式化为以空格分隔的单个字符串。
   * (Formats an array of scope strings into a single space-separated string.)
   * @param scopes - 包含一个或多个 scope 的字符串数组。 (Array of strings containing one or more scopes.)
   * @returns 返回格式化后的 scope 字符串。 (Returns the formatted scope string.)
   */
  static formatScopes(scopes: string[]): string {
    return scopes.join(' ');
  }

  static async validateScopes(
    scopes: string[],
    client: Client
  ): Promise<{ valid: boolean; invalidScopes: string[]; error_description?: string }>;
  static validateScopes(
    requestedScopes: string[],
    allowedScopes: string[]
  ): { valid: boolean; invalidScopes: string[]; error_description?: string };
  /**
   * 验证请求的 scopes 是否有效。
   * (Validates if the requested scopes are valid.)
   */
  static validateScopes(
    scopes: string[],
    clientOrAllowedScopes: Client | string[]
  ):
    | Promise<{ valid: boolean; invalidScopes: string[]; error_description?: string }>
    | { valid: boolean; invalidScopes: string[]; error_description?: string } {
    if (scopes.length === 0) {
      return { valid: true, invalidScopes: [] };
    }

    if (Array.isArray(clientOrAllowedScopes)) {
      const invalidScopes = scopes.filter((scope) => !clientOrAllowedScopes.includes(scope));
      return {
        valid: invalidScopes.length === 0,
        invalidScopes,
        error_description: invalidScopes.length > 0 ? `Requested scope(s) not in allowed list: ${invalidScopes.join(', ')}` : undefined,
      };
    }

    const client = clientOrAllowedScopes as Client;

    return (async () => {
      let clientAllowedScopes: string[] = [];
      if (client.allowedScopes) {
        try {
          clientAllowedScopes = JSON.parse(client.allowedScopes as string);
          if (!Array.isArray(clientAllowedScopes)) clientAllowedScopes = [];
        } catch (e) {
          console.error('Failed to parse client.allowedScopes for client ID:', client.id, e);
          clientAllowedScopes = [];
        }
      }

      const invalidAgainstClientAllowed = scopes.filter(
        (scope) => !clientAllowedScopes.includes(scope)
      );
      if (invalidAgainstClientAllowed.length > 0) {
        return {
          valid: false,
          invalidScopes: invalidAgainstClientAllowed,
          error_description: `Requested scope(s) not allowed for this client: ${invalidAgainstClientAllowed.join(', ')}`,
        };
      }

      const validDbScopes = await prisma.scope.findMany({
        where: {
          name: { in: scopes },
          isActive: true,
        },
      });
      const validScopeNamesFromDb = validDbScopes.map((s) => s.name);
      const invalidOrInactiveScopes = scopes.filter(
        (scope) => !validScopeNamesFromDb.includes(scope)
      );

      if (invalidOrInactiveScopes.length > 0) {
        return {
          valid: false,
          invalidScopes: invalidOrInactiveScopes,
          error_description: `Requested scope(s) are invalid or inactive: ${invalidOrInactiveScopes.join(', ')}`,
        };
      }

      if (client.clientType === 'PUBLIC') {
        // 公开客户端的额外scope验证逻辑可以在此处添加
        // 目前暂时移除非公开scope的检查，因为schema中没有isPublic字段
      }
      return { valid: true, invalidScopes: [] };
    })();
  }

  /**
   * 检查用户拥有的 scopes 列表是否包含特定的必需 scope。
   * (Checks if the list of scopes owned by the user includes a specific required scope.)
   */
  static hasScope(userScopes: string[], requiredScope: string): boolean {
    return userScopes.includes(requiredScope);
  }

  /**
   * 检查用户拥有的 scopes 列表是否包含所列必需 scopes 中的任何一个。
   * (Checks if the list of scopes owned by the user includes any of the listed required scopes.)
   */
  static hasAnyScope(userScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.some((scope) => userScopes.includes(scope));
  }

  /**
   * 检查用户拥有的 scopes 列表是否包含所有指定的必需 scopes。
   * (Checks if the list of scopes owned by the user includes all specified required scopes.)
   */
  static hasAllScopes(userScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.every((scope) => userScopes.includes(scope));
  }
}

// 导入自定义的 ApiError 类，用于标准化的API错误处理。
// Import custom ApiError class for standardized API error handling.
// import { ApiError } from '../api/errorHandler'; // 已在顶部导入 BaseError, OAuth2Error 等 (Already imported BaseError, OAuth2Error etc. at the top)

/**
 * 封装刷新令牌 (refresh_token) 授权类型的核心处理逻辑。
 * (Encapsulates the core processing logic for the refresh_token grant type.)
 */
export async function processRefreshTokenGrantLogic(
  refreshTokenValue: string,
  requestedScope: string | undefined,
  client: Client,
  ipAddress?: string,
  userAgent?: string
): Promise<{
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  newRefreshToken: string;
  scope?: string;
}> {
  const verification = await JWTUtils.verifyRefreshToken(refreshTokenValue);
  if (!verification.valid || !verification.payload) {
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id,
      action: 'invalid_refresh_token_structure_signature',
      resource: 'oauth/token_logic_refresh',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: verification.error || 'Refresh token JWT verification failed (structure/signature).',
      metadata: { grantType: 'refresh_token', providedTokenValue: refreshTokenValue.substring(0, 20) + "..." },
    });
    throw new OAuth2Error( // 使用 OAuth2Error (Use OAuth2Error)
      verification.error || 'Invalid refresh token.',
      OAuth2ErrorCode.InvalidGrant, // 使用枚举 (Use enum)
      400
    );
  }

  const refreshTokenHashToVerify = JWTUtils.getTokenHash(refreshTokenValue);
  const storedRefreshToken = await prisma.refreshToken.findFirst({
    where: {
      tokenHash: refreshTokenHashToVerify,
      isRevoked: false,
      expiresAt: { gt: new Date() },
      clientId: client.id,
    },
  });

  if (!storedRefreshToken) {
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id,
      action: 'refresh_token_not_found_revoked_expired_or_mismatched_client',
      resource: 'oauth/token_logic_refresh',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'Refresh token not found in database, or it has been revoked, expired, or was not issued to this client.',
      metadata: { grantType: 'refresh_token', tokenHashAttempted: refreshTokenHashToVerify },
    });
    throw new OAuth2Error( // 使用 OAuth2Error (Use OAuth2Error)
      'Refresh token is invalid, expired, has been revoked, or was not issued to the authenticated client.',
      OAuth2ErrorCode.InvalidGrant,
      400
    );
  }

  const originalScopes = ScopeUtils.parseScopes(storedRefreshToken.scope ?? '');
  let finalGrantedScope = storedRefreshToken.scope ?? undefined;

  if (requestedScope) {
    const requestedScopeArray = ScopeUtils.parseScopes(requestedScope);
    const scopeValidation = ScopeUtils.validateScopes(requestedScopeArray, originalScopes);
    if (!scopeValidation.valid) {
      await AuthorizationUtils.logAuditEvent({
        clientId: client.id,
        userId: storedRefreshToken.userId ?? undefined,
        action: 'refresh_token_invalid_scope_requested',
        resource: 'oauth/token_logic_refresh',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: `Requested scope ('${requestedScope}') is invalid or exceeds originally granted scope ('${storedRefreshToken.scope}'). Invalid parts: ${scopeValidation.invalidScopes.join(', ')}`,
        metadata: { grantType: 'refresh_token', requestedScope, originalScope: storedRefreshToken.scope },
      });
      throw new OAuth2Error( // 使用 OAuth2Error (Use OAuth2Error)
        'Requested scope is invalid or exceeds the scope originally granted to the refresh token.',
        OAuth2ErrorCode.InvalidScope,
        400
      );
    }
    finalGrantedScope = requestedScope;
  }

  let permissions: string[] = [];
  if (storedRefreshToken.userId) {
    permissions = await AuthorizationUtils.getUserPermissions(storedRefreshToken.userId);
  }

  const newAccessToken = await JWTUtils.createAccessToken({
    client_id: client.clientId,
    user_id: storedRefreshToken.userId ?? undefined,
    scope: finalGrantedScope,
    permissions,
  });
  const newAccessTokenHash = JWTUtils.getTokenHash(newAccessToken);

  await prisma.accessToken.create({
    data: {
      token: newAccessToken,
      tokenHash: newAccessTokenHash,
      clientId: client.id,
      userId: storedRefreshToken.userId ?? undefined,
      scope: finalGrantedScope,
      expiresAt: addHours(new Date(), 1),
    },
  });

  const newRefreshTokenValue = await JWTUtils.createRefreshToken({
    client_id: client.clientId,
    user_id: storedRefreshToken.userId ?? undefined,
    scope: finalGrantedScope,
  });
  const newRefreshTokenHash = JWTUtils.getTokenHash(newRefreshTokenValue);

  await prisma.refreshToken.update({
    where: { id: storedRefreshToken.id },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
    },
  });

  await prisma.refreshToken.create({
    data: {
      token: newRefreshTokenValue,
      tokenHash: newRefreshTokenHash,
      clientId: client.id,
      userId: storedRefreshToken.userId ?? undefined,
      scope: finalGrantedScope,
      expiresAt: addDays(new Date(), 30),
      isRevoked: false,
      previousTokenId: storedRefreshToken.id,
    },
  });

  await AuthorizationUtils.logAuditEvent({
    clientId: client.id,
    userId: storedRefreshToken.userId ?? undefined,
    action: 'token_refreshed_successfully_logic',
    resource: 'oauth/token_logic_refresh',
    ipAddress,
    userAgent,
    success: true,
    metadata: {
      grantType: 'refresh_token',
      scope: finalGrantedScope,
      newAccessTokenHash_prefix: newAccessTokenHash.substring(0, 10),
      newRefreshTokenHash_prefix: newRefreshTokenHash.substring(0, 10),
      oldRefreshTokenId: storedRefreshToken.id,
    },
  });

  return {
    accessToken: newAccessToken,
    tokenType: 'Bearer',
    expiresIn: 3600,
    newRefreshToken: newRefreshTokenValue,
    scope: finalGrantedScope,
  };
}
