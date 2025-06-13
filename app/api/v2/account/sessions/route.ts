// /api/v2/account/sessions

import { NextResponse } from 'next/server';
// import { getCurrentUser } from '~/server/auth';
// import { prisma } from '~/server/db';

/**
 * @swagger
 * /api/v2/account/sessions:
 *   get:
 *     summary: 列出当前用户的活动会话 (个人账户管理)
 *     description: 检索当前已认证用户的所有活动会话列表，例如在不同设备或浏览器上的登录。
 *     tags: [Account API]
 *     responses:
 *       200:
 *         description: 成功获取活动会话列表。
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: # Session ID
 *                     type: string
 *                   ipAddress:
 *                     type: string
 *                     nullable: true
 *                   userAgent:
 *                     type: string
 *                     nullable: true
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                   lastAccessedAt:
 *                     type: string
 *                     format: date-time
 *                   expiresAt:
 *                     type: string
 *                     format: date-time
 *                   isCurrentSession: # Helpful indicator
 *                     type: boolean
 *       401:
 *         description: 用户未认证。
 */
export async function GET(request: Request) {
  // TODO: 实现列出当前用户活动会话的逻辑 (Implement logic to list current user's active sessions)
  // 1. 获取当前已认证的用户信息.
  // 2. 从数据库查询该用户的 UserSession 记录.
  // 3. 识别当前请求所在的会话 (e.g., by comparing session token if available, or other means).
  // 4. 返回会话列表，并标记当前会话。
  console.log('GET /api/v2/account/sessions request');
  // const currentUser = await getCurrentUser(request);
  // if (!currentUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  // const currentSessionToken = request.headers.get('Authorization')?.split(' ')[1]; // Example

  // 示例数据 (Example data)
  const sessions = [
    {
      id: 'session123_current',
      ipAddress: '192.168.1.100',
      userAgent: 'Chrome on macOS',
      createdAt: new Date(Date.now() - 3*24*60*60*1000).toISOString(),
      lastAccessedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 27*24*60*60*1000).toISOString(),
      isCurrentSession: true // Mark the current session
    },
    {
      id: 'session456_other_device',
      ipAddress: '203.0.113.45',
      userAgent: 'Firefox on Windows',
      createdAt: new Date(Date.now() - 5*24*60*60*1000).toISOString(),
      lastAccessedAt: new Date(Date.now() - 24*60*60*1000).toISOString(),
      expiresAt: new Date(Date.now() + 25*24*60*60*1000).toISOString(),
      isCurrentSession: false
    }
  ];
  return NextResponse.json(sessions);
}
