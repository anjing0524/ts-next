// 文件路径: app/api/v2/roles/[roleId]/route.ts
// 描述: 此文件处理针对特定角色资源 (由 roleId 标识) 的 API 请求，
// 包括获取角色详情 (GET), 更新角色信息 (PUT), 以及删除角色 (DELETE)。
// 使用 `withAuth` 中间件进行访问控制。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database'; // Prisma ORM 客户端。
import { Prisma } from '@prisma/client'; // Prisma 生成的类型。
import { withAuth, type AuthContext } from '@repo/lib/middleware'; // 引入权限控制中间件。
import { withErrorHandling } from '@repo/lib';
import { AuthorizationUtils } from '@repo/lib/auth'; // For Audit Logging
import { z } from 'zod'; // Zod 库，用于数据验证。

// 定义路由上下文接口，用于从动态路由参数中获取 roleId。
interface RouteParams {
  roleId: string;
}

// --- Zod Schema 定义 ---
// 用于验证更新角色请求体的数据结构和规则。
const UpdateRoleSchema = z.object({
  displayName: z
    .string()
    .min(1, '显示名称不能为空 (Display name cannot be empty)')
    .max(100, '显示名称不能超过100个字符 (Display name cannot exceed 100 characters long)')
    .optional(),
  description: z
    .string()
    .max(255, '描述信息不能超过255个字符 (Description cannot exceed 255 characters long)')
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
});

// Zod Schema for PATCH requests, allows updating permissions as well.
const RolePatchSchema = UpdateRoleSchema.extend({
  permissionIds: z
    .array(z.string().cuid('无效的权限ID格式 (Invalid Permission ID format: must be a CUID)'))
    .optional(),
});

// 定义一组核心系统角色名称。这些角色通常具有特殊意义，不应被轻易删除或修改。
const CORE_SYSTEM_ROLES = [
  'SYSTEM_ADMIN',
  'USER',
  'USER_ADMIN',
  'PERMISSION_ADMIN',
  'CLIENT_ADMIN',
  'AUDIT_ADMIN',
];

/**
 * GET /api/v2/roles/{roleId} - 获取特定角色详情
 */
async function getRoleByIdHandler(
  req: NextRequest,
  { authContext, params }: { authContext: AuthContext; params: RouteParams }
): Promise<NextResponse> {
  const { roleId } = params;
  const performingAdminId = authContext.user_id;
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  try {
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });

    if (!role) {
      await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'ROLE_READ_FAILURE_NOT_FOUND',
        resource: `Role:${roleId}`,
        success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Role not found.',
      });
      return NextResponse.json({ message: '角色未找到 (Role not found)' }, { status: 404 });
    }

    const { rolePermissions, ...roleData } = role;
    const formattedRole = {
      ...roleData,
      permissions: rolePermissions.map((rp) => rp.permission),
    };

    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'ROLE_READ_SUCCESS',
      resource: `Role:${roleId}`,
      success: true,
      ipAddress,
      userAgent,
      metadata: { roleName: role.name, returnedFields: Object.keys(formattedRole) },
    });
    return NextResponse.json(formattedRole);
  } catch (error: any) {
    console.error(
      `获取角色 ${roleId} 详情失败 (Failed to fetch role details for ID ${roleId}):`,
      error
    );
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'ROLE_READ_FAILURE_DB_ERROR',
      resource: `Role:${roleId}`,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: `Failed to fetch role details for ID ${roleId}.`,
      metadata: { error: error.message },
    });
    return NextResponse.json(
      {
        message: `获取角色详情时发生错误 (An error occurred while retrieving role details for ID ${roleId})`,
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v2/roles/{roleId} - 更新特定角色信息
 */
async function updateRoleHandler(
  req: NextRequest,
  { authContext, params }: { authContext: AuthContext; params: RouteParams }
): Promise<NextResponse> {
  const { roleId } = params;
  const performingAdminId = authContext.user_id;
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  let body;
  try {
    body = await req.json();
  } catch (e: any) {
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'ROLE_UPDATE_FAILURE_INVALID_JSON',
      resource: `Role:${roleId}`,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: 'Invalid JSON request body for role update (PUT).',
      metadata: { error: e.message },
    });
    return NextResponse.json(
      { message: '无效的JSON请求体 (Invalid JSON request body)' },
      { status: 400 }
    );
  }

  const validationResult = UpdateRoleSchema.safeParse(body);
  if (!validationResult.success) {
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'ROLE_UPDATE_FAILURE_VALIDATION',
      resource: `Role:${roleId}`,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: 'Role update payload validation failed (PUT).',
      metadata: { issues: validationResult.error.format(), receivedBody: body },
    });
    return NextResponse.json(
      {
        message: '更新角色信息验证失败 (Role update input validation failed)',
        errors: validationResult.error.format(),
      },
      { status: 400 }
    );
  }

  if (Object.keys(validationResult.data).length === 0) {
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'ROLE_UPDATE_FAILURE_EMPTY_BODY',
      resource: `Role:${roleId}`,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: 'At least one field to update is required (PUT).',
    });
    return NextResponse.json(
      {
        message:
          '请求体中至少需要一个待更新的字段 (At least one field to update is required in the request body)',
      },
      { status: 400 }
    );
  }

  try {
    const existingRole = await prisma.role.findUnique({ where: { id: roleId } });
    if (!existingRole) {
      await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'ROLE_UPDATE_FAILURE_NOT_FOUND',
        resource: `Role:${roleId}`,
        success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Role not found to update (PUT).',
      });
      return NextResponse.json(
        { message: '角色未找到，无法更新 (Role not found, cannot update)' },
        { status: 404 }
      );
    }

    if (
      CORE_SYSTEM_ROLES.includes(existingRole.name) &&
      validationResult.data.isActive === false &&
      existingRole.name === 'SYSTEM_ADMIN'
    ) {
      await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'ROLE_UPDATE_FAILURE_SYSTEM_ROLE_DEACTIVATION',
        resource: `Role:${roleId}`,
        success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Attempted to deactivate SYSTEM_ADMIN role.',
        metadata: { roleName: existingRole.name },
      });
      return NextResponse.json(
        {
          message:
            '禁止操作：不能停用 SYSTEM_ADMIN 角色 (Forbidden: Cannot deactivate the SYSTEM_ADMIN role)',
        },
        { status: 403 }
      );
    }
    if ((body as any).name && (body as any).name !== existingRole.name) {
      await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'ROLE_UPDATE_FAILURE_NAME_MODIFICATION',
        resource: `Role:${roleId}`,
        success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Modifying the role name is not allowed.',
        metadata: { attemptedName: (body as any).name, currentName: existingRole.name },
      });
      return NextResponse.json(
        {
          message:
            '禁止操作：不允许修改角色名称 (Forbidden: Modifying the role name is not allowed)',
        },
        { status: 400 }
      );
    }

    const updatedRole = await prisma.role.update({
      where: { id: roleId },
      data: validationResult.data,
      include: {
        rolePermissions: { include: { permission: true } },
      },
    });

    const { rolePermissions, ...roleData } = updatedRole;
    const formattedRole = {
      ...roleData,
      permissions: rolePermissions.map((rp) => rp.permission),
    };

    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'ROLE_UPDATE_SUCCESS',
      resource: `Role:${roleId}`,
      success: true,
      ipAddress,
      userAgent,
      metadata: { updatedData: validationResult.data },
    });

    return NextResponse.json(formattedRole);
  } catch (error: any) {
    console.error(`更新角色 ${roleId} 失败 (Failed to update role ${roleId}):`, error);
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'ROLE_UPDATE_FAILURE_SERVER_ERROR',
      resource: `Role:${roleId}`,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: 'Server error during role update (PUT).',
      metadata: { error: error.message },
    });
    return NextResponse.json(
      {
        message: `更新角色时发生服务器错误 (Server error occurred while updating role for ID ${roleId})`,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/roles/{roleId} - 删除特定角色
 */
async function deleteRoleHandler(
  req: NextRequest,
  { authContext, params }: { authContext: AuthContext; params: RouteParams }
): Promise<NextResponse> {
  const { roleId } = params;
  const performingAdminId = authContext.user_id;
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  try {
    const roleToDelete = await prisma.role.findUnique({ where: { id: roleId } });
    if (!roleToDelete) {
      await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'ROLE_DELETE_FAILURE_NOT_FOUND',
        resource: `Role:${roleId}`,
        success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Role not found to delete.',
      });
      return NextResponse.json({ message: '角色未找到 (Role not found)' }, { status: 404 });
    }

    if (CORE_SYSTEM_ROLES.includes(roleToDelete.name)) {
      await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'ROLE_DELETE_FAILURE_CORE_SYSTEM_ROLE',
        resource: `Role:${roleId}`,
        success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Attempted to delete a core system role.',
        metadata: { roleName: roleToDelete.name },
      });
      return NextResponse.json(
        { message: '禁止操作：不能删除核心系统角色 (Forbidden: Cannot delete core system roles)' },
        { status: 403 }
      );
    }

    const usersWithRoleCount = await prisma.userRole.count({ where: { roleId } });
    if (usersWithRoleCount > 0) {
      await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'ROLE_DELETE_FAILURE_IN_USE',
        resource: `Role:${roleId}`,
        success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Role is still assigned to users.',
        metadata: { usersCount: usersWithRoleCount },
      });
      return NextResponse.json(
        {
          message: `角色正在使用中，无法删除 (Role is in use by ${usersWithRoleCount} users and cannot be deleted)`,
        },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.role.delete({ where: { id: roleId } });
    });

    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'ROLE_DELETE_SUCCESS',
      resource: `Role:${roleId}`,
      success: true,
      ipAddress,
      userAgent,
      metadata: { deletedRoleName: roleToDelete.name },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error(`删除角色 ${roleId} 失败 (Failed to delete role ${roleId}):`, error);
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'ROLE_DELETE_FAILURE_SERVER_ERROR',
      resource: `Role:${roleId}`,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: 'Server error during role deletion.',
      metadata: { error: error.message },
    });
    return NextResponse.json(
      { message: `删除角色时发生错误 (An error occurred while deleting role for ID ${roleId})` },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v2/roles/{roleId} - 部分更新角色信息，包括权限
 */
async function patchRoleHandler(
  req: NextRequest,
  { authContext, params }: { authContext: AuthContext; params: RouteParams }
): Promise<NextResponse> {
  const { roleId } = params;
  const performingAdminId = authContext.user_id;
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  let body;
  try {
    body = await req.json();
  } catch (e: any) {
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'ROLE_PATCH_FAILURE_INVALID_JSON',
      resource: `Role:${roleId}`,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: 'Invalid JSON request body for role patch.',
      metadata: { error: e.message },
    });
    return NextResponse.json({ message: '无效的JSON请求体' }, { status: 400 });
  }

  const validationResult = RolePatchSchema.safeParse(body);
  if (!validationResult.success) {
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'ROLE_PATCH_FAILURE_VALIDATION',
      resource: `Role:${roleId}`,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: 'Role patch payload validation failed.',
      metadata: { issues: validationResult.error.format(), receivedBody: body },
    });
    return NextResponse.json(
      { message: '更新角色信息验证失败', errors: validationResult.error.format() },
      { status: 400 }
    );
  }

  const { displayName, description, isActive, permissionIds } = validationResult.data;

  if (Object.keys(validationResult.data).length === 0) {
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'ROLE_PATCH_FAILURE_EMPTY_BODY',
      resource: `Role:${roleId}`,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: 'At least one field to update is required for PATCH.',
    });
    return NextResponse.json({ message: '请求体中至少需要一个待更新的字段' }, { status: 400 });
  }

  try {
    const existingRole = await prisma.role.findUnique({ where: { id: roleId } });
    if (!existingRole) {
      await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'ROLE_PATCH_FAILURE_NOT_FOUND',
        resource: `Role:${roleId}`,
        success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Role not found to patch.',
      });
      return NextResponse.json({ message: '角色未找到，无法更新' }, { status: 404 });
    }

    if (
      CORE_SYSTEM_ROLES.includes(existingRole.name) &&
      isActive === false &&
      existingRole.name === 'SYSTEM_ADMIN'
    ) {
      await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'ROLE_PATCH_FAILURE_SYSTEM_ROLE_DEACTIVATION',
        resource: `Role:${roleId}`,
        success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Attempted to deactivate SYSTEM_ADMIN role via PATCH.',
        metadata: { roleName: existingRole.name },
      });
      return NextResponse.json(
        { message: '禁止操作：不能停用 SYSTEM_ADMIN 角色' },
        { status: 403 }
      );
    }
    if ((body as any).name && (body as any).name !== existingRole.name) {
      await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'ROLE_PATCH_FAILURE_NAME_MODIFICATION',
        resource: `Role:${roleId}`,
        success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Modifying the role name is not allowed (PATCH).',
        metadata: { attemptedName: (body as any).name, currentName: existingRole.name },
      });
      return NextResponse.json({ message: '禁止操作：不允许修改角色名称' }, { status: 400 });
    }

    const updatedRole = await prisma.$transaction(async (tx) => {
      const roleUpdateData: Prisma.RoleUpdateInput = {};
      if (displayName !== undefined) roleUpdateData.displayName = displayName;
      if (description !== undefined) roleUpdateData.description = description;
      if (isActive !== undefined) roleUpdateData.isActive = isActive;

      if (Object.keys(roleUpdateData).length > 0) {
        await tx.role.update({
          where: { id: roleId },
          data: roleUpdateData,
        });
      }

      if (permissionIds !== undefined) {
        if (permissionIds.length > 0) {
          const permissionsCount = await tx.permission.count({
            where: { id: { in: permissionIds } },
          });
          if (permissionsCount !== permissionIds.length) {
            throw new Error(`One or more provided permissionIds are invalid or do not exist.`);
          }
        }

        await tx.rolePermission.deleteMany({ where: { roleId: roleId } });
        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((pid) => ({ roleId: roleId, permissionId: pid })),
          });
        }
      }

      return tx.role.findUnique({
        where: { id: roleId },
        include: { rolePermissions: { include: { permission: true } } },
      });
    });

    if (!updatedRole) {
      throw new Error('Role update failed post-transaction.');
    }

    const { rolePermissions, ...roleData } = updatedRole;
    const formattedRole = {
      ...roleData,
      permissions: rolePermissions.map((rp) => rp.permission),
    };

    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'ROLE_PATCH_SUCCESS',
      resource: `Role:${roleId}`,
      success: true,
      ipAddress,
      userAgent,
      metadata: {
        roleId: roleId,
        updatedFields: Object.keys(validationResult.data),
        assignedPermissionIds: permissionIds,
      },
    });
    return NextResponse.json(formattedRole);
  } catch (error: any) {
    console.error(`更新角色 ${roleId} 失败:`, error);
    let errorMessage = `An error occurred while patching role for ID ${roleId}`;
    let actionCode = 'ROLE_PATCH_FAILURE_DB_ERROR';
    let httpStatus = 500;

    if (error.message.toLowerCase().includes('permissionids are invalid')) {
      errorMessage = error.message;
      actionCode = 'ROLE_PATCH_FAILURE_INVALID_PERMISSIONS_IN_TX';
      httpStatus = 400;
    }

    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: actionCode,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: errorMessage,
      metadata: {
        error: error.message,
        errorCode: (error as any).code,
        attemptedData: validationResult.data,
      },
    });

    return NextResponse.json({ message: errorMessage }, { status: httpStatus });
  }
}

// --- 导出 HTTP 方法处理器 ---
export const GET = withErrorHandling(
  withAuth(getRoleByIdHandler, { requiredPermissions: ['role:read'] })
) as any;

export const PUT = withErrorHandling(
  withAuth(updateRoleHandler, { requiredPermissions: ['role:update'] })
) as any;

export const DELETE = withErrorHandling(
  withAuth(deleteRoleHandler, { requiredPermissions: ['role:delete'] })
) as any;

export const PATCH = withErrorHandling(
  withAuth(patchRoleHandler, { requiredPermissions: ['role:update'] })
) as any;
