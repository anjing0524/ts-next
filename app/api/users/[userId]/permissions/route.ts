import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';
// Assuming a Redis client setup, e.g., import { redis } from '@/lib/redis';
// For now, we'll simulate cache logic and focus on permission calculation.

interface UserPermissionsRouteParams {
  params: {
    userId: string;
  };
}

// Helper function to get all parent roles for a given roleId
async function getRoleHierarchy(roleId: string, allRolesMap: Map<string, { id: string; parentId: string | null }>): Promise<string[]> {
  const hierarchy = new Set<string>();
  let currentRoleId: string | null = roleId;
  while (currentRoleId && !hierarchy.has(currentRoleId)) {
    hierarchy.add(currentRoleId);
    const role = allRolesMap.get(currentRoleId);
    currentRoleId = role?.parentId || null;
  }
  return Array.from(hierarchy);
}


// GET /api/users/{userId}/permissions - List all effective permissions for a user
async function getUserEffectivePermissions(request: NextRequest, { params }: UserPermissionsRouteParams, authContext: AuthContext) {
  try {
    const userId = params.userId;
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(userId)) {
        return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // --- Placeholder for Cache Read ---
    // const cacheKey = `user_permissions:${userId}`;
    // const cachedPermissions = await redis.get(cacheKey);
    // if (cachedPermissions) {
    //   return NextResponse.json(JSON.parse(cachedPermissions), { status: 200 });
    // }
    // --- End Placeholder ---

    const effectivePermissions = new Map<string, { identifier: string; name: string; description: string | null; source: string; sourceDetail: string }>();

    // 1. Get directly assigned active permissions
    const directUserPermissions = await prisma.userPermission.findMany({
      where: {
        userId: userId,
        isActive: true,
        permission: { isActive: true },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: { permission: true },
    });

    directUserPermissions.forEach(up => {
      if (up.permission) {
        effectivePermissions.set(up.permission.identifier, {
            identifier: up.permission.identifier,
            name: up.permission.name,
            description: up.permission.description,
            source: 'direct',
            sourceDetail: 'Directly Assigned'
        });
      }
    });

    // 2. Get permissions from active roles, considering hierarchy
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId: userId,
        isActive: true,
        role: { isActive: true },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: { role: true },
    });

    if (userRoles.length > 0) {
      // Fetch all active roles once to build hierarchy map efficiently
      const allActiveRoles = await prisma.role.findMany({ where: { isActive: true }, select: { id: true, parentId: true, name: true } });
      const allRolesMap = new Map(allActiveRoles.map(r => [r.id, r]));

      const allRelevantRoleIds = new Set<string>();
      for (const ur of userRoles) {
        if (ur.role) {
          const roleHierarchyIds = await getRoleHierarchy(ur.role.id, allRolesMap);
          roleHierarchyIds.forEach(id => allRelevantRoleIds.add(id));
        }
      }

      if (allRelevantRoleIds.size > 0) {
        const rolePermissions = await prisma.rolePermission.findMany({
          where: {
            roleId: { in: Array.from(allRelevantRoleIds) },
            permission: { isActive: true },
          },
          include: { permission: true, role: { select: { name: true, displayName: true } } },
        });

        rolePermissions.forEach(rp => {
          if (rp.permission && !effectivePermissions.has(rp.permission.identifier)) { // Add only if not already present from direct assignment or higher precedence
            effectivePermissions.set(rp.permission.identifier, {
                identifier: rp.permission.identifier,
                name: rp.permission.name,
                description: rp.permission.description,
                source: 'role',
                sourceDetail: `${rp.role.displayName} (${rp.role.name})`
            });
          }
        });
      }
    }

    const permissionsArray = Array.from(effectivePermissions.values());

    // --- Placeholder for Cache Write ---
    // await redis.set(cacheKey, JSON.stringify(permissionsArray), { EX: 15 * 60 }); // 15 minutes
    // --- End Placeholder ---

    // Log audit event for permission query if needed, e.g., for sensitive users or frequent checks.
    // For now, this is treated as a normal data read.
    // Consider if authContext.user_id (current admin) is different from params.userId (target user)
    // to log who is querying whose permissions.

    return NextResponse.json({
        userId: userId,
        permissions: permissionsArray,
        retrievedAt: new Date().toISOString(),
        // cached: false // Add cache status if implementing cache
    }, { status: 200 });

  } catch (error) {
    console.error(`Error fetching effective permissions for user ${params.userId}:`, error);
    // Add audit log for failure if necessary
    return NextResponse.json({ error: 'Failed to fetch effective permissions' }, { status: 500 });
  }
}

// Permission for this endpoint:
// Could be 'system:user:read_permissions' or part of 'system:user:manage' or even 'system:role:manage'
// For now, let's use 'system:role:manage' as it's already used for role-related APIs.
// A more specific permission like 'system:user:read_effective_permissions' would be better.
export const GET = withAuth(getUserEffectivePermissions, { requiredPermissions: ['system:role:manage'] });
