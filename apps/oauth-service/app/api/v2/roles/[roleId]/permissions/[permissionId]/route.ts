// app/api/v2/roles/[roleId]/permissions/[permissionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { withAuth, type AuthContext } from '@repo/lib/middleware';
import { withErrorHandling } from '@repo/lib';
import { AuthorizationUtils } from '@repo/lib/auth'; // For Audit Logging

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
async function removePermissionFromRoleHandler(req: NextRequest, context: RouteContext & { authContext: AuthContext }) {
  const { roleId, permissionId } = context.params;
  const performingAdmin = undefined as any; // TODO: 从认证中间件获取用户信息
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  console.log(`管理员 ${performingAdmin?.id} 正在从角色 ${roleId} 移除权限 ${permissionId}。(Admin ${performingAdmin?.id} removing permission ${permissionId} from role ${roleId}.)`);

  try {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      await AuthorizationUtils.logAuditEvent({
          userId: performingAdmin?.id,
          action: 'ROLE_PERMISSION_REMOVE_FAILURE_ROLE_NOT_FOUND',
          resource: `Role:${roleId}`,
          success: false,
          ipAddress,
          userAgent,
          errorMessage: 'Role not found when attempting to remove permission.',
          metadata: { permissionIdToRemove: permissionId },
      });
      return NextResponse.json({ message: '角色未找到 (Role not found)' }, { status: 404 });
    }
    const permission = await prisma.permission.findUnique({ where: { id: permissionId } });
    if (!permission) {
      await AuthorizationUtils.logAuditEvent({
          userId: performingAdmin?.id,
          action: 'ROLE_PERMISSION_REMOVE_FAILURE_PERMISSION_NOT_FOUND',
          resource: `Permission:${permissionId}`,
          success: false,
          ipAddress,
          userAgent,
          errorMessage: 'Permission not found when attempting to remove from role.',
          metadata: { roleId: roleId },
      });
      return NextResponse.json({ message: '权限未找到 (Permission not found)' }, { status: 404 });
    }

    const deleteResult = await prisma.rolePermission.deleteMany({
      where: {
        roleId: roleId,
        permissionId: permissionId
      },
    });

    if (deleteResult.count === 0) {
      await AuthorizationUtils.logAuditEvent({
          userId: performingAdmin?.id,
          action: 'ROLE_PERMISSION_REMOVE_FAILURE_NOT_ASSIGNED',
          resource: `RolePermission:${roleId}_${permissionId}`,
          success: false, // Or 'INFO' if such status exists, as it's not a system error but a client one.
          ipAddress,
          userAgent,
          errorMessage: 'Permission was not assigned to this role or already removed.',
          metadata: { roleName: role.name, permissionName: permission.name },
      });
      return NextResponse.json({ message: '权限未分配给此角色或已移除 (Permission not assigned to this role or already removed)' }, { status: 404 });
    }

    await AuthorizationUtils.logAuditEvent({
        userId: performingAdmin?.id,
        action: 'ROLE_PERMISSION_REMOVE_SUCCESS',
                  resource: `RolePermission:${roleId}_${permissionId}`, // Composite ID or similar for join table change
        success: true,
        ipAddress,
        userAgent,
        metadata: { roleName: role.name, removedPermissionName: permission.name, roleId, permissionId },
    });
    return new NextResponse(null, { status: 204 }); // No Content

  } catch (error: any) {
    console.error(`从角色 ${roleId} 移除权限 ${permissionId} 失败 (Failed to remove permission ${permissionId} from role ${roleId}):`, error);
    await AuthorizationUtils.logAuditEvent({
        userId: performingAdmin?.id,
        action: 'ROLE_PERMISSION_REMOVE_FAILURE_DB_ERROR',
                  resource: `RolePermission:${roleId}_${permissionId}`,
        success: false,
        ipAddress,
        userAgent,
        errorMessage: `Failed to remove permission ${permissionId} from role ${roleId}.`,
        metadata: { error: error.message },
    });
    return NextResponse.json({ message: '移除角色权限失败 (Failed to remove role permission)' }, { status: 500 });
  }
}

export const DELETE = withErrorHandling(
  withAuth(async (request: NextRequest, authContext: AuthContext) => {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const permissionId = pathSegments[pathSegments.length - 1] || '';
    const roleId = pathSegments[pathSegments.length - 3] || '';
    return removePermissionFromRoleHandler(request, { params: { roleId, permissionId }, authContext });
  }, { requiredPermissions: ['roles:permissions:remove'] })
);
