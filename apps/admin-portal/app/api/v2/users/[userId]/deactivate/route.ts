// 文件路径: app/api/v2/users/[userId]/deactivate/route.ts
// 描述: 此文件处理停用特定用户账户的 API 请求。
// 端点通常由管理员调用，以临时或永久性地禁止用户访问系统。
// 使用 `requirePermission` 中间件进行访问控制，确保只有具备 'users:deactivate' 权限的用户才能执行此操作。

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma ORM 客户端。
import { User, Prisma } from '@prisma/client'; // Prisma 生成的用户类型。
// import { JWTUtils } from '@/lib/auth/oauth2'; // REMOVED: 手动JWT验证已移除。
import { requirePermission } from '@/lib/auth/middleware'; // 引入权限控制中间件。

// --- 辅助函数 ---

/**
 * 创建并返回一个标准化的 JSON 错误响应。
 * @param message - 错误描述信息。
 * @param status - HTTP 状态码。
 * @param errorCode - (可选) 应用特定的错误代码字符串。
 * @returns NextResponse 对象。
 */
function errorResponse(message: string, status: number, errorCode?: string): NextResponse {
  return NextResponse.json({ error: errorCode || 'request_failed', message }, { status });
}

// `isUserAdmin` 函数已移除，权限检查由 `requirePermission` 中间件处理。

/**
 * 从用户对象中排除敏感字段 (如 passwordHash)。
 * @param user - User 对象、部分 User 对象或 null。
 * @returns 一个新的对象 (不含 passwordHash) 或 null。
 */
function excludeSensitiveUserFields(user: User | Partial<User> | null): Partial<User> | null {
  if (!user) return null;
  const { passwordHash, ...rest } = user as any;
  return rest;
}

// 定义路由上下文接口，用于从动态路由参数中获取 userId。
interface RouteContext {
  params: {
    userId: string; // 目标用户的ID。
  };
}

// --- POST /api/v2/users/{userId}/deactivate (停用用户账户) ---
// 此处理函数用于停用指定的用户账户。
async function deactivateUserHandler(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { params } = context; // 从路由上下文中获取路径参数。
  const targetUserId = params.userId; // 需要被停用的目标用户ID。

  // `req.user` 由 `requirePermission` 中间件填充，包含执行操作的已认证用户信息。
  const actingUser = req.user;
  // 日志记录哪个用户 (通常是管理员) 正在尝试停用哪个用户。
  console.log(`User ${actingUser?.id} (ClientID: ${actingUser?.clientId}) attempting to DEACTIVATE user ${targetUserId}.`);

  // 安全检查: 防止用户 (包括管理员) 通过此接口停用自己的账户。
  // 自我停用可能导致账户无法访问，应通过专门的流程处理 (如果允许)。
  if (targetUserId === actingUser?.id) {
    return errorResponse('Users cannot deactivate their own account using this endpoint. Please contact another administrator if needed.', 403, 'self_deactivation_not_allowed');
  }

  try {
    // 步骤 1: 检查目标用户是否存在于数据库中。
    const userToDeactivate = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!userToDeactivate) {
      // 如果用户不存在，返回 404 Not Found 错误。
      return errorResponse('User not found to deactivate.', 404, 'user_not_found');
    }

    // 步骤 2: 执行停用操作。
    // 检查用户是否已经是停用状态。如果是，则无需更新，直接返回当前用户信息。
    if (!userToDeactivate.isActive) {
      console.log(`User ${targetUserId} is already inactive. No action taken by user ${actingUser?.id}.`);
      return NextResponse.json(excludeSensitiveUserFields(userToDeactivate), { status: 200 }); // 200 OK，用户已经是目标状态。
    }

    // 如果用户当前是激活状态，则更新其状态为非激活。
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId }, // 指定要更新的用户。
      data: {
        isActive: false,       // 将 isActive 状态设置为 false。
        updatedAt: new Date(), // 手动更新 updatedAt 时间戳。
        // 根据业务需求，停用用户时可能还需要：
        // - 撤销其所有活动会话/令牌 (需要额外的会话管理逻辑)。
        // - 清除 lockedUntil 状态 (如果适用)。
        // lockedUntil: null,
      },
    });

    // 步骤 3: 返回更新后的用户信息 (排除敏感字段)。
    console.log(`User ${targetUserId} successfully DEACTIVATED by user ${actingUser?.id}.`);
    return NextResponse.json(excludeSensitiveUserFields(updatedUser), { status: 200 });

  } catch (error: any) {
    // 错误处理：记录未知错误，并返回500服务器错误。
    console.error(`Error deactivating user ${targetUserId} by user ${actingUser?.id}:`, error);
    return errorResponse('An unexpected error occurred while deactivating the user account. Please try again later.', 500, 'server_error');
  }
}

// 使用 `requirePermission` 中间件包装 deactivateUserHandler。
// 只有拥有 'users:deactivate' 权限的用户才能调用此 POST 端点。
export const POST = requirePermission('users:deactivate', deactivateUserHandler);
