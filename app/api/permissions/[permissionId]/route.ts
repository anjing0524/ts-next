import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';
import { prisma } from '@/lib/prisma';
import {
  // PermissionTypeEnum, // Not used in this file
  // HttpMethodEnum, // Not directly used in UpdatePermissionSchema if it uses ApiPermissionDetailsSchema
  ApiPermissionDetailsSchema,
  MenuPermissionDetailsSchema,
  DataPermissionDetailsSchema,
} from '@/schemas/permissionSchemas';

// 更新权限的 Schema
// name (唯一标识符) 和 type (类型) 通常不应在此处更新，以保持权限的稳定性和一致性。
// 如需更改 name 或 type，建议通过更明确的流程（例如删除旧权限，创建新权限）。
const UpdatePermissionSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(100).optional(),
  description: z.string().max(255).optional().nullable(),
  resource: z.string().min(1, 'Resource is required').max(100).optional(),
  action: z.string().min(1, 'Action is required').max(50).optional(),
  apiDetails: ApiPermissionDetailsSchema.optional(),
  menuDetails: MenuPermissionDetailsSchema.optional(),
  dataDetails: DataPermissionDetailsSchema.optional(),
});

interface PermissionRouteParams {
  params: {
    permissionId: string; // 权限 ID (CUID)
  };
}

// GET /api/permissions/{permissionId} - 获取权限详情 (已重构)
async function getPermission(
  request: NextRequest,
  { params }: PermissionRouteParams,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _authContext: AuthContext
) {
  try {
    const permissionId = params.permissionId;
    // CUID 格式通常为 'c' + 24 位小写字母数字混合字符串。
    // Prisma 会自动处理无效 ID 格式的查询（通常返回 null），所以严格的格式校验可以省略，
    // 但如果需要，可以使用 z.string().cuid() 或类似 regex。
    // 此处移除了原有的 UUID 校验。

    // 获取权限核心信息，并包含其特定类型的详细信息
    const permission = await prisma.permission.findUnique({
      where: { id: permissionId },
      include: {
        apiPermission: true, // 包含 API 权限详情
        menuPermission: true, // 包含菜单权限详情
        dataPermission: true, // 包含数据权限详情
      },
    });

    if (!permission) {
      return NextResponse.json({ error: 'Permission not found' }, { status: 404 });
    }

    // 返回的数据将包含核心权限信息及其嵌套的类型特定详情
    return NextResponse.json(permission, { status: 200 });
  } catch (error) {
    console.error(`Error fetching permission ${params.permissionId}:`, error);
    // 审计日志 (可选，根据策略决定是否对读操作的异常进行审计)
    // await AuthorizationUtils.logAuditEvent({...});
    return NextResponse.json({ error: 'Failed to fetch permission' }, { status: 500 });
  }
}

// PUT /api/permissions/{permissionId} - 更新权限详情 (已重构)
async function updatePermission(
  request: NextRequest,
  { params }: PermissionRouteParams,
  authContext: AuthContext
) {
  try {
    const permissionId = params.permissionId;
    // 移除了 UUID 格式校验

    const body = await request.json();
    const validationResult = UpdatePermissionSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const dataToUpdate = validationResult.data;

    // 1. 首先，获取当前权限记录，特别是其 `type`，以确定哪个关联表需要更新
    const existingPermission = await prisma.permission.findUnique({
      where: { id: permissionId },
    });

    if (!existingPermission) {
      return NextResponse.json({ error: 'Permission not found' }, { status: 404 });
    }

    // 2. 使用 Prisma 事务进行更新
    const updatedPermission = await prisma.$transaction(async (tx) => {
      // 2a. 更新 Permission 主表中的通用字段
      const { apiDetails, menuDetails, dataDetails, ...scalarData } = dataToUpdate;
      // let mainPermissionUpdated = existingPermission; // This variable is assigned but never read

      if (Object.keys(scalarData).length > 0) {
        await tx.permission.update({
          where: { id: permissionId },
          data: scalarData,
        });
      }

      // 2b. 根据权限类型和请求中提供的 details 更新关联表
      // 注意：这里假设如果提供了 details，就进行更新操作。
      // 如果关联记录可能不存在，则应使用 upsert 或先查询再决定 create/update。
      // 但基于创建逻辑，关联记录应该存在。
      if (existingPermission.type === 'API' && apiDetails) {
        await tx.apiPermission.update({
          where: { permissionId: permissionId },
          data: apiDetails,
        });
      } else if (existingPermission.type === 'MENU' && menuDetails) {
        await tx.menuPermission.update({
          where: { permissionId: permissionId },
          data: menuDetails,
        });
      } else if (existingPermission.type === 'DATA' && dataDetails) {
        await tx.dataPermission.update({
          where: { permissionId: permissionId },
          data: dataDetails,
        });
      }

      // 返回更新后的主权限信息（不包含关联数据，如果需要则需额外查询或调整返回）
      // 为了与 GET 请求保持一致，这里可以重新查询包含关联数据
      return tx.permission.findUniqueOrThrow({
        where: { id: permissionId },
        include: {
          apiPermission: true,
          menuPermission: true,
          dataPermission: true,
        },
      });
    });

    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'permission_updated',
      resource: `permission:${updatedPermission.id}`,
      success: true,
      // metadata 中记录被更新的字段和权限名称/ID
      metadata: {
        updatedFields: Object.keys(dataToUpdate),
        permissionName: updatedPermission.name,
      },
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json(updatedPermission, { status: 200 });
  } catch (error) {
    console.error(`Error updating permission ${params.permissionId}:`, error);
    // 确保记录审计日志时 authContext.user_id 可用
    const userIdForAudit = authContext && authContext.user_id ? authContext.user_id : 'system';
    await AuthorizationUtils.logAuditEvent({
      userId: userIdForAudit,
      action: 'permission_update_failed_exception',
      resource: `permission:${params.permissionId}`,
      success: false,
      errorMessage:
        error instanceof Error ? error.message : 'Unknown error while updating permission',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to update permission' }, { status: 500 });
  }
}

// DELETE /api/permissions/{permissionId} - 删除权限 (已重构)
async function deletePermission(
  request: NextRequest,
  { params }: PermissionRouteParams,
  authContext: AuthContext
) {
  try {
    const permissionId = params.permissionId;
    // 移除了 UUID 格式校验

    // 1. 获取权限信息，同时检查是否被角色使用
    const permission = await prisma.permission.findUnique({
      where: { id: permissionId },
      include: {
        rolePermissions: { select: { roleId: true } }, // 仅选择需要的字段以优化查询
      },
    });

    if (!permission) {
      return NextResponse.json({ error: 'Permission not found' }, { status: 404 });
    }

    // 2. 检查权限是否仍被任何角色使用
    if (permission.rolePermissions && permission.rolePermissions.length > 0) {
      const roleIds = permission.rolePermissions.map((rp) => rp.roleId);
      await AuthorizationUtils.logAuditEvent({
        userId: authContext.user_id,
        action: 'permission_delete_failed_in_use_by_roles', // 更具体的 action
        resource: `permission:${permissionId}`,
        success: false,
        errorMessage: `Permission is currently assigned to ${permission.rolePermissions.length} role(s) and cannot be deleted.`,
        // metadata 中记录权限名称和关联的角色ID列表
        metadata: { permissionName: permission.name, associatedRoleIds: roleIds },
        ipAddress: request.ip || request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return NextResponse.json(
        {
          error: 'Permission is in use by roles. Remove from roles first.',
          details: { associatedRoleIds: roleIds },
        },
        { status: 400 }
      );
    }

    // 3. UserPermission 表已从 schema.prisma 移除，因此不再需要检查 directUserAssignments。
    //    如果未来添加了直接用户权限分配表，需要在此处添加相应检查。

    // 4. 执行删除操作。
    //    Prisma Schema 中定义的 onDelete: Cascade 关系将自动处理关联的 ApiPermission, MenuPermission, DataPermission 记录。
    await prisma.permission.delete({
      where: { id: permissionId },
    });

    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'permission_deleted',
      resource: `permission:${permissionId}`,
      success: true,
      // metadata 中记录被删除权限的名称
      metadata: { deletedPermissionName: permission.name, type: permission.type },
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ message: 'Permission deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error(`Error deleting permission ${params.permissionId}:`, error);
    // 确保记录审计日志时 authContext.user_id 可用
    const userIdForAudit = authContext && authContext.user_id ? authContext.user_id : 'system';
    await AuthorizationUtils.logAuditEvent({
      userId: userIdForAudit,
      action: 'permission_delete_failed_exception',
      resource: `permission:${params.permissionId}`,
      success: false,
      errorMessage:
        error instanceof Error ? error.message : 'Unknown error while deleting permission',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to delete permission' }, { status: 500 });
  }
}

// 应用权限中间件。用户需要 'system:permission:manage' 权限 (示例，具体权限标识符应更新为新格式)
// 注意: 这里的 'system:permission:manage' 权限标识符可能需要根据新的命名规范 (如 'permission:manage:system') 进行调整
export const GET = withAuth(getPermission, { requiredPermissions: ['system:permission:manage'] });
export const PUT = withAuth(updatePermission, {
  requiredPermissions: ['system:permission:manage'],
});
export const DELETE = withAuth(deletePermission, {
  requiredPermissions: ['system:permission:manage'],
});
