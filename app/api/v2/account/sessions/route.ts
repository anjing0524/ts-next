// /api/v2/account/sessions
// 描述: 处理当前认证用户活动会话 (基于RefreshToken) 的获取请求。
// (Handles GET requests for the currently authenticated user's active sessions, based on RefreshTokens.)

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { RefreshToken } from '@prisma/client';

// 定义会话响应中期望的字段结构
// (Define expected field structure in session response)
interface SessionResponseItem {
  id: string; // Refresh Token ID or JTI
  // ipAddress: string | null; // Currently not stored on RefreshToken model
  // userAgent: string | null; // Currently not stored on RefreshToken model
  clientId: string; // ClientId from the associated OAuthClient
  clientName: string | null; // ClientName from the associated OAuthClient
  createdAt: string;
  expiresAt: string;
  lastAccessedAt?: string; // This might be similar to createdAt or updatedAt of the RT
  isCurrentSession: boolean; // Hard to determine server-side reliably with JWTs
}


/**
 * @swagger
 * /api/v2/account/sessions:
 *   get:
 *     summary: 列出当前用户的活动会话 (个人账户管理)
 *     description: 检索当前已认证用户的所有活动会话列表，这些会话基于有效的刷新令牌。
 *     tags: [Account API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取活动会话列表。
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserSessionInfo'
 *       401:
 *         description: 用户未认证。
 * components:
 *   schemas:
 *     UserSessionInfo:
 *       type: object
 *       properties:
 *         id: { type: string, description: "会话的唯一标识符 (通常是刷新令牌的ID或JTI)。" }
 *         clientId: { type: string, description: "关联的OAuth客户端ID字符串。" }
 *         clientName: { type: string, nullable: true, description: "关联的OAuth客户端名称。" }
 *         # ipAddress: { type: string, nullable: true, description: "会话创建时的IP地址。" }
 *         # userAgent: { type: string, nullable: true, description: "会话创建时的用户代理。" }
 *         createdAt: { type: string, format: date-time, description: "会话创建时间。" }
 *         expiresAt: { type: string, format: date-time, description: "会话（刷新令牌）过期时间。" }
 *         # lastAccessedAt: { type: string, format: date-time, description: "会话最后访问时间。" }
 *         isCurrentSession: { type: boolean, description: "是否为发起此请求的当前会话 (此字段可能难以准确提供)。" }
 */
async function listUserSessionsHandler(request: AuthenticatedRequest) {
  const currentUserId = request.user?.id;
  if (!currentUserId) {
    return NextResponse.json({ message: "Unauthorized: User ID not found in token." }, { status: 401 });
  }

  try {
    // 获取当前用户所有未撤销且未过期的刷新令牌
    // (Fetch all un-revoked and un-expired refresh tokens for the current user)
    const activeRefreshTokens = await prisma.refreshToken.findMany({
      where: {
        userId: currentUserId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      include: {
        client: { // 包含关联的OAuth客户端信息以获取 clientName
          select: {
            clientId: true, // The string identifier
            clientName: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc', // 按创建时间排序，最新的在前
      },
    });

    // 格式化刷新令牌为会话信息
    // (Format refresh tokens as session information)
    // 确定 "isCurrentSession" 比较复杂，因为当前的API请求是基于Access Token的。
    // Access Token 可能与某个特定的 Refresh Token 相关，也可能不是（例如 client_credentials）。
    // 一个简化的方法是，如果不确定，总是返回 false，或者需要更复杂的追踪机制。
    // For now, `isCurrentSession` will be defaulted to false.
    const sessions: SessionResponseItem[] = activeRefreshTokens.map(rt => ({
      id: rt.id, // 使用 RefreshToken 的数据库 ID 作为会话标识符
      // ipAddress: rt.ipAddress || null, // 如果 RefreshToken 模型中有这些字段
      // userAgent: rt.userAgent || null,
      clientId: rt.client.clientId, // The string clientId
      clientName: rt.client.clientName || null,
      createdAt: rt.createdAt.toISOString(),
      expiresAt: rt.expiresAt.toISOString(),
      // lastAccessedAt: rt.updatedAt.toISOString(), // Or a dedicated field if it exists
      isCurrentSession: false, // 简化处理：目前难以准确判断 (Simplified: Hard to determine accurately for now)
    }));

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Error fetching user sessions:", error);
    return NextResponse.json({ message: "Error fetching user sessions." }, { status: 500 });
  }
}
export const GET = requirePermission()(listUserSessionsHandler);
