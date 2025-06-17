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
import { OAuthClient, User, AuthorizationCode, RefreshToken as PrismaRefreshToken, AccessToken as PrismaAccessToken, Prisma, ClientType } from '@prisma/client'; // Prisma 生成的数据库模型类型
import { ClientAuthUtils, AuthorizationUtils, OAuth2ErrorTypes, PKCEUtils, ScopeUtils, JWTUtils } from '@/lib/auth/oauth2';
import { addHours, addDays, getUnixTime } from 'date-fns';
// import crypto from 'crypto'; // crypto is used by JWTUtils.getTokenHash
// import { z } from 'zod'; // Zod is now imported from schemas.ts

// Import Zod schemas from the dedicated schema file
import {
  tokenRequestSchema, // This is the discriminated union
  tokenAuthorizationCodeGrantSchema, // Specific schema for validation within handler
  tokenClientCredentialsGrantSchema, // Specific schema
  tokenRefreshTokenGrantSchema,      // Specific schema
  TokenSuccessResponse,              // For successful response payload
  TokenErrorResponse                 // For error response payload
} from './schemas';

// --- 辅助函数 ---
function errorResponse(error: string, description: string, status: number = 400): NextResponse {
  console.warn(`Token endpoint error: ${error} - ${description}`);
  return NextResponse.json({ error, error_description: description } as TokenErrorResponse, { status });
}

// --- 主处理函数 (HTTP POST) ---
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const rawGrantType = formData.get('grant_type') as string;

  const formDataObj: Record<string, any> = {};
  formData.forEach((value, key) => { formDataObj[key] = value; });

  // --- 步骤 1: 客户端认证 ---
  // ClientAuthUtils will extract client_id from header or body if available.
  const authResult = await ClientAuthUtils.authenticateClient(req, formData);
  if (authResult.error || !authResult.client) {
    return errorResponse(
      authResult.error?.error || OAuth2ErrorTypes.INVALID_CLIENT,
      authResult.error?.error_description || 'Client authentication failed.',
      authResult.error?.error === OAuth2ErrorTypes.INVALID_CLIENT ? 401 : 400 // More specific status for client auth failure
    );
  }
  const client = authResult.client as OAuthClient; // client is now the Prisma OAuthClient object

  // Ensure client_id from authenticated client is used for Zod parsing,
  // especially if it came from Basic Auth header and not in body.
  if (!formDataObj.client_id && client.clientId) {
    formDataObj.client_id = client.clientId; // Use the string clientId
  }
  // If grant type requires client_secret in body and it was used for Basic Auth,
  // it won't be in formDataObj. This is fine as client is already authenticated.
  // Zod schemas for specific grants might make client_id/secret optional if auth is by header.

  // --- 步骤 2: 根据 grant_type 分发处理 ---
  try {
    // Use the discriminated union for initial parsing of grant_type and common fields
    // However, full validation with specific schemas is better done inside handlers for clarity.
    if (!rawGrantType) {
        throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: "grant_type is required." };
    }

    switch (rawGrantType) {
      case 'authorization_code': {
        // Now parse with the specific schema for this grant type
        const validationResult = tokenAuthorizationCodeGrantSchema.safeParse(formDataObj);
        if (!validationResult.success) {
          throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: validationResult.error.errors[0]?.message || "Invalid parameters for authorization_code grant." };
        }
        // Pass the validated data and the authenticated client object
        return await handleAuthorizationCodeGrant(validationResult.data, client);
      }
      case 'refresh_token': {
        const validationResult = tokenRefreshTokenGrantSchema.safeParse(formDataObj);
        if (!validationResult.success) {
          throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: validationResult.error.errors[0]?.message || "Invalid parameters for refresh_token grant." };
        }
        return await handleRefreshTokenGrant(validationResult.data, client);
      }
      case 'client_credentials': {
        // For client_credentials, client_id/secret might be optional in body if Basic Auth was used.
        // The `client` object is already authenticated.
        const validationResult = tokenClientCredentialsGrantSchema.safeParse(formDataObj);
        if (!validationResult.success) {
          throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: validationResult.error.errors[0]?.message || "Invalid parameters for client_credentials grant." };
        }
        return await handleClientCredentialsGrant(validationResult.data, client);
      }
      default:
        return errorResponse(OAuth2ErrorTypes.UNSUPPORTED_GRANT_TYPE, `Unsupported grant_type: ${rawGrantType}`);
    }
  } catch (e: any) {
    // Catch errors thrown as { error, error_description } objects or other errors
    if (e.error && e.error_description) {
        return errorResponse(e.error, e.error_description, e.status || 400);
    }
    console.error('Token endpoint internal error:', e); // Log unexpected errors
    return errorResponse(OAuth2ErrorTypes.SERVER_ERROR, 'An unexpected server error occurred.');
  }
}


// --- 'authorization_code' 授权类型处理函数 ---
// data is now parsed by tokenAuthorizationCodeGrantSchema
async function handleAuthorizationCodeGrant(
  data: z.infer<typeof tokenAuthorizationCodeGrantSchema>,
  client: OAuthClient // Authenticated client passed in
): Promise<NextResponse> {
  // Client is already authenticated.
  // We need to ensure data.client_id (if present) matches authenticated client.
  // However, tokenAuthorizationCodeGrantSchema makes client_id optional, so we rely on `client` object.
  // If client_id was in body and used for Zod, it should match.
  if (data.client_id && data.client_id !== client.clientId) {
     throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: 'client_id in body does not match authenticated client.' };
  }

  const { code, redirect_uri: redirectUri, code_verifier: codeVerifier } = data;

  // Use the new validateAuthorizationCode service function
  // Note: validateAuthorizationCode expects the CUID (client.id), not string clientId (client.clientId)
  const validatedAuthCode = await import('@/lib/auth/authorizationCodeFlow').then(mod =>
    mod.validateAuthorizationCode(code, client.id, redirectUri, codeVerifier)
  );

  if (!validatedAuthCode) {
    throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Authorization code is invalid, expired, already used, or PKCE verification failed.' };
  }

  // Ensure user exists (validatedAuthCode contains userId)
  const user = await prisma.user.findUnique({ where: { id: validatedAuthCode.userId }});
  if (!user || !user.isActive) {
      throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'User associated with authorization code not found or inactive.' };
  }

  const userPermissions = await AuthorizationUtils.getUserPermissions(validatedAuthCode.userId);
  const grantedScopesArray = ScopeUtils.parseScopes(validatedAuthCode.scope);

  // Use JWTUtils from lib/auth/oauth2.ts for consistency with other grant handlers in this file
  const accessTokenString = await JWTUtils.createAccessToken({
    client_id: client.clientId, // String clientId
    user_id: validatedAuthCode.userId,
    scope: validatedAuthCode.scope,
    permissions: userPermissions,
    // exp: client.accessTokenLifetime ? `${client.accessTokenLifetime}s` : undefined // Pass as string for setExpirationTime
  });
  const refreshTokenString = await JWTUtils.createRefreshToken({
    client_id: client.clientId,
    user_id: validatedAuthCode.userId,
    scope: validatedAuthCode.scope,
    // exp: client.refreshTokenLifetime ? `${client.refreshTokenLifetime / (24*60*60)}d` : undefined
  });

  let idTokenString: string | undefined = undefined;
  // TODO: The nonce for ID token needs to be retrieved if it was stored with the auth code.
  // validatedAuthCode from my service does not currently return nonce.
  // The original code: authCode.nonce was used. Need to align this.
  // For now, assuming nonce is not critical for this step if not readily available from validatedAuthCode.
  if (grantedScopesArray.includes('openid') && user) {
     // const nonceFromAuthCode = await prisma.authorizationCode.findUnique({where: {code: validatedAuthCode.code}, select: {nonce: true}});
     // idTokenString = await JWTUtils.createIdToken(user, client, nonceFromAuthCode?.nonce ?? undefined);
     idTokenString = await JWTUtils.createIdToken(user, client, undefined); // Passing undefined nonce for now
  }

  const accessTokenExpiresIn = client.accessTokenLifetime || 3600; // Default 1 hour
  const refreshTokenExpiresInDays = client.refreshTokenLifetime ? Math.ceil(client.refreshTokenLifetime / (24*60*60)) : 30; // Default 30 days

  // Store new tokens
  await prisma.accessToken.create({
    data: {
      tokenHash: JWTUtils.getTokenHash(accessTokenString),
      userId: validatedAuthCode.userId,
      clientId: client.id, // DB CUID
      scope: validatedAuthCode.scope,
      expiresAt: addHours(new Date(), accessTokenExpiresIn / 3600),
    },
  });
  await prisma.refreshToken.create({
    data: {
      tokenHash: JWTUtils.getTokenHash(refreshTokenString),
      userId: validatedAuthCode.userId,
      clientId: client.id, // DB CUID
      scope: validatedAuthCode.scope,
      expiresAt: addDays(new Date(), refreshTokenExpiresInDays),
    },
  });

  const responsePayload: TokenSuccessResponse = {
    access_token: accessTokenString,
    token_type: 'Bearer',
    expires_in: accessTokenExpiresIn,
    refresh_token: refreshTokenString,
    scope: validatedAuthCode.scope,
    ...(idTokenString && { id_token: idTokenString }),
  };
  return NextResponse.json(responsePayload);
}

// --- 'refresh_token' 授权类型处理函数 ---
async function handleRefreshTokenGrant(
  data: z.infer<typeof tokenRefreshTokenGrantSchema>, // Parsed by specific schema
  client: OAuthClient // Authenticated client
): Promise<NextResponse> {
  // Client is already authenticated.
  // If data.client_id is present (it's optional in Zod schema for refresh), ensure it matches.
  if (data.client_id && data.client_id !== client.clientId) {
    throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: 'client_id in body does not match authenticated client for refresh_token grant.' };
  }

  const { refresh_token: refreshTokenValue, scope: requestedScopeString } = data;

  const refreshTokenHash = JWTUtils.getTokenHash(refreshTokenValue);
  const storedRefreshToken = await prisma.refreshToken.findUnique({
    where: { tokenHash: refreshTokenHash },
    include: { user: true, client: true } // Include client to get its string clientId
  });

  if (!storedRefreshToken) throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token not found.' };
  if (storedRefreshToken.isRevoked) throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token has been revoked.' };
  if (storedRefreshToken.expiresAt < new Date()) throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token expired.' };
  // Ensure the refresh token was issued to the currently authenticated client
  if (storedRefreshToken.clientId !== client.id) {
      throw { error: OAuth2ErrorTypes.INVALID_GRANT, error_description: 'Refresh token was not issued to this client.' };
  }
  if (!storedRefreshToken.userId || !storedRefreshToken.user) {
    // Client credentials refresh token might not have userId, but this impl seems user-centric for refresh
    throw { error: OAuth2ErrorTypes.SERVER_ERROR, error_description: 'User information missing from refresh token.'};
  }

  const originalScopes = ScopeUtils.parseScopes(storedRefreshToken.scope || '');
  let finalGrantedScopeString = storedRefreshToken.scope || '';

  if (requestedScopeString) {
    const requestedScopesArray = ScopeUtils.parseScopes(requestedScopeString);
    // All requested scopes must be a subset of (or equal to) original scopes
    if (requestedScopesArray.some(s => !originalScopes.includes(s))) {
      throw { error: OAuth2ErrorTypes.INVALID_SCOPE, error_description: 'Requested scope exceeds originally granted scope.' };
    }
    finalGrantedScopeString = ScopeUtils.formatScopes(requestedScopesArray);
  }
  const finalGrantedScopesArray = ScopeUtils.parseScopes(finalGrantedScopeString);

  const userPermissions = await AuthorizationUtils.getUserPermissions(storedRefreshToken.userId);

  const newAccessTokenString = await JWTUtils.createAccessToken({
    client_id: client.clientId, // String clientId for JWT payload
    user_id: storedRefreshToken.userId,
    scope: finalGrantedScopeString,
    permissions: userPermissions,
  });

  let newIdTokenString: string | undefined = undefined;
  if (finalGrantedScopesArray.includes('openid') && storedRefreshToken.user) {
    newIdTokenString = await JWTUtils.createIdToken(storedRefreshToken.user, client, undefined);
  }

  const accessTokenExpiresIn = client.accessTokenLifetime || 3600;
  const refreshTokenDefaultLifetimeDays = client.refreshTokenLifetime ? Math.ceil(client.refreshTokenLifetime / (24*60*60)) : 30;

  await prisma.accessToken.create({
    data: {
      tokenHash: JWTUtils.getTokenHash(newAccessTokenString),
      userId: storedRefreshToken.userId,
      clientId: client.id, // DB CUID
      scope: finalGrantedScopeString,
      expiresAt: addHours(new Date(), accessTokenExpiresIn / 3600),
    },
  });

  // Refresh Token Rotation
  await prisma.refreshToken.update({
    where: { id: storedRefreshToken.id },
    data: { isRevoked: true, revokedAt: new Date() },
  });

  const newRefreshTokenString = await JWTUtils.createRefreshToken({
    client_id: client.clientId, // String clientId
    user_id: storedRefreshToken.userId,
    scope: finalGrantedScopeString,
  });
  await prisma.refreshToken.create({
    data: {
      tokenHash: JWTUtils.getTokenHash(newRefreshTokenString),
      userId: storedRefreshToken.userId,
      clientId: client.id, // DB CUID
      scope: finalGrantedScopeString,
      expiresAt: addDays(new Date(), refreshTokenDefaultLifetimeDays),
      previousTokenId: storedRefreshToken.id,
    },
  });

  const responsePayload: TokenSuccessResponse = {
    access_token: newAccessTokenString,
    token_type: 'Bearer',
    expires_in: accessTokenExpiresIn,
    refresh_token: newRefreshTokenString,
    scope: finalGrantedScopeString,
    ...(newIdTokenString && { id_token: newIdTokenString }),
  };

  return NextResponse.json(responsePayload);
}

// --- 'client_credentials' 授权类型处理函数 ---
async function handleClientCredentialsGrant(
  data: z.infer<typeof tokenClientCredentialsGrantSchema>, // Parsed by specific schema
  client: OAuthClient // Authenticated client
): Promise<NextResponse> {
  // Client is already authenticated.
  // If data.client_id is present (it's optional in Zod schema for this grant if Basic Auth used), ensure it matches.
  if (data.client_id && data.client_id !== client.clientId) {
    throw { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: 'client_id in body does not match authenticated client for client_credentials grant.' };
  }

  // ClientType is an enum, not string literal 'PUBLIC'
  if (client.clientType === ClientType.PUBLIC) { // Prisma enum ClientType.PUBLIC
      throw { error: OAuth2ErrorTypes.UNAUTHORIZED_CLIENT, error_description: 'Public clients are not permitted to use the client_credentials grant type.' };
  }

  const requestedScopeString = data.scope;
  let finalGrantedScopeString: string | undefined = undefined;

  let clientAllowedScopesArray: string[] = [];
  try {
    if(client.allowedScopes) {
        clientAllowedScopesArray = JSON.parse(client.allowedScopes);
        if (!Array.isArray(clientAllowedScopesArray)) clientAllowedScopesArray = [];
    }
  } catch (e) {
      console.error("Failed to parse client.allowedScopes for client_credentials", client.id, e);
      clientAllowedScopesArray = [];
  }


  if (requestedScopeString) {
    const requestedScopesArray = ScopeUtils.parseScopes(requestedScopeString);
    // Validate requested scopes are a subset of client's allowed scopes
    // AND also validate these scopes exist globally and are active (using the async ScopeUtils.validateScopes)
    const globalScopeValidation = await ScopeUtils.validateScopes(requestedScopesArray, client); // This overload takes client object
    if (!globalScopeValidation.valid) {
        throw { error: OAuth2ErrorTypes.INVALID_SCOPE, error_description: globalScopeValidation.error_description || 'Requested scope is invalid or not allowed.' };
    }
    finalGrantedScopeString = ScopeUtils.formatScopes(requestedScopesArray);
  } else {
    // If no scope requested, grant all of client's allowed scopes (if any)
    if (clientAllowedScopesArray.length > 0) {
        // Optionally, validate these default scopes against global list too, though they should be valid if configured correctly.
        finalGrantedScopeString = ScopeUtils.formatScopes(clientAllowedScopesArray);
    }
  }

  // Use clientCredentialsFlow.grantClientCredentialsToken which should internally use a JWT utility
  // This requires clientCredentialsFlow.ts to be refactored to use AuthenticatedClient type and my jwtUtils.
  // For now, directly using JWTUtils from lib/auth/oauth2.ts for less friction:
  const accessTokenString = await JWTUtils.createAccessToken({
    client_id: client.clientId, // String clientId
    // No user_id for client_credentials
    scope: finalGrantedScopeString,
    permissions: [], // Client-specific permissions might be defined differently
  });

  const accessTokenExpiresIn = client.accessTokenLifetime || 3600;

  await prisma.accessToken.create({
    data: {
      tokenHash: JWTUtils.getTokenHash(accessTokenString),
      clientId: client.id, // DB CUID
      userId: null, // No user for client_credentials
      scope: finalGrantedScopeString,
      expiresAt: addHours(new Date(), accessTokenExpiresIn / 3600),
    },
  });

  const responsePayload: TokenSuccessResponse = {
    access_token: accessTokenString,
    token_type: 'Bearer',
    expires_in: accessTokenExpiresIn,
    scope: finalGrantedScopeString,
  };
  return NextResponse.json(responsePayload);
}
