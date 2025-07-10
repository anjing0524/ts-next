// 文件路径: app/api/v2/oauth/token/route.ts
// File path: app/api/v2/oauth/token/route.ts
// 描述: 此文件实现了 OAuth 2.1 令牌端点 (Token Endpoint)，支持多种客户端认证方式
// Description: This file implements the OAuth 2.1 Token Endpoint, supporting multiple client authentication methods
// 
// 认证方式优先级 (Authentication method priority):
// 1. client_assertion (JWT Client Assertion) - OAuth 2.1 推荐方式，最安全
// 2. client_secret (Basic Auth 或请求体) - 兼容性支持，不推荐用于生产环境
// 3. 公开客户端 (Public Client) - 仅适用于特定场景
//
// 主要职责:
// Main responsibilities:
// 1. 客户端认证 (Client Authentication): 优先支持JWT Client Assertion，兼容传统认证方式
// 1. Client Authentication: Prioritizes JWT Client Assertion, compatible with traditional methods
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

import { OAuthClient, ClientType as PrismaClientType } from '@prisma/client'; // Prisma 生成的数据库模型类型 (Prisma generated database model types)
import { prisma } from '@repo/database'; // Prisma ORM 用于数据库交互 (Prisma ORM for database interaction)
import { NextRequest, NextResponse } from 'next/server';
// 注意：Prisma模型中的 AuthorizationCode, RefreshToken, AccessToken 在此文件中未直接作为类型导入，因为它们通常在操作后通过Prisma客户端返回或作为参数传递。
// Note: Prisma models AuthorizationCode, RefreshToken, AccessToken are not directly imported as types here as they are usually returned by Prisma client or passed as args after operations.
import { AuthorizationUtils, JWTUtils, ScopeUtils, type RefreshTokenPayload } from '@repo/lib/auth';
import { OAuth2Error, OAuth2ErrorCode, TokenError } from '@repo/lib/errors'; // 导入自定义错误类 (Import custom error classes)
import { withErrorHandling } from '@repo/lib/utils/error-handler'; // 导入错误处理高阶函数 (Import error handling HOF)
import { addDays, addHours } from 'date-fns'; // 日期/时间操作库 (Date/time manipulation library)
import { ClientAuthUtils } from '../../../../../lib/auth/utils'; // OAuth 2.0 辅助工具 (OAuth 2.0 helper utilities)
import * as crypto from 'crypto'; // 用于哈希计算 (For hash computation)

// 从专用的模式文件导入 Zod 模式
// Import Zod schemas from the dedicated schema file
import { z } from 'zod'; // Keep z import if used directly for type inference like z.infer
import {
  // tokenRequestSchema, // 这是可区分联合类型 (This is the discriminated union) - Not directly used after individual parsing
  tokenAuthorizationCodeGrantSchema, // authorization_code 授权的特定模式 (Specific schema for authorization_code grant)
  tokenClientCredentialsGrantSchema, // client_credentials 授权的特定模式 (Specific schema for client_credentials grant)
  tokenRefreshTokenGrantSchema, // refresh_token 授权的特定模式 (Specific schema for refresh_token grant)
  TokenSuccessResponse, // 成功响应的载荷类型 (Payload type for successful response)
} from './schemas';

// 扩展TokenSuccessResponse类型以支持id_token
interface ExtendedTokenSuccessResponse extends TokenSuccessResponse {
  id_token?: string;
}

// 辅助函数：哈希令牌
async function hashToken(token: string): Promise<string> {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// 辅助函数：验证刷新令牌
async function validateRefreshToken(refreshToken: string, client: OAuthClient): Promise<RefreshTokenPayload> {
  try {
    const payload = await JWTUtils.verifyAndDecodeRefreshToken(refreshToken, client);
    return payload;
  } catch (error) {
    throw new OAuth2Error(
      'Invalid refresh token.',
      OAuth2ErrorCode.InvalidGrant
    );
  }
}

// 辅助函数：获取客户端权限
async function getClientPermissions(clientId: string): Promise<string[]> {
  // 这里可以根据需要实现客户端权限获取逻辑
  // 目前返回空数组，表示客户端没有特殊权限
  return [];
}

// --- 主处理函数 (HTTP POST), 由 withErrorHandling 包装 ---
// --- Main Handler Function (HTTP POST), wrapped by withErrorHandling ---
async function tokenEndpointHandler(req: NextRequest): Promise<NextResponse> {
  const formData = await req.formData(); // 解析表单数据 (Parse form data)
  const rawGrantType = formData.get('grant_type') as string; // 获取原始的 grant_type 字符串 (Get the raw grant_type string)

  const formDataObj: Record<string, any> = {};
  formData.forEach((value, key) => {
    formDataObj[key] = value;
  });

  // --- 步骤 1: 客户端认证 (优先支持 client_assertion) ---
  // --- Step 1: Client Authentication (prioritize client_assertion) ---
  // 
  // 认证方式优先级 (Authentication method priority):
  // 1. client_assertion (JWT Client Assertion) - OAuth 2.1 推荐，最安全
  // 2. client_secret (Basic Auth 或请求体) - 兼容性支持
  // 3. 公开客户端 - 仅适用于特定场景
  //
  // ClientAuthUtils.authenticateClient 会按以下顺序尝试认证:
  // ClientAuthUtils.authenticateClient will attempt authentication in the following order:
  // 1. 检查 client_assertion_type 和 client_assertion 参数
  // 1. Check client_assertion_type and client_assertion parameters
  // 2. 检查 Basic Authentication 头
  // 2. Check Basic Authentication header
  // 3. 检查请求体中的 client_id 和 client_secret
  // 3. Check client_id and client_secret in request body
  // 4. 检查公开客户端 (仅 client_id，无 client_secret)
  // 4. Check public client (only client_id, no client_secret)
  const client = await ClientAuthUtils.authenticateClient(req, formData);
  // 如果上一步没有抛出错误，则客户端已成功认证 (If the previous step didn't throw, client is authenticated)

  if (!formDataObj.client_id && client.clientId) {
    formDataObj.client_id = client.clientId;
  }

  // --- 步骤 2: 根据 grant_type 分发处理 ---
  // --- Step 2: Dispatch handling based on grant_type ---
  if (!rawGrantType) {
    throw new OAuth2Error('grant_type is required.', OAuth2ErrorCode.InvalidRequest);
  }

  switch (rawGrantType) {
    case 'authorization_code': {
      const validationResult = tokenAuthorizationCodeGrantSchema.safeParse(formDataObj);
      if (!validationResult.success) {
        throw new OAuth2Error(
          validationResult.error.errors[0]?.message ||
            'Invalid parameters for authorization_code grant.',
          OAuth2ErrorCode.InvalidRequest,
          400,
          undefined,
          validationResult.error.flatten().fieldErrors
        );
      }
      return await handleAuthorizationCodeGrant(validationResult.data, client, req);
    }
    case 'refresh_token': {
      const validationResult = tokenRefreshTokenGrantSchema.safeParse(formDataObj);
      if (!validationResult.success) {
        throw new OAuth2Error(
          validationResult.error.errors[0]?.message ||
            'Invalid parameters for refresh_token grant.',
          OAuth2ErrorCode.InvalidRequest,
          400,
          undefined,
          validationResult.error.flatten().fieldErrors
        );
      }
      return await handleRefreshTokenGrant(validationResult.data, client);
    }
    case 'client_credentials': {
      const validationResult = tokenClientCredentialsGrantSchema.safeParse(formDataObj);
      if (!validationResult.success) {
        throw new OAuth2Error(
          validationResult.error.errors[0]?.message ||
            'Invalid parameters for client_credentials grant.',
          OAuth2ErrorCode.InvalidRequest,
          400,
          undefined,
          validationResult.error.flatten().fieldErrors
        );
      }
      return await handleClientCredentialsGrant(validationResult.data, client);
    }
    default:
      throw new OAuth2Error(
        `Unsupported grant_type: ${rawGrantType}`,
        OAuth2ErrorCode.UnsupportedGrantType
      );
  }
}
export const POST = withErrorHandling(tokenEndpointHandler);

// --- 'authorization_code' 授权类型处理函数 ---
// --- 'authorization_code' Grant Type Handler ---
async function handleAuthorizationCodeGrant(
  data: z.infer<typeof tokenAuthorizationCodeGrantSchema>,
  client: OAuthClient,
  req: NextRequest
): Promise<NextResponse> {
  // 获取客户端IP和用户代理
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const userAgent = req.headers.get('user-agent') || undefined;
  // 验证请求体中的 client_id (如果提供) 是否与已认证的客户端匹配
  // Validate client_id from body (if provided) matches authenticated client
  if (data.client_id && data.client_id !== client.clientId) {
    // This is a client-side error, usually not a high-priority audit log unless repeated.
    // For now, we'll let the OAuth2Error be the response.
    throw new OAuth2Error(
      'client_id in body does not match authenticated client.',
      OAuth2ErrorCode.InvalidRequest
    );
  }

  // 使用恢复的 authorization-code-flow 业务逻辑
  const { validateAuthorizationCode } = await import(
    '../../../../../lib/auth/authorization-code-flow'
  );

  // 验证授权码和PKCE
  const validatedAuthCode = await validateAuthorizationCode(
    data.code,
    client.id, // 使用客户端的数据库ID
    data.redirect_uri,
    data.code_verifier
  );

  // 获取用户权限
  const userPermissions = await AuthorizationUtils.getUserPermissions(validatedAuthCode.userId);

  // 获取用户信息（用于可能的ID令牌）
  const user = await prisma.user.findUnique({
    where: { id: validatedAuthCode.userId },
  });

  const grantedScopesArray = ScopeUtils.parseScopes(validatedAuthCode.scope ?? '');

  const accessTokenString = await JWTUtils.generateToken({
    client_id: client.clientId,
    user_id: validatedAuthCode.userId,
    scope: validatedAuthCode.scope,
    permissions: userPermissions,
    // exp 由 JWTUtils.generateToken 内部处理默认值或基于 client.accessTokenTtl (exp is handled internally by JWTUtils.generateToken with default or client.accessTokenTtl)
  });
  const refreshTokenString = await JWTUtils.generateToken({
    client_id: client.clientId,
    user_id: validatedAuthCode.userId,
    scope: validatedAuthCode.scope,
    token_type: 'refresh_token',
    // exp 由 JWTUtils.generateToken 内部处理默认值或基于 client.refreshTokenTtl (exp is handled internally by JWTUtils.generateToken with default or client.refreshTokenTtl)
  });

  let idTokenString: string | undefined = undefined;
  if (grantedScopesArray.includes('openid') && user) {
    // TODO: 传递 nonce (如果已在 authorizationCodeFlow 中存储和返回)
    // TODO: Pass nonce (if stored and returned in authorizationCodeFlow)
    idTokenString = await JWTUtils.generateToken({
      sub: user.id,
      aud: client.clientId,
      name: user.displayName || user.username || undefined,
      nonce: validatedAuthCode.nonce || undefined,
    });
  }

  const accessTokenExpiresIn = client.accessTokenTtl || 3600; // 默认1小时 (Default 1 hour)
  // 注意：刷新令牌的DB过期时间应与JWT内部的'exp'声明一致 (Note: Refresh token DB expiry should align with JWT's internal 'exp' claim)
  const refreshTokenDefaultLifetimeDays = client.refreshTokenTtl
    ? Math.ceil(client.refreshTokenTtl / (24 * 60 * 60))
    : 30; // 默认30天 (Default 30 days)

  // 存储刷新令牌到数据库 (Store refresh token to database)
  const refreshTokenRecord = await prisma.refreshToken.create({
    data: {
      token: refreshTokenString, // 添加原始令牌
      tokenHash: await hashToken(refreshTokenString),
      clientId: client.id,
      userId: validatedAuthCode.userId,
      scope: validatedAuthCode.scope,
      expiresAt: addDays(new Date(), refreshTokenDefaultLifetimeDays),
      isRevoked: false,
    },
  });

  // 记录审计日志 (Record audit log)
  await prisma.auditLog.create({
    data: {
      userId: validatedAuthCode.userId,
      actorType: 'API_CLIENT',
      actorId: client.clientId,
      action: 'TOKEN_ISSUED',
      resourceType: 'OAUTH_TOKEN',
      resourceId: `auth_code_${validatedAuthCode.id}`,
      ipAddress,
      userAgent,
      status: 'SUCCESS',
      details: {
        grantType: 'authorization_code',
        clientId: client.clientId,
        scope: validatedAuthCode.scope,
        tokenType: 'access_token',
      },
      timestamp: new Date(),
    },
  });

  // 删除已使用的授权码 (Delete used authorization code)
  await prisma.authorizationCode.delete({
    where: { id: validatedAuthCode.id },
  });

  const response: ExtendedTokenSuccessResponse = {
    access_token: accessTokenString,
    token_type: 'Bearer',
    expires_in: accessTokenExpiresIn,
    refresh_token: refreshTokenString,
    scope: validatedAuthCode.scope,
  };

  if (idTokenString) {
    response.id_token = idTokenString;
  }

  return NextResponse.json(response);
}

// --- 'refresh_token' 授权类型处理函数 ---
// --- 'refresh_token' Grant Type Handler ---
async function handleRefreshTokenGrant(
  data: z.infer<typeof tokenRefreshTokenGrantSchema>,
  client: OAuthClient
): Promise<NextResponse> {
  // 验证请求体中的 client_id (如果提供) 是否与已认证的客户端匹配
  // Validate client_id from body (if provided) matches authenticated client
  if (data.client_id && data.client_id !== client.clientId) {
    throw new OAuth2Error(
      'client_id in body does not match authenticated client.',
      OAuth2ErrorCode.InvalidRequest
    );
  }

  // 验证刷新令牌 (Validate refresh token)
  const refreshTokenPayload = await validateRefreshToken(data.refresh_token, client);

  // 确保刷新令牌属于已认证的客户端 (Ensure refresh token belongs to authenticated client)
  if ((refreshTokenPayload.client_id as string) !== client.clientId) {
    throw new OAuth2Error(
      'Refresh token does not belong to the authenticated client.',
      OAuth2ErrorCode.InvalidGrant
    );
  }

  // 获取用户权限 (Get user permissions)
  const userPermissions = await AuthorizationUtils.getUserPermissions(refreshTokenPayload.user_id as string);

  // 生成新的访问令牌 (Generate new access token)
  const newAccessTokenString = await JWTUtils.generateToken({
    client_id: client.clientId,
    user_id: refreshTokenPayload.user_id as string,
    scope: refreshTokenPayload.scope as string,
    permissions: userPermissions,
  });

  // 生成新的刷新令牌 (Generate new refresh token)
  const newRefreshTokenString = await JWTUtils.generateToken({
    client_id: client.clientId,
    user_id: refreshTokenPayload.user_id as string,
    scope: refreshTokenPayload.scope as string,
    token_type: 'refresh_token',
  });

  // 撤销旧的刷新令牌 (Revoke old refresh token)
  await prisma.refreshToken.updateMany({
    where: {
      tokenHash: await hashToken(data.refresh_token),
      isRevoked: false,
    },
    data: { isRevoked: true },
  });

  // 存储新的刷新令牌 (Store new refresh token)
  const refreshTokenDefaultLifetimeDays = client.refreshTokenTtl
    ? Math.ceil(client.refreshTokenTtl / (24 * 60 * 60))
    : 30;

  await prisma.refreshToken.create({
    data: {
      token: newRefreshTokenString, // 添加原始令牌
      tokenHash: await hashToken(newRefreshTokenString),
      clientId: client.id,
      userId: refreshTokenPayload.user_id as string,
      scope: refreshTokenPayload.scope as string,
      expiresAt: addDays(new Date(), refreshTokenDefaultLifetimeDays),
      isRevoked: false,
    },
  });

  const accessTokenExpiresIn = client.accessTokenTtl || 3600;

  const response: TokenSuccessResponse = {
    access_token: newAccessTokenString,
    token_type: 'Bearer',
    expires_in: accessTokenExpiresIn,
    refresh_token: newRefreshTokenString,
    scope: refreshTokenPayload.scope as string,
  };

  return NextResponse.json(response);
}

// --- 'client_credentials' 授权类型处理函数 ---
// --- 'client_credentials' Grant Type Handler ---
async function handleClientCredentialsGrant(
  data: z.infer<typeof tokenClientCredentialsGrantSchema>,
  client: OAuthClient
): Promise<NextResponse> {
  // 验证请求体中的 client_id (如果提供) 是否与已认证的客户端匹配
  // Validate client_id from body (if provided) matches authenticated client
  if (data.client_id && data.client_id !== client.clientId) {
    throw new OAuth2Error(
      'client_id in body does not match authenticated client.',
      OAuth2ErrorCode.InvalidRequest
    );
  }

  // 获取客户端权限 (Get client permissions)
  const clientPermissions = await getClientPermissions(client.id);

  // 验证请求的范围 (Validate requested scope)
  const requestedScopes = data.scope ? ScopeUtils.parseScopes(data.scope) : [];
  let allowedScopes: string[] = [];
  
  try {
    // 安全地解析允许的范围
    if (client.allowedScopes) {
      allowedScopes = JSON.parse(client.allowedScopes);
    }
  } catch (error) {
    console.warn('Failed to parse client allowedScopes:', error);
    // 如果解析失败，使用空数组作为默认值
    allowedScopes = [];
  }

  // 检查请求的范围是否在允许的范围内 (Check if requested scopes are within allowed scopes)
  const invalidScopes = requestedScopes.filter(scope => !allowedScopes.includes(scope));
  if (invalidScopes.length > 0) {
    throw new OAuth2Error(
      `Invalid scope(s): ${invalidScopes.join(', ')}`,
      OAuth2ErrorCode.InvalidScope
    );
  }

  // 生成访问令牌 (Generate access token)
  const accessTokenString = await JWTUtils.generateToken({
    client_id: client.clientId,
    scope: data.scope || '',
    permissions: clientPermissions,
    token_type: 'client_credentials',
  });

  const accessTokenExpiresIn = client.accessTokenTtl || 3600;

  const response: TokenSuccessResponse = {
    access_token: accessTokenString,
    token_type: 'Bearer',
    expires_in: accessTokenExpiresIn,
    scope: data.scope || '',
  };

  return NextResponse.json(response);
}
