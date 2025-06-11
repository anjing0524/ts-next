import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { withAuth, AuthContext, PermissionUtils, validateSession } from '@/lib/auth/middleware'; // Added validateSession for manual DELETE handling
import { AuthorizationUtils } from '@/lib/auth/oauth2';
import { prisma } from '@/lib/prisma';


// Zod Schema for setting user roles (替换用户所有角色的校验 Schema)
// 接收一个角色 ID 数组
const SetUserRolesSchema = z.object({
  roleIds: z.array(z.string().cuid('Invalid Role ID format'), {
    errorMap: () => ({ message: 'Role IDs must be an array of CUID strings.' }),
  }),
});

// Interface for route parameters passed by Next.js dynamic routing
// 路径参数接口定义
interface DynamicRouteParams {
  userId: string; // 用户 ID
  roleId?: string; // 角色 ID (可选, 因为 GET 和 POST /roles 路径中不包含 roleId)
}

// GET /api/users/{userId}/roles - 获取指定用户的角色列表
async function handleGetUserRoles(request: NextRequest, authContext: AuthContext, routeParams: { params: DynamicRouteParams }) {
  const { userId: targetUserId } = routeParams.params; // 从路径参数中获取目标用户 ID
  const requestingUserId = authContext.user_id; // 当前操作用户的 ID (来自 withAuth 中间件)
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  // 权限检查：用户可以查看自己的角色，或者需要 'users:read' (或更具体的 'users:roles:read') 权限查看他人角色
  const canViewOwn = requestingUserId === targetUserId;
  const canAdminView = PermissionUtils.hasPermission(authContext.permissions || [], 'users:read');

  if (!canViewOwn && !canAdminView) {
    // 记录审计日志：无权限查看用户角色
    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'user_roles_list_unauthorized',
      resource: `users/${targetUserId}/roles`,
      ipAddress, userAgent, success: false,
      errorMessage: 'Permission denied to view user roles.',
    });
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  }

  try {
    // 查询用户的所有角色关联记录，并包含角色本身的详细信息
    const userRoles = await prisma.userRole.findMany({
      where: { userId: targetUserId },
      include: {
        role: true, // 包含关联的 Role 对象
      },
      orderBy: { role: { name: 'asc' }} // 按角色名称升序排序
    });

    // 记录审计日志：成功列出用户角色
    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'user_roles_list_success',
      resource: `users/${targetUserId}/roles`,
      ipAddress, userAgent, success: true,
      metadata: { targetUserId, listedRolesCount: userRoles.length }
    });

    // 返回角色对象数组
    return NextResponse.json(userRoles.map(ur => ur.role));
  } catch (error) {
    console.error(`Error fetching roles for user ${targetUserId}:`, error);
    // 记录审计日志：获取用户角色列表失败
    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'user_roles_list_error',
      resource: `users/${targetUserId}/roles`,
      ipAddress, userAgent, success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error fetching user roles',
      metadata: { targetUserId }
    });
    return NextResponse.json({ error: 'Failed to fetch user roles' }, { status: 500 });
  }
}

// POST /api/users/{userId}/roles - 设置/替换指定用户的角色 (已重构为 "Replace All" 逻辑)
async function handleSetUserRoles(request: NextRequest, authContext: AuthContext, routeParams: { params: DynamicRouteParams }) {
  const { userId: targetUserId } = routeParams.params; // 目标用户 ID
  const requestingUserId = authContext.user_id; // 操作用户 ID
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    const body = await request.json();
    // 使用 SetUserRolesSchema 校验请求体
    const validation = SetUserRolesSchema.safeParse(body);

    if (!validation.success) {
      // 记录审计日志：请求体验证失败
      await AuthorizationUtils.logAuditEvent({
        userId: requestingUserId,
        action: 'user_roles_set_validation_failed', // 更新 action 名称
        resource: `users/${targetUserId}/roles`,
        ipAddress, userAgent, success: false,
        errorMessage: 'Input validation failed for setting user roles.',
        metadata: { targetUserId, errors: validation.error.flatten().fieldErrors },
      });
      return NextResponse.json({ error: 'Validation error', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { roleIds } = validation.data; // 获取角色 ID 列表

    // 检查目标用户是否存在
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 检查所有提供的 roleIds 是否都对应有效的、激活的角色
    if (roleIds.length > 0) {
      const validRolesCount = await prisma.role.count({
        where: {
          id: { in: roleIds },
          isActive: true, // 确保角色是激活的
        },
      });
      if (validRolesCount !== roleIds.length) {
        // 找出无效或未激活的角色ID (用于更详细的错误信息)
         const validRoles = await prisma.role.findMany({
            where: { id: { in: roleIds }, isActive: true },
            select: { id: true }
        });
        const validRoleIdSet = new Set(validRoles.map(r => r.id));
        const invalidOrInactiveRoleIds = roleIds.filter(id => !validRoleIdSet.has(id));

        await AuthorizationUtils.logAuditEvent({
            userId: requestingUserId,
            action: 'user_roles_set_failed_invalid_roles',
            resource: `users/${targetUserId}/roles`,
            success: false,
            errorMessage: 'One or more provided role IDs are invalid or refer to inactive roles.',
            metadata: { targetUserId, invalidOrInactiveRoleIds },
            ipAddress, userAgent,
        });
        return NextResponse.json({ error: 'One or more provided role IDs are invalid or refer to inactive roles.', invalidOrInactiveRoleIds }, { status: 400 });
      }
    }

    // 使用 Prisma 事务执行“替换全部”操作：
    // 1. 删除用户当前所有的 UserRole 记录
    // 2. 如果 roleIds 非空，则为提供的每个 roleId 创建新的 UserRole 记录
    await prisma.$transaction(async (tx) => {
      // 删除用户当前所有角色分配
      await tx.userRole.deleteMany({
        where: { userId: targetUserId },
      });

      // 如果请求中提供了新的角色ID列表，则创建新的关联记录
      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({
            userId: targetUserId,
            roleId: roleId,
            assignedBy: requestingUserId, // 记录分配者
            // assignedAt 默认为 new Date()，由 Prisma schema 控制
          })),
        });
      }
    });

    // 记录审计日志：成功设置用户角色
    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'user_roles_set_success', // 更新 action 名称
      resource: `users/${targetUserId}/roles`,
      ipAddress, userAgent, success: true,
      metadata: { targetUserId, assignedRoleIds: roleIds, assignedRolesCount: roleIds.length },
    });

    // 返回成功响应，可以包含新分配的角色列表或其ID
    const updatedUserRoles = await prisma.userRole.findMany({
        where: { userId: targetUserId },
        include: { role: true }
    });

    return NextResponse.json(updatedUserRoles.map(ur => ur.role), { status: 200 });
  } catch (error) {
    console.error(`Error setting roles for user ${targetUserId}:`, error);
    // 记录审计日志：设置用户角色时发生异常
    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'user_roles_set_error', // 更新 action 名称
      resource: `users/${targetUserId}/roles`,
      ipAddress, userAgent, success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error setting user roles',
      metadata: { targetUserId }
    });
    return NextResponse.json({ error: 'Failed to set user roles' }, { status: 500 });
  }
}

// DELETE /api/users/{userId}/roles/{roleId} - 从用户移除指定角色
// 此函数签名和逻辑假定它用于处理带有 roleId 的路径 (例如 /api/users/[userId]/roles/[roleId])
// 本次子任务不修改此 DELETE 处理程序。
// This function expects `params.roleId` to be populated from the dynamic route segment.
async function handleRemoveRoleFromUser(request: NextRequest, authContext: AuthContext, routeParams: { params: Required<DynamicRouteParams> }) {
  const { userId: targetUserId, roleId: targetRoleId } = routeParams.params; // 目标用户ID和目标角色ID
  const requestingUserId = authContext.user_id; // 操作用户ID
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    // 查找现有的角色分配记录
    const existingAssignment = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: targetUserId, roleId: targetRoleId } },
    });

    if (!existingAssignment) {
      // 记录审计日志：未找到要删除的角色分配
      await AuthorizationUtils.logAuditEvent({
        userId: requestingUserId,
        action: 'user_role_remove_not_found',
        resource: `users/${targetUserId}/roles/${targetRoleId}`,
        ipAddress, userAgent, success: false,
        errorMessage: 'Role assignment not found for deletion.',
        metadata: { targetUserId, targetRoleId }
      });
      return NextResponse.json({ error: 'Role assignment not found' }, { status: 404 });
    }

    // 删除角色分配记录
    await prisma.userRole.delete({
      where: { userId_roleId: { userId: targetUserId, roleId: targetRoleId } },
    });

    // 记录审计日志：成功移除用户角色
    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'user_role_remove_success',
      resource: `users/${targetUserId}/roles/${targetRoleId}`,
      ipAddress, userAgent, success: true,
      metadata: { removedRoleId: targetRoleId, targetUserId },
    });

    return new NextResponse(null, { status: 204 }); // 成功，无内容返回
  } catch (error) {
    console.error(`Error removing role ${targetRoleId} from user ${targetUserId}:`, error);
    // 记录审计日志：移除用户角色时发生异常
    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'user_role_remove_error',
      resource: `users/${targetUserId}/roles/${targetRoleId}`,
      ipAddress, userAgent, success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error removing user role',
      metadata: { targetUserId, targetRoleId }
    });
    return NextResponse.json({ error: 'Failed to remove role' }, { status: 500 });
  }
}

// 导出经过包装的路由处理函数
export const GET = withAuth(handleGetUserRoles, {
    requiredPermissions: [], // 权限在处理函数内部进行更灵活的检查 (用户自身 vs 管理员)
    requireUserContext: true, // 确保 authContext 中包含用户信息
});

// POST 请求处理函数 (已更新为 handleSetUserRoles)
export const POST = withAuth(handleSetUserRoles, {
    requiredPermissions: ['users:edit_roles', 'admin'], // 设置用户角色所需的权限
    requireUserContext: true,
});

// 关于 DELETE 请求:
// 如果此文件路径为 /api/users/[userId]/roles/route.ts,
// 则 roleId 必须从查询参数或请求体中获取。
// 如果文件路径为 /api/users/[userId]/roles/[roleId]/route.ts, 则 params.roleId 来自路径。
// 当前子任务的提示表明 DELETE 路径为 /api/users/{userId}/roles/{roleId}。
// `withAuth` 中间件可能需要增强以正确传递所有动态参数。
// 以下是如果 Next.js 为文件路径处理动态参数时的标准导出方式。
// 这假定此 DELETE 导出要按预期工作，文件实际位于 /api/users/[userId]/roles/[roleId]/route.ts。
// 如果此文件 *必须* 是 /api/users/[userId]/roles/route.ts，则 DELETE 需要从查询中获取 roleId。
// 本次任务中，DELETE 部分的现有结构和导出方式保持不变。

export async function DELETE(request: NextRequest, { params }: { params: { userId: string, roleId: string } }) {
    // 手动重新包装 DELETE 以确保 AuthContext 和 params 正确处理。
    // 如果 `withAuth` 不能完美地将 Next.js 传递的路由参数应用于所有 HTTP 方法，通常需要这样做。
    const authContext = await validateSession(request); // `validateSession` 应返回包含 user_id 和 permissions 的 AuthContext
    if (!authContext || !authContext.user_id) {
        return NextResponse.json({ error: 'Unauthorized for DELETE' }, { status: 401 });
    }

    // 权限检查 (此处的权限检查是示例性的，实际应与 withAuth 中使用的逻辑一致或更完善)
    const hasPermission = PermissionUtils.hasPermission(authContext.permissions || [], 'users:edit_roles') ||
                          PermissionUtils.hasPermission(authContext.permissions || [], 'admin');

    if (!hasPermission) {
        // 记录审计日志：删除用户角色权限不足
        await AuthorizationUtils.logAuditEvent({
            userId: authContext.user_id,
            action: 'user_role_remove_unauthorized',
            resource: `users/${params.userId}/roles/${params.roleId}`,
            success: false,
            errorMessage: 'Permission denied to remove role from user.',
            ipAddress: request.headers.get('x-forwarded-for') || undefined,
            userAgent: request.headers.get('user-agent') || undefined,
        });
        return NextResponse.json({ error: 'Permission Denied to remove role from user' }, { status: 403 });
    }

    // 构造传递给实际处理函数的参数
    const routeParamsForHandler: { params: Required<DynamicRouteParams> } = { params: { userId: params.userId, roleId: params.roleId } };
    return handleRemoveRoleFromUser(request, authContext as AuthContext, routeParamsForHandler);
}
