// 文件路径: app/api/v2/users/[userId]/permissions/route.ts
// 描述: 获取特定用户的有效权限列表 (Get effective permissions for a specific user)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Permission } from '@prisma/client'; // User, Role, UserRole, RolePermission, Prisma types not directly used in handler after refactor
// import { JWTUtils } from '@/lib/auth/oauth2'; // REMOVED
import { requirePermission } from '@/lib/auth/middleware'; // 引入 requirePermission

// --- 辅助函数 (Copied/adapted from other user management routes) ---
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'request_failed', message }, { status });
}

// isUserAdmin function is no longer needed.

interface RouteContext {
  params: {
    userId: string; // 目标用户的ID (ID of the target user)
  };
}

// 定义将从权限对象中选择的字段类型 (Define the type for fields selected from Permission object)
type EffectivePermission = Pick<Permission, 'id' | 'name' | 'displayName' | 'description' | 'resource' | 'action' | 'type'>;

/**
 * 获取用户的所有有效权限对象 (Gets all effective permission objects for a user)
 * @param targetUserId 用户ID (User ID)
 * @returns Promise<EffectivePermission[]> 用户拥有的所有有效权限对象数组 (Promise<EffectivePermission[]> an array of all effective permission objects the user has)
 */
async function getUserEffectivePermissions(targetUserId: string): Promise<EffectivePermission[]> {
  if (!targetUserId) {
    return [];
  }

  const userRoles = await prisma.userRole.findMany({
    where: {
      userId: targetUserId,
      role: { isActive: true } // 只考虑用户分配到的、且本身是激活的角色 (Only consider user's assigned roles that are themselves active)
      // 可选: 检查 UserRole 的 expiresAt 字段 (Optional: check UserRole's expiresAt field)
      // AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }]
    },
    include: {
      role: {
        include: {
          rolePermissions: {
            where: {
              permission: { isActive: true } // 只获取角色关联到的、且本身是激活的权限 (Only fetch role's permissions that are themselves active)
            },
            include: {
              permission: true, // 包含完整的权限对象 (Include the full permission object)
            },
          },
        },
      },
    },
  });

  const permissionsMap = new Map<string, EffectivePermission>(); // 使用Map确保权限唯一性 (Use Map to ensure permission uniqueness by ID)

  for (const userRole of userRoles) {
    if (userRole.role?.rolePermissions) {
      for (const rolePermission of userRole.role.rolePermissions) {
        if (rolePermission.permission) {
          const perm = rolePermission.permission;
          if (!permissionsMap.has(perm.id)) { // 按ID确保唯一性 (Ensure uniqueness by ID)
            permissionsMap.set(perm.id, {
              id: perm.id,
              name: perm.name,
              displayName: perm.displayName,
              description: perm.description,
              resource: perm.resource,
              action: perm.action,
              type: perm.type,
            });
          }
        }
      }
    }
  }
  return Array.from(permissionsMap.values());
}


// --- GET /api/v2/users/{userId}/permissions (获取用户的有效权限列表) ---
async function listUserPermissionsHandler(req: NextRequest, context: RouteContext) {
  const { params } = context;
  const targetUserId = params.userId;
  const performingAdmin = req.user;
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) listing permissions for user ${targetUserId}.`);

  try {
    // 1. 检查目标用户是否存在 (Check if target user exists) - Was step 2
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return errorResponse('User not found.', 404, 'user_not_found');

    // (可选) 检查目标用户是否激活 - Was optional comment
    // if (!targetUser.isActive) return errorResponse('Target user account is inactive.', 403, 'target_user_inactive');

    // 2. 获取用户的有效权限 (Fetch user's effective permissions) - Was step 3
    const effectivePermissions = await getUserEffectivePermissions(targetUserId);

    // 3. 返回响应 (Return response) - Was step 4
    return NextResponse.json({
      permissions: effectivePermissions,
      count: effectivePermissions.length
    }, { status: 200 });

  } catch (error) {
    console.error(`Error fetching permissions for user ${targetUserId} by admin ${performingAdmin?.id}:`, error);
    return errorResponse('An unexpected error occurred while fetching user permissions.', 500, 'server_error');
  }
}
export const GET = requirePermission('users:permissions:read', listUserPermissionsHandler);

// Declaration for JWTUtils is no longer needed.
