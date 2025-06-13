// /api/v2/account/change-password

import { NextResponse } from 'next/server';
// import { getCurrentUser } from '~/server/auth';
// import * as bcrypt from 'bcrypt';
// import { prisma } from '~/server/db'; // Assuming prisma client

/**
 * @swagger
 * /api/v2/account/change-password:
 *   post:
 *     summary: 当前用户修改自己的密码 (个人账户管理)
 *     description: 允许当前已认证用户修改自己的登录密码。需要提供当前密码和新密码。
 *     tags: [Account API]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 description:用户的当前密码。
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: 用户的新密码。应符合密码强度策略。
 *               confirmNewPassword: # 建议前端包含此字段
 *                 type: string
 *                 format: password
 *                 description: 确认新密码。
 *     responses:
 *       200: # Or 204 No Content
 *         description: 密码已成功修改。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Password changed successfully."
 *       400:
 *         description: 无效请求，例如当前密码不正确、新密码不符合策略、新密码与确认密码不匹配。
 *       401:
 *         description: 用户未认证。
 *       422:
 *         description: 密码不符合安全策略 (Unprocessable Entity)。
 */
export async function POST(request: Request) {
  // TODO: 实现当前用户修改密码的逻辑 (Implement logic for current user to change their password)
  // 1. 获取当前已认证的用户信息.
  // 2. 解析请求体 (currentPassword, newPassword, confirmNewPassword).
  // 3. 验证新密码和确认密码是否匹配 (if confirmNewPassword is provided).
  // 4. 验证当前密码是否正确 (compare hashed currentPassword with stored passwordHash).
  // 5. 验证新密码是否符合密码强度策略 (SecurityPolicy - PASSWORD_STRENGTH).
  // 6. 验证新密码是否与密码历史中的近期密码不同 (SecurityPolicy - PASSWORD_HISTORY).
  // 7. 哈希新密码.
  // 8. 更新数据库中用户的 passwordHash.
  // 9. (重要) 将新密码的哈希存入 PasswordHistory.
  // 10. (可选) 使该用户在其他设备上的会话失效 (UserSession management).
  // 11. 返回成功响应。
  console.log('POST /api/v2/account/change-password request');
  // const currentUser = await getCurrentUser(request);
  // if (!currentUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { currentPassword, newPassword, confirmNewPassword } = body;

  if (newPassword !== confirmNewPassword) { // Basic validation example
    return NextResponse.json({ message: "New password and confirmation do not match." }, { status: 400 });
  }

  // Placeholder for actual password change logic
  // if (!await bcrypt.compare(currentPassword, currentUser.passwordHash)) {
  //   return NextResponse.json({ message: "Incorrect current password." }, { status: 400 });
  // }
  // ... policy checks ...
  // const newPasswordHash = await bcrypt.hash(newPassword, 10);
  // await prisma.user.update({ where: { id: currentUser.id }, data: { passwordHash: newPasswordHash, mustChangePassword: false } });
  // ... update password history ...

  return NextResponse.json({ message: 'Password changed successfully (Not Implemented)' });
}
