// 文件路径: app/api/v2/users/[userId]/unlock/route.ts
// 描述: 管理员手动解锁用户账户 (Admin manually unlocks a user account)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User, Prisma } from '@prisma/client';
import { JWTUtils } from '@/lib/auth/oauth2'; // For V2 Auth session token verification

// --- 辅助函数 (Copied from other user management routes) ---
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'request_failed', message }, { status });
}

async function isUserAdmin(userId: string): Promise<boolean> {
  // TODO: Implement real RBAC check.
  const userWithRoles = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } }
  });
  return userWithRoles?.userRoles.some(ur => ur.role.name === 'admin') || false;
}

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
export async function POST(req: NextRequest, context: RouteContext) {
  const { params } = context;
  const targetUserId = params.userId;

  // 1. 管理员认证 (Admin Authentication)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return errorResponse('Unauthorized: Missing Authorization header.', 401, 'unauthorized');
  const token = authHeader.substring(7);
  if (!token) return errorResponse('Unauthorized: Missing token.', 401, 'unauthorized');

  const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);
  if (!valid || !payload) return errorResponse(`Unauthorized: Invalid token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
  const adminUserId = payload.userId as string | undefined;
  if (!adminUserId) return errorResponse('Unauthorized: Invalid token payload (Admin ID missing).', 401, 'invalid_token_payload');
  if (!(await isUserAdmin(adminUserId))) return errorResponse('Forbidden: Not an admin.', 403, 'forbidden');

  try {
    // 2. 检查目标用户是否存在 (Check if target user exists)
    const userToUnlock = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!userToUnlock) return errorResponse('User not found to unlock.', 404, 'user_not_found');

    // 3. 执行解锁操作 (Perform unlock operation)
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        lockedUntil: null,         // 设置为 null 以解锁 (Set to null to unlock)
        failedLoginAttempts: 0,    // 重置登录失败尝试次数 (Reset failed login attempts)
        updatedAt: new Date(),      // 手动更新时间戳 (Manually update timestamp)
      },
    });

    // 4. 返回更新后的用户信息 (Return updated user information)
    return NextResponse.json(excludeSensitiveUserFields(updatedUser), { status: 200 });

  } catch (error: any) {
    console.error(`Error unlocking user ${targetUserId} by admin ${adminUserId}:`, error);
    return errorResponse('An unexpected error occurred while unlocking the user account.', 500, 'server_error');
  }
}
