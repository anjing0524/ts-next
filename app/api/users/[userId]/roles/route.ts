import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';

interface UserRoleRouteParams {
  params: {
    userId: string;
  };
}

// Schema for assigning/removing roles to/from a user
const ModifyUserRolesSchema = z.object({
  roleIds: z.array(z.string().uuid('Each role ID must be a valid UUID')).min(1, 'At least one role ID is required'),
  expiresAt: z.string().datetime({ message: "Invalid datetime string for expiresAt. Must be ISO8601." }).optional(),
});

// GET /api/users/{userId}/roles - List roles assigned to a user
async function getUserRoles(request: NextRequest, { params }: UserRoleRouteParams, authContext: AuthContext) {
  try {
    const userId = params.userId;
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(userId)) {
        return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        // isActive: true, // Optionally filter only active role assignments
      },
      include: { role: true }, // Include the actual role details
      orderBy: { role: { name: 'asc' } },
    });

    // Return role details along with assignment info like expiresAt, isActive
    return NextResponse.json(userRoles.map(ur => ({
        id: ur.role.id,
        name: ur.role.name,
        displayName: ur.role.displayName,
        description: ur.role.description,
        isSystem: ur.role.isSystem,
        assignedAt: ur.assignedAt,
        expiresAt: ur.expiresAt,
        isActiveAssignment: ur.isActive, // Renamed to avoid conflict with role.isActive
    })), { status: 200 });

  } catch (error) {
    console.error(`Error fetching roles for user ${params.userId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch user roles' }, { status: 500 });
  }
}

// POST /api/users/{userId}/roles - Assign roles to a user
async function assignRolesToUser(request: NextRequest, { params }: UserRoleRouteParams, authContext: AuthContext) {
  try {
    const userId = params.userId;
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(userId)) {
        return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }

    const body = await request.json();
    const validationResult = ModifyUserRolesSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: validationResult.error.flatten() }, { status: 400 });
    }

    const { roleIds, expiresAt } = validationResult.data;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds }, isActive: true }, // Ensure roles are active
    });
    if (roles.length !== roleIds.length) {
      const foundIds = roles.map(r => r.id);
      const notFoundOrInactiveIds = roleIds.filter(id => !foundIds.includes(id));
      return NextResponse.json({ error: `Roles not found or inactive: ${notFoundOrInactiveIds.join(', ')}` }, { status: 400 });
    }

    const createdEntries = await prisma.$transaction(
      roleIds.map(roleId =>
        prisma.userRole.upsert({
          where: { userId_roleId: { userId, roleId } },
          update: {
            isActive: true, // Re-activating if it was inactive
            assignedBy: authContext.user_id,
            assignedAt: new Date(),
            expiresAt: expiresAt ? new Date(expiresAt) : null,
          },
          create: {
            userId,
            roleId,
            assignedBy: authContext.user_id,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
          },
        })
      )
    );

    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id, // The admin performing the action
      action: 'user_roles_assigned',
      resource: `user:${userId}`,
      success: true,
      metadata: { targetUserId: userId, assignedRoleIds: roleIds, count: createdEntries.length, expiresAt },
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ message: `${createdEntries.length} roles assigned successfully.` }, { status: 200 });

  } catch (error) {
    console.error(`Error assigning roles to user ${params.userId}:`, error);
    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'user_roles_assign_failed',
      resource: `user:${params.userId}`,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to assign roles' }, { status: 500 });
  }
}

// DELETE /api/users/{userId}/roles - Remove roles from a user
async function removeRolesFromUser(request: NextRequest, { params }: UserRoleRouteParams, authContext: AuthContext) {
  try {
    const userId = params.userId;
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(userId)) {
        return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }

    const body = await request.json(); // Expects { roleIds: [...] }
    // We only need roleIds for deletion, expiresAt is not relevant.
    const RoleIdsSchema = z.object({
        roleIds: z.array(z.string().uuid()).min(1),
    });
    const validationResult = RoleIdsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: validationResult.error.flatten() }, { status: 400 });
    }

    const { roleIds } = validationResult.data;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const deleteResult = await prisma.userRole.deleteMany({
      where: {
        userId: userId,
        roleId: { in: roleIds },
      },
    });

    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id, // The admin performing the action
      action: 'user_roles_removed',
      resource: `user:${userId}`,
      success: true,
      metadata: { targetUserId: userId, removedRoleIds: roleIds, count: deleteResult.count },
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ message: `${deleteResult.count} roles removed successfully.` }, { status: 200 });

  } catch (error) {
    console.error(`Error removing roles from user ${params.userId}:`, error);
    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'user_roles_remove_failed',
      resource: `user:${params.userId}`,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to remove roles' }, { status: 500 });
  }
}

// Apply auth middleware. Users need 'system:user:manage' or a more specific 'system:user:assignroles' permission.
// For now, using 'system:role:manage' as it implies high-level role manipulation capabilities.
// A more fitting permission would be 'system:user:manage' or 'system:user:assign_roles'.
// Let's assume 'system:role:manage' is sufficient for now.
const requiredPermission = 'system:role:manage';

export const GET = withAuth(getUserRoles, { requiredPermissions: [requiredPermission] });
export const POST = withAuth(assignRolesToUser, { requiredPermissions: [requiredPermission] });
export const DELETE = withAuth(removeRolesFromUser, { requiredPermissions: [requiredPermission] });
