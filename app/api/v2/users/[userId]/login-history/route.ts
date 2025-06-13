// 文件路径: app/api/v2/users/[userId]/login-history/route.ts
// 描述: 管理员获取特定用户的登录历史 (Admin gets login history for a specific user)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { AuditLog, Prisma } from '@prisma/client'; // Prisma types
import { JWTUtils } from '@/lib/auth/oauth2';   // For V2 Auth session token verification

const DEFAULT_PAGE_SIZE = 10;  // 列表分页的默认页面大小 (Default page size for listing)
const MAX_PAGE_SIZE = 100;     // 列表分页的最大页面大小 (Maximum page size for listing)

// 定义登录相关的操作类型 (Define login-related action types)
// 这些应与 AuditLog 中记录操作时使用的字符串一致
// (These should match the strings used when logging actions in AuditLog)
const LOGIN_ACTION_TYPES = ['USER_LOGIN_SUCCESS', 'USER_LOGIN_FAILURE', 'USER_ACCOUNT_LOCKED_LOGIN_ATTEMPT'];

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
    userId: string; // 目标用户的ID (ID of the target user whose login history is being fetched)
  };
}

// --- GET /api/v2/users/{userId}/login-history (获取用户的登录历史) ---
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
  const adminUserId = payload.userId as string | undefined; // 执行此操作的管理员ID (ID of admin performing this action)
  if (!adminUserId) return errorResponse('Unauthorized: Invalid token payload (Admin ID missing).', 401, 'invalid_token_payload');
  if (!(await isUserAdmin(adminUserId))) return errorResponse('Forbidden: Not an admin.', 403, 'forbidden');

  try {
    // 2. 检查目标用户是否存在 (Check if target user exists)
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return errorResponse('User not found.', 404, 'user_not_found');

    // 3. 处理查询参数 (Process query parameters for pagination and sorting)
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    let pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10);
    if (pageSize <= 0) pageSize = DEFAULT_PAGE_SIZE;
    if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

    // 登录历史通常按时间倒序排列 (Login history is usually sorted by time descending)
    const sortBy = searchParams.get('sortBy') || 'timestamp'; // 'timestamp' is the field in AuditLog
    const sortOrderInput = searchParams.get('sortOrder') || 'desc';
    const sortOrder = (sortOrderInput.toLowerCase() === 'asc' || sortOrderInput.toLowerCase() === 'desc') ? sortOrderInput.toLowerCase() as Prisma.SortOrder : 'desc';

    // 构建 Prisma 查询条件 (Construct Prisma query conditions)
    const where: Prisma.AuditLogWhereInput = {
      userId: targetUserId, // 筛选特定用户的日志 (Filter logs for the specific user)
      action: {
        in: LOGIN_ACTION_TYPES, // 筛选登录相关的操作 (Filter for login-related actions)
      },
    };

    // 确保 sortBy 是 AuditLog 模型的一个有效字段 (Ensure sortBy is a valid field of AuditLog model)
    const validSortByFields: (keyof AuditLog)[] = ['timestamp', 'action', 'status', 'ipAddress'];
    const safeSortBy = validSortByFields.includes(sortBy as keyof AuditLog) ? sortBy : 'timestamp';
    const orderBy: Prisma.AuditLogOrderByWithRelationInput = { [safeSortBy]: sortOrder };

    // 4. 查询登录历史和总数 (Query login history and total count)
    const loginHistory = await prisma.auditLog.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { // 选择要返回的字段 (Select fields to return)
        id: true,
        timestamp: true,
        action: true,
        status: true,
        ipAddress: true,
        userAgent: true,
        details: true,
        // actorId: true, // actorId 应该与 targetUserId 相同 (actorId should be same as targetUserId)
        // actorType: true, // 应该是 'USER' (Should be 'USER')
      }
    });
    const totalHistoryEntries = await prisma.auditLog.count({ where });

    // 5. 返回响应 (Return response)
    return NextResponse.json({
      loginHistory: loginHistory,
      total: totalHistoryEntries,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(totalHistoryEntries / pageSize),
    }, { status: 200 });

  } catch (error: any) {
    console.error(`Error fetching login history for user ${targetUserId} by admin ${adminUserId}:`, error);
    return errorResponse('An unexpected error occurred while fetching login history.', 500, 'server_error');
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
