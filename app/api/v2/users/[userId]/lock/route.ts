// 文件路径: app/api/v2/users/[userId]/lock/route.ts
// 描述: 管理员手动锁定用户账户 (Admin manually locks a user account)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User, Prisma } from '@prisma/client'; // User is used by excludeSensitiveUserFields
// import { JWTUtils } from '@/lib/auth/oauth2'; // REMOVED
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入 requirePermission
import { addYears } from 'date-fns'; // For setting a long lock duration

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
async function lockUserHandler(req: AuthenticatedRequest, context: RouteContext) {
  const { params } = context;
  const targetUserId = params.userId;
  const performingAdmin = req.user;

  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to LOCK user ${targetUserId}.`);

  // 防止管理员锁定自己的账户 (Prevent admin from locking their own account via this endpoint)
  if (targetUserId === performingAdmin?.id) {
    return errorResponse('Action not allowed: Administrators cannot lock their own account using this endpoint.', 400, 'self_lock_not_allowed');
  }

  try {
    // 1. 检查用户是否存在 (Check if user exists) - Was step 2
    const userToLock = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!userToLock) {
      return errorResponse('User not found.', 404, 'user_not_found');
    }

    // 2. 更新用户状态以锁定账户 (Update user status to lock account) - Was step 3
    const lockUntilDate = addYears(new Date(), 100); // "Indefinite" lock

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        isActive: false, // 明确将用户设置为非活动 (Explicitly set user to inactive)
        lockedUntil: lockUntilDate,
        failedLoginAttempts: 0, // 可选：重置登录失败尝试次数 (Optional: Reset failed login attempts)
        updatedAt: new Date(),
      },
    });

    // 3. 返回更新后的用户信息 (Return updated user information) - Was step 4
    return NextResponse.json(excludeSensitiveUserFields(updatedUser), { status: 200 });
    // 或返回 204 No Content (Or return 204 No Content)
    // return new NextResponse(null, { status: 204 });

  } catch (error: any) {
    console.error(`Error locking user ${targetUserId} by admin ${performingAdmin?.id}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') { // Record to update not found
        return errorResponse('User not found to lock.', 404, 'user_not_found_on_update');
      }
    }
    return errorResponse('An unexpected error occurred while locking the user account.', 500, 'server_error');
  }
}
export const POST = requirePermission('users:lock', lockUserHandler);
