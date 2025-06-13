// 文件路径: app/api/v2/users/[userId]/password-history/route.ts
// 描述: 管理员查看用户密码历史记录元数据 (Admin views user password history metadata)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { PasswordHistory, Prisma } from '@prisma/client'; // Prisma types
import { JWTUtils } from '@/lib/auth/oauth2';   // For V2 Auth session token verification

const DEFAULT_PAGE_SIZE = 10;  // 列表分页的默认页面大小 (Default page size for listing)
const MAX_PAGE_SIZE = 100;     // 列表分页的最大页面大小 (Maximum page size for listing)

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

interface RouteContext {
  params: {
    userId: string; // 目标用户的ID (ID of the target user whose password history is being fetched)
  };
}

// --- GET /api/v2/users/{userId}/password-history (获取用户的密码历史记录元数据) ---
export async function GET(req: NextRequest, context: RouteContext) {
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
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return errorResponse('User not found.', 404, 'user_not_found');

    // 3. 处理查询参数 (Process query parameters for pagination)
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    let pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10);
    if (pageSize <= 0) pageSize = DEFAULT_PAGE_SIZE;
    if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

    // 密码历史按创建时间倒序排列 (Password history sorted by creation time descending)
    const orderBy: Prisma.PasswordHistoryOrderByWithRelationInput = { createdAt: 'desc' };

    const where: Prisma.PasswordHistoryWhereInput = {
      userId: targetUserId,
    };

    // 4. 查询密码历史记录和总数 (Query password history and total count)
    const passwordHistoryEntries = await prisma.passwordHistory.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { // 只选择非敏感的元数据 (Only select non-sensitive metadata)
        id: true,
        createdAt: true,
        // userId: true, // userId is known from context, not strictly needed in each item
      }
    });
    const totalHistoryEntries = await prisma.passwordHistory.count({ where });

    // 5. 返回响应 (Return response)
    return NextResponse.json({
      passwordHistory: passwordHistoryEntries,
      total: totalHistoryEntries,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(totalHistoryEntries / pageSize),
    }, { status: 200 });

  } catch (error: any) {
    console.error(`Error fetching password history for user ${targetUserId} by admin ${adminUserId}:`, error);
    return errorResponse('An unexpected error occurred while fetching password history.', 500, 'server_error');
  }
}

// 确保 JWTUtils.verifyV2AuthAccessToken 存在
// (Ensure JWTUtils.verifyV2AuthAccessToken exists)
/*
declare module '@/lib/auth/oauth2' {
  export class JWTUtils {
    static async verifyV2AuthAccessToken(token: string): Promise<{
      valid: boolean;
      payload?: { userId: string; [key: string]: any };
      error?: string;
    }>;
  }
}
*/
