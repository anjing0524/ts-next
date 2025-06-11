import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';
import { z } from 'zod';

const AssignPermissionSchema = z.object({
  permissionId: z.string().cuid('Invalid Permission ID format'),
});

// Interface for route parameters passed by Next.js dynamic routing
interface DynamicRouteParams {
  params: {
    roleId: string;
  }
}

// GET /api/roles/{roleId}/permissions - List permissions for a role
async function handleGetRolePermissions(request: NextRequest, authContext: AuthContext, routeParams: DynamicRouteParams) {
  const { roleId } = routeParams.params;
  const requestingUserId = authContext.user_id;
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    // First, check if the role itself exists to provide a clear 404 if not
    const roleExists = await prisma.role.findUnique({ where: { id: roleId } });
    if (!roleExists) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    const rolePermissions = await prisma.rolePermission.findMany({
      where: { roleId: roleId },
      include: {
        permission: true,
      },
      orderBy: { permission: { name: 'asc' } }
    });

    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'role_permissions_list_success',
      resource: `roles/${roleId}/permissions`,
      ipAddress, userAgent, success: true,
      metadata: { roleId, listedPermissionsCount: rolePermissions.length }
    });

    return NextResponse.json(rolePermissions.map(rp => rp.permission));
  } catch (error) {
    console.error(`Error fetching permissions for role ${roleId}:`, error);
    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'role_permissions_list_error',
      resource: `roles/${roleId}/permissions`,
      ipAddress, userAgent, success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      metadata: { roleId }
    });
    return NextResponse.json({ error: 'Failed to fetch role permissions' }, { status: 500 });
  }
}

// POST /api/roles/{roleId}/permissions - Assign a permission to a role
async function handleAssignPermissionToRole(request: NextRequest, authContext: AuthContext, routeParams: DynamicRouteParams) {
  const { roleId } = routeParams.params;
  const requestingUserId = authContext.user_id;
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    const body = await request.json();
    const validation = AssignPermissionSchema.safeParse(body);

    if (!validation.success) {
      await AuthorizationUtils.logAuditEvent({
        userId: requestingUserId,
        action: 'role_permission_assign_validation_failed',
        resource: `roles/${roleId}/permissions`,
        ipAddress, userAgent, success: false,
        errorMessage: 'Input validation failed for permission assignment.',
        metadata: { roleId, errors: validation.error.flatten().fieldErrors },
      });
      return NextResponse.json({ error: 'Validation error', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { permissionId } = validation.data;

    const [role, permission] = await Promise.all([
      prisma.role.findUnique({ where: { id: roleId, isActive: true } }),
      prisma.permission.findUnique({ where: { id: permissionId, isActive: true } }),
    ]);

    if (!role) {
      return NextResponse.json({ error: 'Active role not found or specified roleId is invalid.' }, { status: 404 });
    }
    if (!permission) {
      return NextResponse.json({ error: 'Active permission not found or specified permissionId is invalid.' }, { status: 404 });
    }

    const rolePermission = await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      update: { assignedAt: new Date() },
      create: { roleId, permissionId, assignedAt: new Date() },
      include: { permission: true }
    });

    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'role_permission_assign_success',
      resource: `roles/${roleId}/permissions`,
      ipAddress, userAgent, success: true,
      metadata: { roleId, assignedPermissionId: permissionId },
    });

    return NextResponse.json(rolePermission.permission, { status: 201 });
  } catch (error) {
    console.error(`Error assigning permission ${body?.permissionId} to role ${roleId}:`, error);
     await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'role_permission_assign_error',
      resource: `roles/${roleId}/permissions`,
      ipAddress, userAgent, success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      metadata: { roleId, attemptedPermissionId: body?.permissionId }
    });
    return NextResponse.json({ error: 'Failed to assign permission' }, { status: 500 });
  }
}

export const GET = withAuth(handleGetRolePermissions, {
    requiredPermissions: ['roles:read', 'admin'],
    requireUserContext: true,
});

export const POST = withAuth(handleAssignPermissionToRole, {
    requiredPermissions: ['roles:edit_permissions', 'admin'],
    requireUserContext: true,
});
