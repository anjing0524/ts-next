// 文件路径: app/api/v2/users/[userId]/roles/[roleId]/route.ts
// 描述: 从用户移除特定角色 (Remove a specific role from a user)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
// User, Role, UserRole types are not strictly needed here as we primarily use IDs
// import { User, Role, UserRole, Prisma } from '@prisma/client';
// import { JWTUtils } from '@/lib/auth/oauth2'; // REMOVED
import { requirePermission } from '@/lib/auth/middleware'; // 引入 requirePermission


// --- 辅助函数 (Copied/adapted from other user management routes) ---
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'request_failed', message }, { status });
}

// isUserAdmin function is no longer needed.

interface RouteContextDelete {
  params: {
    userId: string; // 目标用户的ID (ID of the target user)
    roleId: string; // 要移除的角色的ID (ID of the role to remove)
  };
}

// --- DELETE /api/v2/users/{userId}/roles/{roleId} (从用户移除角色) ---
async function removeRoleFromUserHandler(req: NextRequest, context: RouteContextDelete) {
  const { params } = context;
  const targetUserId = params.userId;
  const roleIdToRemove = params.roleId;
  const performingAdmin = req.user;
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) removing role ${roleIdToRemove} from user ${targetUserId}.`);

  // 1. 验证路径参数 (Validate path parameters) - Was step 2
  if (!targetUserId || !roleIdToRemove) {
    // Should be caught by Next.js routing if params are missing, but good practice
    return errorResponse('User ID and Role ID are required in the path.', 400, 'invalid_path_params');
  }

  try {
    // 3. 检查目标用户是否存在 (Check if target user exists - optional, deleteMany is idempotent on userId)
    // const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    // if (!targetUser) return errorResponse('User not found.', 404, 'user_not_found');

    // 4. 执行删除操作 (Perform delete operation)
    // 删除特定的 UserRole 记录 (Delete the specific UserRole record)
    const deleteResult = await prisma.userRole.deleteMany({
      where: {
        userId: targetUserId,
        roleId: roleIdToRemove,
      },
    });

    // 5. 检查是否有记录被删除 (Check if any record was deleted)
    if (deleteResult.count === 0) {
      // 如果 count 为 0，表示用户没有被分配该角色，或者用户/角色不存在
      // (If count is 0, user was not assigned this role, or user/role doesn't exist)
      // 检查用户和角色是否真的存在以提供更准确的404
      // (Check if user and role actually exist for a more accurate 404)
      const userExists = await prisma.user.count({ where: { id: targetUserId }});
      if (userExists === 0) return errorResponse('User not found.', 404, 'user_not_found');
      const roleExists = await prisma.role.count({ where: { id: roleIdToRemove }});
      if (roleExists === 0) return errorResponse('Role not found.', 404, 'role_not_found');
    // If both exist, then the assignment itself was not found.
    return errorResponse('User is not assigned this role.', 404, 'assignment_not_found');
    }

  // 5. 返回成功响应 (Return success response) - Was step 6
    return new NextResponse(null, { status: 204 }); // 204 No Content

  } catch (error: any) {
  console.error(`Error removing role ${roleIdToRemove} from user ${targetUserId} by admin ${performingAdmin?.id}:`, error);
    return errorResponse('An unexpected error occurred while removing the role assignment.', 500, 'server_error');
  }
}
export const DELETE = requirePermission('users:roles:remove', removeRoleFromUserHandler);

// Declaration for JWTUtils is no longer needed.
