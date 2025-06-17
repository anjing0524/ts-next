// /api/v2/account/sessions/[sessionId]
// 描述: 处理特定会话 (基于RefreshToken ID) 的撤销请求。
// (Handles DELETE requests for a specific session, identified by RefreshToken ID.)

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { RefreshToken, Prisma } from '@prisma/client'; // Import Prisma types for type safety
import * as jose from 'jose'; // For decoding JWTs to get JTIs

interface RouteContext {
  params: {
    sessionId: string; // This will be the ID of the RefreshToken record
  };
}

/**
 * @swagger
 * /api/v2/account/sessions/{sessionId}:
 *   delete:
 *     summary: 撤销（删除）用户指定的会话 (个人账户管理)
 *     description: 允许当前已认证用户撤销其特定的活动会话（刷新令牌）。这将使该刷新令牌失效，并可能使其派生的访问令牌失效。
 *     tags: [Account API]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         description: 要撤销的会话ID (即刷新令牌的数据库ID)。
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: 会话已成功撤销。
 *       401:
 *         description: 用户未认证。
 *       403:
 *         description: 禁止访问（例如，尝试撤销不属于自己的会话）。
 *       404:
 *         description: 未找到指定的会话ID。
 *       500:
 *         description: 服务器内部错误。
 */
async function deleteUserSessionHandler(request: AuthenticatedRequest, context: RouteContext) {
  const currentUserId = request.user?.id;
  if (!currentUserId) {
    return NextResponse.json({ message: "Unauthorized: User ID not found in token." }, { status: 401 });
  }

  const { sessionId } = context.params;
  if (!sessionId) {
    return NextResponse.json({ message: "Session ID is required." }, { status: 400 });
  }

  // 当前请求的访问令牌的JTI (如果存在) - 用于防止用户撤销当前操作所依赖的会话
  // This is complex because the current access token might not be directly linked to one specific refresh token
  // if multiple refresh tokens exist for the same user/client.
  // A simpler rule is just to revoke the specified refresh token by its ID.
  // The "don't revoke current session" rule is more for traditional session cookie based systems.
  // For JWTs, revoking the refresh token that *might* have led to the current access token is usually fine.

  try {
    const refreshTokenToRevoke = await prisma.refreshToken.findUnique({
      where: { id: sessionId },
    });

    if (!refreshTokenToRevoke) {
      return NextResponse.json({ message: "会话未找到 (Session not found)." }, { status: 404 });
    }

    // 验证此会话是否属于当前认证的用户
    // (Verify this session belongs to the currently authenticated user)
    if (refreshTokenToRevoke.userId !== currentUserId) {
      console.warn(`User ${currentUserId} attempt to revoke session ${sessionId} belonging to user ${refreshTokenToRevoke.userId}.`);
      // Return 404 to not reveal existence of session for another user, or 403 for forbidden.
      return NextResponse.json({ message: "会话未找到或无权操作 (Session not found or not authorized to perform this action)." }, { status: 404 });
    }

    if (refreshTokenToRevoke.isRevoked) {
        // 会话已被撤销，直接返回成功 (Session already revoked, return success)
        return new NextResponse(null, { status: 204 });
    }

    // 执行撤销操作 (Perform revocation)
    await prisma.$transaction(async (tx) => {
      // 1. 标记 RefreshToken 为已撤销
      await tx.refreshToken.update({
        where: { id: sessionId },
        data: { isRevoked: true, revokedAt: new Date() },
      });

      // 2. 将 RefreshToken JTI (或其ID作为JTI的代理) 添加到黑名单
      //    假设 RefreshToken.id 可以作为其 JTI 或与嵌入的 JTI 相关联
      //    如果 RefreshToken 本身是 JWT, 解码获取 JTI
      let rtJti = refreshTokenToRevoke.id; // Fallback to using DB ID as JTI for blacklisting
      try {
        // If raw token was stored, you could decode it. Assuming it's not stored.
        // const decodedRt = jose.decodeJwt(refreshTokenToRevoke.token);
        // if (decodedRt.jti) rtJti = decodedRt.jti;
      } catch (e) { console.warn("Could not decode refresh token to get JTI for blacklisting, using its ID."); }

      await tx.tokenBlacklist.upsert({
        where: { jti: rtJti },
        create: { jti: rtJti, tokenType: 'refresh_token', expiresAt: refreshTokenToRevoke.expiresAt },
        update: { expiresAt: refreshTokenToRevoke.expiresAt }, // Ensure expiry is updated if re-blacklisted
      });
      console.log(`User ${currentUserId} revoked session (RefreshToken ID: ${sessionId}, JTI for blacklist: ${rtJti}).`);

      // 3. 级联撤销: 将与此 RefreshToken 相关的 AccessToken 也加入黑名单
      //    这需要确定哪些 AccessToken 是由此 RefreshToken (或其家族) 派生的。
      //    一个简化的方法是：撤销该用户和该客户端下的所有未过期 AccessToken。
      //    更精确的方法需要 AccessToken 与 RefreshToken 的直接关联 (例如，AccessToken.refreshTokenId)。
      //    当前 Prisma schema 中 AccessToken 没有直接外键到 RefreshToken。
      //    所以，我们将撤销该用户和该客户端下的所有未过期 AccessToken。
      const relatedAccessTokens = await tx.accessToken.findMany({
        where: {
          userId: currentUserId,
          clientId: refreshTokenToRevoke.clientId, // Tokens issued to the same client
          expiresAt: { gt: new Date() },
          // AND NOT (id IN (SELECT jti FROM TokenBlacklist WHERE tokenType = 'access_token')) // Avoid re-blacklisting
        },
      });

      if (relatedAccessTokens.length > 0) {
        const blacklistEntries = [];
        for (const at of relatedAccessTokens) {
            let accessJti = at.id; // Fallback: use AccessToken.id as JTI
            try {
                // If raw token was stored on AT model, decode it here. Assume not.
                // const decodedAt = jose.decodeJwt(at.token);
                // if (decodedAt.jti) accessJti = decodedAt.jti;
            } catch(e) { console.warn(`Could not decode AT ${at.id} to get JTI during cascading revoke, using its ID.`);}

            blacklistEntries.push({ jti: accessJti, tokenType: 'access_token', expiresAt: at.expiresAt });
        }

        // Batch upsert into blacklist
        for (const entry of blacklistEntries) {
            await tx.tokenBlacklist.upsert({
                where: {jti: entry.jti},
                create: entry,
                update: {expiresAt: entry.expiresAt}
            });
        }
        console.log(`Cascading revocation for user ${currentUserId}, client ID (DB) ${refreshTokenToRevoke.clientId}: ${blacklistEntries.length} access tokens blacklisted.`);
      }
    });

    return new NextResponse(null, { status: 204 }); // 成功，无内容 (Success, no content)

  } catch (error) {
    console.error(`Error revoking session ${sessionId} for user ${currentUserId}:`, error);
    // 检查是否是 Prisma 的记录未找到错误 (例如，在事务内部的查询)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ message: "会话或关联记录未找到 (Session or related record not found during operation)." }, { status: 404 });
    }
    return NextResponse.json({ message: "撤销会话时发生错误 (Error revoking session)." }, { status: 500 });
  }
}
export const DELETE = requirePermission()(deleteUserSessionHandler);
