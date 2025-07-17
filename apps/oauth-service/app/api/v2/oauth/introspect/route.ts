// 文件路径: app/api/v2/oauth/introspect/route.ts
// File path: app/api/v2/oauth/introspect/route.ts
// 描述: OAuth 2.0 令牌内省端点 (RFC 7662)
// Description: OAuth 2.0 Token Introspection Endpoint (RFC 7662)

import { ClientAuthUtils } from '@/lib/utils'; // 本地工具类
import { ConfigurationError, OAuth2Error, OAuth2ErrorCode } from '@/lib/errors';
import { withErrorHandling } from '@/app/utils/error-handler';
import { prisma } from '@repo/database';
import { JWTUtils, successResponse } from '@repo/lib/node';
import { NextRequest, NextResponse } from 'next/server';
import {
  IntrospectResponseActive,
  introspectResponseActiveSchema,
  introspectTokenRequestSchema,
} from './schemas';

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
  bodyParams.forEach((value, key) => {
    rawBodyData[key] = value;
  });

  // 转换为FormData以符合ClientAuthUtils.authenticateClient的参数类型
  const formData = new FormData();
  bodyParams.forEach((value, key) => {
    formData.append(key, value);
  });

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
  if (
    validationResult.data.client_id &&
    validationResult.data.client_id !== authenticatedClient.clientId
  ) {
    throw new OAuth2Error(
      'client_id in body does not match authenticated client.',
      OAuth2ErrorCode.InvalidRequest,
      400
    );
  }

  const { token, token_type_hint } = validationResult.data;
  let activeResponsePayload: IntrospectResponseActive | null = null;

  // --- 令牌验证逻辑 --- (Token Validation Logic)
  // 尝试作为访问令牌处理 (Attempt to process as an Access Token)
  if (token_type_hint === 'access_token' || !token_type_hint) {
    const atVerification = await JWTUtils.verifyToken(token);
    if (atVerification.valid && atVerification.payload) {
      const payload = atVerification.payload;
      if (payload.jti) {
        const blacklisted = await prisma.tokenBlacklist.findUnique({ where: { jti: payload.jti } });
        if (blacklisted) {
          return successResponse({ active: false }, 200, 'Token is blacklisted.');
        }
      }
      const dbAccessToken = await prisma.accessToken.findFirst({
        where: { tokenHash: JWTUtils.getTokenHash(token), expiresAt: { gt: new Date() } },
        include: { user: true },
      });

      // RFC7662: 令牌的 client_id 是指颁发给哪个客户端的，不一定与发起内省请求的客户端相同。
      // RFC7662: The token's client_id refers to whom it was issued, not necessarily the client making the introspection request.
      // 此处检查 payload.sub 是否与 dbAccessToken.userId 匹配是正确的。
      // Checking if payload.sub matches dbAccessToken.userId is correct here.
      if (
        dbAccessToken &&
        payload.sub ===
          dbAccessToken.userId /* && payload.client_id === dbAccessToken.clientId - This check is too restrictive for general introspection */
      ) {
        activeResponsePayload = {
          active: true,
          scope: ((payload.scope as string) || dbAccessToken.scope) ?? undefined,
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
    const rtVerification = await JWTUtils.verifyToken(token);
    if (rtVerification.valid && rtVerification.payload) {
      const payload = rtVerification.payload;
      if (payload.jti) {
        const blacklisted = await prisma.tokenBlacklist.findUnique({ where: { jti: payload.jti } });
        if (blacklisted) {
          return successResponse({ active: false }, 200, 'Token is blacklisted.');
        }
      }
      const dbRefreshToken = await prisma.refreshToken.findFirst({
        where: {
          tokenHash: JWTUtils.getTokenHash(token),
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      });
      if (
        dbRefreshToken &&
        payload.sub === dbRefreshToken.userId /* && payload.client_id === dbRefreshToken.clientId */
      ) {
        activeResponsePayload = {
          active: true,
          scope: ((payload.scope as string) || dbRefreshToken.scope) ?? undefined,
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
      console.warn(
        'Active token introspection, but client_id could not be determined from token payload. Marking inactive.'
      );
      return successResponse(
        { active: false },
        200,
        'Token details inconsistent (missing client_id in token).'
      );
    }

    // 使用 Zod 验证构建的活动响应 (Validate constructed active response with Zod)
    const parsedActiveResponse = introspectResponseActiveSchema.safeParse(activeResponsePayload);
    if (parsedActiveResponse.success) {
      return successResponse(parsedActiveResponse.data, 200, 'Token is active.');
    } else {
      console.error(
        'Introspection active response schema validation failed:',
        parsedActiveResponse.error.flatten()
      );
      throw new ConfigurationError(
        'Internal server error processing token details for active token.',
        { zodIssues: parsedActiveResponse.error.flatten().fieldErrors }
      );
    }
  }

  // 如果令牌无效、已过期、已撤销，或通过任何方式都找不到，则返回 active: false
  // If token is invalid, expired, revoked, or not found by any means, return active: false
  return successResponse({ active: false }, 200, 'Token is not active.');
}

// 使用 withErrorHandling 包装处理函数 (Wrap the handler with withErrorHandling)
export const POST = withErrorHandling(introspectionHandlerInternal);
