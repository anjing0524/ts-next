import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';

interface RolePermissionRouteParams {
  params: {
    roleId: string;
  };
}

// Schema for assigning/removing permissions to/from a role
const ModifyRolePermissionsSchema = z.object({
  permissionIds: z.array(z.string().uuid('Each permission ID must be a valid UUID')).min(1, 'At least one permission ID is required'),
});

// GET /api/roles/{roleId}/permissions - List permissions assigned to a role
async function getRolePermissions(request: NextRequest, { params }: RolePermissionRouteParams, authContext: AuthContext) {
  try {
    const roleId = params.roleId;
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(roleId)) {
        return NextResponse.json({ error: 'Invalid role ID format' }, { status: 400 });
    }

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    const rolePermissions = await prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true }, // Include the actual permission details
      orderBy: { permission: { identifier: 'asc' } },
    });

    return NextResponse.json(rolePermissions.map(rp => rp.permission), { status: 200 });
  } catch (error) {
    console.error(`Error fetching permissions for role ${params.roleId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch role permissions' }, { status: 500 });
  }
}

// POST /api/roles/{roleId}/permissions - Assign permissions to a role
async function assignPermissionsToRole(request: NextRequest, { params }: RolePermissionRouteParams, authContext: AuthContext) {
  try {
    const roleId = params.roleId;
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(roleId)) {
        return NextResponse.json({ error: 'Invalid role ID format' }, { status: 400 });
    }

    const body = await request.json();
    const validationResult = ModifyRolePermissionsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: validationResult.error.flatten() }, { status: 400 });
    }

    const { permissionIds } = validationResult.data;

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // Validate that all permissions exist
    const permissions = await prisma.permission.findMany({
      where: { id: { in: permissionIds } },
    });
    if (permissions.length !== permissionIds.length) {
      const foundIds = permissions.map(p => p.id);
      const notFoundIds = permissionIds.filter(id => !foundIds.includes(id));
      return NextResponse.json({ error: `Permissions not found: ${notFoundIds.join(', ')}` }, { status: 400 });
    }

    // Create new RolePermission entries
    // Use transaction for atomicity if assigning multiple
    const createdEntries = await prisma.$transaction(
      permissionIds.map(permissionId =>
        prisma.rolePermission.upsert({ // Use upsert to avoid duplicates if re-assigning
          where: { roleId_permissionId: { roleId, permissionId } },
          update: { assignedBy: authContext.user_id, assignedAt: new Date() },
          create: {
            roleId,
            permissionId,
            assignedBy: authContext.user_id, // Assuming assignedBy is user ID from auth context
          },
        })
      )
    );

    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'role_permissions_assigned',
      resource: `role:${roleId}`,
      success: true,
      metadata: { roleName: role.name, assignedPermissionIds: permissionIds, count: createdEntries.length },
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ message: `${createdEntries.length} permissions assigned successfully.` }, { status: 200 });

  } catch (error) {
    console.error(`Error assigning permissions to role ${params.roleId}:`, error);
     await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'role_permissions_assign_failed',
      resource: `role:${params.roleId}`,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to assign permissions' }, { status: 500 });
  }
}

// DELETE /api/roles/{roleId}/permissions - Remove permissions from a role
async function removePermissionsFromRole(request: NextRequest, { params }: RolePermissionRouteParams, authContext: AuthContext) {
  try {
    const roleId = params.roleId;
     if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(roleId)) {
        return NextResponse.json({ error: 'Invalid role ID format' }, { status: 400 });
    }

    const body = await request.json(); // Expects { permissionIds: [...] }
    const validationResult = ModifyRolePermissionsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: validationResult.error.flatten() }, { status: 400 });
    }

    const { permissionIds } = validationResult.data;

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // No need to check if permissions exist, deleteMany will just ignore non-existent ones in the join table.
    const deleteResult = await prisma.rolePermission.deleteMany({
      where: {
        roleId: roleId,
        permissionId: { in: permissionIds },
      },
    });

    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'role_permissions_removed',
      resource: `role:${roleId}`,
      success: true,
      metadata: { roleName: role.name, removedPermissionIds: permissionIds, count: deleteResult.count },
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ message: `${deleteResult.count} permissions removed successfully.` }, { status: 200 });

  } catch (error) {
    console.error(`Error removing permissions from role ${params.roleId}:`, error);
    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'role_permissions_remove_failed',
      resource: `role:${params.roleId}`,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to remove permissions' }, { status: 500 });
  }
}


// Apply auth middleware. Users need 'system:role:manage' permission for all these actions.
export const GET = withAuth(getRolePermissions, { requiredPermissions: ['system:role:manage'] });
export const POST = withAuth(assignPermissionsToRole, { requiredPermissions: ['system:role:manage'] });
export const DELETE = withAuth(removePermissionsFromRole, { requiredPermissions: ['system:role:manage'] });
