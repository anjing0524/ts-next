// 文件路径: app/api/v2/users/[userId]/roles/route.ts
// 描述: 管理特定用户的角色分配 (List roles for a user, Assign roles to a user)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client'; // User, UserRole types not directly used in handlers after refactor
// import { JWTUtils } from '@/lib/auth/oauth2'; // REMOVED
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入 requirePermission

// --- 辅助函数 (Copied/adapted from other user management routes) ---
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'request_failed', message }, { status });
}

// isUserAdmin function is no longer needed.

interface RouteContextGetPost {
  params: {
    userId: string; // 目标用户的ID (ID of the target user)
  };
}

// --- GET /api/v2/users/{userId}/roles (获取用户拥有的角色列表) ---
async function listUserRolesHandler(req: AuthenticatedRequest, context: RouteContextGetPost) {
  const { params } = context;
  const targetUserId = params.userId;
  const performingAdmin = req.user;
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) listing roles for user ${targetUserId}.`);

  try {
    // 1. 检查目标用户是否存在 (Check if target user exists) - Was step 2
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return errorResponse('User not found.', 404, 'user_not_found');

    // 2. 获取用户的角色 (Fetch user's roles) - Was step 3
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId: targetUserId,
        role: { isActive: true }, // 只获取与激活角色关联的分配 (Only fetch assignments linked to active roles)
        // 可根据 UserRole 自身的 'expiresAt' 或其他状态字段进行过滤 (Can filter by UserRole's own 'expiresAt' or other status fields)
        // e.g. AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }]
      },
      include: {
        role: true, // 包含完整的角色信息 (Include full role information)
      },
      orderBy: { role: { name: 'asc' } } // 按角色名称排序 (Order by role name)
    });

    // 格式化响应 (Format response)
    const rolesToReturn = userRoles
      .map(ur => ur.role) // 直接取 role 对象 (Directly take the role object)
      .filter(role => role != null) // 确保 role 对象存在 (Ensure role object exists)
      .map(role => ({ // 显式选择要返回的字段 (Explicitly select fields to return)
        id: role.id,
        name: role.name,
        displayName: role.displayName,
        description: role.description,
        isActive: role.isActive, // 也返回角色是否激活的状态 (Also return role's active status)
        // assignedAt: ur.assignedAt, // 如果需要分配时的特定信息 (If specific info from assignment time is needed)
      }));

    return NextResponse.json({ roles: rolesToReturn }, { status: 200 });

  } catch (error) {
    console.error(`Error fetching roles for user ${targetUserId} by admin ${performingAdmin?.id}:`, error);
    return errorResponse('An unexpected error occurred while fetching user roles.', 500, 'server_error');
  }
}
export const GET = requirePermission('users:roles:read', listUserRolesHandler);


// --- POST /api/v2/users/{userId}/roles (为用户分配一个或多个角色) ---
async function assignRolesToUserHandler(req: AuthenticatedRequest, context: RouteContextGetPost) {
  const { params } = context;
  const targetUserId = params.userId;
  const performingAdmin = req.user;
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) assigning roles to user ${targetUserId}.`);

  // 1. 解析请求体 (Parse request body) - Was step 2
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (e) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  const { roleIds } = requestBody; // 期望是一个角色ID的数组: { "roleIds": ["id1", "id2"] } (Expect an array of role IDs)
  if (!roleIds || !Array.isArray(roleIds) || roleIds.length === 0 || !roleIds.every(id => typeof id === 'string')) {
    return errorResponse('Invalid request: "roleIds" must be a non-empty array of strings.', 400, 'validation_error_roleIds');
  }

  try {
    // 2. 检查目标用户是否存在 (Check if target user exists) - Was step 3
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return errorResponse('User not found, cannot assign roles.', 404, 'user_not_found');

    // 3. 处理角色分配 (Process role assignments) - Was step 4
    const successfullyAssignedRoles: Partial<Role>[] = [];
    const assignmentErrors: { roleId: string, message: string }[] = [];

    // 获取用户已有的角色ID，用于幂等性检查 (Get user's existing role IDs for idempotency check)
    const existingUserRoles = await prisma.userRole.findMany({
        where: { userId: targetUserId },
        select: { roleId: true }
    });
    const existingRoleIdsSet = new Set(existingUserRoles.map(ur => ur.roleId));

    for (const roleId of roleIds) {
      // 检查角色是否存在且激活 (Check if role exists and is active)
      const roleToAssign = await prisma.role.findUnique({
        where: { id: roleId, isActive: true },
      });

      if (!roleToAssign) {
        assignmentErrors.push({ roleId, message: 'Role not found or is not active.' });
        continue;
      }

      // 检查用户是否已被分配此角色 (Check if user already has this role)
      if (existingRoleIdsSet.has(roleId)) {
        console.log(`User ${targetUserId} already has role ${roleId} (${roleToAssign.name}). Skipping assignment, considering as success.`);
        successfullyAssignedRoles.push({ id: roleToAssign.id, name: roleToAssign.name, displayName: roleToAssign.displayName });
        continue;
      }

      // 创建 UserRole 记录 (Create UserRole record)
      await prisma.userRole.create({
        data: {
          userId: targetUserId,
          roleId: roleId,
          assignedBy: performingAdmin?.id, // 可选：记录操作的管理员 (Optional: record the admin performing action)
          // context, expiresAt can also be set here if applicable
        },
      });
      successfullyAssignedRoles.push({ id: roleToAssign.id, name: roleToAssign.name, displayName: roleToAssign.displayName });
    }

    // 4. 返回响应 (Return response) - Was step 5
    if (assignmentErrors.length > 0) {
      const status = successfullyAssignedRoles.length > 0 ? 207 : 400; // 207 Multi-Status if partial success, 400 if all failed
      return NextResponse.json({
        message: status === 207 ? 'Some roles assigned with errors.' : 'Failed to assign roles.',
        assignedRoles: successfullyAssignedRoles,
        errors: assignmentErrors
      }, { status });
    }

    return NextResponse.json({
        message: 'Roles assigned successfully.',
        assignedRoles: successfullyAssignedRoles
    }, { status: 200 }); // Or 201 if treating as new resource creation (UserRole records)

  } catch (error: any) {
    // 处理 Prisma 已知错误，例如外键约束 (Handle Prisma known errors, e.g., foreign key constraint)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') { // Foreign key constraint failed (e.g., roleId doesn't exist on roles table)
             return errorResponse('Role assignment failed: One or more role IDs are invalid.', 400, 'validation_error_fk');
        }
    }
    console.error(`Error assigning roles to user ${targetUserId} by admin ${performingAdmin?.id}:`, error);
    return errorResponse('An unexpected error occurred while assigning roles.', 500, 'server_error');
  }
}
export const POST = requirePermission('users:roles:assign', assignRolesToUserHandler);

// Declaration for JWTUtils is no longer needed.
