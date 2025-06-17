// /api/v2/account/change-password
// 描述: 处理当前认证用户修改自己密码的请求。
// (Handles requests from the currently authenticated user to change their own password.)

import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { PasswordComplexitySchema, checkPasswordHistory, SALT_ROUNDS } from '@/lib/auth/passwordUtils';
import { Prisma } from '@prisma/client';

// Zod schema for change password payload
// 修改密码请求的Zod Schema
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "当前密码不能为空 (Current password is required)"),
  newPassword: PasswordComplexitySchema, // 复用密码复杂度策略 (Reuse password complexity policy)
  confirmNewPassword: z.string(),
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: "新密码与确认密码不匹配 (New password and confirmation do not match)",
  path: ["confirmNewPassword"], // 报告错误在哪个字段 (Field to report error on)
});

/**
 * @swagger
 * /api/v2/account/change-password:
 *   post:
 *     summary: 当前用户修改自己的密码 (个人账户管理)
 *     description: 允许当前已认证用户修改自己的登录密码。需要提供当前密码和新密码，新密码需符合系统安全策略。
 *     tags: [Account API]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *               - confirmNewPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 description: 用户的当前密码。
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: 用户的新密码。应符合密码强度策略。
 *               confirmNewPassword:
 *                 type: string
 *                 format: password
 *                 description: 确认新密码。
 *     responses:
 *       200: { description: "密码已成功修改。" }
 *       204: { description: "密码已成功修改 (无内容返回)。" }
 *       400: { description: "无效请求 (例如，当前密码不正确、新密码与确认不符、新密码与当前密码相同)。" }
 *       401: { description: "用户未认证。" }
 *       422: { description: "新密码不符合安全策略 (例如，复杂度或历史记录要求)。" }
 */
async function changePasswordHandler(request: AuthenticatedRequest) {
  const currentUserId = request.user?.id;
  if (!currentUserId) {
    return NextResponse.json({ message: "Unauthorized: User ID not found in token." }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body', message: 'Failed to parse JSON body.' }, { status: 400 });
  }

  const validationResult = changePasswordSchema.safeParse(payload);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }

  const { currentPassword, newPassword } = validationResult.data;

  try {
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { passwordHash: true }
    });

    if (!user || !user.passwordHash) {
      // Should not happen if user is authenticated, but good for robustness
      return NextResponse.json({ message: "User not found or password not set." }, { status: 404 });
    }

    // 1. 验证当前密码 (Verify current password)
    const isCurrentPasswordCorrect = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPasswordCorrect) {
      return NextResponse.json({ message: "Incorrect current password." }, { status: 400 });
    }

    // 2. 确保新密码与当前密码不同 (Ensure new password is different from current)
    const isNewPasswordSameAsOld = await bcrypt.compare(newPassword, user.passwordHash);
    if (isNewPasswordSameAsOld) {
      return NextResponse.json({ message: "New password cannot be the same as the current password." }, { status: 400 });
    }

    // 3. 验证新密码是否与密码历史中的近期密码不同 (Check password history)
    // (SecurityPolicy - PASSWORD_HISTORY, assuming checkPasswordHistory utility exists and is configured)
    const isPasswordInHistory = !(await checkPasswordHistory(currentUserId, newPassword)); // checkPasswordHistory returns true if NOT in history
    if (isPasswordInHistory) {
      return NextResponse.json({
        error: 'Unprocessable Entity',
        message: 'New password cannot be the same as one of your recent passwords. Please choose a different password.'
      }, { status: 422 });
    }

    // 4. 哈希新密码 (Hash new password)
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // 5. 更新数据库 (Update database in a transaction)
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: currentUserId },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: false, // 用户主动修改密码后，此标记应设为false
          updatedAt: new Date(),      // 手动更新时间戳
        },
      });

      // 6. 将新密码的哈希存入 PasswordHistory
      await tx.passwordHistory.create({
        data: {
          userId: currentUserId,
          passwordHash: newPasswordHash,
        }
      });

      // 7. (可选) 使该用户在其他设备上的会话失效 - 这部分逻辑比较复杂，可能需要单独的会话管理服务。
      // (Optional: Invalidate user's other sessions - This is complex and might need a separate session service)
      // For now, this step is conceptual.
    });

    return NextResponse.json({ message: 'Password changed successfully.' }, { status: 200 });

  } catch (error) {
    console.error("Error changing password:", error);
    // Handle potential Prisma errors if any step within transaction fails for other reasons
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Log specific Prisma error
        return NextResponse.json({ message: "Database error during password change." }, { status: 500 });
    }
    return NextResponse.json({ message: "Error changing password." }, { status: 500 });
  }
}
export const POST = requirePermission()(changePasswordHandler); // No specific permission beyond being authenticated
