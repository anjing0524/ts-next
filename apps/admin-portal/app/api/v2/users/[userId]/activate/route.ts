// 文件路径: app/api/v2/users/[userId]/activate/route.ts
// 描述: 此文件处理激活特定用户账户的 API 请求。
// 端点通常由管理员调用，以重新激活先前被停用的用户账户。
// 使用 `requirePermission` 中间件进行访问控制，确保只有具备 'users:activate' 权限的用户才能执行此操作。

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma ORM 客户端，用于数据库交互。
import { User, Prisma } from '@prisma/client'; // Prisma 生成的用户类型。
// import { JWTUtils } from '@/lib/auth/oauth2'; // REMOVED: 手动JWT验证已移除，改用 requirePermission。
import { requirePermission } from '@/lib/auth/middleware'; // 引入权限控制中间件和认证请求类型。

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
 * 从用户对象中排除敏感字段 (如 passwordHash)，以便安全地返回给客户端。
 * @param user - User 对象、部分 User 对象或 null。
 * @returns 一个新的对象 (不含 passwordHash) 或 null。
 */
function excludeSensitiveUserFields(user: User | Partial<User> | null): Partial<User> | null {
  if (!user) return null;
  const { passwordHash, ...rest } = user as any; // 类型断言以处理 Partial<User>
  return rest;
}

// 定义路由上下文接口，用于从动态路由参数中获取 userId。
interface RouteContext {
  params: {
    userId: string; // 目标用户的ID，从URL路径参数中提取。
  };
}

// --- POST /api/v2/users/{userId}/activate (激活用户账户) ---
// 此处理函数用于激活指定的用户账户。
async function activateUserHandler(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { params } = context; // 从路由上下文中获取路径参数。
  const targetUserId = params.userId; // 需要被激活的目标用户ID。

  // `req.user` 由 `requirePermission` 中间件填充，包含了执行此操作的已认证用户信息。
  const performingAdmin = req.user;
  // 日志记录哪个管理员正在尝试激活哪个用户。
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to ACTIVATE user ${targetUserId}.`);

  // 安全检查：管理员不应能激活自己的账户 (如果存在这种业务逻辑)。
  // 通常激活操作是针对其他账户的。如果账户是自己停用的，则可能通过其他方式恢复。
  // 此处假设管理员不能通过此接口激活自身，以防止意外操作或滥用。
  if (targetUserId === performingAdmin?.id) {
    // (可选的逻辑) 如果不允许管理员通过此接口激活自身。
    // return errorResponse('Administrators cannot activate their own account using this endpoint.', 403, 'self_activation_not_allowed');
    // 当前场景下，激活自身账户可能无害，主要看业务需求。
  }

  try {
    // 步骤 1: 检查目标用户是否存在于数据库中。
    const userToActivate = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!userToActivate) {
      // 如果用户不存在，返回 404 Not Found 错误。
      return errorResponse('User not found to activate.', 404, 'user_not_found');
    }

    // 步骤 2: 执行激活操作。
    // 检查用户是否已经是激活状态。如果是，则无需更新，直接返回当前用户信息。
    if (userToActivate.isActive) {
      console.log(`User ${targetUserId} is already active. No action taken by admin ${performingAdmin?.id}.`);
      return NextResponse.json(excludeSensitiveUserFields(userToActivate), { status: 200 }); // 200 OK，因为用户已经是目标状态。
    }

    // 如果用户当前未激活，则更新其状态。
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId }, // 指定要更新的用户。
      data: {
        isActive: true,        // 将 isActive 状态设置为 true。
        updatedAt: new Date(), // 手动更新 updatedAt 时间戳。
        // 根据业务需求，可能还需要重置 failedLoginAttempts 或清除 lockedUntil 状态。
        // failedLoginAttempts: 0,
        // lockedUntil: null,
      },
    });

    // 步骤 3: 返回更新后的用户信息 (排除敏感字段)。
    console.log(`User ${targetUserId} successfully ACTIVATED by admin ${performingAdmin?.id}.`);
    return NextResponse.json(excludeSensitiveUserFields(updatedUser), { status: 200 });

  } catch (error: any) {
    // 错误处理：记录未知错误，并返回500服务器错误。
    console.error(`Error activating user ${targetUserId} by admin ${performingAdmin?.id}:`, error);
    return errorResponse('An unexpected error occurred while activating the user account. Please try again later.', 500, 'server_error');
  }
}

// 使用 `requirePermission` 中间件包装 activateUserHandler。
// 只有拥有 'users:activate' 权限的用户才能调用此 POST 端点。
export const POST = requirePermission('users:activate', activateUserHandler);
