// 文件路径: app/api/v2/oauth/revoke/route.ts
// File path: app/api/v2/oauth/revoke/route.ts
// 描述: OAuth 2.0 令牌撤销端点 (RFC 7009)
// Description: OAuth 2.0 Token Revocation Endpoint (RFC 7009)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/utils/error-handler';
import { JWTUtils, ClientAuthUtils, OAuth2ErrorTypes as OldOAuth2ErrorTypes } from '@/lib/auth/oauth2'; // OldOAuth2ErrorTypes will be replaced by OAuth2ErrorCode
import * as jose from 'jose';
import { revokeTokenRequestSchema } from './schemas';
import { ApiResponse } from '@/lib/types/api';
import { OAuth2Error, OAuth2ErrorCode, BaseError, ValidationError } from '@/lib/errors';

/**
 * @swagger
 * /api/v2/oauth/revoke:
 *   post:
 *     summary: OAuth 2.0 令牌撤销 (Token Revocation) - RFC 7009
 *     description: |
 *       撤销一个访问令牌或刷新令牌 (RFC 7009)。
 *       Revokes an access token or a refresh token (RFC 7009).
 *       客户端通过提供令牌来进行撤销。服务器将验证客户端身份（如果适用）和令牌。
 *       The client makes a request by providing the token to be revoked. The server will validate client identity (if applicable) and the token.
 *       无论令牌是否有效或已被撤销，服务器通常都会返回 HTTP 200 OK，以防止信息泄露。
 *       The server typically returns HTTP 200 OK regardless of whether the token was valid or already revoked, to prevent information leakage.
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
 *             $ref: '#/components/schemas/RevokeTokenRequest'
 *     responses:
 *       '200':
 *         description: 令牌撤销请求已处理。 (Token revocation request processed.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseNull'
 *       '400':
 *         description: 无效的请求。 (Invalid request.)
 *       '401':
 *         description: 客户端认证失败。 (Client authentication failed.)
 *       '415':
 *         description: 不支持的媒体类型。 (Unsupported Media Type.)
 *       '500':
 *         description: 服务器内部错误。 (Internal server error.)
 * components:
 *   schemas:
 *     RevokeTokenRequest:
 *       type: object
 *       required: [token]
 *       properties:
 *         token: { type: string, description: "需要撤销的令牌。" }
 *         token_type_hint: { type: string, enum: [access_token, refresh_token], description: "可选的令牌类型提示。" }
 *         client_id: { type: string, description: "公共客户端的ID (如果未使用Basic Auth)。" }
 *         client_secret: { type: string, description: "机密客户端的密钥 (如果未使用Basic Auth)。" }
 *     ApiResponseNull: # 已在其他地方定义 (Defined elsewhere)
 *       allOf:
 *         - $ref: '#/components/schemas/ApiResponseBase'
 *         - type: object
 *           properties:
 *             data: { type: 'null', nullable: true }
 */
// 令牌撤销端点处理函数
// Token revocation endpoint handler function
async function revocationHandlerInternal(request: NextRequest): Promise<NextResponse> {
  // 检查请求的内容类型是否为 'application/x-www-form-urlencoded'
  // Check if the request content type is 'application/x-www-form-urlencoded'
  if (request.headers.get('content-type') !== 'application/x-www-form-urlencoded') {
    // 不支持的媒体类型，抛出 OAuth2Error
    // Unsupported media type, throw OAuth2Error
    throw new OAuth2Error(
      'Unsupported Media Type. Please use application/x-www-form-urlencoded.',
      OAuth2ErrorCode.InvalidRequest, // RFC 规定 Content-Type 错误通常是 415，但 OAuth2Error 没有直接的 UNSUPPORTED_MEDIA_TYPE。InvalidRequest + 详细信息是可接受的。
                                    // RFC states Content-Type errors are usually 415, but OAuth2Error doesn't have a direct UNSUPPORTED_MEDIA_TYPE. InvalidRequest + details is acceptable.
      415, // HTTP 415 Unsupported Media Type
      undefined,
      { expectedContentType: 'application/x-www-form-urlencoded' }
    );
  }

  const bodyParams = new URLSearchParams(await request.text());
  const rawBodyData: Record<string, any> = {};
  bodyParams.forEach((value, key) => { rawBodyData[key] = value; });

  // --- 客户端认证 ---
  // ClientAuthUtils.authenticateClient 现在会抛出错误
  // ClientAuthUtils.authenticateClient will now throw errors
  let authenticatedClient = await ClientAuthUtils.authenticateClient(request, bodyParams);

  // 公共客户端可能在请求体中提供 client_id，再次检查 (ClientAuthUtils 内部已处理，此逻辑可简化或移除)
  // Public clients might provide client_id in body, re-check (ClientAuthUtils handles this internally, this logic can be simplified or removed)
  if (!authenticatedClient && rawBodyData.client_id) { // ClientAuthUtils 会处理此情况 (ClientAuthUtils handles this case)
     // 如果 ClientAuthUtils 未能通过 body 中的 client_id 识别公共客户端，则此逻辑可能需要调整或依赖 ClientAuthUtils 的实现
     // If ClientAuthUtils failed to identify a public client via client_id in body, this logic might need adjustment or rely on ClientAuthUtils's impl.
     // 当前 ClientAuthUtils 实现应该已经覆盖了公共客户端的 body client_id 场景。
     // Current ClientAuthUtils implementation should already cover public client body client_id scenario.
  }
  // 如果到这里 authenticatedClient 仍然未定义，ClientAuthUtils 应该已经抛出了错误。
  // If authenticatedClient is still undefined here, ClientAuthUtils should have thrown an error.
  // 为了健壮性，可以再加一个检查，尽管理论上不应该执行到。
  // For robustness, an additional check can be added, though theoretically it shouldn't be reached.
  if (!authenticatedClient) {
    // This path should ideally not be reached if ClientAuthUtils.authenticateClient throws as expected.
    throw new OAuth2Error('Client authentication or identification failed unexpectedly after initial check.', OAuth2ErrorCode.InvalidClient, 401);
  }

  console.log(`Token revocation request authenticated for client: ${authenticatedClient.clientId}`);

  // --- 请求体验证 ---
  const validationResult = revokeTokenRequestSchema.safeParse(rawBodyData);
  if (!validationResult.success) {
    throw new OAuth2Error(
      validationResult.error.errors[0]?.message || 'Invalid revocation request parameters.',
      OAuth2ErrorCode.InvalidRequest,
      400,
      undefined,
      { issues: validationResult.error.flatten().fieldErrors }
    );
  }

  if (validationResult.data.client_id && validationResult.data.client_id !== authenticatedClient.clientId) {
    throw new OAuth2Error("client_id in body does not match authenticated client.", OAuth2ErrorCode.InvalidRequest, 400);
  }

  const { token: tokenToRevoke, token_type_hint: tokenTypeHint } = validationResult.data;

  // --- 令牌撤销逻辑 ---
  const tokenHash = JWTUtils.getTokenHash(tokenToRevoke);
  let tokenFoundAndRevoked = false;
  let revokedTokenDetails = { type: "unknown", idForLog: "unknown" };

  let decodedJwtPayload: jose.JWTPayload | null = null;
  try {
    decodedJwtPayload = jose.decodeJwt(tokenToRevoke);
  } catch (e) {
    console.warn("Revocation: Token provided is not a valid JWT, proceeding with hash-based lookup.", { error: (e as Error).message });
  }
  const jtiToBlacklist = decodedJwtPayload?.jti || null;

  // 尝试作为访问令牌处理
  // Attempt to process as an access token
  if (tokenTypeHint === 'access_token' || !tokenTypeHint) {
    const accessToken = await prisma.accessToken.findFirst({
      where: { tokenHash: tokenHash, clientId: authenticatedClient.id },
    });

    if (accessToken) {
      const effectiveJti = jtiToBlacklist || accessToken.id;
      await prisma.tokenBlacklist.upsert({
          where: { jti: effectiveJti },
          create: { jti: effectiveJti, tokenType: 'access_token', expiresAt: accessToken.expiresAt },
          update: { expiresAt: accessToken.expiresAt },
      });
      // 可选：直接从 AccessToken 表删除记录 (Optional: directly delete record from AccessToken table)
      // await prisma.accessToken.delete({ where: { id: accessToken.id }});
      tokenFoundAndRevoked = true;
      revokedTokenDetails = { type: "access_token", idForLog: accessToken.id };
      console.log(`Access token (ID: ${accessToken.id}) for client ${authenticatedClient.clientId} blacklisted.`);
    }
  }

  // 尝试作为刷新令牌处理
  // Attempt to process as a refresh token
  if (!tokenFoundAndRevoked && (tokenTypeHint === 'refresh_token' || !tokenTypeHint)) {
    const refreshToken = await prisma.refreshToken.findFirst({
      where: { tokenHash: tokenHash, clientId: authenticatedClient.id },
    });

    if (refreshToken && !refreshToken.isRevoked) {
      const effectiveJti = jtiToBlacklist || refreshToken.id;
      await prisma.$transaction(async (tx) => {
        await tx.refreshToken.update({
          where: { id: refreshToken.id },
          data: { isRevoked: true, revokedAt: new Date() },
        });
        await tx.tokenBlacklist.upsert({
            where: { jti: effectiveJti },
            create: { jti: effectiveJti, tokenType: 'refresh_token', expiresAt: refreshToken.expiresAt },
            update: { expiresAt: refreshToken.expiresAt },
        });
        tokenFoundAndRevoked = true;
        revokedTokenDetails = { type: "refresh_token", idForLog: refreshToken.id };
        console.log(`Refresh token (ID: ${refreshToken.id}) for client ${authenticatedClient.clientId} revoked and blacklisted.`);

        // 级联撤销相关访问令牌 (Cascading revocation for related access tokens)
        if (refreshToken.userId) {
          // 此处简化：实际级联可能更复杂，需要追踪令牌家族 (Simplified here: actual cascading might be more complex)
          const relatedAccessTokens = await tx.accessToken.findMany({
            where: { userId: refreshToken.userId, clientId: authenticatedClient.id, expiresAt: { gt: new Date() } }
          });
          if (relatedAccessTokens.length > 0) {
            const blacklistCascadeEntries = relatedAccessTokens.map(at => ({
                jti: at.id, // 假设 AccessToken.id 可用作 JTI (Assume AccessToken.id can be used as JTI)
                tokenType: 'access_token' as 'access_token' | 'refresh_token', // 类型断言 (Type assertion)
                expiresAt: at.expiresAt
            }));
            for (const entry of blacklistCascadeEntries) {
                await tx.tokenBlacklist.upsert({ where: {jti: entry.jti}, create: entry, update: {expiresAt: entry.expiresAt} });
            }
            console.log(`Cascaded revocation: ${relatedAccessTokens.length} access tokens blacklisted for user ${refreshToken.userId}.`);
          }
        }
      });
    }
  }

  // 记录审计事件 (Log audit event)
  await AuthorizationUtils.logAuditEvent({
      clientId: authenticatedClient.id,
      action: 'token_revocation_attempt',
      resource: `token_type_hint:${tokenTypeHint || 'any'}`,
      ipAddress: request.headers.get('x-forwarded-for') || request.ip || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true, // RFC 7009: 总是返回 200 (Always return 200 per RFC 7009)
      metadata: {
          token_hash_prefix: tokenHash.substring(0, 10),
          token_found_and_processed_as: tokenFoundAndRevoked ? revokedTokenDetails.type : 'none',
          actually_revoked_in_db: tokenFoundAndRevoked,
      },
  });

  // RFC 7009: 服务器以 HTTP 200 响应，无论令牌是否有效或已撤销。
  // RFC 7009: Server responds with HTTP 200 if token revoked or client submitted invalid token.
  return NextResponse.json<ApiResponse<null>>({
    success: true,
    message: "Token revocation request processed.", // 消息表明已处理，而非一定已撤销某个特定令牌 (Message indicates processed, not necessarily that a specific token was revoked)
    data: null
  }, { status: 200 });
}

// 使用 withErrorHandling 包装处理函数
// Wrap the handler with withErrorHandling
export const POST = withErrorHandling(revocationHandlerInternal);

// 文件结束 (End Of File)
// EOF
