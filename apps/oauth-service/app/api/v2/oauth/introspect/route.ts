// 文件路径: app/api/v2/oauth/introspect/route.ts
// File path: app/api/v2/oauth/introspect/route.ts
// 描述: OAuth 2.0 令牌内省端点 (RFC 7662)
// Description: OAuth 2.0 Token Introspection Endpoint (RFC 7662)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { withErrorHandling } from '@/lib/utils/error-handler';
import { ClientAuthUtils } from '@/lib/auth/utils'; // 本地工具类
import { ScopeUtils, JWTUtils } from '@repo/lib/auth';
import * as jose from 'jose';
import { introspectTokenRequestSchema, IntrospectResponseActive, IntrospectResponseInactive, introspectResponseActiveSchema } from './schemas';
import { ApiResponse } from '@repo/lib/types/api';
import { OAuth2Error, OAuth2ErrorCode, ConfigurationError } from '@/lib/errors';

/**
 * @swagger
 * /api/v2/oauth/introspect:
 *   post:
 *     summary: OAuth 2.0 令牌内省 (Token Introspection) - RFC 7662
 *     description: |
 *       验证令牌的有效性并返回其元数据。此端点受客户端凭证保护。
 *       Validates a token and returns its metadata. This endpoint is protected by client credentials.
 *     tags: [OAuth V2]
 *     consumes: [application/x-www-form-urlencoded]
 *     produces: [application/json]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             $ref: '#/components/schemas/IntrospectTokenRequest'
 *     responses:
 *       '200':
 *         description: 令牌内省响应。active为true表示令牌有效，active为false表示令牌无效。
 *                      (Token introspection response. active:true indicates a valid token, active:false indicates an invalid token.)
 *         content:
 *           application/json:
 *             schema:
 *               oneOf: # 表示响应可以是活动令牌或非活动令牌的 ApiResponse 结构
 *                 - $ref: '#/components/schemas/ApiResponseIntrospectionActive'
 *                 - $ref: '#/components/schemas/ApiResponseIntrospectionInactive'
 *       '400':
 *         description: 无效请求。 (Invalid request.)
 *         content: { $ref: '#/components/schemas/ApiResponseError' }
 *       '401':
 *         description: 客户端认证失败。 (Client authentication failed.)
 *         content: { $ref: '#/components/schemas/ApiResponseError' }
 *       '415':
 *         description: 不支持的媒体类型。 (Unsupported Media Type.)
 *         content: { $ref: '#/components/schemas/ApiResponseError' }
 *       '500':
 *         description: 服务器内部错误。 (Internal server error.)
 *         content: { $ref: '#/components/schemas/ApiResponseError' }
 * components:
 *   schemas:
 *     IntrospectTokenRequest: # 已在 schemas.ts 中定义，此处为文档目的 (Defined in schemas.ts, here for documentation)
 *       type: object
 *       required: [token]
 *       properties:
 *         token: { type: string }
 *         token_type_hint: { type: string, enum: [access_token, refresh_token] }
 *         client_id: { type: string }
 *         # client_secret: { type: string } // client_secret is not part of RFC7662 request body if using Basic Auth
 *     IntrospectResponseActiveData: # 'data' field for active token
 *       type: object
 *       required: [active, client_id, sub, iss, aud, exp, iat] # JTI is often optional
 *       properties:
 *         active: { type: boolean, enum: [true] }
 *         scope: { type: string, nullable: true }
 *         client_id: { type: string }
 *         username: { type: string, nullable: true }
 *         sub: { type: string }
 *         aud: { type: string, description: "可以是字符串或字符串数组 (Can be string or array of strings)" }
 *         iss: { type: string }
 *         exp: { type: number, format: int64 }
 *         iat: { type: number, format: int64 }
 *         jti: { type: string, nullable: true }
 *         token_type: { type: string, nullable: true } # e.g. Bearer for AT, or 'refresh_token'
 *         user_id: { type: string, nullable: true }
 *         permissions: { type: array, items: { type: string }, nullable: true }
 *     IntrospectResponseInactiveData: # 'data' field for inactive token
 *       type: object
 *       required: [active]
 *       properties:
 *         active: { type: boolean, enum: [false] }
 *     ApiResponseIntrospectionActive:
 *       allOf:
 *         - $ref: '#/components/schemas/ApiResponseBase'
 *         - type: object
 *           properties:
 *             data: { $ref: '#/components/schemas/IntrospectResponseActiveData' }
 *             message: { type: string, example: "Token is active." }
 *     ApiResponseIntrospectionInactive:
 *       allOf:
 *         - $ref: '#/components/schemas/ApiResponseBase'
 *         - type: object
 *           properties:
 *             data: { $ref: '#/components/schemas/IntrospectResponseInactiveData' }
 *             message: { type: string, example: "Token is not active." }
 *     # ApiResponseBase, ApiError, ApiResponseError 已在其他地方定义 (Defined elsewhere)
 */
// 令牌内省端点处理函数 (内部逻辑)
// Token introspection endpoint handler function (internal logic)
async function introspectionHandlerInternal(request: NextRequest): Promise<NextResponse> {
  // 检查内容类型 (Check content type)
  if (request.headers.get('content-type') !== 'application/x-www-form-urlencoded') {
    throw new OAuth2Error(
      'Unsupported Media Type. Please use application/x-www-form-urlencoded.',
      OAuth2ErrorCode.InvalidRequest,
      415,
      undefined,
      { expectedContentType: 'application/x-www-form-urlencoded' }
    );
  }

  const bodyParams = new URLSearchParams(await request.text());
  const rawBodyData: Record<string, any> = {};
  bodyParams.forEach((value, key) => { rawBodyData[key] = value; });

  // 转换为FormData以符合ClientAuthUtils.authenticateClient的参数类型
  const formData = new FormData();
  bodyParams.forEach((value, key) => { formData.append(key, value); });

  // --- 客户端认证 --- (Client Authentication)
  const authenticatedClient = await ClientAuthUtils.authenticateClient(request, formData);
  console.log(`Introspection request authenticated for client: ${authenticatedClient.clientId}`);

  // --- 请求体验证 --- (Request body validation)
  const validationResult = introspectTokenRequestSchema.safeParse(rawBodyData);
  if (!validationResult.success) {
    throw new OAuth2Error(
        validationResult.error.errors[0]?.message || 'Invalid introspection request parameters.',
        OAuth2ErrorCode.InvalidRequest,
        400,
        undefined,
        { issues: validationResult.error.flatten().fieldErrors }
    );
  }
  // client_id (如果提供) 必须与已认证客户端匹配 - ClientAuthUtils 已处理基础的客户端认证。
  // client_id (if provided) must match authenticated client - ClientAuthUtils has handled basic client auth.
  // 此处是可选的额外检查，确保请求体中的 client_id (如果存在) 与认证的客户端一致。
  // This is an optional extra check to ensure client_id in body (if present) matches the authenticated client.
  if (validationResult.data.client_id && validationResult.data.client_id !== authenticatedClient.clientId) {
     throw new OAuth2Error("client_id in body does not match authenticated client.", OAuth2ErrorCode.InvalidRequest, 400);
  }

  const { token, token_type_hint } = validationResult.data;
  let activeResponsePayload: IntrospectResponseActive | null = null;

  // --- 令牌验证逻辑 --- (Token Validation Logic)
  // 尝试作为访问令牌处理 (Attempt to process as an Access Token)
  if (token_type_hint === 'access_token' || !token_type_hint) {
    const atVerification = await JWTUtils.verifyAccessToken(token);
    if (atVerification.valid && atVerification.payload) {
      const payload = atVerification.payload;
      if (payload.jti) {
        const blacklisted = await prisma.tokenBlacklist.findUnique({ where: { jti: payload.jti } });
        if (blacklisted) {
          return NextResponse.json<ApiResponse<IntrospectResponseInactive>>({ success: true, data: { active: false }, message: "Token is blacklisted." }, { status: 200 });
        }
      }
      const dbAccessToken = await prisma.accessToken.findFirst({
        where: { tokenHash: JWTUtils.getTokenHash(token), expiresAt: { gt: new Date() } },
        include: { user: true }
      });

      // RFC7662: 令牌的 client_id 是指颁发给哪个客户端的，不一定与发起内省请求的客户端相同。
      // RFC7662: The token's client_id refers to whom it was issued, not necessarily the client making the introspection request.
      // 此处检查 payload.sub 是否与 dbAccessToken.userId 匹配是正确的。
      // Checking if payload.sub matches dbAccessToken.userId is correct here.
      if (dbAccessToken && payload.sub === dbAccessToken.userId /* && payload.client_id === dbAccessToken.clientId - This check is too restrictive for general introspection */) {
        activeResponsePayload = {
            active: true,
            scope: (payload.scope as string || dbAccessToken.scope) ?? undefined,
            client_id: payload.client_id as string, // client_id from the token being introspected
            username: dbAccessToken.user?.username || undefined,
            sub: payload.sub as string,
            aud: (payload.aud as string | string[]) ?? undefined,
            iss: payload.iss as string,
            exp: payload.exp,
            iat: payload.iat,
            jti: payload.jti,
            token_type: 'Bearer', // RFC 7662 (section 2.2) - "token_type" is optional
            user_id: dbAccessToken.userId ?? undefined,
            permissions: (payload.permissions as string[]) ?? undefined,
        };
      }
    }
  }

  // 如果未被识别为活动的访问令牌，或者提示是 refresh_token
  // If not identified as an active access token, or if hint was refresh_token
  if (!activeResponsePayload && (token_type_hint === 'refresh_token' || !token_type_hint)) {
    const rtVerification = await JWTUtils.verifyRefreshToken(token);
    if (rtVerification.valid && rtVerification.payload) {
      const payload = rtVerification.payload;
      if (payload.jti) {
        const blacklisted = await prisma.tokenBlacklist.findUnique({ where: { jti: payload.jti } });
        if (blacklisted) {
          return NextResponse.json<ApiResponse<IntrospectResponseInactive>>({ success: true, data: { active: false }, message: "Token is blacklisted." }, { status: 200 });
        }
      }
      const dbRefreshToken = await prisma.refreshToken.findFirst({
          where: { tokenHash: JWTUtils.getTokenHash(token), isRevoked: false, expiresAt: { gt: new Date() }},
          include: { user: true }
      });
      if (dbRefreshToken && payload.sub === dbRefreshToken.userId /* && payload.client_id === dbRefreshToken.clientId */) {
        activeResponsePayload = {
            active: true,
            scope: (payload.scope as string || dbRefreshToken.scope) ?? undefined,
            client_id: payload.client_id as string,
            username: dbRefreshToken.user?.username || undefined,
            sub: payload.sub as string,
            aud: (payload.aud as string | string[]) ?? undefined,
            iss: payload.iss as string,
            exp: payload.exp,
            iat: payload.iat,
            jti: payload.jti,
            token_type: 'refresh_token',
            user_id: dbRefreshToken.userId ?? undefined,
        };
      }
    }
  }

  // 最终响应构建 (Final response construction)
  if (activeResponsePayload) {
    if (!activeResponsePayload.client_id) {
        console.warn("Active token introspection, but client_id could not be determined from token payload. Marking inactive.");
        return NextResponse.json<ApiResponse<IntrospectResponseInactive>>({ success: true, data: { active: false }, message: "Token details inconsistent (missing client_id in token)." }, { status: 200 });
    }

    // 使用 Zod 验证构建的活动响应 (Validate constructed active response with Zod)
    const parsedActiveResponse = introspectResponseActiveSchema.safeParse(activeResponsePayload);
    if (parsedActiveResponse.success) {
        return NextResponse.json<ApiResponse<IntrospectResponseActive>>({ success: true, data: parsedActiveResponse.data, message: "Token is active." }, { status: 200 });
    } else {
        console.error("Introspection active response schema validation failed:", parsedActiveResponse.error.flatten());
        throw new ConfigurationError('Internal server error processing token details for active token.', { zodIssues: parsedActiveResponse.error.flatten().fieldErrors });
    }
  }

  // 如果令牌无效、已过期、已撤销，或通过任何方式都找不到，则返回 active: false
  // If token is invalid, expired, revoked, or not found by any means, return active: false
  return NextResponse.json<ApiResponse<IntrospectResponseInactive>>({
    success: true,
    data: { active: false },
    message: "Token is not active."
  }, { status: 200 });
}

// 使用 withErrorHandling 包装处理函数 (Wrap the handler with withErrorHandling)
export const POST = withErrorHandling(introspectionHandlerInternal);

// 文件结束 (End Of File)
// EOF
