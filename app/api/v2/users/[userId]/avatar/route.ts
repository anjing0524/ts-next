// 文件路径: app/api/v2/users/[userId]/avatar/route.ts
// 描述: 管理员更新用户头像 (Admin updates user avatar)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User, Prisma } from '@prisma/client';
import { JWTUtils } from '@/lib/auth/oauth2';

// --- 辅助函数 (Copied/adapted) ---
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

// 简单的URL格式验证 (Simple URL format validation)
function isValidHttpUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

interface RouteContext {
  params: {
    userId: string; // 目标用户的ID (ID of the target user)
  };
}

// --- PUT /api/v2/users/{userId}/avatar (更新用户头像) ---
export async function PUT(req: NextRequest, context: RouteContext) {
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

  // 2. 解析请求体 (Parse request body)
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (e) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  const { avatarUrl } = requestBody;

  // 3. 数据验证 (Data validation)
  if (avatarUrl === undefined || avatarUrl === null) { // 允许设置为空字符串或null来清除头像
    // return errorResponse('avatarUrl is required.', 400, 'validation_error_avatarUrl_required');
  }
  if (avatarUrl && (typeof avatarUrl !== 'string' || !isValidHttpUrl(avatarUrl))) {
    return errorResponse('Invalid avatarUrl format. Must be a valid HTTP/HTTPS URL.', 400, 'validation_error_avatarUrl_format');
  }
  if (avatarUrl && avatarUrl.length > 2048) { // 限制URL长度 (Limit URL length)
      return errorResponse('avatarUrl exceeds maximum length of 2048 characters.', 400, 'validation_error_avatarUrl_length');
  }


  try {
    // 4. 检查目标用户是否存在 (Check if target user exists)
    const userToUpdate = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!userToUpdate) return errorResponse('User not found to update avatar.', 404, 'user_not_found');

    // 5. 更新用户头像 (Update user avatar)
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        avatar: avatarUrl, // 如果 avatarUrl 是空字符串或null，则头像会被清除 (If avatarUrl is empty string or null, avatar will be cleared)
        updatedAt: new Date(),
      },
    });

    // 6. 返回更新后的用户信息 (Return updated user information)
    return NextResponse.json(excludeSensitiveUserFields(updatedUser), { status: 200 });

  } catch (error: any) {
    console.error(`Error updating avatar for user ${targetUserId} by admin ${adminUserId}:`, error);
    return errorResponse('An unexpected error occurred while updating user avatar.', 500, 'server_error');
  }
}
