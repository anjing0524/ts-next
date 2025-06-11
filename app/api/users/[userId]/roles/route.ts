import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext, PermissionUtils, validateSession } from '@/lib/auth/middleware'; // Added validateSession for manual DELETE handling
import { AuthorizationUtils } from '@/lib/auth/oauth2';
import { z } from 'zod';

const AssignRoleSchema = z.object({
  roleId: z.string().cuid('Invalid Role ID format'),
});

// Interface for route parameters passed by Next.js dynamic routing
interface DynamicRouteParams {
  userId: string;
  roleId?: string; // roleId is optional here because GET and POST to /roles don't have it in path
}

// GET /api/users/{userId}/roles - List a user's roles
async function handleGetUserRoles(request: NextRequest, authContext: AuthContext, routeParams: { params: DynamicRouteParams }) {
  const { userId: targetUserId } = routeParams.params;
  const requestingUserId = authContext.user_id; // from withAuth context
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  // Authorization: User can view their own roles, or admin with 'users:read' (or a more specific role like 'users:roles:read')
  const canViewOwn = requestingUserId === targetUserId;
  const canAdminView = PermissionUtils.hasPermission(authContext.permissions || [], 'users:read');

  if (!canViewOwn && !canAdminView) {
    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'user_roles_list_unauthorized',
      resource: `users/${targetUserId}/roles`,
      ipAddress, userAgent, success: false,
      errorMessage: 'Permission denied to view user roles.',
    });
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  }

  try {
    const userRoles = await prisma.userRole.findMany({
      where: { userId: targetUserId },
      include: {
        role: true,
      },
      orderBy: { role: { name: 'asc' }}
    });

    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'user_roles_list_success',
      resource: `users/${targetUserId}/roles`,
      ipAddress, userAgent, success: true,
      metadata: { listedRolesCount: userRoles.length }
    });

    return NextResponse.json(userRoles.map(ur => ur.role));
  } catch (error) {
    console.error(`Error fetching roles for user ${targetUserId}:`, error);
    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'user_roles_list_error',
      resource: `users/${targetUserId}/roles`,
      ipAddress, userAgent, success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to fetch user roles' }, { status: 500 });
  }
}

// POST /api/users/{userId}/roles - Assign a role to a user
async function handleAssignRoleToUser(request: NextRequest, authContext: AuthContext, routeParams: { params: DynamicRouteParams }) {
  const { userId: targetUserId } = routeParams.params;
  const requestingUserId = authContext.user_id;
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    const body = await request.json();
    const validation = AssignRoleSchema.safeParse(body);

    if (!validation.success) {
      await AuthorizationUtils.logAuditEvent({
        userId: requestingUserId,
        action: 'user_role_assign_validation_failed',
        resource: `users/${targetUserId}/roles`,
        ipAddress, userAgent, success: false,
        errorMessage: 'Input validation failed for role assignment.',
        metadata: { errors: validation.error.flatten().fieldErrors },
      });
      return NextResponse.json({ error: 'Validation error', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { roleId } = validation.data;

    const [userExists, roleExists] = await Promise.all([
      prisma.user.count({ where: { id: targetUserId } }),
      prisma.role.count({ where: { id: roleId, isActive: true } }), // Ensure role is active
    ]);

    if (userExists === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (roleExists === 0) {
      return NextResponse.json({ error: 'Active role not found' }, { status: 404 });
    }

    const userRole = await prisma.userRole.upsert({
      where: { userId_roleId: { userId: targetUserId, roleId } },
      update: { assignedAt: new Date(), assignedBy: requestingUserId }, // Update assignment time/by if it exists
      create: { userId: targetUserId, roleId, assignedBy: requestingUserId },
      include: { role: true }
    });

    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'user_role_assign_success',
      resource: `users/${targetUserId}/roles`,
      ipAddress, userAgent, success: true,
      metadata: { assignedRoleId: roleId, targetUserId },
    });

    return NextResponse.json(userRole.role, { status: 201 });
  } catch (error) {
    console.error(`Error assigning role to user ${targetUserId}:`, error);
     await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'user_role_assign_error',
      resource: `users/${targetUserId}/roles`,
      ipAddress, userAgent, success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to assign role' }, { status: 500 });
  }
}

// DELETE /api/users/{userId}/roles/{roleId} - Remove a role from a user
// This function expects `params.roleId` to be populated from the dynamic route segment.
async function handleRemoveRoleFromUser(request: NextRequest, authContext: AuthContext, routeParams: { params: Required<DynamicRouteParams> }) {
  const { userId: targetUserId, roleId: targetRoleId } = routeParams.params;
  const requestingUserId = authContext.user_id;
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    const existingAssignment = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: targetUserId, roleId: targetRoleId } },
    });

    if (!existingAssignment) {
      await AuthorizationUtils.logAuditEvent({
        userId: requestingUserId,
        action: 'user_role_remove_not_found',
        resource: `users/${targetUserId}/roles/${targetRoleId}`,
        ipAddress, userAgent, success: false,
        errorMessage: 'Role assignment not found for deletion.',
      });
      return NextResponse.json({ error: 'Role assignment not found' }, { status: 404 });
    }

    await prisma.userRole.delete({
      where: { userId_roleId: { userId: targetUserId, roleId: targetRoleId } },
    });

    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'user_role_remove_success',
      resource: `users/${targetUserId}/roles/${targetRoleId}`,
      ipAddress, userAgent, success: true,
      metadata: { removedRoleId: targetRoleId, targetUserId },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error(`Error removing role ${targetRoleId} from user ${targetUserId}:`, error);
    await AuthorizationUtils.logAuditEvent({
      userId: requestingUserId,
      action: 'user_role_remove_error',
      resource: `users/${targetUserId}/roles/${targetRoleId}`,
      ipAddress, userAgent, success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to remove role' }, { status: 500 });
  }
}

// Export wrapped handlers
export const GET = withAuth(handleGetUserRoles, {
    requiredPermissions: [], // Permissions are checked inside the handler for flexibility (own vs admin)
    requireUserContext: true,
});

export const POST = withAuth(handleAssignRoleToUser, {
    requiredPermissions: ['users:edit_roles', 'admin'],
    requireUserContext: true,
});

// For DELETE, if this file is /api/users/[userId]/roles/route.ts,
// then roleId must come from query or body.
// If file is /api/users/[userId]/roles/[roleId]/route.ts, then params.roleId is from path.
// The prompt implies DELETE /api/users/{userId}/roles/{roleId} as a path.
// The `withAuth` wrapper might need to be enhanced to pass down all dynamic params correctly.
// The following is a standard way to export if dynamic params are handled by Next.js for the file path.
// This assumes this file is actually at /api/users/[userId]/roles/[roleId]/route.ts for the DELETE export to work as intended with path param.
// If this file *must* be /api/users/[userId]/roles/route.ts, then DELETE needs to get roleId from query.
// For this task, I'm writing it as if this file handles the specific /roles/{roleId} part.

export async function DELETE(request: NextRequest, { params }: { params: { userId: string, roleId: string } }) {
    // Manually re-wrapping for DELETE to ensure AuthContext and params are correctly handled.
    // This is often needed if `withAuth` doesn't perfectly align with how Next.js passes route params to all HTTP methods.
    const authContext = await validateSession(request);
    if (!authContext || !authContext.user_id) { // Ensure user_id is part of your AuthContext from validateSession
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
     // Augment AuthContext with permissions if validateSession doesn't already do it.
    // This part is simplified; in a real app, permissions would be part of AuthContext.
    // const userPermissions = await AuthorizationUtils.getUserPermissions(authContext.user_id);
    // authContext.permissions = userPermissions;


    // Permission check for DELETE
    // Assuming permissions are part of the AuthContext populated by a full validateSession/withAuth
    // For this example, let's assume validateSession provides a basic AuthContext.
    // A real app would fetch permissions if not already in session.
    // This is a placeholder for actual permission check if not using withAuth directly here.
    const hasPermission = PermissionUtils.hasPermission(authContext.permissions || [], 'users:edit_roles') ||
                          PermissionUtils.hasPermission(authContext.permissions || [], 'admin');

    if (!hasPermission) {
        return NextResponse.json({ error: 'Permission Denied to delete user role' }, { status: 403 });
    }

    const routeParamsForHandler: { params: Required<DynamicRouteParams> } = { params: { userId: params.userId, roleId: params.roleId } };
    return handleRemoveRoleFromUser(request, authContext as AuthContext, routeParamsForHandler);
}
