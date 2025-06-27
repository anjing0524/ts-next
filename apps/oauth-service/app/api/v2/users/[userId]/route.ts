// 文件路径: app/api/v2/users/[userId]/route.ts
// 描述: 此文件处理单个用户的 API 请求，包括获取用户详情 (GET)、更新用户 (PUT) 和删除用户 (DELETE)。
// 使用权限控制中间件来保护这些端点，确保只有授权用户才能访问。

import { NextRequest, NextResponse } from 'next/server';
import { User } from '@prisma/client';
import { withAuth, type AuthContext } from '@repo/lib/middleware';
import { withErrorHandling } from '@repo/lib';
import { AuthorizationUtils } from '@repo/lib/auth';
import { UserService, UpdateUserParams } from '../../../../../lib/services/user-service';
import { z } from 'zod';

// --- Zod Schema 定义 ---
// 用于验证更新用户请求体的数据结构和规则
const UpdateUserSchema = z.object({
  displayName: z
    .string()
    .max(100, '显示名称不能超过100个字符 (Display name cannot exceed 100 characters long)')
    .optional(),
  firstName: z
    .string()
    .max(50, '名字不能超过50个字符 (First name cannot exceed 50 characters long)')
    .optional(),
  lastName: z
    .string()
    .max(50, '姓氏不能超过50个字符 (Last name cannot exceed 50 characters long)')
    .optional(),
  organization: z
    .string()
    .max(100, '组织名称不能超过100个字符 (Organization name cannot exceed 100 characters long)')
    .optional(),
  department: z
    .string()
    .max(100, '部门名称不能超过100个字符 (Department name cannot exceed 100 characters long)')
    .optional(),
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
  avatar: z.string().url('头像必须是有效的URL (Avatar must be a valid URL)').optional(),
});

/**
 * GET /api/v2/users/[userId] - 获取用户详情
 * 此处理函数响应 GET 请求，返回指定用户的详细信息。
 * 需要 'user:read' 权限才能访问。
 *
 * @param req NextRequest - 请求对象
 * @param context - 认证上下文和路由参数
 * @returns NextResponse - 包含用户详情的 JSON 响应
 */
async function getUserHandler(
  req: NextRequest,
  context: { authContext: AuthContext; params: { userId: string } }
): Promise<NextResponse> {
  const { userId } = context.params;
  const performingUserId = context.authContext.user_id;

  if (!userId) {
    return NextResponse.json(
      { message: '用户ID参数缺失 (User ID parameter is missing)' },
      { status: 400 }
    );
  }

  try {
    const user = await UserService.getUserById(userId);

    if (!user) {
      return NextResponse.json({ message: '用户未找到 (User not found)' }, { status: 404 });
    }

    return NextResponse.json({
      data: user,
      message: '用户详情获取成功 (User details retrieved successfully)',
    });
  } catch (error: any) {
    console.error('获取用户详情失败 (Failed to get user details):', error);
    return NextResponse.json(
      { message: '获取用户详情失败 (Failed to get user details)' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v2/users/[userId] - 更新用户信息
 * 此处理函数响应 PUT 请求，用于更新指定用户的信息。
 * 请求体需要符合 UpdateUserSchema 定义的结构和规则。
 * 需要 'user:update' 权限才能访问。
 *
 * @param req NextRequest - 请求对象
 * @param context - 认证上下文和路由参数
 * @returns NextResponse - 包含更新后的用户信息或错误信息的 JSON 响应
 */
async function updateUserHandler(
  req: NextRequest,
  context: { authContext: AuthContext; params: { userId: string } }
): Promise<NextResponse> {
  const { userId } = context.params;
  const performingAdminId = context.authContext.user_id;
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  if (!userId) {
    return NextResponse.json(
      { message: '用户ID参数缺失 (User ID parameter is missing)' },
      { status: 400 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch (e: any) {
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'USER_UPDATE_FAILURE_INVALID_JSON',
      resource: `user:${userId}`,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: 'Invalid JSON request body for user update.',
      metadata: { error: e.message },
    });
    return NextResponse.json(
      { message: '无效的JSON请求体 (Invalid JSON request body)' },
      { status: 400 }
    );
  }

  const validationResult = UpdateUserSchema.safeParse(body);
  if (!validationResult.success) {
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'USER_UPDATE_FAILURE_VALIDATION',
      resource: `user:${userId}`,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: 'User update payload validation failed.',
      metadata: { issues: validationResult.error.format(), receivedBody: body },
    });
    return NextResponse.json(
      {
        message: '更新用户验证失败 (User update input validation failed)',
        errors: validationResult.error.format(),
      },
      { status: 400 }
    );
  }

  try {
    const updatedUser = await UserService.updateUser(userId, validationResult.data, {
      userId: performingAdminId,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      data: updatedUser,
      message: '用户更新成功 (User updated successfully)',
    });
  } catch (error: any) {
    // UserService已经记录了审计日志，这里只处理HTTP响应
    return NextResponse.json(
      {
        message: error.message || '更新用户失败 (Failed to update user)',
      },
      { status: error.status || 500 }
    );
  }
}

/**
 * DELETE /api/v2/users/[userId] - 删除用户（软删除）
 * 此处理函数响应 DELETE 请求，用于删除指定用户（设置为非活动状态）。
 * 需要 'user:delete' 权限才能访问。
 *
 * @param req NextRequest - 请求对象
 * @param context - 认证上下文和路由参数
 * @returns NextResponse - 包含删除结果的 JSON 响应
 */
async function deleteUserHandler(
  req: NextRequest,
  context: { authContext: AuthContext; params: { userId: string } }
): Promise<NextResponse> {
  const { userId } = context.params;
  const performingAdminId = context.authContext.user_id;
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  if (!userId) {
    return NextResponse.json(
      { message: '用户ID参数缺失 (User ID parameter is missing)' },
      { status: 400 }
    );
  }

  // 防止用户删除自己
  if (userId === performingAdminId) {
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'USER_DELETE_FAILURE_SELF_DELETE',
      resource: `user:${userId}`,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: 'User attempted to delete their own account.',
    });
    return NextResponse.json(
      { message: '不能删除自己的账户 (Cannot delete your own account)' },
      { status: 400 }
    );
  }

  try {
    await UserService.deleteUser(userId, {
      userId: performingAdminId,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      message: '用户删除成功 (User deleted successfully)',
    });
  } catch (error: any) {
    // UserService已经记录了审计日志，这里只处理HTTP响应
    return NextResponse.json(
      {
        message: error.message || '删除用户失败 (Failed to delete user)',
      },
      { status: error.status || 500 }
    );
  }
}

// 导出处理函数，使用权限控制和错误处理包装器
export const GET = withErrorHandling(
  withAuth(getUserHandler, { requiredPermissions: ['user:read'] })
) as any;

export const PUT = withErrorHandling(
  withAuth(updateUserHandler, { requiredPermissions: ['user:update'] })
) as any;

export const DELETE = withErrorHandling(
  withAuth(deleteUserHandler, { requiredPermissions: ['user:delete'] })
) as any;
