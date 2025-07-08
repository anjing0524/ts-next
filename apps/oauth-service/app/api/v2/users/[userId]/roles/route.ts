// apps/oauth-service/app/api/v2/users/[userId]/roles/route.ts

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@repo/database';
import { errorResponse, successResponse } from '@repo/lib';
import { AuthorizationUtils } from '@repo/lib/auth';

const updateUserRolesSchema = z.object({
  roleIds: z.array(z.string().cuid()).min(1, 'At least one role ID must be provided.'),
});

async function updateUserRoles(
  request: NextRequest,
  params: { userId: string }
) {
  const actorId = request.headers.get('X-User-Id');
  if (!actorId) {
    return errorResponse({ message: 'Unauthorized: Missing user identifier.', statusCode: 401 });
  }

  const { userId } = params;

  try {
    const body = await request.json();
    const validation = updateUserRolesSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse({ message: 'Invalid request body.', statusCode: 400, details: validation.error.flatten() });
    }
    const { roleIds } = validation.data;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return errorResponse({ message: 'User not found.', statusCode: 404 });
    }

    const roles = await prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) {
      return errorResponse({ message: 'One or more roles not found.', statusCode: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({
          userId,
          roleId,
          assignedBy: actorId,
        })),
      });
    });

    await AuthorizationUtils.logAuditEvent({
      userId: actorId,
      action: 'USER_ROLES_UPDATED',
      success: true,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { targetUserId: userId, assignedRoleIds: roleIds },
    });

    const updatedRoles = await prisma.role.findMany({
      where: { userRoles: { some: { userId } } },
    });

    return successResponse(updatedRoles, 200);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    await AuthorizationUtils.logAuditEvent({
      userId: actorId,
      action: 'USER_ROLES_UPDATED',
      success: false,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      errorMessage,
      metadata: { targetUserId: userId },
    });
    return errorResponse({ message: 'Internal server error.', statusCode: 500 });
  }
}

/**
 * PUT /api/v2/users/{userId}/roles
 * Replaces all roles for a user.
 * Authorization is handled by middleware.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const routeParams = await params;
  return await updateUserRoles(request, routeParams);
}

