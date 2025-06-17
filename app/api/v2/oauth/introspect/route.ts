// 文件路径: app/api/v2/oauth/introspect/route.ts
// 描述: OAuth 2.0 令牌内省端点 (RFC 7662)

import { NextRequest, NextResponse } from 'next/server';
// import { z } from 'zod'; // Zod is imported from schemas.ts

import { prisma } from '@/lib/prisma';
// successResponse, errorResponse are not used in this specific version of the file.
// import { successResponse, errorResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { JWTUtils, ClientAuthUtils, OAuth2ErrorTypes, ScopeUtils } from '@/lib/auth/oauth2';
import * as jose from 'jose'; // For decoding JWT to get claims

// Import Zod schemas from the dedicated schema file
import {
  introspectTokenRequestSchema,
  IntrospectTokenRequestPayload, // Type for validated request
  IntrospectResponse,            // Union type for response
  IntrospectResponseActive,      // Type for active response
  IntrospectResponseInactive     // Type for inactive response
} from './schemas';

/**
 * @swagger
 * /api/v2/oauth/introspect:
 *   post:
 *     summary: OAuth 2.0 令牌内省 (Token Introspection)
 *     description: |
 *       验证令牌的有效性并返回其元数据。
 *       此端点受客户端凭证保护 (通常是机密客户端使用 Basic Auth)。
 *       参考 RFC 7662。
 *     tags:
 *       - OAuth V2
 *     consumes:
 *       - application/x-www-form-urlencoded
 *     produces:
 *       - application/json
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: 需要内省的令牌。
 *                 example: '2YotnFZFEjr1zCsicMWpAA'
 *               token_type_hint:
 *                 type: string
 *                 description: 可选的令牌类型提示 (例如 "access_token" 或 "refresh_token")。
 *                 example: 'access_token'
 *               client_id:
 *                 type: string
 *                 description: (如果未使用Basic Auth) 进行请求的客户端ID。
 *               client_secret:
 *                 type: string
 *                 description: (如果未使用Basic Auth且客户端是机密的) 客户端密钥。
 *             required:
 *               - token
 *     responses:
 *       '200':
 *         description: 令牌内省响应。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 active:
 *                   type: boolean
 *                   description: 指示令牌是否有效且活动的布尔值。
 *                 scope:
 *                   type: string
 *                   description: 令牌关联的作用域 (空格分隔)。
 *                 client_id:
 *                   type: string
 *                   description: 令牌颁发给的客户端ID。
 *                 username:
 *                   type: string
 *                   description: 令牌关联的资源所有者用户名 (如果适用)。
 *                 sub:
 *                   type: string
 *                   description: 令牌的主题 (通常是用户ID或客户端ID)。
 *                 aud:
 *                   type: string
 *                   description: 令牌的受众。
 *                 iss:
 *                   type: string
 *                   description: 令牌的颁发者。
 *                 exp:
 *                   type: integer
 *                   format: int64
 *                   description: 令牌的过期时间戳 (Unix时间)。
 *                 iat:
 *                   type: integer
 *                   format: int64
 *                   description: 令牌的颁发时间戳 (Unix时间)。
 *                 jti:
 *                   type: string
 *                   description: 令牌的唯一标识符 (JWT ID)。
 *                 token_type:
 *                   type: string
 *                   description: 令牌类型 (例如 "Bearer")。
 *                 # ... 其他根据令牌类型和服务器策略的声明
 *       '400':
 *         description: 无效的请求 (例如缺少 'token' 参数)。
 *       '401':
 *         description: 客户端认证失败。
 *       '500':
 *         description: 服务器内部错误。
 */
async function introspectionHandler(request: NextRequest) {
  const overallRequestId = (request as any).requestId; // from withErrorHandler

  if (request.headers.get('content-type') !== 'application/x-www-form-urlencoded') {
    // Using a simplified error response structure here as errorResponse util is not in scope.
    return NextResponse.json({ error: 'unsupported_media_type', error_description: 'Unsupported Media Type. Please use application/x-www-form-urlencoded.' }, { status: 415 });
  }

  const bodyParams = new URLSearchParams(await request.text());
  const rawBodyData: Record<string, any> = {};
  bodyParams.forEach((value, key) => { rawBodyData[key] = value; });


  // --- 客户端认证 (Client Authentication) ---
  const clientAuthResult = await ClientAuthUtils.authenticateClient(request, bodyParams);

  if (!clientAuthResult.client) {
    if (clientAuthResult.error) {
      return NextResponse.json(clientAuthResult.error, { status: 401 });
    }
    return NextResponse.json({ error: OAuth2ErrorTypes.INVALID_CLIENT, error_description: 'Client authentication failed' }, { status: 401 });
  }
  const authenticatedClient = clientAuthResult.client;
  console.log(`Introspection request authenticated for client: ${authenticatedClient.clientId}`);


  // --- 请求体验证 (Using imported Zod schema) ---
  const validationResult = introspectTokenRequestSchema.safeParse(rawBodyData);
  if (!validationResult.success) {
    return NextResponse.json(
        { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: validationResult.error.errors[0]?.message || 'Invalid introspection request parameters.', issues: validationResult.error.flatten().fieldErrors },
        { status: 400 }
    );
  }
  const { token, token_type_hint } = validationResult.data;


  let activeResponsePayload: IntrospectResponseActive | null = null;

  // --- 令牌验证逻辑 ---
  // Try as Access Token
  if (token_type_hint === 'access_token' || !token_type_hint) {
    const atVerification = await JWTUtils.verifyAccessToken(token);
    if (atVerification.valid && atVerification.payload) {
      const payload = atVerification.payload;
      let isTokenActiveInDb = false;

      // Check JTI blacklist first
      if (payload.jti) {
        const blacklisted = await prisma.tokenBlacklist.findUnique({ where: { jti: payload.jti } });
        if (blacklisted) {
          return NextResponse.json({ active: false } as IntrospectResponseInactive);
        }
      }

      // Then check AccessToken table
      const dbAccessToken = await prisma.accessToken.findFirst({
        where: {
            tokenHash: JWTUtils.getTokenHash(token),
            // isRevoked: false, // Assuming isRevoked is part of the model, if not, remove
            expiresAt: { gt: new Date() }
        }
      });
      // If isRevoked is not on AccessToken, blacklisting is the primary revocation check for ATs
      // For this logic, let's assume blacklisting check is primary for ATs.
      // If found in DB and not expired (and optionally !isRevoked if field exists), it's active.
      if (dbAccessToken /* && !dbAccessToken.isRevoked (if field exists) */) {
        isTokenActiveInDb = true;
      }

      if (isTokenActiveInDb) {
        activeResponsePayload = {
            active: true,
            scope: payload.scope as string || undefined,
            client_id: payload.client_id as string, // client_id from token payload
            username: payload.user_id ? (await prisma.user.findUnique({where: {id: payload.user_id as string}}))?.username : undefined,
            sub: payload.sub as string,
            aud: payload.aud as string | string[] | undefined,
            iss: payload.iss as string,
            exp: payload.exp,
            iat: payload.iat,
            jti: payload.jti,
            token_type: 'Bearer',
            ...(dbAccessToken.userId && { user_id: dbAccessToken.userId }), // Add user_id if present in db record
            permissions: payload.permissions as string[] || undefined, // If permissions are in token
        };
      }
    }
  }

    }
  }

  // If not identified as an active access token, or if hint was refresh_token
  if (!activeResponsePayload && (token_type_hint === 'refresh_token' || !token_type_hint || (token_type_hint === 'access_token' && !activeResponsePayload))) {
    const rtVerification = await JWTUtils.verifyRefreshToken(token);
    if (rtVerification.valid && rtVerification.payload) {
      const payload = rtVerification.payload;
      let isTokenActiveInDb = false;

      if (payload.jti) {
        const blacklisted = await prisma.tokenBlacklist.findUnique({ where: { jti: payload.jti } });
        if (blacklisted) {
          return NextResponse.json({ active: false } as IntrospectResponseInactive);
        }
      }

      const dbRefreshToken = await prisma.refreshToken.findFirst({
          where: { tokenHash: JWTUtils.getTokenHash(token), isRevoked: false, expiresAt: { gt: new Date() }}
      });
      if (dbRefreshToken) { // Refresh tokens explicitly check isRevoked
        isTokenActiveInDb = true;
      }

      if (isTokenActiveInDb) {
        activeResponsePayload = {
            active: true,
            scope: payload.scope as string || undefined,
            client_id: payload.client_id as string,
            username: payload.user_id ? (await prisma.user.findUnique({where: {id: payload.user_id as string}}))?.username : undefined,
            sub: payload.sub as string,
            aud: payload.aud as string | string[] | undefined,
            iss: payload.iss as string,
            exp: payload.exp,
            iat: payload.iat,
            jti: payload.jti,
            token_type: 'refresh_token', // Hinting it's a refresh token, though RFC7662 is vague on this for RTs
            ...(dbRefreshToken?.userId && { user_id: dbRefreshToken.userId }),
        };
      }
    }
  }

  // Final response construction
  if (activeResponsePayload) {
    // Ensure all required fields for active response are present, even if from different sources
    if (!activeResponsePayload.client_id && accessTokenVerification.payload?.client_id) {
        activeResponsePayload.client_id = accessTokenVerification.payload.client_id as string;
    } else if (!activeResponsePayload.client_id && refreshTokenVerification?.payload?.client_id) {
        activeResponsePayload.client_id = refreshTokenVerification.payload.client_id as string;
    }
    // If still no client_id for an active token, something is wrong with token generation or data.
    if (!activeResponsePayload.client_id) {
        console.warn("Active token introspection, but client_id could not be determined from token payload.");
        return NextResponse.json({ active: false } as IntrospectResponseInactive);
    }

    // Remove undefined fields for cleaner response, then validate with Zod
    Object.keys(activeResponsePayload).forEach(key =>
        (activeResponsePayload as any)[key] === undefined && delete (activeResponsePayload as any)[key]
    );
    const parsedActiveResponse = IntrospectResponseActive.safeParse(activeResponsePayload);
    if (parsedActiveResponse.success) {
        return NextResponse.json(parsedActiveResponse.data);
    } else {
        console.error("Introspection active response schema validation failed:", parsedActiveResponse.error.flatten());
        return NextResponse.json({ active: false, error_description: "Internal server error processing token details." } as IntrospectResponseInactive);
    }
  }

  // If token is invalid, expired, revoked, or not found by any means
  return NextResponse.json({ active: false } as IntrospectResponseInactive);
}

// TODO: 替换简化的 authenticateIntrospectionClient 为健壮的客户端认证中间件 (e.g., withClientAuth)
// export const POST = withErrorHandler(withClientAuth(introspectionHandler, { requiredClientTypes: ['CONFIDENTIAL'] }));
export const POST = withErrorHandler(introspectionHandler);

// 添加一个辅助函数到JWTUtils（如果它不存在）
// JWTUtils.getTokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
// 这应该在 lib/auth/oauth2.ts 中定义

// 临时添加到此文件末尾，实际应在 lib/auth/oauth2.ts 的 JWTUtils 类中
// class JWTUtils {
//   static getTokenHash(token: string): string {
//     const crypto = require('crypto');
//     return crypto.createHash('sha256').update(token).digest('hex');
//   }
//   // ... other methods
// }
