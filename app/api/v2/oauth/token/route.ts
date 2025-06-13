// 文件路径: app/api/v2/oauth/token/route.ts
// 描述: OAuth 2.0 令牌端点

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { OAuthClient, User, AuthorizationCode, RefreshToken as PrismaRefreshToken, AccessToken as PrismaAccessToken } from '@prisma/client';
// ClientAuthUtils for client auth, AuthorizationUtils for user permissions
import { ClientAuthUtils, AuthorizationUtils, OAuth2ErrorTypes, PKCEUtils, ScopeUtils, JWTUtils } from '@/lib/auth/oauth2';
import { addHours, addDays, getUnixTime } from 'date-fns'; // For time manipulation
import crypto from 'crypto';

// --- 辅助函数 ---
/**
 * 构建并返回错误响应。
 * @param error - 错误代码 (RFC 6749, Section 5.2)
 * @param description - 错误的详细描述
 * @param status - HTTP 状态码
 * @returns NextResponse 对象
 */
function errorResponse(error: string, description: string, status: number = 400): NextResponse {
  console.warn(`Token endpoint error: ${error} - ${description}`); // 服务端日志记录错误
  return NextResponse.json({ error, error_description: description }, { status });
}

// --- 主处理函数 ---
export async function POST(req: NextRequest) {
  const formData = await req.formData();

  // 1. 客户端认证 (Client Authentication)
  // 使用 ClientAuthUtils 进行客户端认证，它应该能处理 Basic Auth 和请求体中的凭据
  // (Use ClientAuthUtils for client authentication, it should handle Basic Auth and credentials in request body)
  const authResult = await ClientAuthUtils.authenticateClient(req, formData);

  if (authResult.error || !authResult.client) {
    return errorResponse(
      authResult.error?.error || OAuth2ErrorTypes.INVALID_CLIENT,
      authResult.error?.error_description || 'Client authentication failed.',
      authResult.error?.error === OAuth2ErrorTypes.INVALID_CLIENT ? 401 : 400 // Typically 401 for invalid_client
    );
  }
  const client = authResult.client;

  // 2. 根据 grant_type 分发处理 (Dispatch based on grant_type)
  const grantType = formData.get('grant_type') as string;

  try {
    switch (grantType) {
      case 'authorization_code':
        return await handleAuthorizationCodeGrant(formData, client);
      case 'refresh_token':
        return await handleRefreshTokenGrant(formData, client);
      case 'client_credentials':
        return await handleClientCredentialsGrant(formData, client);
      default:
        return errorResponse(OAuth2ErrorTypes.UNSUPPORTED_GRANT_TYPE, `Unsupported grant_type: ${grantType}`);
    }
  } catch (e: any) {
    // 捕获在各个 grant handler 中可能抛出的特定错误
    // (Catch specific errors that might be thrown from grant handlers)
    if (e.error && e.error_description) {
        return errorResponse(e.error, e.error_description, e.status || 400);
    }
    console.error('Token endpoint internal error:', e);
    return errorResponse(OAuth2ErrorTypes.SERVER_ERROR, 'An unexpected error occurred.');
  }
}


// --- authorization_code 授权类型处理 ---
async function handleAuthorizationCodeGrant(formData: FormData, client: OAuthClient): Promise<NextResponse> {
  const code = formData.get('code') as string;
  const redirectUri = formData.get('redirect_uri') as string; // 必须与授权请求中的一致 (Must match the one in authorization request)
  const codeVerifier = formData.get('code_verifier') as string; // PKCE code verifier

  if (!code || !redirectUri) {
    throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: 'Missing required parameters: code, redirect_uri.' };
  }
  // PKCE 要求 code_verifier (PKCE requires code_verifier)
  if (!codeVerifier) {
      throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: 'Missing required parameter: code_verifier.' };
  }

  const authCode = await prisma.authorizationCode.findUnique({
    where: { code },
    include: { user: true } // 获取用户信息 (Get user information)
  });

  if (!authCode) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Authorization code not found.' };
  }
  if (authCode.isUsed) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Authorization code has already been used.' };
  }
  if (authCode.expiresAt < new Date()) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Authorization code expired.' };
  }
  if (authCode.redirectUri !== redirectUri) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'redirect_uri mismatch.' };
  }
  if (authCode.clientId !== client.id) {
    // 授权码不属于此客户端 (Authorization code does not belong to this client)
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Authorization code was not issued to this client.' };
  }

  // PKCE 验证 (PKCE Verification)
  if (!authCode.codeChallenge || !authCode.codeChallengeMethod) {
      // 如果存储的授权码没有 code_challenge，说明授权请求阶段就没有PKCE，这不应该发生
      // (If stored auth code lacks code_challenge, it means no PKCE in auth request, which shouldn't happen)
      console.error(`Authorization code ${authCode.id} is missing PKCE challenge.`);
      throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'PKCE challenge missing from authorization code record.' };
  }
  if (!PKCEUtils.verifyCodeChallenge(codeVerifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'PKCE verification failed: Invalid code_verifier.' };
  }

  // 将授权码标记为已使用 (Mark authorization code as used)
  await prisma.authorizationCode.update({
    where: { id: authCode.id },
    data: { isUsed: true },
  });

  // 生成访问令牌和刷新令牌 (Generate Access Token and Refresh Token)
  // 确保 authCode.user 存在 (Ensure authCode.user exists)
  if (!authCode.userId || !authCode.user) {
      console.error(`User ID or user object missing for AuthorizationCode ID: ${authCode.id}`);
      throw { error: OAuth2ErrorTypes.SERVER_ERROR, error_description: 'User information missing from authorization code.' };
  }

  const userPermissions = await AuthorizationUtils.getUserPermissions(authCode.userId); // 获取用户权限 (Corrected to AuthorizationUtils)

  const accessTokenString = await JWTUtils.createAccessToken({
    client_id: client.clientId, // 使用客户端的字符串ID (Use client's string ID)
    user_id: authCode.userId,
    scope: authCode.scope, // 使用授权码中保存的范围 (Use scopes from authorization code)
    permissions: userPermissions,
  });
  const refreshTokenString = await JWTUtils.createRefreshToken({
    client_id: client.clientId,
    user_id: authCode.userId,
    scope: authCode.scope,
  });

  // 存储访问令牌和刷新令牌 (Store Access Token and Refresh Token)
  const accessTokenExpiresIn = 3600; // 1 hour
  await prisma.accessToken.create({
    data: {
      token: accessTokenString,
      tokenHash: crypto.createHash('sha256').update(accessTokenString).digest('hex'),
      userId: authCode.userId,
      clientId: client.id,
      scope: authCode.scope,
      expiresAt: addHours(new Date(), 1),
      isRevoked: false,
    },
  });
  await prisma.refreshToken.create({
    data: {
      token: refreshTokenString,
      tokenHash: crypto.createHash('sha256').update(refreshTokenString).digest('hex'),
      userId: authCode.userId,
      clientId: client.id,
      scope: authCode.scope,
      expiresAt: addDays(new Date(), 30), // 刷新令牌有效期通常更长 (Refresh tokens usually have longer expiry)
      isRevoked: false,
    },
  });

  return NextResponse.json({
    access_token: accessTokenString,
    token_type: 'Bearer',
    expires_in: accessTokenExpiresIn,
    refresh_token: refreshTokenString,
    scope: authCode.scope, // 返回授予的范围 (Return granted scope)
    // sub: authCode.userId, // 'sub' is not a standard parameter for token response. Included in ID token.
  });
}

// --- refresh_token 授权类型处理 ---
async function handleRefreshTokenGrant(formData: FormData, client: OAuthClient): Promise<NextResponse> {
  const refreshTokenValue = formData.get('refresh_token') as string;
  const requestedScope = formData.get('scope') as string | undefined; // 可选的范围参数 (Optional scope parameter)

  if (!refreshTokenValue) {
    throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: 'Missing required parameter: refresh_token.' };
  }

  // 查找并验证刷新令牌 (Find and validate refresh token)
  // 使用 tokenHash 进行查找 (Use tokenHash for lookup)
  const refreshTokenHash = JWTUtils.getTokenHash(refreshTokenValue);
  const storedRefreshToken = await prisma.refreshToken.findUnique({
    where: { tokenHash: refreshTokenHash },
  });

  if (!storedRefreshToken) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token not found.' };
  }
  if (storedRefreshToken.isRevoked) {
    // 安全考虑：如果已撤销的刷新令牌被使用，可能需要撤销所有相关令牌
    // (Security consideration: if a revoked refresh token is used, might need to revoke all related tokens)
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token has been revoked.' };
  }
  if (storedRefreshToken.expiresAt < new Date()) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token expired.' };
  }
  if (storedRefreshToken.clientId !== client.id) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token was not issued to this client.' };
  }

  // 范围验证 (Scope validation)
  const originalScopes = ScopeUtils.parseScopes(storedRefreshToken.scope);
  let grantedScope = storedRefreshToken.scope; // 默认授予原始范围 (Default to original granted scopes)

  if (requestedScope) {
    const newRequestedScopes = ScopeUtils.parseScopes(requestedScope);
    // 客户端请求的范围不能超出原始授予的范围 (Client requested scopes cannot exceed originally granted scopes)
    if (newRequestedScopes.some(s => !originalScopes.includes(s))) {
      throw { error: OAuth2ErrorTypes.INVALID_SCOPE, error_description: 'Requested scope exceeds originally granted scope.' };
    }
    grantedScope = ScopeUtils.formatScopes(newRequestedScopes); // 如果有效，则授予请求的新范围 (If valid, grant the new requested scopes)
  }

  if (!storedRefreshToken.userId) {
      console.error(`User ID missing for RefreshToken ID: ${storedRefreshToken.id}`);
      throw { error: OAuth2ErrorTypes.SERVER_ERROR, error_description: 'User information missing from refresh token.' };
  }
  const userPermissions = await AuthorizationUtils.getUserPermissions(storedRefreshToken.userId); // Corrected to AuthorizationUtils

  // 生成新的访问令牌 (Generate new Access Token)
  const newAccessTokenString = await JWTUtils.createAccessToken({
    client_id: client.clientId,
    user_id: storedRefreshToken.userId,
    scope: grantedScope,
    permissions: userPermissions
  });

  // 存储新的访问令牌 (Store new Access Token)
  const accessTokenExpiresIn = 3600; // 1 小时 (1 hour)
  const newAccessTokenHash = JWTUtils.getTokenHash(newAccessTokenString);
  await prisma.accessToken.create({
    data: {
      // token: newAccessTokenString, // Storing full token can be a security risk if DB is compromised
      tokenHash: newAccessTokenHash,
      userId: storedRefreshToken.userId,
      clientId: client.id,
      scope: grantedScope,
      expiresAt: addHours(new Date(), 1),
      isRevoked: false, // 访问令牌通常不单独撤销，依赖有效期 (Access tokens usually not revoked individually, rely on expiry)
    },
  });

  // --- Refresh Token Rotation ---
  // 1. 将旧的刷新令牌标记为已撤销 (Mark the old refresh token as revoked)
  await prisma.refreshToken.update({
    where: { id: storedRefreshToken.id },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      // replacedByTokenId: newRefreshTokenHash // 可选：如果想追踪替换链 (Optional: if you want to track replacement chain)
    },
  });

  // 2. 生成新的刷新令牌 (Generate a new refresh token)
  const newRefreshTokenString = await JWTUtils.createRefreshToken({
    client_id: client.clientId,
    user_id: storedRefreshToken.userId,
    scope: grantedScope, // 新的刷新令牌继承计算后的范围 (New refresh token inherits the calculated scope)
  });
  const newRefreshTokenHash = JWTUtils.getTokenHash(newRefreshTokenString);
  const newRefreshTokenExpiresAt = addDays(new Date(), 30); // 假设刷新令牌有效期为30天 (Assume refresh token expiry is 30 days)

  // 3. 存储新的刷新令牌 (Store the new refresh token)
  await prisma.refreshToken.create({
    data: {
      // token: newRefreshTokenString, // Avoid storing full token
      tokenHash: newRefreshTokenHash,
      userId: storedRefreshToken.userId,
      clientId: client.id,
      scope: grantedScope,
      expiresAt: newRefreshTokenExpiresAt,
      isRevoked: false,
      previousTokenId: storedRefreshToken.id, // 链接到旧令牌ID，用于追踪 (Link to old token ID for tracking)
    },
  });

  console.log(`Refresh token rotated for user ${storedRefreshToken.userId}, client ${client.clientId}. Old JTI (from token, if any): ${JWTUtils.decodeJwt(refreshTokenValue)?.jti}, New JTI (from token): ${JWTUtils.decodeJwt(newRefreshTokenString)?.jti}`);


  return NextResponse.json({
    access_token: newAccessTokenString,
    token_type: 'Bearer',
    expires_in: accessTokenExpiresIn,
    refresh_token: newRefreshTokenString, // 返回新的刷新令牌 (Return the new refresh token)
    scope: grantedScope,
  });
}

// --- client_credentials 授权类型处理 ---
async function handleClientCredentialsGrant(formData: FormData, client: OAuthClient): Promise<NextResponse> {
  if (client.clientType === 'PUBLIC') { // 公共客户端不应使用此授权类型 (Public clients should not use this grant type)
      throw { error: OAuth2ErrorTypes.UNAUTHORIZED_CLIENT, error_description: 'Public clients are not permitted to use the client_credentials grant type.' };
  }

  const requestedScope = formData.get('scope') as string | undefined;
  let grantedScope: string | undefined = undefined;

  if (requestedScope) {
    const requestedScopesArray = ScopeUtils.parseScopes(requestedScope);
    // 验证请求的范围是否在客户端允许的范围内 (Validate requested scopes against client's allowed scopes)
    const clientAllowedScopes = client.allowedScopes ? ScopeUtils.parseScopes(JSON.parse(client.allowedScopes)) : [];

    if (requestedScopesArray.some(s => !clientAllowedScopes.includes(s))) {
      throw { error: OAuth2ErrorTypes.INVALID_SCOPE, error_description: 'Requested scope is not allowed for this client.' };
    }
    // 也可以在这里加入对全局范围有效性的检查 (Can also add global scope validation here)
    grantedScope = ScopeUtils.formatScopes(requestedScopesArray);
  } else {
    // 如果客户端未请求特定范围，可以授予客户端预配置的默认范围或不授予任何范围
    // (If client requests no specific scope, grant client's pre-configured default scopes or no scopes)
    // For simplicity, if no scope requested, no scope is granted in token, or a default.
    // Or, parse client.allowedScopes and grant all of them if that's the policy.
    // Let's assume for now, if no scope is requested, we grant a subset of allowed scopes or a default.
    // For client_credentials, often the token's scope is what the client is *allowed* to do generally.
    // If `client.allowedScopes` is a JSON array string:
    try {
        const clientScopes = client.allowedScopes ? JSON.parse(client.allowedScopes as string) : []; // Added 'as string'
        if (Array.isArray(clientScopes) && clientScopes.length > 0) {
            grantedScope = ScopeUtils.formatScopes(clientScopes); // Grant all allowed scopes by default
        }
    } catch(e) {
        console.error("Error parsing client.allowedScopes for client_credentials:", e);
        // Decide on behavior: grant no scopes, or error.
    }
  }

  // 生成访问令牌 (Generate Access Token) - 注意：client_credentials 通常不包含 user_id
  // (Note: client_credentials usually do not include user_id)
  const accessTokenString = await JWTUtils.createAccessToken({
    client_id: client.clientId,
    // user_id: undefined, // No user context for client_credentials
    scope: grantedScope,
    permissions: [], // 客户端凭据通常不直接关联用户权限 (Client credentials usually not directly tied to user permissions)
                      // 但可以有客户端自身的权限 (But can have client's own permissions)
  });
  const accessTokenHash = JWTUtils.getTokenHash(accessTokenString);

  const accessTokenExpiresIn = 3600; // 1 hour
  await prisma.accessToken.create({
    data: {
      // token: accessTokenString,
      tokenHash: accessTokenHash,
      // userId: null, // No user
      clientId: client.id,
      scope: grantedScope,
      expiresAt: addHours(new Date(), 1),
      isRevoked: false, // 通常不单独撤销 (Usually not revoked individually)
    },
  });

  return NextResponse.json({
    access_token: accessTokenString,
    token_type: 'Bearer',
    expires_in: accessTokenExpiresIn,
    scope: grantedScope,
  });
}

// The declare module block for ClientAuthUtils.getUserPermissions is no longer needed
// as AuthorizationUtils.getUserPermissions is used and expected to be correctly defined.
