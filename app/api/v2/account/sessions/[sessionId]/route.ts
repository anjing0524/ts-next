// /api/v2/account/sessions/[sessionId]

import { NextResponse } from 'next/server';
// import { getCurrentUser } from '~/server/auth';
// import { prisma } from '~/server/db';

/**
 * @swagger
 * /api/v2/account/sessions/{sessionId}:
 *   delete:
 *     summary: 撤销（删除）用户指定的会话 (个人账户管理)
 *     description: 允许当前已认证用户撤销（登出）其在其他设备或浏览器上的特定活动会话。用户不能撤销当前正在使用的会话。
 *     tags: [Account API]
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         description: 要撤销的会话ID。
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: 会话已成功撤销。
 *       400:
 *         description: 无效请求，例如尝试撤销当前会话。
 *       401:
 *         description: 用户未认证。
 *       403:
 *         description: 禁止访问（例如，尝试撤销不属于自己的会话）。
 *       404:
 *         description: 未找到指定的会话ID。
 */
export async function DELETE(request: Request, { params }: { params: { sessionId: string } }) {
  // TODO: 实现撤销用户指定会话的逻辑 (Implement logic to revoke a user's specific session)
  // 1. 获取当前已认证的用户信息.
  // 2. 从路径参数中获取 sessionId。
  // 3. 验证该 sessionId 对应的 UserSession 是否属于当前用户。
  // 4. （重要）验证要删除的会话不是当前正在使用的会话。用户不能通过此端点使当前会话失效。
  //    (当前会话的撤销应通过专门的 /logout 端点处理)
  // 5. 从数据库中删除该 UserSession 记录 (或标记为已撤销)。
  // 6. 返回成功响应 (204 No Content)。
  const { sessionId } = params;
  console.log(`DELETE /api/v2/account/sessions/${sessionId} request`);
  // const currentUser = await getCurrentUser(request);
  // if (!currentUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  // const currentSessionToken = request.headers.get('Authorization')?.split(' ')[1]; // Or other way to get current session ID
  // if (sessionId === currentSessionToken /* or actual current session ID from DB */ ) {
  //  return NextResponse.json({ message: "Cannot revoke the current session via this endpoint. Use logout." }, { status: 400 });
  // }

  // Placeholder for actual session revocation logic
  // const session = await prisma.userSession.findUnique({ where: { id: sessionId } });
  // if (!session) {
  //   return NextResponse.json({ message: "Session not found." }, { status: 404 });
  // }
  // if (session.userId !== currentUser.id) {
  //   return NextResponse.json({ message: "Forbidden to revoke this session." }, { status: 403 });
  // }
  // await prisma.userSession.delete({ where: { id: sessionId } });

  console.log(`Session ${sessionId} revoked (Not Implemented)`);
  return new NextResponse(null, { status: 204 });
}
