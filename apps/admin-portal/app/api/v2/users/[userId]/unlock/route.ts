// 文件路径: app/api/v2/users/[userId]/unlock/route.ts
// 描述: 此文件处理管理员手动解锁特定用户账户的 API 请求。
// "解锁"通常意味着清除用户的 `lockedUntil` 状态，重置登录失败次数，并可能将用户重新标记为活动状态。
// 使用 `requirePermission` 中间件进行访问控制，确保只有具备 'users:unlock' 权限的用户才能执行此操作。

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma ORM 客户端。
import { User, Prisma } from '@prisma/client'; // Prisma 生成的用户类型和高级查询类型。
// import { JWTUtils } from '@/lib/auth/oauth2'; // REMOVED: 认证由中间件处理。
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

// `isUserAdmin` 函数已移除，权限由 `requirePermission` 统一管理。

/**
 * 从用户对象中排除敏感字段 (如 passwordHash)。
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
    userId: string; // 目标用户的ID。
  };
}

// --- POST /api/v2/users/{userId}/unlock (管理员手动解锁用户账户) ---
// 此处理函数用于管理员手动解锁指定的用户账户。
async function unlockUserHandler(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { params } = context; // 从路由上下文中获取路径参数。
  const targetUserId = params.userId; // 需要被解锁的目标用户ID。

  // `req.user` 由 `requirePermission` 中间件填充，包含执行此操作的已认证用户信息 (管理员)。
  const performingAdmin = req.user;
  // 日志记录哪个管理员正在尝试解锁哪个用户。
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to UNLOCK user ${targetUserId}.`);

  // 安全检查: 管理员不应能通过此接口解锁自己的账户 (如果账户被锁定，通常需要其他机制或联系其他管理员)。
  // 尽管此操作本身可能无害，但明确禁止自我操作可以避免潜在的逻辑混淆或意外。
  if (targetUserId === performingAdmin?.id) {
    // (可选逻辑) 如果管理员账户被锁定，应通过不同的流程（例如，超级管理员干预或特定的账户恢复流程）。
    // return errorResponse('Administrators cannot unlock their own account using this endpoint. If your account is locked, please contact another administrator.', 403, 'self_unlock_not_allowed');
    // 当前场景下，如果管理员有权限解锁用户，解锁自身可能被视为修复操作。为保持一致性，可以禁止。
  }

  try {
    // 步骤 1: 检查目标用户是否存在于数据库中。
    const userToUnlock = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!userToUnlock) {
      // 如果用户不存在，返回 404 Not Found 错误。
      return errorResponse('User not found to unlock.', 404, 'user_not_found');
    }

    // (可选) 检查用户是否真的被锁定。如果用户未被锁定，可能无需执行操作。
    // if (userToUnlock.isActive && !userToUnlock.lockedUntil) {
    //   console.log(`User ${targetUserId} is already unlocked and active. No action needed by admin ${performingAdmin?.id}.`);
    //   return NextResponse.json(excludeSensitiveUserFields(userToUnlock), { status: 200 });
    // }

    // 步骤 2: 执行解锁操作。
    // 更新用户的状态以解除锁定。
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId }, // 指定要更新的用户。
      data: {
        isActive: true,            // 将用户标记为活动状态。如果业务逻辑允许解锁后仍为非活动，则此行可移除或调整。
        lockedUntil: null,         // 将 lockedUntil 设置为 null，表示账户不再因锁定策略而被禁止登录。
        failedLoginAttempts: 0,    // 重置登录失败尝试次数，允许用户重新尝试登录。
        updatedAt: new Date(),     // 手动更新 updatedAt 时间戳。
      },
    });

    // 步骤 3: 返回响应。
    // 通常，成功的操作会返回 HTTP 204 No Content，表示操作已成功执行，但响应体中没有内容。
    // 或者，也可以返回更新后的用户对象 (HTTP 200 OK)，如此处被注释掉的行所示。
    console.log(`User ${targetUserId} successfully UNLOCKED by admin ${performingAdmin?.id}.`);
    // return NextResponse.json(excludeSensitiveUserFields(updatedUser), { status: 200 });
    return new NextResponse(null, { status: 204 }); // 推荐使用 204 No Content

  } catch (error: any) {
    // 错误处理：
    console.error(`Error unlocking user ${targetUserId} by admin ${performingAdmin?.id}:`, error);
    // 捕获 Prisma 特定的错误，例如 P2025 (要更新的记录未找到)。
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') { // 'An operation failed because it depends on one or more records that were required but not found.'
        // 这种情况理论上已被前面的 findUnique 覆盖，但作为双重保障。
        return errorResponse('User not found to unlock (likely deleted or ID changed during operation).', 404, 'user_not_found_on_update');
      }
    }
    // 返回通用服务器错误。
    return errorResponse('An unexpected error occurred while unlocking the user account. Please try again later.', 500, 'server_error');
  }
}

// 使用 `requirePermission` 中间件包装 unlockUserHandler。
// 只有拥有 'users:unlock' 权限的用户才能调用此 POST 端点。
export const POST = requirePermission('users:unlock', unlockUserHandler);
