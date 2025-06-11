import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';
import { prisma } from '@/lib/prisma';

// Schema for updating a role (角色更新的校验 Schema)
const UpdateRoleSchema = z.object({
  // 角色显示名称 (可选)
  displayName: z.string().min(1, 'Display name is required').max(100).optional(),
  // 角色描述 (可选, 可为 null 以清空描述)
  description: z.string().max(255).optional().nullable(),
  // 角色激活状态 (可选)
  isActive: z.boolean().optional(),
  // 注意: 'name' (唯一标识符), 'parentId', 'isSystem' 通常不在此处更新。
  // name 的更改可能破坏引用；parentId 和 isSystem 已从 Role 模型中移除。
});

interface RoleRouteParams {
  params: {
    roleId: string; // 角色 ID (CUID)
  };
}

// GET /api/roles/{roleId} - 获取角色详情 (已重构)
async function getRole(request: NextRequest, { params }: RoleRouteParams, authContext: AuthContext) {
  try {
    const roleId = params.roleId;
    // Prisma 会自动处理无效 CUID 格式的查询（通常返回 null），所以特定格式校验已移除。

    // 查询角色及其关联的权限信息
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        // 包含角色权限关联记录，并进一步包含每个权限的详细信息
        rolePermissions: {
          include: {
            permission: true, // 包含关联的 Permission 对象
          },
        },
      },
    });

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // 返回的数据将包含角色信息及其嵌套的权限列表
    return NextResponse.json(role, { status: 200 });
  } catch (error) {
    console.error(`Error fetching role ${params.roleId}:`, error);
    // 根据策略决定是否对读操作的异常进行审计
    // await AuthorizationUtils.logAuditEvent({...});
    return NextResponse.json({ error: 'Failed to fetch role' }, { status: 500 });
  }
}

// PUT /api/roles/{roleId} - 更新角色详情 (已重构)
async function updateRole(request: NextRequest, { params }: RoleRouteParams, authContext: AuthContext) {
  try {
    const roleId = params.roleId;
    // CUID 格式校验已移除

    const body = await request.json();
    // 使用 Zod Schema 校验请求体
    const validationResult = UpdateRoleSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: validationResult.error.flatten() }, { status: 400 });
    }

    const dataToUpdate = validationResult.data;

    // 检查角色是否存在
    const currentRole = await prisma.role.findUnique({ where: { id: roleId } });
    if (!currentRole) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // parentId 和 isSystem 相关的逻辑已移除，因为这些字段不在新的 Role 模型中。

    // 执行更新
    const updatedRole = await prisma.role.update({
      where: { id: roleId },
      data: dataToUpdate, // dataToUpdate 只包含 displayName, description, isActive
    });

    // 记录审计日志：角色更新成功
    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'role_updated',
      resource: `role:${updatedRole.id}`,
      success: true,
      metadata: { updatedFields: Object.keys(dataToUpdate), roleName: updatedRole.name },
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json(updatedRole, { status: 200 });

  } catch (error) {
    console.error(`Error updating role ${params.roleId}:`, error);
    // 确保在异常情况下记录审计日志
    const userIdForAudit = authContext && authContext.user_id ? authContext.user_id : 'system';
    await AuthorizationUtils.logAuditEvent({
      userId: userIdForAudit,
      action: 'role_update_failed_exception',
      resource: `role:${params.roleId}`,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error while updating role',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }
}

// DELETE /api/roles/{roleId} - 删除角色 (已重构)
async function deleteRole(request: NextRequest, { params }: RoleRouteParams, authContext: AuthContext) {
  try {
    const roleId = params.roleId;
    // CUID 格式校验已移除

    // 1. 查询角色信息，并包含其用户关联信息 (用于检查角色是否仍被用户分配)
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        userRoles: { select: { userId: true } } // 仅选择需要的字段以优化查询
      }
    });

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // 2. isSystem 和 children 相关的检查已移除，因为这些字段不在新的 Role 模型中。

    // 3. 检查角色是否仍分配给任何用户
    if (role.userRoles && role.userRoles.length > 0) {
      const userIds = role.userRoles.map(ur => ur.userId);
      // 记录审计日志：角色删除失败（仍有用户分配）
      await AuthorizationUtils.logAuditEvent({
        userId: authContext.user_id,
        action: 'role_delete_failed_in_use_by_users', // 更具体的 action
        resource: `role:${roleId}`,
        success: false,
        errorMessage: `Role is currently assigned to ${role.userRoles.length} user(s) and cannot be deleted.`,
        metadata: { roleName: role.name, assignedUserCount: role.userRoles.length, sampleUserIds: userIds.slice(0, 5) },
        ipAddress: request.ip || request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return NextResponse.json({
        error: 'Cannot delete role assigned to users. Unassign users first.',
        details: { assignedUserCount: role.userRoles.length }
      }, { status: 400 });
    }

    // 4. 执行删除。
    // Prisma Schema 中 RolePermission 的 onDelete: Cascade (如果设置) 会自动删除关联的权限分配。
    // UserRole 的 onDelete: Cascade (如果设置) 也会自动处理。
    await prisma.role.delete({
      where: { id: roleId },
    });

    // 记录审计日志：角色删除成功
    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'role_deleted',
      resource: `role:${roleId}`,
      success: true,
      metadata: { deletedRoleName: role.name, isActive: role.isActive },
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ message: 'Role deleted successfully' }, { status: 200 });

  } catch (error) {
    console.error(`Error deleting role ${params.roleId}:`, error);
    // 确保在异常情况下记录审计日志
    const userIdForAudit = authContext && authContext.user_id ? authContext.user_id : 'system';
    await AuthorizationUtils.logAuditEvent({
      userId: userIdForAudit,
      action: 'role_delete_failed_exception',
      resource: `role:${params.roleId}`,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error while deleting role',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to delete role' }, { status: 500 });
  }
}

// 应用认证中间件。用户需要 'system:role:manage' 权限 (示例，具体权限标识符应更新为新格式)
// 注意: 这里的 'system:role:manage' 权限标识符可能需要根据新的权限命名规范进行调整
export const GET = withAuth(getRole, { requiredPermissions: ['system:role:manage'] }); // 或更细粒度的读取权限 'system:role:read'
export const PUT = withAuth(updateRole, { requiredPermissions: ['system:role:manage'] });
export const DELETE = withAuth(deleteRole, { requiredPermissions: ['system:role:manage'] });
