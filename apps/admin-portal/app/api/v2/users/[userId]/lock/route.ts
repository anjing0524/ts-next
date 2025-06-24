// 文件路径: app/api/v2/users/[userId]/lock/route.ts
// 描述: 此文件处理管理员手动锁定特定用户账户的 API 请求。
// "锁定"通常意味着用户在一段时间内或永久无法登录，并且其账户状态被标记为非活动。
// 使用 `requirePermission` 中间件进行访问控制，确保只有具备 'users:lock' 权限的用户才能执行此操作。

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma ORM 客户端。
import { User, Prisma } from '@prisma/client'; // Prisma 生成的用户类型和高级查询类型。
// import { JWTUtils } from '@/lib/auth/oauth2'; // REMOVED: 认证由中间件处理。
import { requirePermission } from '@/lib/auth/middleware'; // 引入权限控制中间件。
import { addYears } from 'date-fns'; // date-fns 库用于日期操作，此处用于设置一个非常长的锁定时间。

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

// --- POST /api/v2/users/{userId}/lock (管理员手动锁定用户账户) ---
// 此处理函数用于管理员手动锁定指定的用户账户。
async function lockUserHandler(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { params } = context; // 从路由上下文中获取路径参数。
  const targetUserId = params.userId; // 需要被锁定的目标用户ID。

  // `req.user` 由 `requirePermission` 中间件填充，包含执行此操作的已认证用户信息 (管理员)。
  const performingAdmin = req.user;
  // 日志记录哪个管理员正在尝试锁定哪个用户。
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to LOCK user ${targetUserId}.`);

  // 安全检查: 防止管理员通过此接口锁定自己的账户。
  // 自我锁定可能导致管理员失去系统访问权限，应避免。
  if (targetUserId === performingAdmin?.id) {
    return errorResponse('Action not allowed: Administrators cannot lock their own account using this endpoint.', 403, 'self_lock_not_allowed');
    // 注意：状态码可以是 400 (Bad Request) 或 403 (Forbidden)，取决于具体策略。
  }

  try {
    // 步骤 1: 检查目标用户是否存在于数据库中。
    const userToLock = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!userToLock) {
      // 如果用户不存在，返回 404 Not Found 错误。
      return errorResponse('User not found to lock.', 404, 'user_not_found');
    }

    // (可选) 检查用户是否已被锁定。如果已经是锁定状态，可以提前返回或提示。
    // if (userToLock.lockedUntil && userToLock.lockedUntil > new Date() && !userToLock.isActive) {
    //   console.log(`User ${targetUserId} is already locked and inactive. No further action by admin ${performingAdmin?.id}.`);
    //   return NextResponse.json(excludeSensitiveUserFields(userToLock), { status: 200 });
    // }

    // 步骤 2: 更新用户状态以锁定账户。
    // 设置一个非常遥远的 `lockedUntil` 日期，实际上等同于“永久”锁定 (或直到手动解锁)。
    // 例如，设置为当前日期后100年。
    const lockUntilDate = addYears(new Date(), 100);

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId }, // 指定要更新的用户。
      data: {
        isActive: false,        // 锁定用户时，通常也将其标记为非活动状态。
        lockedUntil: lockUntilDate, // 设置锁定截止日期。
        failedLoginAttempts: 0, // (可选) 重置登录失败尝试次数。这是一个好习惯，因为账户已被管理员干预。
        updatedAt: new Date(),  // 手动更新 `updatedAt` 时间戳。
      },
    });

    // 步骤 3: 返回更新后的用户信息 (排除敏感字段)。
    // HTTP 200 OK 表示操作成功。
    console.log(`User ${targetUserId} successfully LOCKED by admin ${performingAdmin?.id}.`);
    return NextResponse.json(excludeSensitiveUserFields(updatedUser), { status: 200 });
    // 或者，如果不需要返回更新后的用户对象，可以返回 HTTP 204 No Content。
    // return new NextResponse(null, { status: 204 });

  } catch (error: any) {
    // 错误处理：
    console.error(`Error locking user ${targetUserId} by admin ${performingAdmin?.id}:`, error);
    // 捕获 Prisma 特定的错误，例如 P2025 (要更新的记录未找到)。
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') { // 'An operation failed because it depends on one or more records that were required but not found.'
        return errorResponse('User not found to lock (likely deleted or ID changed during operation).', 404, 'user_not_found_on_update');
      }
    }
    // 返回通用服务器错误。
    return errorResponse('An unexpected error occurred while locking the user account. Please try again later.', 500, 'server_error');
  }
}

// 使用 `requirePermission` 中间件包装 lockUserHandler。
// 只有拥有 'users:lock' 权限的用户才能调用此 POST 端点。
export const POST = requirePermission('users:lock', lockUserHandler);
