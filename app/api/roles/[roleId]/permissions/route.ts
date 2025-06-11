import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';

// 定义路径参数的校验 Schema (用于校验 roleId)
const RolePermissionParamsSchema = z.object({
  roleId: z.string(), // CUID 校验可以省略，让 Prisma 处理无效 ID
});

// 定义管理角色权限请求体的校验 Schema (用于批量分配权限)
const ManageRolePermissionsSchema = z.object({
  // 权限 ID 列表，用于替换角色当前的所有权限
  permissionIds: z.array(z.string(), {
    errorMap: () => ({ message: 'Permission IDs must be an array of strings.' }),
  }),
});

interface RolePermissionsRouteParams {
  params: {
    roleId: string;
  };
}

// GET /api/roles/{roleId}/permissions - 获取角色拥有的权限列表
async function getRolePermissions(
  request: NextRequest,
  { params }: RolePermissionsRouteParams,
  authContext: AuthContext
) {
  try {
    // 校验路径参数 roleId
    const paramsValidation = RolePermissionParamsSchema.safeParse(params);
    if (!paramsValidation.success) {
      return NextResponse.json({ error: 'Invalid role ID format', details: paramsValidation.error.flatten() }, { status: 400 });
    }
    const { roleId } = paramsValidation.data;

    // 查询角色及其关联的权限 ID
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        // 选择 rolePermissions 关联，并从中选择 permissionId
        // 如果客户端需要完整的 permission 对象，可以改为:
        // rolePermissions: { include: { permission: true } }
        rolePermissions: {
          select: {
            permissionId: true,
            // Можно также включить детали самого разрешения, если это необходимо клиенту
            // permission: { select: { id: true, name: true, displayName: true } }
          },
        },
      },
    });

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // 提取权限 ID 列表 (或完整的权限对象列表)
    const permissionIds = role.rolePermissions.map(rp => rp.permissionId);
    // const permissions = role.rolePermissions.map(rp => rp.permission); // Если включили детали разрешения

    // 记录审计日志 (可选，一般读操作不强制审计，除非有特殊需求)
    // await AuthorizationUtils.logAuditEvent({ ... });

    return NextResponse.json({ permissionIds }, { status: 200 });
  } catch (error) {
    console.error(`Error fetching permissions for role ${params.roleId}:`, error);
    // 异常情况的审计日志 (可选)
    const userIdForAudit = authContext && authContext.user_id ? authContext.user_id : 'system';
    await AuthorizationUtils.logAuditEvent({
      userId: userIdForAudit,
      action: 'role_permissions_fetch_failed_exception',
      resource: `role:${params.roleId}/permissions`,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error while fetching role permissions',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to fetch role permissions' }, { status: 500 });
  }
}

// POST /api/roles/{roleId}/permissions - 为角色分配/替换权限 (采用“先删除后添加”的策略，实现幂等性)
async function assignPermissionsToRole(
  request: NextRequest,
  { params }: RolePermissionsRouteParams,
  authContext: AuthContext
) {
  try {
    // 1. 校验路径参数 roleId
    const paramsValidation = RolePermissionParamsSchema.safeParse(params);
    if (!paramsValidation.success) {
      return NextResponse.json({ error: 'Invalid role ID format', details: paramsValidation.error.flatten() }, { status: 400 });
    }
    const { roleId } = paramsValidation.data;

    // 2. 解析并校验请求体
    const body = await request.json();
    const bodyValidation = ManageRolePermissionsSchema.safeParse(body);
    if (!bodyValidation.success) {
      return NextResponse.json({ error: 'Validation failed for request body', details: bodyValidation.error.flatten() }, { status: 400 });
    }
    const { permissionIds } = bodyValidation.data;

    // 3. 检查角色是否存在
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // 4. (可选但推荐) 检查所有提供的 permissionIds 是否都对应有效的 Permission 记录
    if (permissionIds.length > 0) {
      const validPermissionsCount = await prisma.permission.count({
        where: {
          id: { in: permissionIds },
        },
      });
      if (validPermissionsCount !== permissionIds.length) {
        // 找出无效的 Permission ID (用于更详细的错误信息)
        const validPermissions = await prisma.permission.findMany({
            where: { id: { in: permissionIds } },
            select: { id: true }
        });
        const validPermissionIdSet = new Set(validPermissions.map(p => p.id));
        const invalidPermissionIds = permissionIds.filter(id => !validPermissionIdSet.has(id));

        await AuthorizationUtils.logAuditEvent({
            userId: authContext.user_id,
            action: 'role_permissions_assign_failed_invalid_permissions',
            resource: `role:${roleId}/permissions`,
            success: false,
            errorMessage: 'One or more provided permission IDs are invalid.',
            metadata: { invalidPermissionIds },
            ipAddress: request.ip || request.headers.get('x-forwarded-for'),
            userAgent: request.headers.get('user-agent'),
        });
        return NextResponse.json({ error: 'One or more provided permission IDs are invalid.', invalidPermissionIds }, { status: 400 });
      }
    }

    // 5. 使用 Prisma 事务执行权限替换操作
    //   a. 删除该角色当前所有的 RolePermission 记录
    //   b. 为提供的 permissionIds 创建新的 RolePermission 记录
    await prisma.$transaction(async (tx) => {
      // 删除当前角色已分配的所有权限
      await tx.rolePermission.deleteMany({
        where: { roleId: roleId },
      });

      // 如果请求中提供了新的权限ID列表，则创建新的关联记录
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: roleId,
            permissionId: permissionId,
          })),
        });
      }
    });

    // 记录审计日志：角色权限分配成功
    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'role_permissions_assigned',
      resource: `role:${roleId}/permissions`,
      success: true,
      metadata: { roleName: role.name, assignedPermissionIds: permissionIds, count: permissionIds.length },
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    // 返回成功响应，可以是被更新后的权限列表或简单的成功消息
    // 为了与 GET 请求保持一致，可以返回新分配的权限 ID 列表
    return NextResponse.json({ message: 'Permissions assigned successfully.', permissionIds }, { status: 200 });

  } catch (error) {
    console.error(`Error assigning permissions to role ${params.roleId}:`, error);
    // 确保在异常情况下记录审计日志
    const userIdForAudit = authContext && authContext.user_id ? authContext.user_id : 'system';
    await AuthorizationUtils.logAuditEvent({
      userId: userIdForAudit,
      action: 'role_permissions_assign_failed_exception',
      resource: `role:${params.roleId}/permissions`,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error while assigning role permissions',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to assign permissions to role' }, { status: 500 });
  }
}

// 应用认证中间件。用户需要 'system:role:manage' 权限 (示例，具体权限标识符应更新为新格式)
// 注意: 这里的 'system:role:manage' 权限标识符可能需要根据新的权限命名规范进行调整
export const GET = withAuth(getRolePermissions, { requiredPermissions: ['system:role:manage'] }); // 或更细粒度的读取权限
export const POST = withAuth(assignPermissionsToRole, { requiredPermissions: ['system:role:manage'] });

// PUT /api/roles/{roleId}/permissions - 通常用于完全替换资源，POST 已实现此逻辑。
// 如果需要明确区分 PUT 和 POST，PUT 也可以实现与 POST 相同的“替换全部”逻辑。
// export const PUT = withAuth(assignPermissionsToRole, { requiredPermissions: ['system:role:manage'] });

// DELETE /api/roles/{roleId}/permissions - (可选) 用于移除角色与特定权限的关联
// 本次任务中未要求实现。如果需要，其逻辑大致为：
// 1. 校验 roleId 和请求体中的 permissionIdsToUnassign
// 2. prisma.rolePermission.deleteMany({ where: { roleId: roleId, permissionId: { in: permissionIdsToUnassign } } })
// 3. 审计日志
// 4. 返回成功响应
