// app/api/v2/roles/[roleId]/permissions/[permissionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2'; // For Audit Logging

interface RouteContext {
  params: {
    roleId: string;       // 角色的ID (ID of the role)
    permissionId: string; // 要移除的权限的ID (ID of the permission to remove)
  };
}

/**
 * 从特定角色移除单个权限 (Remove a single permission from a specific role)
 * Permission: roles:permissions:remove
 */
async function removePermissionFromRoleHandler(req: AuthenticatedRequest, context: RouteContext) {
  const { roleId, permissionId } = context.params;
  const performingAdmin = req.user;
  const ipAddress = req.ip || req.headers?.get('x-forwarded-for');
  const userAgent = req.headers?.get('user-agent');

  console.log(`管理员 ${performingAdmin?.id} 正在从角色 ${roleId} 移除权限 ${permissionId}。(Admin ${performingAdmin?.id} removing permission ${permissionId} from role ${roleId}.)`);

  try {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      await AuthorizationUtils.logAuditEvent({
          actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
          actorId: performingAdmin?.id || 'anonymous',
          userId: performingAdmin?.id,
          action: 'ROLE_PERMISSION_REMOVE_FAILURE_ROLE_NOT_FOUND',
          status: 'FAILURE',
          resourceType: 'Role',
          resourceId: roleId,
          ipAddress,
          userAgent,
          errorMessage: 'Role not found when attempting to remove permission.',
          details: JSON.stringify({ permissionIdToRemove: permissionId }),
      });
      return NextResponse.json({ message: '角色未找到 (Role not found)' }, { status: 404 });
    }
    const permission = await prisma.permission.findUnique({ where: { id: permissionId } });
    if (!permission) {
      await AuthorizationUtils.logAuditEvent({
          actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
          actorId: performingAdmin?.id || 'anonymous',
          userId: performingAdmin?.id,
          action: 'ROLE_PERMISSION_REMOVE_FAILURE_PERMISSION_NOT_FOUND',
          status: 'FAILURE',
          resourceType: 'Permission',
          resourceId: permissionId,
          ipAddress,
          userAgent,
          errorMessage: 'Permission not found when attempting to remove from role.',
          details: JSON.stringify({ roleId: roleId }),
      });
      return NextResponse.json({ message: '权限未找到 (Permission not found)' }, { status: 404 });
    }

    const deleteResult = await prisma.rolePermission.deleteMany({
      where: {
        roleId: roleId,
        permissionId: permissionId,
      },
    });

    if (deleteResult.count === 0) {
      await AuthorizationUtils.logAuditEvent({
          actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
          actorId: performingAdmin?.id || 'anonymous',
          userId: performingAdmin?.id,
          action: 'ROLE_PERMISSION_REMOVE_FAILURE_NOT_ASSIGNED',
          status: 'FAILURE', // Or 'INFO' if such status exists, as it's not a system error but a client one.
          resourceType: 'RolePermission',
          resourceId: `${roleId}_${permissionId}`,
          ipAddress,
          userAgent,
          errorMessage: 'Permission was not assigned to this role or already removed.',
          details: JSON.stringify({ roleName: role.name, permissionName: permission.name }),
      });
      return NextResponse.json({ message: '权限未分配给此角色或已移除 (Permission not assigned to this role or already removed)' }, { status: 404 });
    }

    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'ROLE_PERMISSION_REMOVE_SUCCESS',
        status: 'SUCCESS',
        resourceType: 'RolePermission',
        resourceId: `${roleId}_${permissionId}`, // Composite ID or similar for join table change
        ipAddress,
        userAgent,
        details: JSON.stringify({ roleName: role.name, removedPermissionName: permission.name, roleId, permissionId }),
    });
    return new NextResponse(null, { status: 204 }); // No Content

  } catch (error: any) {
    console.error(`从角色 ${roleId} 移除权限 ${permissionId} 失败 (Failed to remove permission ${permissionId} from role ${roleId}):`, error);
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'ROLE_PERMISSION_REMOVE_FAILURE_DB_ERROR',
        status: 'FAILURE',
        resourceType: 'RolePermission',
        resourceId: `${roleId}_${permissionId}`,
        ipAddress,
        userAgent,
        errorMessage: `Failed to remove permission ${permissionId} from role ${roleId}.`,
        details: JSON.stringify({ error: error.message }),
    });
    return NextResponse.json({ message: '移除角色权限失败 (Failed to remove role permission)' }, { status: 500 });
  }
}

export const DELETE = requirePermission('roles:permissions:remove')(removePermissionFromRoleHandler);

[end of app/api/v2/roles/[roleId]/permissions/[permissionId]/route.ts]
