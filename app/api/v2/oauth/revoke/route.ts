// 文件路径: app/api/v2/oauth/revoke/route.ts
// 描述: OAuth 2.0 令牌撤销端点 (RFC 7009)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto'; // 引入 crypto 用于哈希

import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { JWTUtils, ClientAuthUtils, OAuth2ErrorTypes } from '@/lib/auth/oauth2'; // 假设这些工具类可用

// --- Zod Schema for Revocation Request Body ---
const RevocationRequestSchema = z.object({
  token: z.string({ required_error: "token is required" }).min(1, '令牌 (token) 不能为空'),
  token_type_hint: z.enum(['access_token', 'refresh_token']).optional().describe('可选的令牌类型提示 (e.g., access_token, refresh_token)'),
  // client_id and client_secret are implicitly handled by ClientAuthUtils if passed in body,
  // but primarily ClientAuthUtils checks Authorization header first.
  // Zod schema here focuses on token and hint.
});


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
  const rawBodyData: Record<string, any> = {};
  bodyParams.forEach((value, key) => { rawBodyData[key] = value; });


  // --- 客户端认证 (Client Authentication) ---
  // ClientAuthUtils.authenticateClient handles Basic Auth (from header) or client_id/secret from body (via bodyParams)
  const clientAuthResult = await ClientAuthUtils.authenticateClient(request, bodyParams);

  if (!clientAuthResult.client) {
    // RFC 7009: If client authentication fails, the server an error response as described in RFC 6749, Section 5.2.
    return NextResponse.json(
      clientAuthResult.error || { error: OAuth2ErrorTypes.INVALID_CLIENT, error_description: 'Client authentication failed' },
      { status: 401 }
    );
  }
  const authenticatedClient = clientAuthResult.client;
  console.log(`Token revocation request authenticated for client: ${authenticatedClient.clientId}`);

  // --- 请求体验证 (Using Zod on rawBodyData which includes token and hint) ---
  const validationResult = RevocationRequestSchema.safeParse(rawBodyData);
  if (!validationResult.success) {
    return NextResponse.json(
      errorResponse(400, validationResult.error.errors[0]?.message || 'Invalid revocation request parameters.', OAuth2ErrorTypes.INVALID_REQUEST, overallRequestId),
      { status: 400 }
    );
  }

  const { token: tokenToRevoke, token_type_hint: tokenTypeHint } = validationResult.data;

  // --- 令牌撤销逻辑 ---
  const tokenHash = JWTUtils.getTokenHash(tokenToRevoke);
  let tokenFoundAndRevoked = false;
  let revokedTokenDetails = { type: "unknown", idForLog: "unknown" };

  // JWTs contain a 'jti' (JWT ID) claim. We should use this for blacklisting if possible.
  // For opaque tokens stored by hash, we use the hash.
  // Let's assume for now that our JWTs have 'jti' and we can decode them to get it.
  // If not, AccessToken.id or RefreshToken.id (if they are unique like JTIs) can be used.

  let decodedJwtPayload: jose.JWTPayload | null = null;
  try {
    decodedJwtPayload = jose.decodeJwt(tokenToRevoke);
  } catch (e) {
    // Not a JWT, or malformed. Proceed with hash-based lookup.
    console.warn("Revocation: Token provided is not a valid JWT, proceeding with hash-based lookup.", e);
  }
  const jtiToBlacklist = decodedJwtPayload?.jti || null;


  // 尝试作为访问令牌处理
  if (tokenTypeHint === 'access_token' || !tokenTypeHint) {
    const accessToken = await prisma.accessToken.findFirst({
      where: { tokenHash: tokenHash, clientId: authenticatedClient.id },
    });

    if (accessToken) {
      // Add to TokenBlacklist. Use JTI if available, otherwise the token's own ID or hash.
      // Assuming AccessToken.id can serve as a unique identifier if JTI is not part of its direct model.
      // The JWTUtils.createAccessToken *does* add a JTI. So jwtPayload.jti should be preferred.
      const effectiveJti = jtiToBlacklist || accessToken.id; // Fallback to accessToken.id if JTI not in JWT

      await prisma.tokenBlacklist.upsert({
          where: { jti: effectiveJti },
          create: { jti: effectiveJti, tokenType: 'access_token', expiresAt: accessToken.expiresAt },
          update: { expiresAt: accessToken.expiresAt }, // Update expiry if somehow re-blacklisted
      });
      // Optionally, delete the AccessToken entry if it's not needed for audit/other purposes post-revocation
      // await prisma.accessToken.delete({ where: { id: accessToken.id } });

      tokenFoundAndRevoked = true;
      revokedTokenDetails = { type: "access_token", idForLog: accessToken.id };
      console.log(`Access token (ID: ${accessToken.id}) for client ${authenticatedClient.clientId} blacklisted.`);
    }
  }

  // 尝试作为刷新令牌处理
  if (!tokenFoundAndRevoked && (tokenTypeHint === 'refresh_token' || !tokenTypeHint)) {
    const refreshToken = await prisma.refreshToken.findFirst({
      where: { tokenHash: tokenHash, clientId: authenticatedClient.id },
    });

    if (refreshToken && !refreshToken.isRevoked) {
      const effectiveJti = jtiToBlacklist || refreshToken.id; // Fallback to refreshToken.id

      await prisma.$transaction(async (tx) => {
        // 1. Revoke the refresh token itself (mark as revoked and add to blacklist)
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

        // 2. Cascading Revocation: Invalidate related Access Tokens
        // Find access tokens that could have been derived from this refresh token family.
        // This is a simplified approach; a more robust one might trace a chain of refresh tokens if rotation creates new DB IDs.
        // For now, assume access tokens are linked by user and client, and their expiry is relevant.
        if (refreshToken.userId) {
          const relatedAccessTokens = await tx.accessToken.findMany({
            where: {
              userId: refreshToken.userId,
              clientId: authenticatedClient.id,
              expiresAt: { gt: new Date() }, // Only active ones
              // We need a way to get their JTIs if not directly stored on AccessToken model
              // For now, we'll assume AccessToken.id is usable as a JTI for blacklisting.
            }
          });

          if (relatedAccessTokens.length > 0) {
            const blacklistEntries = relatedAccessTokens.map(at => {
              // Attempt to decode each access token to get its JTI for blacklisting
              // This is inefficient. Ideally, JTI is stored on AccessToken model.
              let accessJti = at.id; // Fallback
              try {
                const decodedAt = jose.decodeJwt(at.token); // Assuming raw token is stored for this...
                if(decodedAt.jti) accessJti = decodedAt.jti;
              } catch(e) { console.warn("Could not decode AT to get JTI during cascading revoke, using ID as JTI."); }

              return { jti: accessJti, tokenType: 'access_token', expiresAt: at.expiresAt };
            });

            // Batch upsert into blacklist
            // Prisma createMany does not support `onConflict` or `upsert` directly in batch.
            // Loop for upsert (can be slow for many tokens, consider raw SQL or batching logic for production)
            for (const entry of blacklistEntries) {
                await tx.tokenBlacklist.upsert({
                    where: {jti: entry.jti},
                    create: entry,
                    update: {expiresAt: entry.expiresAt} // Keep it simple, just update expiry if re-blacklisted
                });
            }
            // Optional: Delete the AccessToken entries from their original table
            // await tx.accessToken.deleteMany({ where: { id: { in: relatedAccessTokens.map(at => at.id) } } });
            console.log(`Cascaded revocation: ${relatedAccessTokens.length} access tokens blacklisted for user ${refreshToken.userId}, client ${authenticatedClient.clientId}.`);
          }
        }
      });
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
