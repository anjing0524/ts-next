import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';

// Interface for route parameters passed by Next.js dynamic routing
interface DynamicRouteParamsDelete {
  params: {
    roleId: string;
    permissionId: string;
  }
}

// DELETE /api/roles/{roleId}/permissions/{permissionId} - Remove a permission from a role
async function handleRemovePermissionFromRole(request: NextRequest, authContext: AuthContext, routeParams: DynamicRouteParamsDelete) {
  const { roleId, permissionId } = routeParams.params;
  const requestingUserId = authContext.user_id;
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    // Check if the assignment exists before attempting to delete
    const existingAssignment = await prisma.rolePermission.findUnique({
      where: { roleId_permissionId: { roleId, permissionId } },
    });

    if (!existingAssignment) {
      await AuthorizationUtils.logAuditEvent({
        userId: requestingUserId,
        action: 'role_permission_remove_not_found',
        resource: `roles/${roleId}/permissions/${permissionId}`,
        ipAddress, userAgent, success: false,
        errorMessage: 'Permission assignment not found for deletion.',
        metadata: { roleId, permissionId }
      });
      return NextResponse.json({ error: 'Permission assignment not found' }, { status: 404 });
    }

    await prisma.rolePermission.delete({
      where: { roleId_permissionId: { roleId, permissionId } },
    });

    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'role_permission_remove_success',
      resource: `roles/${roleId}/permissions/${permissionId}`,
      ipAddress, userAgent, success: true,
      metadata: { roleId, removedPermissionId: permissionId },
    });

    return new NextResponse(null, { status: 204 }); // No Content
  } catch (error) {
    console.error(`Error removing permission ${permissionId} from role ${roleId}:`, error);
    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'role_permission_remove_error',
      resource: `roles/${roleId}/permissions/${permissionId}`,
      ipAddress, userAgent, success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      metadata: { roleId, permissionId }
    });
    return NextResponse.json({ error: 'Failed to remove permission from role' }, { status: 500 });
  }
}

export const DELETE = withAuth(handleRemovePermissionFromRole, {
    requiredPermissions: ['roles:edit_permissions', 'admin'],
    requireUserContext: true,
});
