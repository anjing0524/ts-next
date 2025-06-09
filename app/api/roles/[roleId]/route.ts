import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';

// Schema for updating a role
const UpdateRoleSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(100).optional(),
  description: z.string().max(255).optional().nullable(), // Allow null to clear description
  parentId: z.string().uuid('Invalid parent role ID format').optional().nullable(), // Allow null to remove parent
  isSystem: z.boolean().optional(),
  // Note: 'name' (identifier) is usually not updatable to avoid breaking references.
});

interface RoleRouteParams {
  params: {
    roleId: string;
  };
}

// GET /api/roles/{roleId} - Get role details
async function getRole(request: NextRequest, { params }: RoleRouteParams, authContext: AuthContext) {
  try {
    const roleId = params.roleId;
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      // include: { parent: true, children: true, permissions: { include: { permission: true } } } // Example includes
    });

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    return NextResponse.json(role, { status: 200 });
  } catch (error) {
    console.error(`Error fetching role ${params.roleId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch role' }, { status: 500 });
  }
}

// PUT /api/roles/{roleId} - Update role details
async function updateRole(request: NextRequest, { params }: RoleRouteParams, authContext: AuthContext) {
  try {
    const roleId = params.roleId;
    const body = await request.json();
    const validationResult = UpdateRoleSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: validationResult.error.flatten() }, { status: 400 });
    }

    const dataToUpdate = validationResult.data;

    // Prevent updating a system role's `isSystem` flag or parent if it's critical
    const currentRole = await prisma.role.findUnique({ where: { id: roleId } });
    if (!currentRole) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    if (currentRole.isSystem) {
      if (dataToUpdate.isSystem === false) {
        return NextResponse.json({ error: 'Cannot change isSystem from true to false for a system role.' }, { status: 400 });
      }
      // Potentially restrict other updates for system roles if needed
    }

    // If parentId is provided (even as null), check if new parent role exists or if it creates a cycle
    if (dataToUpdate.parentId === roleId) {
        return NextResponse.json({ error: 'Role cannot be its own parent.' }, { status: 400 });
    }
    if (dataToUpdate.parentId) {
      const parentRole = await prisma.role.findUnique({ where: { id: dataToUpdate.parentId } });
      if (!parentRole) {
        return NextResponse.json({ error: 'New parent role not found' }, { status: 400 });
      }
      // Basic cycle check: new parent should not have current role as an ancestor
      // This requires a more complex query or iterative check. For now, we'll skip deep cycle check.
    }


    const updatedRole = await prisma.role.update({
      where: { id: roleId },
      data: dataToUpdate,
    });

    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'role_updated',
      resource: `role:${updatedRole.id}`,
      success: true,
      metadata: { updatedFields: Object.keys(dataToUpdate) },
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json(updatedRole, { status: 200 });

  } catch (error) {
    console.error(`Error updating role ${params.roleId}:`, error);
     await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'role_update_failed_exception',
      resource: `role:${params.roleId}`,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }
}

// DELETE /api/roles/{roleId} - Delete a role
async function deleteRole(request: NextRequest, { params }: RoleRouteParams, authContext: AuthContext) {
  try {
    const roleId = params.roleId;

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: { children: true, userRoles: true } // Check for children and user assignments
    });

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    if (role.isSystem) {
      await AuthorizationUtils.logAuditEvent({
        userId: authContext.user_id,
        action: 'role_delete_failed_system_role',
        resource: `role:${roleId}`,
        success: false,
        errorMessage: 'System roles cannot be deleted.',
        ipAddress: request.ip || request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return NextResponse.json({ error: 'System roles cannot be deleted.' }, { status: 400 });
    }

    if (role.children.length > 0) {
      return NextResponse.json({ error: 'Cannot delete role with child roles. Reassign children first.' }, { status: 400 });
    }

    if (role.userRoles.length > 0) {
      return NextResponse.json({ error: 'Cannot delete role assigned to users. Unassign users first.' }, { status: 400 });
    }

    // Proceed with deletion
    // Prisma will also delete related RolePermission entries due to onDelete: Cascade (if schema is set up that way)
    await prisma.role.delete({
      where: { id: roleId },
    });

    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'role_deleted',
      resource: `role:${roleId}`, // roleId is correct here, as the role object is gone
      success: true,
      metadata: { deletedRoleName: role.name },
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ message: 'Role deleted successfully' }, { status: 200 }); // Or 204 No Content

  } catch (error) {
    console.error(`Error deleting role ${params.roleId}:`, error);
    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'role_delete_failed_exception',
      resource: `role:${params.roleId}`,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to delete role' }, { status: 500 });
  }
}

// Apply auth middleware. Users need 'system:role:manage' permission.
// For GET, 'system:role:read' could be a more granular permission if defined.
export const GET = withAuth(getRole, { requiredPermissions: ['system:role:manage'] });
export const PUT = withAuth(updateRole, { requiredPermissions: ['system:role:manage'] });
export const DELETE = withAuth(deleteRole, { requiredPermissions: ['system:role:manage'] });
