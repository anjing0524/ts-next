// 导入 Node.js 内置的 crypto 模块，用于加密操作
import crypto from 'crypto';

// 导入 Next.js 服务器相关的类型
import { NextRequest, NextResponse } from 'next/server';

// 导入 Prisma 客户端生成的类型，用于与数据库交互
import { User, OAuthClient as Client, AuthorizationCode, AccessToken, RefreshToken } from '@prisma/client';
// 导入 date-fns 库中的函数，用于日期和时间的操作，例如计算令牌的过期时间。
// Import functions from date-fns library for date and time operations, e.g., calculating token expiration.
import { addHours, addDays } from 'date-fns';
// 导入 jose 库，用于处理 JWT (JSON Web Tokens) 的签名、验证和编解码。
// Import jose library for handling JWT (JSON Web Tokens) signing, verification, and decoding.
import * as jose from 'jose';

// 导入共享的 Prisma 客户端实例。
// Import shared Prisma client instance.
import { prisma } from '@/lib/prisma';
// 导入权限服务，用于获取用户权限等。
// Import PermissionService for fetching user permissions, etc.
import { permissionServiceInstance as permissionService } from '@/lib/services/permissionService';
// 导入自定义错误类 (Import custom error classes)
import { OAuth2Error, OAuth2ErrorCode, ConfigurationError, BaseError } from '../errors';

// 导入并re-export工具类 (Import and re-export utility classes)
import { JWTUtils, ScopeUtils } from '@repo/lib';
import { ClientAuthUtils } from './utils/client-auth-utils';
import { AuthorizationUtils } from './utils';

// 导出所有需要的工具类 (Export all required utility classes)
export { JWTUtils } from '@repo/lib';
export { ClientAuthUtils } from './utils/client-auth-utils';
export { AuthorizationUtils };

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

// PKCEUtils 类已迁移到 @repo/lib
// PKCEUtils class has been moved to @repo/lib
export { PKCEUtils } from '@repo/lib';

// ScopeUtils 类已迁移到 @repo/lib
// ScopeUtils class has been moved to @repo/lib
export { ScopeUtils } from '@repo/lib';

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
    token_type: 'refresh_token',
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
