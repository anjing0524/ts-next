// 文件路径: app/api/v2/oauth/token/route.ts
// File path: app/api/v2/oauth/token/route.ts
// 描述: 此文件实现了 OAuth 2.0 令牌端点 (Token Endpoint)。
// Description: This file implements the OAuth 2.0 Token Endpoint.
// 主要职责:
// Main responsibilities:
// 1. 客户端认证 (Client Authentication): 验证请求令牌的客户端身份。支持 HTTP Basic Authentication 或请求体中的 client_id 和 client_secret。
// 1. Client Authentication: Verifies the identity of the client requesting a token. Supports HTTP Basic Authentication or client_id and client_secret in the request body.
// 2. 处理不同的授权类型 (Grant Types):
// 2. Handles different grant types:
//    - 'authorization_code': 使用从授权端点获得的授权码来交换访问令牌和刷新令牌。包括 PKCE 验证。
//    - 'authorization_code': Exchanges an authorization code (obtained from the authorization endpoint) for an access token and refresh token. Includes PKCE verification.
//    - 'refresh_token': 使用刷新令牌来获取新的访问令牌，并可能实现刷新令牌轮换 (Refresh Token Rotation)。
//    - 'refresh_token': Uses a refresh token to obtain a new access token, potentially implementing Refresh Token Rotation.
//    - 'client_credentials': 允许客户端直接获取访问令牌以访问其自身拥有的资源或代表其自身执行操作。
//    - 'client_credentials': Allows a client to directly obtain an access token to access its own resources or perform actions on its own behalf.
// 3. 生成和存储令牌: 创建 JWT 格式的访问令牌和刷新令牌，并将它们（或其哈希）存储到数据库中。
// 3. Generates and stores tokens: Creates access tokens and refresh tokens in JWT format, and stores them (or their hashes) in the database.
// 4. 返回令牌响应: 将访问令牌、令牌类型 (Bearer)、有效期、刷新令牌（如果适用）和授予的范围返回给客户端。
// 4. Returns token response: Sends the access token, token type (Bearer), expiration time, refresh token (if applicable), and granted scopes back to the client.
// 安全性: 强调客户端认证、PKCE、授权码和刷新令牌的一次性使用或轮换机制。
// Security: Emphasizes client authentication, PKCE, and one-time use or rotation mechanisms for authorization codes and refresh tokens.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma ORM 用于数据库交互 (Prisma ORM for database interaction)
import { OAuthClient, User, Prisma, ClientType as PrismaClientType } from '@prisma/client'; // Prisma 生成的数据库模型类型 (Prisma generated database model types)
// 注意：Prisma模型中的 AuthorizationCode, RefreshToken, AccessToken 在此文件中未直接作为类型导入，因为它们通常在操作后通过Prisma客户端返回或作为参数传递。
// Note: Prisma models AuthorizationCode, RefreshToken, AccessToken are not directly imported as types here as they are usually returned by Prisma client or passed as args after operations.
import { ClientAuthUtils, AuthorizationUtils, ScopeUtils, JWTUtils } from '@/lib/auth/oauth2'; // OAuth 2.0 辅助工具 (OAuth 2.0 helper utilities)
import { addHours, addDays } from 'date-fns'; // 日期/时间操作库 (Date/time manipulation library)
import { OAuth2Error, OAuth2ErrorCode, BaseError, TokenError, ResourceNotFoundError, ValidationError, AuthenticationError } from '@/lib/errors'; // 导入自定义错误类 (Import custom error classes)
import { withErrorHandling } from '@/lib/utils/error-handler'; // 导入错误处理高阶函数 (Import error handling HOF)


// 从专用的模式文件导入 Zod 模式
// Import Zod schemas from the dedicated schema file
import {
  // tokenRequestSchema, // 这是可区分联合类型 (This is the discriminated union) - Not directly used after individual parsing
  tokenAuthorizationCodeGrantSchema, // authorization_code 授权的特定模式 (Specific schema for authorization_code grant)
  tokenClientCredentialsGrantSchema, // client_credentials 授权的特定模式 (Specific schema for client_credentials grant)
  tokenRefreshTokenGrantSchema,      // refresh_token 授权的特定模式 (Specific schema for refresh_token grant)
  TokenSuccessResponse,              // 成功响应的载荷类型 (Payload type for successful response)
  // TokenErrorResponse                 // 错误响应的载荷类型 (Payload type for error response) - Handled by ApiResponse<never>
} from './schemas';
import { z } from 'zod'; // Keep z import if used directly for type inference like z.infer

// --- 主处理函数 (HTTP POST), 由 withErrorHandling 包装 ---
// --- Main Handler Function (HTTP POST), wrapped by withErrorHandling ---
async function tokenEndpointHandler(req: NextRequest): Promise<NextResponse> {
  const formData = await req.formData(); // 解析表单数据 (Parse form data)
  const rawGrantType = formData.get('grant_type') as string; // 获取原始的 grant_type 字符串 (Get the raw grant_type string)

  const formDataObj: Record<string, any> = {};
  formData.forEach((value, key) => { formDataObj[key] = value; });

  // --- 步骤 1: 客户端认证 ---
  // --- Step 1: Client Authentication ---
  // ClientAuthUtils.authenticateClient 现在会抛出错误而不是返回错误对象
  // ClientAuthUtils.authenticateClient will now throw an error instead of returning an error object
  const client = await ClientAuthUtils.authenticateClient(req, formData);
  // 如果上一步没有抛出错误，则客户端已成功认证 (If the previous step didn't throw, client is authenticated)

  if (!formDataObj.client_id && client.clientId) {
    formDataObj.client_id = client.clientId;
  }

  // --- 步骤 2: 根据 grant_type 分发处理 ---
  // --- Step 2: Dispatch handling based on grant_type ---
  if (!rawGrantType) {
      throw new OAuth2Error("grant_type is required.", OAuth2ErrorCode.InvalidRequest);
  }

  switch (rawGrantType) {
    case 'authorization_code': {
      const validationResult = tokenAuthorizationCodeGrantSchema.safeParse(formDataObj);
      if (!validationResult.success) {
        throw new OAuth2Error(validationResult.error.errors[0]?.message || "Invalid parameters for authorization_code grant.", OAuth2ErrorCode.InvalidRequest, 400, undefined, validationResult.error.flatten().fieldErrors);
      }
      return await handleAuthorizationCodeGrant(validationResult.data, client);
    }
    case 'refresh_token': {
      const validationResult = tokenRefreshTokenGrantSchema.safeParse(formDataObj);
      if (!validationResult.success) {
        throw new OAuth2Error(validationResult.error.errors[0]?.message || "Invalid parameters for refresh_token grant.", OAuth2ErrorCode.InvalidRequest, 400, undefined, validationResult.error.flatten().fieldErrors);
      }
      return await handleRefreshTokenGrant(validationResult.data, client);
    }
    case 'client_credentials': {
      const validationResult = tokenClientCredentialsGrantSchema.safeParse(formDataObj);
      if (!validationResult.success) {
        throw new OAuth2Error(validationResult.error.errors[0]?.message || "Invalid parameters for client_credentials grant.", OAuth2ErrorCode.InvalidRequest, 400, undefined, validationResult.error.flatten().fieldErrors);
      }
      return await handleClientCredentialsGrant(validationResult.data, client);
    }
    default:
      throw new OAuth2Error(`Unsupported grant_type: ${rawGrantType}`, OAuth2ErrorCode.UnsupportedGrantType);
  }
}
export const POST = withErrorHandling(tokenEndpointHandler);


// --- 'authorization_code' 授权类型处理函数 ---
// --- 'authorization_code' Grant Type Handler ---
async function handleAuthorizationCodeGrant(
  data: z.infer<typeof tokenAuthorizationCodeGrantSchema>,
  client: OAuthClient
): Promise<NextResponse> {
  // 验证请求体中的 client_id (如果提供) 是否与已认证的客户端匹配
  // Validate client_id from body (if provided) matches authenticated client
  if (data.client_id && data.client_id !== client.clientId) {
     throw new OAuth2Error('client_id in body does not match authenticated client.', OAuth2ErrorCode.InvalidRequest);
  }

  const { code, redirect_uri: redirectUri, code_verifier: codeVerifier } = data;
  let validatedAuthCode;
  try {
    // validateAuthorizationCode 现在会抛出错误，而不是返回 null
    // validateAuthorizationCode will now throw errors instead of returning null
    validatedAuthCode = await import('@/lib/auth/authorizationCodeFlow').then(mod =>
      mod.validateAuthorizationCode(code, client.id, redirectUri, codeVerifier)
    );
  } catch (error: any) {
    // 捕获来自 validateAuthorizationCode 的特定错误并转换为 OAuth2Error
    // Catch specific errors from validateAuthorizationCode and convert to OAuth2Error
    if (error instanceof ResourceNotFoundError || // 代码未找到 (Code not found)
        error instanceof TokenError ||           // 代码已使用/过期 (Code used/expired)
        error instanceof ValidationError ||        // ClientID/RedirectURI 不匹配 (ClientID/RedirectURI mismatch)
        error instanceof AuthenticationError) {  // PKCE 失败 (PKCE failed)
      throw new OAuth2Error(error.message, OAuth2ErrorCode.InvalidGrant, error.status, undefined, error.context);
    }
    // 对于其他未知错误 (例如数据库错误)
    // For other unknown errors (e.g., database errors)
    console.error("Unexpected error during authorization code validation:", error); // 记录原始错误 (Log original error)
    throw new OAuth2Error('Authorization code validation failed due to an unexpected server error.', OAuth2ErrorCode.ServerError, 500, undefined, { originalErrorName: error.name, originalMessage: error.message });
  }

  // 确保用户存在且活动
  // Ensure user exists and is active
  const user = await prisma.user.findUnique({ where: { id: validatedAuthCode.userId }});
  if (!user || !user.isActive) {
      throw new OAuth2Error('User associated with authorization code not found or inactive.', OAuth2ErrorCode.InvalidGrant);
  }

  const userPermissions = await AuthorizationUtils.getUserPermissions(validatedAuthCode.userId);
  const grantedScopesArray = ScopeUtils.parseScopes(validatedAuthCode.scope);

  const accessTokenString = await JWTUtils.createAccessToken({
    client_id: client.clientId,
    user_id: validatedAuthCode.userId,
    scope: validatedAuthCode.scope,
    permissions: userPermissions,
    // exp 由 JWTUtils.createAccessToken 内部处理默认值或基于 client.accessTokenLifetime (exp is handled internally by JWTUtils.createAccessToken with default or client.accessTokenLifetime)
  });
  const refreshTokenString = await JWTUtils.createRefreshToken({
    client_id: client.clientId,
    user_id: validatedAuthCode.userId,
    scope: validatedAuthCode.scope,
    // exp 由 JWTUtils.createRefreshToken 内部处理默认值或基于 client.refreshTokenLifetime (exp is handled internally by JWTUtils.createRefreshToken with default or client.refreshTokenLifetime)
  });

  let idTokenString: string | undefined = undefined;
  if (grantedScopesArray.includes('openid') && user) {
     // TODO: 传递 nonce (如果已在 authorizationCodeFlow 中存储和返回)
     // TODO: Pass nonce (if stored and returned in authorizationCodeFlow)
     idTokenString = await JWTUtils.createIdToken(user, client, validatedAuthCode.nonce || undefined);
  }

  const accessTokenExpiresIn = client.accessTokenLifetime || 3600; // 默认1小时 (Default 1 hour)
  // 注意：刷新令牌的DB过期时间应与JWT内部的'exp'声明一致 (Note: Refresh token DB expiry should align with JWT's internal 'exp' claim)
  const refreshTokenDefaultLifetimeDays = client.refreshTokenLifetime ? Math.ceil(client.refreshTokenLifetime / (24*60*60)) : 30; // 默认30天 (Default 30 days)


  // 原子化地存储令牌 (Store tokens atomically)
  try {
    await prisma.$transaction([
      prisma.accessToken.create({
        data: {
          tokenHash: JWTUtils.getTokenHash(accessTokenString),
          userId: validatedAuthCode.userId,
          clientId: client.id,
          scope: validatedAuthCode.scope,
          expiresAt: addHours(new Date(), accessTokenExpiresIn / 3600),
        },
      }),
      prisma.refreshToken.create({
        data: {
          tokenHash: JWTUtils.getTokenHash(refreshTokenString),
          userId: validatedAuthCode.userId,
          clientId: client.id,
          scope: validatedAuthCode.scope,
          expiresAt: addDays(new Date(), refreshTokenDefaultLifetimeDays),
        },
      })
    ]);
  } catch (dbError) {
    console.error("Failed to store tokens:", dbError);
    throw new OAuth2Error("Failed to store tokens due to a server issue.", OAuth2ErrorCode.ServerError, 500);
  }


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
// --- 'refresh_token' Grant Type Handler ---
async function handleRefreshTokenGrant(
  data: z.infer<typeof tokenRefreshTokenGrantSchema>,
  client: OAuthClient
): Promise<NextResponse> {
  if (data.client_id && data.client_id !== client.clientId) {
    throw new OAuth2Error('client_id in body does not match authenticated client for refresh_token grant.', OAuth2ErrorCode.InvalidRequest);
  }

  const { refresh_token: refreshTokenValue, scope: requestedScopeString } = data;

  const refreshTokenHash = JWTUtils.getTokenHash(refreshTokenValue);
  const storedRefreshToken = await prisma.refreshToken.findUnique({
    where: { tokenHash: refreshTokenHash },
    include: { user: true } // 不需要 client，因为已通过 client.id 筛选 (No need for client, as already filtered by client.id)
  });

  // 验证存储的刷新令牌 (Validate stored refresh token)
  if (!storedRefreshToken) throw new OAuth2Error('Refresh token not found.', OAuth2ErrorCode.InvalidGrant);
  if (storedRefreshToken.isRevoked) throw new OAuth2Error('Refresh token has been revoked.', OAuth2ErrorCode.InvalidGrant);
  if (storedRefreshToken.expiresAt < new Date()) throw new OAuth2Error('Refresh token expired.', OAuth2ErrorCode.InvalidGrant);
  if (storedRefreshToken.clientId !== client.id) {
      throw new OAuth2Error('Refresh token was not issued to this client.', OAuth2ErrorCode.InvalidGrant);
  }
  if (!storedRefreshToken.userId || !storedRefreshToken.user) {
    throw new OAuth2Error('User information missing from refresh token or user is inactive.', OAuth2ErrorCode.InvalidGrant); // 确保用户仍然有效 (Ensure user is still valid)
  }
  if (!storedRefreshToken.user.isActive) {
    throw new OAuth2Error('User associated with refresh token is inactive.', OAuth2ErrorCode.InvalidGrant);
  }


  const originalScopes = ScopeUtils.parseScopes(storedRefreshToken.scope || '');
  let finalGrantedScopeString = storedRefreshToken.scope || '';

  if (requestedScopeString) {
    const requestedScopesArray = ScopeUtils.parseScopes(requestedScopeString);
    if (requestedScopesArray.some(s => !originalScopes.includes(s))) {
      throw new OAuth2Error('Requested scope exceeds originally granted scope.', OAuth2ErrorCode.InvalidScope);
    }
    finalGrantedScopeString = ScopeUtils.formatScopes(requestedScopesArray);
  }
  const finalGrantedScopesArray = ScopeUtils.parseScopes(finalGrantedScopeString);

  const userPermissions = await AuthorizationUtils.getUserPermissions(storedRefreshToken.userId);

  const newAccessTokenString = await JWTUtils.createAccessToken({
    client_id: client.clientId,
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

  // 实现刷新令牌轮换 (Implement Refresh Token Rotation)
  const newRefreshTokenString = await JWTUtils.createRefreshToken({
    client_id: client.clientId,
    user_id: storedRefreshToken.userId,
    scope: finalGrantedScopeString,
  });

  try {
    await prisma.$transaction([
      // 1. 创建新的访问令牌 (Create new access token)
      prisma.accessToken.create({
        data: {
          tokenHash: JWTUtils.getTokenHash(newAccessTokenString),
          userId: storedRefreshToken.userId,
          clientId: client.id,
          scope: finalGrantedScopeString,
          expiresAt: addHours(new Date(), accessTokenExpiresIn / 3600),
        },
      }),
      // 2. 将旧的刷新令牌标记为已撤销 (Mark old refresh token as revoked)
      prisma.refreshToken.update({
        where: { id: storedRefreshToken.id },
        data: { isRevoked: true, revokedAt: new Date() },
      }),
      // 3. 创建新的刷新令牌 (Create new refresh token)
      prisma.refreshToken.create({
        data: {
          tokenHash: JWTUtils.getTokenHash(newRefreshTokenString),
          userId: storedRefreshToken.userId,
          clientId: client.id,
          scope: finalGrantedScopeString,
          expiresAt: addDays(new Date(), refreshTokenDefaultLifetimeDays),
          previousTokenId: storedRefreshToken.id,
        },
      })
    ]);
  } catch (dbError) {
    console.error("Failed to rotate refresh token and store new tokens:", dbError);
    throw new OAuth2Error("Failed to process token refresh due to a server issue.", OAuth2ErrorCode.ServerError, 500);
  }


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
// --- 'client_credentials' Grant Type Handler ---
async function handleClientCredentialsGrant(
  data: z.infer<typeof tokenClientCredentialsGrantSchema>,
  client: OAuthClient
): Promise<NextResponse> {
  if (data.client_id && data.client_id !== client.clientId) {
    throw new OAuth2Error('client_id in body does not match authenticated client for client_credentials grant.', OAuth2ErrorCode.InvalidRequest);
  }

  if (client.clientType === PrismaClientType.PUBLIC) {
      throw new OAuth2Error('Public clients are not permitted to use the client_credentials grant type.', OAuth2ErrorCode.UnauthorizedClient);
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
      // 如果解析失败，可以认为客户端没有配置允许的scopes，或者配置错误
      // If parsing fails, can assume client has no configured allowed scopes or configuration is erroneous
      clientAllowedScopesArray = [];
      // 也可以抛出配置错误 (Could also throw a configuration error)
      // throw new ConfigurationError("Client allowedScopes configuration is invalid.", "CLIENT_SCOPE_CONFIG_INVALID", { clientId: client.clientId });
  }

  if (requestedScopeString) {
    const requestedScopesArray = ScopeUtils.parseScopes(requestedScopeString);
    const globalScopeValidation = await ScopeUtils.validateScopes(requestedScopesArray, client);
    if (!globalScopeValidation.valid) {
        throw new OAuth2Error(globalScopeValidation.error_description || 'Requested scope is invalid or not allowed for this client.', OAuth2ErrorCode.InvalidScope);
    }
    finalGrantedScopeString = ScopeUtils.formatScopes(requestedScopesArray);
  } else {
    if (clientAllowedScopesArray.length > 0) {
        // 验证客户端默认的scopes是否仍然有效 (Validate if client's default scopes are still valid globally)
        const defaultScopeValidation = await ScopeUtils.validateScopes(clientAllowedScopesArray, client);
        if (!defaultScopeValidation.valid) {
            console.warn(`Client ${client.clientId} has default scopes that are no longer valid: ${defaultScopeValidation.invalidScopes.join(', ')}`);
            // 策略：是颁发一个无scope的令牌，还是拒绝？此处拒绝。
            // Policy: Issue token with no scope, or deny? Denying here.
            throw new OAuth2Error('Client default scopes are currently invalid. Please check client configuration.', OAuth2ErrorCode.InvalidScope);
        }
        finalGrantedScopeString = ScopeUtils.formatScopes(clientAllowedScopesArray);
    }
    // 如果请求的scope和客户端配置的scope都为空，finalGrantedScopeString 将是 undefined 或空字符串
    // If both requested scope and client's configured scopes are empty, finalGrantedScopeString will be undefined or empty string
  }

  const accessTokenString = await JWTUtils.createAccessToken({
    client_id: client.clientId,
    scope: finalGrantedScopeString,
    permissions: [], // 客户端凭证令牌通常不包含用户权限 (Client credentials tokens usually don't contain user permissions)
  });

  const accessTokenExpiresIn = client.accessTokenLifetime || 3600;

  try {
    await prisma.accessToken.create({
      data: {
        tokenHash: JWTUtils.getTokenHash(accessTokenString),
        clientId: client.id,
        userId: null, // 客户端凭证授予没有用户 (No user for client_credentials grant)
        scope: finalGrantedScopeString,
        expiresAt: addHours(new Date(), accessTokenExpiresIn / 3600),
      },
    });
  } catch (dbError) {
    console.error("Failed to store client credentials access token:", dbError);
    throw new OAuth2Error("Failed to store access token due to a server issue.", OAuth2ErrorCode.ServerError, 500);
  }

  const responsePayload: TokenSuccessResponse = {
    access_token: accessTokenString,
    token_type: 'Bearer',
    expires_in: accessTokenExpiresIn,
    scope: finalGrantedScopeString,
  };
  return NextResponse.json(responsePayload);
}
