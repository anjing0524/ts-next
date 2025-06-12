// 文件路径: app/api/v2/auth/logout/route.ts
// 描述: 用户登出API端点 (v2)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';

import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { JWTUtils, AuthorizationUtils } from '@/lib/auth/oauth2'; // JWTUtils for token verification (optional here)
import { withAuth } from '@/lib/auth/middleware'; // 登出通常需要用户已认证

// 确保 JWTUtils.getTokenHash 存在或在此处定义一个临时的
const getTokenHash = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// --- 请求 Schema ---
const LogoutRequestSchema = z.object({
  refresh_token: z.string().min(1, '刷新令牌 (refresh_token) 不能为空'),
  // all_sessions: z.boolean().optional().default(false).describe('是否登出所有会话 (不仅仅是当前refresh_token关联的会话)'),
});

/**
 * @swagger
 * /api/v2/auth/logout:
 *   post:
 *     summary: 用户登出 (User Logout)
 *     description: |
 *       使用提供的刷新令牌使用户会话失效。
 *       成功登出后，该刷新令牌及其关联的访问令牌（如果服务器端有此逻辑）将不再有效。
 *       此端点通常需要认证的请求 (即用户必须已登录才能登出)。
 *     tags:
 *       - Auth V2
 *     security:
 *       - bearerAuth: [] # 通常登出请求本身也需要一个有效的访问令牌来验证用户身份
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refresh_token:
 *                 type: string
 *                 description: 需要使其失效的刷新令牌。
 *     produces:
 *       - application/json
 *     responses:
 *       '200':
 *         description: 登出成功。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "登出成功 (Logout successful)"
 *       '400':
 *         description: 无效的请求 (例如，缺少 refresh_token)。
 *       '401':
 *         description: 未经授权 (例如，访问令牌无效或与刷新令牌用户不匹配)。
 *       '404':
 *         description: 刷新令牌未找到或已被撤销。
 *       '500':
 *         description: 服务器内部错误。
 */
async function logoutHandler(request: NextRequest, authContext: any /* from withAuth */) {
  const overallRequestId = (request as any).requestId; // from withErrorHandler
  const body = await request.json();

  const validationResult = LogoutRequestSchema.safeParse(body);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.flatten().fieldErrors;
    return NextResponse.json(
      errorResponse(400, `无效的请求体: ${JSON.stringify(errorMessages)}`, 'VALIDATION_ERROR', overallRequestId),
      { status: 400 }
    );
  }

  const { refresh_token: refreshTokenString } = validationResult.data;
  const currentUserId = authContext.user_id; // 从 withAuth 中间件获取当前认证用户ID

  // 1. (可选) 验证刷新令牌结构，但不验证其签名或过期，因为目的是使其失效
  //    这一步主要是为了快速失败格式错误的令牌。
  //    const refreshTokenPayload = JWTUtils.decodeJwt(refreshTokenString); // 假设有此方法
  //    if (!refreshTokenPayload || !refreshTokenPayload.jti) {
  //      return NextResponse.json(errorResponse(400, '无效的刷新令牌格式', 'INVALID_TOKEN_FORMAT', overallRequestId), { status: 400 });
  //    }

  // 2. 在数据库中查找并撤销刷新令牌
  const refreshTokenHash = getTokenHash(refreshTokenString);
  const storedRefreshToken = await prisma.refreshToken.findFirst({
    where: {
      tokenHash: refreshTokenHash,
      revoked: false, // 只找未被撤销的
    },
  });

  if (!storedRefreshToken) {
    // 即便令牌未找到或已被撤销，也可能返回成功，以避免泄露令牌状态。
    // 但为了更明确的客户端反馈，这里返回404。根据安全策略调整。
    await AuthorizationUtils.logAuditEvent({
        userId: currentUserId, // 操作者
        action: 'logout_failed_token_not_found',
        ipAddress: request.ip,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: 'Refresh token not found or already revoked.',
        metadata: { providedTokenHashSubstr: refreshTokenHash.substring(0,10) }
    });
    return NextResponse.json(
      errorResponse(404, '刷新令牌未找到或已被撤销 (Refresh token not found or already revoked)', 'TOKEN_NOT_FOUND', overallRequestId),
      { status: 404 }
    );
  }

  // 3. 验证操作权限：确保当前认证用户是该刷新令牌的所有者
  if (storedRefreshToken.userId !== currentUserId) {
    await AuthorizationUtils.logAuditEvent({
        userId: currentUserId, // 操作者
        actorId: storedRefreshToken.userId, // 令牌的实际拥有者
        action: 'logout_failed_permission_denied',
        ipAddress: request.ip,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: 'User does not have permission to revoke this refresh token.',
        metadata: { tokenId: storedRefreshToken.id }
    });
    return NextResponse.json(
      errorResponse(403, '无权操作此刷新令牌 (Permission denied to revoke this refresh token)', 'FORBIDDEN', overallRequestId),
      { status: 403 }
    );
  }

  // 4. 撤销刷新令牌
  await prisma.refreshToken.update({
    where: { id: storedRefreshToken.id },
    data: { revoked: true, revokedAt: new Date() },
  });

  // 5. (可选) 撤销与此刷新令牌关联的所有活动访问令牌
  //    这需要 AccessToken 表与 RefreshToken 表有某种关联，或者通过 userId 和 clientId 查找。
  //    如果 AccessToken 表有 refreshTokenId 字段：
  //    await prisma.accessToken.updateMany({
  //      where: { refreshTokenId: storedRefreshToken.id, revoked: false },
  //      data: { revoked: true, revokedAt: new Date() },
  //    });
  //    或者，如果通过用户和客户端关联：
  await prisma.accessToken.updateMany({
    where: {
      userId: storedRefreshToken.userId,
      clientId: storedRefreshToken.clientId, // 确保只撤销同一用户、同一客户端的访问令牌
      revoked: false,
      expiresAt: { gt: new Date() } // 只撤销未过期的
    },
    data: { revoked: true, revokedAt: new Date() }
  });

  await AuthorizationUtils.logAuditEvent({
      userId: currentUserId,
      clientId: storedRefreshToken.clientId,
      action: 'user_logout_success',
      ipAddress: request.ip,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true,
      metadata: { revokedRefreshTokenId: storedRefreshToken.id }
  });

  // 6. 返回成功响应
  return NextResponse.json(
    successResponse(null, 200, '登出成功 (Logout successful)', overallRequestId),
    { status: 200 }
  );
}

// 登出操作需要用户已认证，因此使用 withAuth 中间件
export const POST = withErrorHandler(withAuth(logoutHandler, { requireUserContext: true }));

EOF
