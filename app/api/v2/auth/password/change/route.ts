// 文件路径: app/api/v2/auth/password/change/route.ts
// 描述: 用户修改密码端点 (User change password endpoint)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User, PasswordHistory, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { JWTUtils } from '@/lib/auth/oauth2';

const MIN_PASSWORD_LENGTH = 8; // 密码最小长度 (Minimum password length)
const PASSWORD_HISTORY_COUNT = 5; // 检查最近多少个历史密码 (Check against how many recent historical passwords)

// 辅助函数：错误响应 (Helper function: Error response)
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'password_change_failed', message }, { status });
}

export async function POST(req: NextRequest) {
  // 1. 用户认证 (User Authentication)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return errorResponse('Unauthorized: Missing or invalid Authorization header.', 401, 'unauthorized');
  }
  const token = authHeader.substring(7);
  if (!token) {
    return errorResponse('Unauthorized: Missing token.', 401, 'unauthorized');
  }

  const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);
  if (!valid || !payload) {
    return errorResponse(`Unauthorized: Invalid or expired token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
  }
  const userId = payload.userId as string | undefined;
  if (!userId) {
    return errorResponse('Unauthorized: Invalid token payload (User ID missing).', 401, 'invalid_token_payload');
  }

  // 2. 解析请求体 (Parse request body)
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (e) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  const { currentPassword, newPassword } = requestBody;

  if (!currentPassword || !newPassword) {
    return errorResponse('Current password and new password are required.', 400, 'validation_error');
  }

  try {
    // 3. 获取用户信息 (Fetch user information)
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      // 理论上，如果令牌有效，用户应该存在 (Theoretically, if token is valid, user should exist)
      return errorResponse('Unauthorized: User not found.', 401, 'user_not_found');
    }
    if (!user.isActive) {
      return errorResponse('Forbidden: User account is inactive.', 403, 'account_inactive');
    }

    // 4. 验证当前密码 (Verify current password)
    const isCurrentPasswordCorrect = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPasswordCorrect) {
      // 可以考虑增加失败尝试计数器，但修改密码场景可能与登录场景分开处理
      // (Could consider incrementing a failed attempt counter, but change password scenario might be handled differently from login)
      return errorResponse('Invalid current password.', 400, 'invalid_current_password');
    }

    // 5. 新密码策略验证 (New password policy validation)
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return errorResponse(`New password must be at least ${MIN_PASSWORD_LENGTH} characters long.`, 400, 'password_policy_violation');
    }
    // 可选：检查新密码是否与当前密码相同 (Optional: Check if new password is the same as current password)
    if (currentPassword === newPassword) {
        return errorResponse('New password cannot be the same as the current password.', 400, 'password_policy_violation');
    }
    // 可选：检查常见弱密码列表 (Optional: Check against common weak password list - not implemented here)

    // 6. 密码历史检查 (Password history check)
    const recentPasswords = await prisma.passwordHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: PASSWORD_HISTORY_COUNT,
    });

    for (const oldPasswordRecord of recentPasswords) {
      if (await bcrypt.compare(newPassword, oldPasswordRecord.passwordHash)) {
        return errorResponse(`New password cannot be the same as one of your last ${PASSWORD_HISTORY_COUNT} passwords.`, 400, 'password_recently_used');
      }
    }

    // 7. 更新密码 (Update password)
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // 使用 Prisma 事务确保原子性操作 (Use Prisma transaction for atomicity)
    await prisma.$transaction(async (tx) => {
      // a. 更新用户密码和状态 (Update user's password and status)
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: false, // 密码已修改 (Password has been changed)
          updatedAt: new Date(),    // Prisma 会自动更新 updatedAt，但显式设置也无妨 (Prisma updates updatedAt automatically, but explicit set is fine)
        },
      });

      // b. 将旧密码添加到历史记录 (Add old password to history)
      await tx.passwordHistory.create({
        data: {
          userId: user.id,
          passwordHash: user.passwordHash, // 存储的是当前（即将成为旧的）密码哈希 (Store the current (soon to be old) password hash)
        },
      });

      // 可选：如果密码历史记录过多，进行清理 (Optional: Prune old password history if it grows too large)
      // const historyCount = await tx.passwordHistory.count({ where: { userId: user.id } });
      // if (historyCount > MAX_PASSWORD_HISTORY_STORAGE) {
      //   const oldestEntries = await tx.passwordHistory.findMany({
      //     where: { userId: user.id },
      //     orderBy: { createdAt: 'asc' },
      //     take: historyCount - MAX_PASSWORD_HISTORY_STORAGE,
      //   });
      //   await tx.passwordHistory.deleteMany({
      //     where: { id: { in: oldestEntries.map(e => e.id) } },
      //   });
      // }
    });

    // 8. 返回成功响应 (Return success response)
    return NextResponse.json({ message: 'Password changed successfully.' }, { status: 200 });

  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // 处理特定的 Prisma 错误 (Handle specific Prisma errors)
      console.error(`Prisma error during password change for user ${userId}:`, error);
    } else {
      console.error(`Error during password change for user ${userId}:`, error);
    }
    return errorResponse('An unexpected error occurred while changing password.', 500, 'server_error');
  }
}

// 确保 JWTUtils.verifyV2AuthAccessToken 在 lib/auth/oauth2.ts 中声明或实现
// (Ensure JWTUtils.verifyV2AuthAccessToken is declared or implemented in lib/auth/oauth2.ts)
/*
declare module '@/lib/auth/oauth2' {
  export class JWTUtils {
    static async verifyV2AuthAccessToken(token: string): Promise<{
      valid: boolean;
      payload?: { userId: string; [key: string]: any }; // 简化 payload 示例 (Simplified payload example)
      error?: string;
    }>;
    // ... other methods
  }
}
*/
