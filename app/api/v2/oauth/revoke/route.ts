// 文件路径: app/api/v2/oauth/revoke/route.ts
// 描述: OAuth 2.0 令牌撤销端点 (RFC 7009)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto'; // 引入 crypto 用于哈希

import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { JWTUtils, ClientAuthUtils, OAuth2ErrorTypes } from '@/lib/auth/oauth2'; // 假设这些工具类可用

// --- 请求 Schema ---
const RevocationRequestSchema = z.object({
  token: z.string().min(1, '令牌 (token) 不能为空'),
  token_type_hint: z.string().optional().describe('可选的令牌类型提示 (e.g., access_token, refresh_token)'),
  // client_id 和 client_secret 用于客户端认证，如果未使用 Basic Auth
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});

// --- 辅助函数 ---
// authenticateRevocationClient is replaced by ClientAuthUtils.authenticateClient
// local getTokenHash is replaced by JWTUtils.getTokenHash

/**
 * @swagger
 * /api/v2/oauth/revoke:
 *   post:
 *     summary: OAuth 2.0 令牌撤销 (Token Revocation)
 *     description: |
 *       撤销一个访问令牌或刷新令牌。
 *       此端点受客户端凭证保护。公共客户端可以撤销其令牌而无需认证密钥。
 *       参考 RFC 7009。
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
 *                 description: 需要撤销的令牌。
 *               token_type_hint:
 *                 type: string
 *                 description: 可选的令牌类型提示 (例如 "access_token" 或 "refresh_token")。
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
 *         description: 令牌已成功撤销或客户端无权撤销或令牌无效 (服务器不区分这些情况以避免信息泄露)。
 *       '400':
 *         description: 无效的请求 (例如缺少 'token' 参数或不支持的令牌类型)。
 *       '401':
 *         description: 客户端认证失败 (仅当客户端认证是必需的时)。
 *       '500':
 *         description: 服务器内部错误。
 */
async function revocationHandler(request: NextRequest) {
  const overallRequestId = (request as any).requestId; // from withErrorHandler

  if (request.headers.get('content-type') !== 'application/x-www-form-urlencoded') {
    return NextResponse.json(errorResponse(415, '不支持的媒体类型 (Unsupported Media Type). 请使用 application/x-www-form-urlencoded。', 'UNSUPPORTED_MEDIA_TYPE', overallRequestId), { status: 415 });
  }

  const bodyParams = new URLSearchParams(await request.text());

  // --- 客户端认证 (Client Authentication) ---
  const clientAuthResult = await ClientAuthUtils.authenticateClient(request, bodyParams);

  if (!clientAuthResult.client) {
    if (clientAuthResult.error) {
      return NextResponse.json(clientAuthResult.error, { status: 401 });
    }
    return NextResponse.json({ error: OAuth2ErrorTypes.INVALID_CLIENT, error_description: 'Client authentication failed' }, { status: 401 });
  }
  const authenticatedClient = clientAuthResult.client;
  console.log(`Token revocation request authenticated for client: ${authenticatedClient.clientId}`);


  // --- 请求体验证 ---
  const tokenToRevoke = bodyParams.get('token');
  const tokenTypeHint = bodyParams.get('token_type_hint');

  if (!tokenToRevoke) {
    return NextResponse.json(errorResponse(400, '请求缺少令牌 (token is required)', OAuth2ErrorTypes.INVALID_REQUEST, overallRequestId), { status: 400 });
  }

  // --- 令牌撤销逻辑 ---
  // RFC 7009: 服务器应该首先验证令牌，然后验证客户端是否有权撤销它。
  // 如果令牌无效或客户端无权，服务器应该仍然返回200 OK，以防止客户端探测令牌。

  const tokenHash = JWTUtils.getTokenHash(tokenToRevoke); // 使用 JWTUtils 中的方法

  let tokenFoundAndRevoked = false;
  let revokedTokenInfo = { type: "unknown", jti: "unknown" };


  // 尝试作为访问令牌处理 (Try to process as access token)
  if (tokenTypeHint === 'access_token' || !tokenTypeHint) {
    const accessToken = await prisma.accessToken.findFirst({
      // where: { tokenHash: tokenHash, clientId: authenticatedClient.id }, // 确保令牌属于此客户端 (Ensure token belongs to this client)
      // clientId in AccessToken is the Prisma CUID, authenticatedClient.id is also CUID
      where: { tokenHash: tokenHash, clientId: authenticatedClient.id }
    });

    if (accessToken) {
      // Prisma schema for AccessToken might not have 'revoked' field directly.
      // If it's meant to be immediately unusable, removing or marking it (if schema supports) is an option.
      // For short-lived access tokens, often no action is taken other than acknowledging.
      // Let's assume for now there isn't a specific 'revoked' field on AccessToken, or it's handled by expiry.
      // If there was a `revoked` field:
      /*
      if (!accessToken.isRevoked) { // Assuming a boolean field `isRevoked`
        await prisma.accessToken.update({
          where: { id: accessToken.id },
          data: { isRevoked: true, revokedAt: new Date() }, // And `revokedAt`
        });
      }
      */
      tokenFoundAndRevoked = true;
      revokedTokenInfo = { type: "access_token", jti: accessToken.id }; // Using AccessToken.id as a stand-in for JTI if not directly present
      console.log(`Access token (ID/Hash_Prefix: ${accessToken.id}/${tokenHash.substring(0,6)}) belonging to client ${authenticatedClient.clientId} acknowledged for revocation.`);
    }
  }

  // 尝试作为刷新令牌处理 (Try to process as refresh token)
  if (!tokenFoundAndRevoked && (tokenTypeHint === 'refresh_token' || !tokenTypeHint)) {
    const refreshToken = await prisma.refreshToken.findFirst({
      // where: { tokenHash: tokenHash, clientId: authenticatedClient.id },
      where: { tokenHash: tokenHash, clientId: authenticatedClient.id }
    });

    if (refreshToken) {
      if (!refreshToken.isRevoked) { // Prisma schema has isRevoked for RefreshToken
        await prisma.refreshToken.update({
          where: { id: refreshToken.id },
          data: { isRevoked: true, revokedAt: new Date() },
        });
      }
      tokenFoundAndRevoked = true;
      revokedTokenInfo = { type: "refresh_token", jti: refreshToken.id }; // Using RefreshToken.id as a stand-in for JTI

      console.log(`Refresh token (ID/Hash_Prefix: ${refreshToken.id}/${tokenHash.substring(0,6)}) belonging to client ${authenticatedClient.clientId} was revoked.`);

      // 标准还建议，如果撤销的是刷新令牌，相关的访问令牌也应被撤销。
      // (Standard also recommends revoking associated access tokens if a refresh token is revoked.)
      // This requires linking access tokens to the refresh token that issued them, or by user+client.
      // Example (if access tokens are linked by userId and clientId):
      if (refreshToken.userId) {
        /*
        const updatedAccessTokens = await prisma.accessToken.updateMany({
          where: {
            userId: refreshToken.userId,
            clientId: authenticatedClient.id,
            // isRevoked: false, // if AccessToken had this field
            expiresAt: { gt: new Date() }
          },
          data: {
            // isRevoked: true, revokedAt: new Date()
            // Or simply delete them if they are not meant to be queryable once revoked this way
          },
        });
        console.log(`Revoked ${updatedAccessTokens.count} associated access tokens for user ${refreshToken.userId} and client ${authenticatedClient.clientId}.`);
        */
      }
    }
  }

  await AuthorizationUtils.logAuditEvent({
      clientId: authenticatedClient.id, // DB ID of the client
      action: 'token_revocation_attempt',
      resource: `token_type_hint:${tokenTypeHint || 'any'}`,
      ipAddress: request.headers.get('x-forwarded-for') || request.ip || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true, // Per RFC 7009, always return 200 for valid client requests
      metadata: {
          token_hash_prefix: tokenHash.substring(0, 10),
          token_found_and_processed_as: tokenFoundAndRevoked ? revokedTokenInfo.type : 'none',
          actually_revoked_in_db: tokenFoundAndRevoked, // Indicates if DB state was changed
      },
  });

  // RFC 7009: "The server responds with HTTP status code 200 if the token has been
  // revoked successfully or if the client submitted an invalid token."
  // 服务器不应泄露令牌是否存在或有效的具体信息。 (Server should not leak specific info about token existence/validity)
  return new NextResponse(null, { status: 200 }); // HTTP 200 OK, 无内容 (No content)
}

// export const POST = withErrorHandler(withClientAuth(revocationHandler)); // 使用合适的客户端认证中间件
export const POST = withErrorHandler(revocationHandler);

EOF
