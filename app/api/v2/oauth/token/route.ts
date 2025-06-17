// 文件路径: app/api/v2/oauth/token/route.ts
// 描述: 此文件实现了 OAuth 2.0 令牌端点 (Token Endpoint)。
// 主要职责:
// 1. 客户端认证 (Client Authentication): 验证请求令牌的客户端身份。支持 HTTP Basic Authentication 或请求体中的 client_id 和 client_secret。
// 2. 处理不同的授权类型 (Grant Types):
//    - 'authorization_code': 使用从授权端点获得的授权码来交换访问令牌和刷新令牌。包括 PKCE 验证。
//    - 'refresh_token': 使用刷新令牌来获取新的访问令牌，并可能实现刷新令牌轮换 (Refresh Token Rotation)。
//    - 'client_credentials': 允许客户端直接获取访问令牌以访问其自身拥有的资源或代表其自身执行操作。
// 3. 生成和存储令牌: 创建 JWT 格式的访问令牌和刷新令牌，并将它们（或其哈希）存储到数据库中。
// 4. 返回令牌响应: 将访问令牌、令牌类型 (Bearer)、有效期、刷新令牌（如果适用）和授予的范围返回给客户端。
// 安全性: 强调客户端认证、PKCE、授权码和刷新令牌的一次性使用或轮换机制。

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma ORM 用于数据库交互
import { OAuthClient, User, AuthorizationCode, RefreshToken as PrismaRefreshToken, AccessToken as PrismaAccessToken, Prisma } from '@prisma/client'; // Prisma 生成的数据库模型类型
import { ClientAuthUtils, AuthorizationUtils, OAuth2ErrorTypes, PKCEUtils, ScopeUtils, JWTUtils } from '@/lib/auth/oauth2';
import { addHours, addDays, getUnixTime } from 'date-fns';
import crypto from 'crypto';
import { z } from 'zod'; // Zod for validation

// --- Zod Schemas for Grant Type Payloads ---

const AuthorizationCodeGrantSchema = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string({ required_error: "code is required" }),
  redirect_uri: z.string({ required_error: "redirect_uri is required" }).url("Invalid redirect_uri format"),
  client_id: z.string().optional(), // Optional if client auth is done via Basic Auth header
  code_verifier: z.string({ required_error: "code_verifier is required for PKCE" }),
});

const RefreshTokenGrantSchema = z.object({
  grant_type: z.literal('refresh_token'),
  refresh_token: z.string({ required_error: "refresh_token is required" }),
  scope: z.string().optional(), // Optional: client can request a narrower scope
  client_id: z.string().optional(),
});

const ClientCredentialsGrantSchema = z.object({
  grant_type: z.literal('client_credentials'),
  scope: z.string().optional(),
  client_id: z.string().optional(),
});


// --- 辅助函数 ---
function errorResponse(error: string, description: string, status: number = 400): NextResponse {
  console.warn(`Token endpoint error: ${error} - ${description}`);
  return NextResponse.json({ error, error_description: description }, { status });
}

// --- 主处理函数 (HTTP POST) ---
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const rawGrantType = formData.get('grant_type') as string;

  // Convert FormData to a plain object for Zod parsing
  const formDataObj: Record<string, any> = {};
  formData.forEach((value, key) => { formDataObj[key] = value; });

  // --- 步骤 1: 客户端认证 ---
  const authResult = await ClientAuthUtils.authenticateClient(req, formData);
  if (authResult.error || !authResult.client) {
    return errorResponse(
      authResult.error?.error || OAuth2ErrorTypes.INVALID_CLIENT,
      authResult.error?.error_description || 'Client authentication failed.',
      authResult.error?.error === OAuth2ErrorTypes.INVALID_CLIENT ? 401 : 400
    );
  }
  const client = authResult.client as OAuthClient;

  // Add client_id from authenticated client to formDataObj if not present (for Zod validation)
  // This is because client_id might come from Basic Auth header instead of body
  if (!formDataObj.client_id && client.clientId) {
    formDataObj.client_id = client.clientId;
  }


  // --- 步骤 2: 根据 grant_type 分发处理 ---
  try {
    switch (rawGrantType) {
      case 'authorization_code': {
        const validationResult = AuthorizationCodeGrantSchema.safeParse(formDataObj);
        if (!validationResult.success) {
          throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: validationResult.error.errors[0]?.message || "Invalid parameters for authorization_code grant." };
        }
        return await handleAuthorizationCodeGrant(validationResult.data, client);
      }
      case 'refresh_token': {
        const validationResult = RefreshTokenGrantSchema.safeParse(formDataObj);
        if (!validationResult.success) {
          throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: validationResult.error.errors[0]?.message || "Invalid parameters for refresh_token grant." };
        }
        return await handleRefreshTokenGrant(validationResult.data, client);
      }
      case 'client_credentials': {
        const validationResult = ClientCredentialsGrantSchema.safeParse(formDataObj);
        if (!validationResult.success) {
          throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: validationResult.error.errors[0]?.message || "Invalid parameters for client_credentials grant." };
        }
        return await handleClientCredentialsGrant(validationResult.data, client);
      }
      default:
        return errorResponse(OAuth2ErrorTypes.UNSUPPORTED_GRANT_TYPE, `Unsupported grant_type: ${rawGrantType}`);
    }
  } catch (e: any) {
    if (e.error && e.error_description) {
        return errorResponse(e.error, e.error_description, e.status || 400);
    }
    console.error('Token endpoint internal error:', e);
    return errorResponse(OAuth2ErrorTypes.SERVER_ERROR, 'An unexpected error occurred.');
  }
}


// --- 'authorization_code' 授权类型处理函数 ---
async function handleAuthorizationCodeGrant(
  data: z.infer<typeof AuthorizationCodeGrantSchema>,
  client: OAuthClient
): Promise<NextResponse> {
  const { code, redirect_uri: redirectUri, code_verifier: codeVerifier } = data;

  const authCode = await prisma.authorizationCode.findUnique({
    where: { code },
    include: { user: true }
  });

  if (!authCode) throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Authorization code not found.' };
  if (authCode.isUsed) throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Authorization code has already been used.' };
  if (authCode.expiresAt < new Date()) throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Authorization code expired.' };
  if (authCode.redirectUri !== redirectUri) throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'redirect_uri mismatch.' };
  if (authCode.clientId !== client.id) throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Authorization code was not issued to this client.' };

  if (!authCode.codeChallenge || !authCode.codeChallengeMethod) {
    console.error(`Authorization code ${authCode.id} is missing PKCE challenge information.`);
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'PKCE challenge missing from authorization code record.' };
  }
  if (!PKCEUtils.verifyCodeChallenge(codeVerifier, authCode.codeChallenge, authCode.codeChallengeMethod as 'S256')) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'PKCE verification failed: Invalid code_verifier.' };
  }

  await prisma.authorizationCode.update({
    where: { id: authCode.id },
    data: { isUsed: true },
  });

  if (!authCode.userId || !authCode.user) {
      console.error(`User ID or user object missing for AuthorizationCode ID: ${authCode.id}.`);
      throw { error: OAuth2ErrorTypes.SERVER_ERROR, error_description: 'User information missing from authorization code record.' };
  }

  const userPermissions = await AuthorizationUtils.getUserPermissions(authCode.userId);
  const grantedScopes = ScopeUtils.parseScopes(authCode.scope);

  const accessTokenString = await JWTUtils.createAccessToken({
    client_id: client.clientId,
    user_id: authCode.userId,
    scope: authCode.scope,
    permissions: userPermissions,
  });
  const refreshTokenString = await JWTUtils.createRefreshToken({
    client_id: client.clientId,
    user_id: authCode.userId,
    scope: authCode.scope,
  });

  let idTokenString: string | undefined = undefined;
  if (grantedScopes.includes('openid') && authCode.user) {
    // Nonce was stored with authCode in the previous step
    idTokenString = await JWTUtils.createIdToken(authCode.user, client, authCode.nonce ?? undefined);
  }

  const accessTokenExpiresIn = client.accessTokenLifetime || 3600;
  const refreshTokenExpiresInDays = client.refreshTokenLifetime ? Math.ceil(client.refreshTokenLifetime / (24*60*60)) : 30;


  await prisma.accessToken.create({
    data: {
      tokenHash: JWTUtils.getTokenHash(accessTokenString),
      userId: authCode.userId,
      clientId: client.id,
      scope: authCode.scope,
      expiresAt: addHours(new Date(), accessTokenExpiresIn / 3600),
    },
  });
  await prisma.refreshToken.create({
    data: {
      tokenHash: JWTUtils.getTokenHash(refreshTokenString),
      userId: authCode.userId,
      clientId: client.id,
      scope: authCode.scope,
      expiresAt: addDays(new Date(), refreshTokenExpiresInDays),
    },
  });

  const responsePayload: any = {
    access_token: accessTokenString,
    token_type: 'Bearer',
    expires_in: accessTokenExpiresIn,
    refresh_token: refreshTokenString,
    scope: authCode.scope,
  };
  if (idTokenString) {
    responsePayload.id_token = idTokenString;
  }

  return NextResponse.json(responsePayload);
}

// --- 'refresh_token' 授权类型处理函数 ---
async function handleRefreshTokenGrant(
  data: z.infer<typeof RefreshTokenGrantSchema>,
  client: OAuthClient
): Promise<NextResponse> {
  const { refresh_token: refreshTokenValue, scope: requestedScopeString } = data;

  const refreshTokenHash = JWTUtils.getTokenHash(refreshTokenValue);
  const storedRefreshToken = await prisma.refreshToken.findUnique({
    where: { tokenHash: refreshTokenHash },
    include: { user: true } // Include user for ID token generation if openid scope
  });

  if (!storedRefreshToken) throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token not found.' };
  if (storedRefreshToken.isRevoked) throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token has been revoked.' };
  if (storedRefreshToken.expiresAt < new Date()) throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token expired.' };
  if (storedRefreshToken.clientId !== client.id) throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token was not issued to this client.' };
  if (!storedRefreshToken.userId || !storedRefreshToken.user) {
    throw { error: OAuth2ErrorTypes.SERVER_ERROR, error_description: 'User information missing from refresh token.'};
  }


  const originalScopes = ScopeUtils.parseScopes(storedRefreshToken.scope);
  let grantedScopeString = storedRefreshToken.scope;

  if (requestedScopeString) {
    const requestedScopesArray = ScopeUtils.parseScopes(requestedScopeString);
    if (requestedScopesArray.some(s => !originalScopes.includes(s))) {
      throw { error: OAuth2ErrorTypes.INVALID_SCOPE, error_description: 'Requested scope exceeds originally granted scope.' };
    }
    grantedScopeString = ScopeUtils.formatScopes(requestedScopesArray);
  }
  const grantedScopesArray = ScopeUtils.parseScopes(grantedScopeString);


  const userPermissions = await AuthorizationUtils.getUserPermissions(storedRefreshToken.userId);

  const newAccessTokenString = await JWTUtils.createAccessToken({
    client_id: client.clientId,
    user_id: storedRefreshToken.userId,
    scope: grantedScopeString,
    permissions: userPermissions,
  });

  // ID Token might be re-issued with refresh token if openid scope is still present
  let newIdTokenString: string | undefined = undefined;
  if (grantedScopesArray.includes('openid') && storedRefreshToken.user) {
    // Nonce is typically not used/required in refresh token flow for ID token re-issuance
    newIdTokenString = await JWTUtils.createIdToken(storedRefreshToken.user, client, undefined);
  }

  const accessTokenExpiresIn = client.accessTokenLifetime || 3600;
  const refreshTokenExpiresInDays = client.refreshTokenLifetime ? Math.ceil(client.refreshTokenLifetime / (24*60*60)) : 30;


  await prisma.accessToken.create({
    data: {
      tokenHash: JWTUtils.getTokenHash(newAccessTokenString),
      userId: storedRefreshToken.userId,
      clientId: client.id,
      scope: grantedScopeString,
      expiresAt: addHours(new Date(), accessTokenExpiresIn / 3600),
    },
  });

  // Refresh Token Rotation
  await prisma.refreshToken.update({
    where: { id: storedRefreshToken.id },
    data: { isRevoked: true, revokedAt: new Date() },
  });

  const newRefreshTokenString = await JWTUtils.createRefreshToken({
    client_id: client.clientId,
    user_id: storedRefreshToken.userId,
    scope: grantedScopeString,
  });
  await prisma.refreshToken.create({
    data: {
      tokenHash: JWTUtils.getTokenHash(newRefreshTokenString),
      userId: storedRefreshToken.userId,
      clientId: client.id,
      scope: grantedScopeString,
      expiresAt: addDays(new Date(), refreshTokenExpiresInDays),
      previousTokenId: storedRefreshToken.id, // Link to the old token
    },
  });

  const responsePayload: any = {
    access_token: newAccessTokenString,
    token_type: 'Bearer',
    expires_in: accessTokenExpiresIn,
    refresh_token: newRefreshTokenString,
    scope: grantedScopeString,
  };
  if (newIdTokenString) {
    responsePayload.id_token = newIdTokenString;
  }

  return NextResponse.json(responsePayload);
}

// --- 'client_credentials' 授权类型处理函数 ---
async function handleClientCredentialsGrant(
  data: z.infer<typeof ClientCredentialsGrantSchema>,
  client: OAuthClient
): Promise<NextResponse> {
  if (client.clientType === ClientType.PUBLIC) {
      throw { error: OAuth2ErrorTypes.UNAUTHORIZED_CLIENT, error_description: 'Public clients are not permitted to use the client_credentials grant type.' };
  }

  const requestedScopeString = data.scope;
  let grantedScopeString: string | undefined = undefined;
  const clientAllowedScopes = client.allowedScopes ? ScopeUtils.parseScopes(JSON.parse(client.allowedScopes)) : [];

  if (requestedScopeString) {
    const requestedScopesArray = ScopeUtils.parseScopes(requestedScopeString);
    if (requestedScopesArray.some(s => !clientAllowedScopes.includes(s))) {
      throw { error: OAuth2ErrorTypes.INVALID_SCOPE, error_description: 'Requested scope is not allowed for this client or is invalid.' };
    }
    // TODO: Validate against global scope list
    grantedScopeString = ScopeUtils.formatScopes(requestedScopesArray);
  } else {
    // Default to a subset of client's allowed scopes or all if appropriate
    // For client_credentials, often it's all client's pre-configured scopes or a specific default.
    // Here, let's grant all allowed scopes if none are requested.
    if (clientAllowedScopes.length > 0) {
        grantedScopeString = ScopeUtils.formatScopes(clientAllowedScopes);
    }
  }

  const accessTokenString = await JWTUtils.createAccessToken({
    client_id: client.clientId,
    // No user_id for client_credentials
    scope: grantedScopeString,
    permissions: [], // Client-specific permissions might be sourced differently if needed
  });

  const accessTokenExpiresIn = client.accessTokenLifetime || 3600;

  await prisma.accessToken.create({
    data: {
      tokenHash: JWTUtils.getTokenHash(accessTokenString),
      clientId: client.id,
      scope: grantedScopeString,
      expiresAt: addHours(new Date(), accessTokenExpiresIn / 3600),
    },
  });

  return NextResponse.json({
    access_token: accessTokenString,
    token_type: 'Bearer',
    expires_in: accessTokenExpiresIn,
    scope: grantedScopeString,
  });
}
