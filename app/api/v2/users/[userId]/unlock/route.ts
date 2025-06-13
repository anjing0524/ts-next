// 文件路径: app/api/v2/users/[userId]/unlock/route.ts
// 描述: 管理员手动解锁用户账户 (Admin manually unlocks a user account)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User, Prisma } from '@prisma/client'; // User is used by excludeSensitiveUserFields
// import { JWTUtils } from '@/lib/auth/oauth2'; // REMOVED
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入 requirePermission

// --- 辅助函数 (Copied from other user management routes) ---
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'request_failed', message }, { status });
}

// isUserAdmin function is no longer needed.

function excludeSensitiveUserFields(user: User | Partial<User> | null): Partial<User> | null {
  if (!user) return null;
  const { passwordHash, ...rest } = user as any;
  return rest;
}

interface RouteContext {
  params: {
    userId: string; // 目标用户的ID (ID of the target user)
  };
}
// --- 主处理函数 ---
async function unlockUserHandler(req: AuthenticatedRequest, context: RouteContext) {
  const { params } = context;
  const targetUserId = params.userId;
  const performingAdmin = req.user;

  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to UNLOCK user ${targetUserId}.`);

  try {
    // 1. 检查用户是否存在 (Check if user exists) - Was step 2
    const userToUnlock = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!userToUnlock) return errorResponse('User not found to unlock.', 404, 'user_not_found');

    // 2. 执行解锁操作 (Perform unlock operation) - Was step 3
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        isActive: true,            // 将用户标记为活动状态 (Mark user as active)
        lockedUntil: null,         // 设置为 null 以解锁 (Set to null to unlock)
        failedLoginAttempts: 0,    // 重置登录失败尝试次数 (Reset failed login attempts)
        updatedAt: new Date(),      // 手动更新时间戳 (Manually update timestamp)
      },
    });

    // 3. 返回更新后的用户信息或成功消息 (Return updated user information or success message) - Was step 4
    // return NextResponse.json(excludeSensitiveUserFields(updatedUser), { status: 200 });
    return new NextResponse(null, { status: 204 }); // 204 No Content is common for such actions

  } catch (error: any) {
    console.error(`Error unlocking user ${targetUserId} by admin ${performingAdmin?.id}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') { // Record to update not found
        return errorResponse('User not found to unlock.', 404, 'user_not_found_on_update');
      }
    }
    return errorResponse('An unexpected error occurred while unlocking the user account.', 500, 'server_error');
  }
}
export const POST = requirePermission('users:unlock', unlockUserHandler);
