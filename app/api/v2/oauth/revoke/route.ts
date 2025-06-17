// 文件路径: app/api/v2/oauth/revoke/route.ts
// 描述: OAuth 2.0 令牌撤销端点 (RFC 7009)

import { NextRequest, NextResponse } from 'next/server';
// import { z } from 'zod'; // Zod is imported from schemas.ts
// import crypto from 'crypto'; // crypto is used by JWTUtils.getTokenHash, not directly here

import { prisma } from '@/lib/prisma';
// successResponse and errorResponse are not used in this specific version of the file.
// import { successResponse, errorResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { JWTUtils, ClientAuthUtils, OAuth2ErrorTypes } from '@/lib/auth/oauth2'; // Using JWTUtils from oauth2.ts
import * as jose from 'jose'; // For decoding JWT to get JTI

// Import Zod schema from the dedicated schema file
import { revokeTokenRequestSchema, RevokeTokenRequestPayload } from './schemas';


/**
 * @swagger
 * /api/v2/oauth/revoke:
 *   post:
 *     summary: OAuth 2.0 令牌撤销 (Token Revocation) - RFC 7009
 *     description: |
 *       撤销一个访问令牌或刷新令牌 (RFC 7009).
 *       客户端通过提供令牌来进行撤销。服务器将验证客户端身份（如果适用）和令牌。
 *       无论令牌是否有效或已被撤销，服务器通常都会返回 HTTP 200 OK，以防止信息泄露。
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
 *                 enum: [access_token, refresh_token]
 *                 description: 可选的令牌类型提示。
 *               client_id:
 *                 type: string
 *                 description: (如果未使用Basic Auth且客户端是公共的) 进行请求的客户端ID。
 *               client_secret:
 *                 type: string
 *                 description: (如果未使用Basic Auth且客户端是机密的) 客户端密钥。
 *             required:
 *               - token
 *     responses:
 *       '200':
 *         description: 令牌已成功撤销，或者令牌无效/未知（服务器不区分以防信息泄露）。
 *         content:
 *           application/json:
 *             schema:
 *               type: object # 通常为空响应体
 *       '400':
 *         description: 无效的请求（例如，缺少 'token' 参数，或请求格式不正确）。
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OAuthError'
 *       '401':
 *         description: 客户端认证失败。
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OAuthError'
 *       '415':
 *         description: 不支持的媒体类型（请求体必须是 application/x-www-form-urlencoded）。
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OAuthError'
 *       '500':
 *         description: 服务器内部错误。
 */
async function revocationHandler(request: NextRequest) {
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
  let authenticatedClient = clientAuthResult.client;

  // Handle public clients that might provide client_id in body
  if (!authenticatedClient && rawBodyData.client_id && !clientAuthResult.error) {
    const publicClientCheck = await prisma.oAuthClient.findUnique({
      where: { clientId: rawBodyData.client_id as string, isActive: true, clientType: 'PUBLIC' }
    });
    if (publicClientCheck) authenticatedClient = publicClientCheck;
  }

  // If client authentication is required (e.g. confidential client) and failed, or no client identified
  if (!authenticatedClient) {
    return NextResponse.json(
      clientAuthResult.error || { error: OAuth2ErrorTypes.INVALID_CLIENT, error_description: 'Client authentication or identification failed.' },
      { status: 401 }
    );
  }
  console.log(`Token revocation request potentially for client: ${authenticatedClient.clientId}`);

  // --- 请求体验证 (Using imported Zod schema) ---
  const validationResult = revokeTokenRequestSchema.safeParse(rawBodyData);
  if (!validationResult.success) {
    return NextResponse.json(
      { error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: validationResult.error.errors[0]?.message || 'Invalid revocation request parameters.', issues: validationResult.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  // client_id from body, if present, must match authenticated client
  if (validationResult.data.client_id && validationResult.data.client_id !== authenticatedClient.clientId) {
    return NextResponse.json({ error: OAuth2ErrorTypes.INVALID_REQUEST, error_description: "client_id in body does not match authenticated client." }, { status: 400 });
  }

  const { token: tokenToRevoke, token_type_hint: tokenTypeHint } = validationResult.data;

  // --- 令牌撤销逻辑 ---
  const tokenHash = JWTUtils.getTokenHash(tokenToRevoke); // From lib/auth/oauth2.ts
  let tokenFoundAndRevoked = false;
  let revokedTokenInfo = { type: "unknown", idForLog: "unknown" }; // Corrected variable name

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
