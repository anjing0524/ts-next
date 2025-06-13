// 文件路径: app/api/v2/users/[userId]/permissions/route.ts
// 描述: 获取特定用户的有效权限列表 (Get effective permissions for a specific user)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User, Role, Permission, UserRole, RolePermission, Prisma } from '@prisma/client';
import { JWTUtils } from '@/lib/auth/oauth2';

// --- 辅助函数 (Copied/adapted from other user management routes) ---
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'request_failed', message }, { status });
}

async function isUserAdmin(userId: string): Promise<boolean> {
  // TODO: Implement real RBAC check.
  const userWithRoles = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } }
  });
  return userWithRoles?.userRoles.some(ur => ur.role.name === 'admin') || false;
}

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
export async function GET(req: NextRequest, context: RouteContext) {
  const { params } = context;
  const targetUserId = params.userId;

  // 1. 管理员认证 (Admin Authentication)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return errorResponse('Unauthorized: Missing Authorization header.', 401, 'unauthorized');
  const token = authHeader.substring(7);
  if (!token) return errorResponse('Unauthorized: Missing token.', 401, 'unauthorized');

  const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);
  if (!valid || !payload) return errorResponse(`Unauthorized: Invalid token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
  const adminUserId = payload.userId as string | undefined;
  if (!adminUserId) return errorResponse('Unauthorized: Invalid token payload (Admin ID missing).', 401, 'invalid_token_payload');
  if (!(await isUserAdmin(adminUserId))) return errorResponse('Forbidden: Not an admin.', 403, 'forbidden');

  try {
    // 2. 检查目标用户是否存在 (Check if target user exists)
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return errorResponse('User not found.', 404, 'user_not_found');

    // (可选) 如果需要，检查目标用户是否激活。通常获取非激活用户的权限列表也是有意义的。
    // (Optional) Check if target user is active if required. Usually, getting permissions for inactive users can also be meaningful.
    // if (!targetUser.isActive) return errorResponse('Target user account is inactive.', 403, 'target_user_inactive');


    // 3. 获取用户的有效权限 (Fetch user's effective permissions)
    const effectivePermissions = await getUserEffectivePermissions(targetUserId);

    // 4. 返回响应 (Return response)
    return NextResponse.json({
      permissions: effectivePermissions,
      count: effectivePermissions.length
    }, { status: 200 });

  } catch (error) {
    console.error(`Error fetching permissions for user ${targetUserId} by admin ${adminUserId}:`, error);
    return errorResponse('An unexpected error occurred while fetching user permissions.', 500, 'server_error');
  }
}

// 声明JWTUtils中期望的方法 (Declare expected methods in JWTUtils)
/*
declare module '@/lib/auth/oauth2' {
  export class JWTUtils {
    static async verifyV2AuthAccessToken(token: string): Promise<{
      valid: boolean;
      payload?: { userId: string; [key: string]: any };
      error?: string;
    }>;
  }
}
*/
