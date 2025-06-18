// 文件路径: app/api/v2/auth/password/change/route.ts
// File path: app/api/v2/auth/password/change/route.ts
// 描述: 用户修改密码端点
// Description: User change password endpoint

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { requirePermission } from '@/lib/auth/middleware';
import type { AuthenticatedRequest } from '@/lib/auth/types';
import { ApiResponse } from '@/lib/types/api';
import { ValidationError, AuthenticationError, ResourceNotFoundError, BaseError } from '@/lib/errors';
import { withErrorHandling } from '@/lib/utils/error-handler';

// 密码最小长度
// Minimum password length
const MIN_PASSWORD_LENGTH = 8;
// 检查最近多少个历史密码
// Check against how many recent historical passwords
const PASSWORD_HISTORY_COUNT = 5;

/**
 * @swagger
 * /api/v2/auth/password/change:
 *   post:
 *     summary: 用户修改自己的密码 (User Changes Own Password)
 *     description: (需要 'auth:password:change' 权限) 允许已认证用户修改自己的密码。
 *                  ((Requires 'auth:password:change' permission) Allows an authenticated user to change their own password.)
 *     tags: [认证 (Authentication)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 description: 用户当前的密码。 (User's current password.)
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: 用户的新密码 (符合密码策略)。 (User's new password (must meet policy).)
 *     responses:
 *       '200':
 *         description: 密码修改成功。 (Password changed successfully.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseNull'
 *       '400':
 *         description: 请求无效（例如，缺少参数，密码策略冲突）。 (Invalid request (e.g., missing parameters, password policy violation).)
 *       '401':
 *         description: 未经授权或当前密码不正确。 (Unauthorized or incorrect current password.)
 *       '403':
 *         description: 禁止访问（例如，账户非活动）。 (Forbidden (e.g., account inactive).)
 *       '404':
 *         description: 已认证用户在数据库中未找到。 (Authenticated user not found in database.)
 *       '500':
 *         description: 服务器内部错误。 (Internal server error.)
 */
// POST 处理函数，用于修改用户密码，由 withErrorHandling 和 requirePermission 包装
// POST handler function for changing user password, wrapped by withErrorHandling and requirePermission
async function changePasswordHandlerInternal(req: AuthenticatedRequest): Promise<NextResponse> {
  const userId = req.user.id; // 从 req.user 中获取用户ID (Get userId from req.user)

  let requestBody;
  try {
    requestBody = await req.json();
  } catch (e) {
    // 无效的JSON，抛出 ValidationError
    // Invalid JSON, throw ValidationError
    throw new ValidationError('Invalid JSON request body.', { detail: (e as Error).message }, 'INVALID_JSON_BODY_PWD_CHANGE');
  }

  const { currentPassword, newPassword } = requestBody;

  // 验证必要字段是否存在
  // Validate if required fields are present
  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current password and new password are required.', undefined, 'MISSING_PASSWORDS_PWD_CHANGE');
  }

  // 1. 获取用户信息 (Fetch user information)
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  // 如果用户未找到（理论上不太可能，因为 requirePermission 已验证用户存在）
  // If user not found (theoretically unlikely as requirePermission should have validated user existence)
  if (!user) {
    // 已认证用户在数据库中未找到，这可能是一个异常情况
    // Authenticated user not found in database, this might be an exceptional case
    throw new ResourceNotFoundError('Authenticated user not found in database.', 'AUTH_USER_NOT_FOUND_PWD_CHANGE', { userId });
  }
  // 检查用户账户是否处于活动状态
  // Check if the user account is active
  if (!user.isActive) {
    // 账户未激活，抛出 AuthenticationError (或 AuthorizationError)
    // Account inactive, throw AuthenticationError (or AuthorizationError)
    throw new AuthenticationError('User account is inactive. Cannot change password.', { userId }, 'ACCOUNT_INACTIVE_PWD_CHANGE');
  }

  // 2. 验证当前密码 (Verify current password)
  const isCurrentPasswordCorrect = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isCurrentPasswordCorrect) {
    // 当前密码不正确，抛出 AuthenticationError
    // Incorrect current password, throw AuthenticationError
    throw new AuthenticationError('Invalid current password.', undefined, 'INVALID_CURRENT_PASSWORD');
  }

  // 3. 新密码策略验证 (New password policy validation)
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    // 新密码长度不足，抛出 ValidationError
    // New password length insufficient, throw ValidationError
    throw new ValidationError(
      `New password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      { minLength: MIN_PASSWORD_LENGTH, actualLength: newPassword.length },
      'PASSWORD_POLICY_LENGTH_PWD_CHANGE'
    );
  }
  if (currentPassword === newPassword) {
    // 新密码不能与当前密码相同，抛出 ValidationError
    // New password cannot be the same as current password, throw ValidationError
    throw new ValidationError(
      'New password cannot be the same as the current password.',
      undefined,
      'PASSWORD_POLICY_SAME_AS_CURRENT_PWD_CHANGE'
    );
  }

  // 4. 密码历史检查 (Password history check)
  const recentPasswords = await prisma.passwordHistory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: PASSWORD_HISTORY_COUNT,
  });

  for (const oldPasswordRecord of recentPasswords) {
    if (await bcrypt.compare(newPassword, oldPasswordRecord.passwordHash)) {
      // 新密码与最近使用过的密码之一相同，抛出 ValidationError
      // New password is the same as one of the recently used passwords, throw ValidationError
      throw new ValidationError(
        `New password cannot be the same as one of your last ${PASSWORD_HISTORY_COUNT} passwords.`,
        { historyCount: PASSWORD_HISTORY_COUNT },
        'PASSWORD_RECENTLY_USED_PWD_CHANGE'
      );
    }
  }

  // 5. 更新密码 (Update password)
  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  // 使用 Prisma 事务确保数据一致性
  // Use Prisma transaction for data consistency
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
        updatedAt: new Date(),
        updatedBy: userId, // 记录是用户自己修改的 (Record that user themself changed it)
      },
    });
    await tx.passwordHistory.create({
      data: {
        userId: user.id,
        passwordHash: user.passwordHash, // 存储的是本次更新前的密码哈希 (Store the password hash before this update)
      },
    });
  });

  // 返回遵循 ApiResponse 结构的成功响应
  // Return a successful response following the ApiResponse structure
  return NextResponse.json<ApiResponse<null>>({
    success: true,
    message: 'Password changed successfully.',
    data: null // 成功修改密码通常不返回特定数据 (Successfully changing password usually doesn't return specific data)
  }, { status: 200 });
};

// 使用 withErrorHandling 和 requirePermission 包装处理函数
// Wrap the handler with withErrorHandling and requirePermission
export const POST = withErrorHandling(requirePermission('auth:password:change')(changePasswordHandlerInternal));

// 文件结束 (End Of File)
// EOF
