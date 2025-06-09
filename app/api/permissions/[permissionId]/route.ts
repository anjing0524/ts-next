import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';

// Allowed permission categories
const permissionCategories = ['system', 'app', 'api', 'data', 'page'] as const;

// Schema for updating a permission
// Identifier, category, resource, action are generally not updatable once created
// to maintain integrity, only name and description.
const UpdatePermissionSchema = z.object({
  name: z.string().min(3, 'Permission name must be at least 3 characters').max(100).optional(),
  description: z.string().max(255).optional().nullable(),
  // If category, resource, action were updatable, they'd need validation and
  // potentially cascading updates or checks, which adds complexity.
  // For now, assume they are fixed after creation.
});

interface PermissionRouteParams {
  params: {
    permissionId: string; // This will be the ID (UUID) of the permission
  };
}

// GET /api/permissions/{permissionId} - Get permission details
async function getPermission(request: NextRequest, { params }: PermissionRouteParams, authContext: AuthContext) {
  try {
    const permissionId = params.permissionId;
    // Validate if permissionId is a UUID if your IDs are UUIDs
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(permissionId)) {
        return NextResponse.json({ error: 'Invalid permission ID format' }, { status: 400 });
    }

    const permission = await prisma.permission.findUnique({
      where: { id: permissionId },
    });

    if (!permission) {
      return NextResponse.json({ error: 'Permission not found' }, { status: 404 });
    }

    return NextResponse.json(permission, { status: 200 });
  } catch (error) {
    console.error(`Error fetching permission ${params.permissionId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch permission' }, { status: 500 });
  }
}

// PUT /api/permissions/{permissionId} - Update permission details
async function updatePermission(request: NextRequest, { params }: PermissionRouteParams, authContext: AuthContext) {
  try {
    const permissionId = params.permissionId;
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(permissionId)) {
        return NextResponse.json({ error: 'Invalid permission ID format' }, { status: 400 });
    }

    const body = await request.json();
    const validationResult = UpdatePermissionSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: validationResult.error.flatten() }, { status: 400 });
    }

    const dataToUpdate = validationResult.data;

    // Ensure permission exists before attempting to update
    const existingPermission = await prisma.permission.findUnique({ where: { id: permissionId } });
    if (!existingPermission) {
      return NextResponse.json({ error: 'Permission not found' }, { status: 404 });
    }
    
    // Typically, identifier, category, resource, action are not changed after creation.
    // If they were, unique constraints on 'identifier' and consistency with category:resource:action
    // would need careful handling. The current schema only allows name and description updates.

    const updatedPermission = await prisma.permission.update({
      where: { id: permissionId },
      data: dataToUpdate,
    });

    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'permission_updated',
      resource: `permission:${updatedPermission.id}`,
      success: true,
      metadata: { updatedFields: Object.keys(dataToUpdate), identifier: updatedPermission.identifier },
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json(updatedPermission, { status: 200 });

  } catch (error) {
    console.error(`Error updating permission ${params.permissionId}:`, error);
    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'permission_update_failed_exception',
      resource: `permission:${params.permissionId}`,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to update permission' }, { status: 500 });
  }
}

// DELETE /api/permissions/{permissionId} - Delete a permission
async function deletePermission(request: NextRequest, { params }: PermissionRouteParams, authContext: AuthContext) {
  try {
    const permissionId = params.permissionId;
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(permissionId)) {
        return NextResponse.json({ error: 'Invalid permission ID format' }, { status: 400 });
    }

    const permission = await prisma.permission.findUnique({
      where: { id: permissionId },
      include: { rolePermissions: true } // Check if permission is in use by roles
    });

    if (!permission) {
      return NextResponse.json({ error: 'Permission not found' }, { status: 404 });
    }

    // Check if the permission is currently assigned to any roles
    if (permission.rolePermissions && permission.rolePermissions.length > 0) {
      await AuthorizationUtils.logAuditEvent({
        userId: authContext.user_id,
        action: 'permission_delete_failed_in_use',
        resource: `permission:${permissionId}`,
        success: false,
        errorMessage: 'Permission is currently assigned to one or more roles and cannot be deleted.',
        metadata: { identifier: permission.identifier, roles_count: permission.rolePermissions.length },
        ipAddress: request.ip || request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return NextResponse.json({ error: 'Permission is in use by roles. Remove from roles first.' }, { status: 400 });
    }

    // Also check UserPermission if direct user-permission assignments are significant
    const directUserAssignments = await prisma.userPermission.count({
        where: { permissionId: permissionId }
    });
    if (directUserAssignments > 0) {
        // Handle as above: log and return error
        return NextResponse.json({ error: `Permission is directly assigned to ${directUserAssignments} user(s). Remove direct assignments first.` }, { status: 400 });
    }


    await prisma.permission.delete({
      where: { id: permissionId },
    });

    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'permission_deleted',
      resource: `permission:${permissionId}`, // ID is correct as object is gone
      success: true,
      metadata: { deletedPermissionIdentifier: permission.identifier },
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ message: 'Permission deleted successfully' }, { status: 200 }); // Or 204

  } catch (error) {
    console.error(`Error deleting permission ${params.permissionId}:`, error);
    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'permission_delete_failed_exception',
      resource: `permission:${params.permissionId}`,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to delete permission' }, { status: 500 });
  }
}

// Apply auth middleware
export const GET = withAuth(getPermission, { requiredPermissions: ['system:permission:manage'] });
export const PUT = withAuth(updatePermission, { requiredPermissions: ['system:permission:manage'] });
export const DELETE = withAuth(deletePermission, { requiredPermissions: ['system:permission:manage'] });
