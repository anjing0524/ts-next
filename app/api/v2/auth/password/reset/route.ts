// 文件路径: app/api/v2/auth/password/reset/route.ts
// 描述: 使用重置令牌设置新密码端点 (Set new password using reset token endpoint)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client'; // User, PasswordResetRequest, PasswordHistory not directly used as types
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入 requirePermission
import bcrypt from 'bcrypt';

const MIN_PASSWORD_LENGTH = 8; // 密码最小长度 (Minimum password length)
const PASSWORD_HISTORY_COUNT_FOR_RESET = 5; // 重置时检查历史密码的数量 (Number of historical passwords to check on reset)

// 辅助函数：错误响应 (Helper function: Error response)
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'password_reset_failed', message }, { status });
}

// 包装原始的 POST 处理函数 (Wrap original POST handler)
async function resetPasswordHandler(req: AuthenticatedRequest, event?: any) {
  // 管理员认证和权限检查已由 requirePermission 处理
  // (Admin authentication and permission check is handled by requirePermission)
  const adminUser = req.user;
  console.log(`Admin user ${adminUser?.userId} (username: ${adminUser?.username}) is attempting to reset a password using a token (permission 'auth:password:reset' granted).`);

  let requestBody;
  try {
    requestBody = await req.json();
  } catch (error) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  const { token, newPassword } = requestBody;

  if (!token || typeof token !== 'string') {
    return errorResponse('Password reset token is required.', 400, 'validation_error');
  }
  if (!newPassword || typeof newPassword !== 'string') {
    return errorResponse('New password is required.', 400, 'validation_error');
  }

  try {
    // 1. 验证重置令牌 (Validate reset token)
    const resetRequest = await prisma.passwordResetRequest.findUnique({
      where: { token: token },
    });

    if (!resetRequest) {
      return errorResponse('Invalid or expired password reset token.', 400, 'invalid_or_expired_token');
    }
    if (resetRequest.isUsed) {
      return errorResponse('This password reset token has already been used.', 400, 'token_already_used');
    }
    if (resetRequest.expiresAt < new Date()) {
      return errorResponse('Password reset token has expired.', 400, 'token_expired');
    }

    // 2. 新密码策略验证 (New password policy validation)
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return errorResponse(`New password must be at least ${MIN_PASSWORD_LENGTH} characters long.`, 400, 'password_policy_violation');
    }
    // 可选：检查常见弱密码 (Optional: Check common weak passwords - not implemented here)

    // 3. 获取用户信息并检查 (Fetch user information and check)
    const user = await prisma.user.findUnique({
      where: { id: resetRequest.userId },
    });

    if (!user) {
      // 如果与令牌关联的用户不存在 (If user associated with token does not exist)
      console.error(`User with ID ${resetRequest.userId} not found for valid reset token ${token}. This should not happen.`);
      return errorResponse('Invalid token: Associated user not found.', 400, 'user_not_found_for_token');
    }
    // 即使令牌有效，也检查用户是否仍处于活动状态 (Even if token is valid, check if user is still active)
    // 如果不是必须的，可以移除此检查，因为令牌本身授权了密码重置 (If not essential, this check can be removed as token itself authorizes reset)
    // if (!user.isActive) {
    //   return errorResponse('User account is inactive. Cannot reset password.', 403, 'account_inactive');
    // }

    // 4. 密码历史检查 (Password history check for the new password)
    // 检查新密码是否在最近使用过的密码中 (Check if new password is among recently used ones)
    const recentPasswords = await prisma.passwordHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: PASSWORD_HISTORY_COUNT_FOR_RESET,
    });

    // Also check against the current active password hash
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
        return errorResponse(`New password cannot be the same as your current password.`, 400, 'password_recently_used');
    }

    for (const oldPasswordRecord of recentPasswords) {
      if (await bcrypt.compare(newPassword, oldPasswordRecord.passwordHash)) {
        return errorResponse(`New password cannot be the same as one of your last ${PASSWORD_HISTORY_COUNT_FOR_RESET + 1} passwords.`, 400, 'password_recently_used');
      }
    }

    // 5. 更新用户密码及相关信息 (Update user password and related information)
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction(async (tx) => {
      // a. 更新用户密码、状态 (Update user's password, status)
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: false, // 密码已重置 (Password has been reset)
          failedLoginAttempts: 0,  // 重置登录尝试次数 (Reset login attempts)
          lockedUntil: null,       // 解锁账户 (Unlock account)
          updatedAt: new Date(),   // 手动更新时间戳 (Manually update timestamp)
        },
      });

      // b. 将新密码（是的，新密码）也添加到历史记录中
      // (Add the new password (yes, the new one) to history as well)
      // 这是为了防止用户在通过此流程重置密码后，立即通过“修改密码”流程改回最近刚用过的密码
      // (This is to prevent user from changing back to a recently used password via "change password" flow
      //  immediately after resetting via this flow, if that flow also checks history)
      // 同时，它也记录了本次密码设置的时间点 (Also, it records the point in time this password was set)
      await tx.passwordHistory.create({
        data: {
          userId: user.id,
          passwordHash: newPasswordHash, // 存储新设置的密码哈希 (Store the newly set password hash)
        },
      });

      // c. 将密码重置请求标记为已使用 (Mark password reset request as used)
      await tx.passwordResetRequest.update({
        where: { id: resetRequest.id },
        data: { isUsed: true },
      });
    });

    // 6. 返回成功响应 (Return success response)
    return NextResponse.json({ message: 'Password reset successfully. You can now log in with your new password.' }, { status: 200 });

  } catch (error: any) {
    console.error(`Password reset error for token ${token} (admin: ${adminUser?.userId}):`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // 处理特定的 Prisma 错误 (Handle specific Prisma errors)
         console.error(`Prisma error during password reset for token ${token} (admin: ${adminUser?.userId}):`, error.code, error.meta);
    }
    return errorResponse('An unexpected error occurred while resetting password.', 500, 'server_error');
  }
}

export const POST = requirePermission('auth:password:reset')(resetPasswordHandler);
