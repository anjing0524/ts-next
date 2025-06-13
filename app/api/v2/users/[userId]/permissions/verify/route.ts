// 文件路径: app/api/v2/users/[userId]/permissions/verify/route.ts
// 描述: 管理员验证特定用户是否拥有某些权限 (Admin verifies if a specific user possesses certain permissions)

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma client
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // Middleware for auth
import { PermissionService } from '@/lib/services/permissionService'; // Actual PermissionService

const permissionServiceInstance = new PermissionService();

// 辅助函数：错误响应 (Helper function: Error response)
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'request_failed', message }, { status });
}

interface RouteContext {
  params: {
    userId: string; // 目标用户的ID (ID of the target user)
  };
}

interface VerifyPermissionsRequestBody {
  permissions: string[]; // 需要验证的权限名称数组, e.g., ["users:create", "posts:read"]
                         // (Array of permission names to verify)
}

// --- POST /api/v2/users/{userId}/permissions/verify (验证用户权限列表) ---
// (Verify a list of permissions for a user)
async function verifyUserPermissionsHandler(req: AuthenticatedRequest, context: RouteContext) {
  const { params } = context;
  const targetUserId = params.userId;
  const performingAdmin = req.user; // Admin user performing the action, from requirePermission middleware

  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to VERIFY PERMISSIONS for user ${targetUserId}.`);

  let requestBody: VerifyPermissionsRequestBody;
  try {
    requestBody = await req.json();
  } catch (e) {
    return errorResponse('无效的JSON请求体 (Invalid JSON request body).', 400, 'invalid_request_body');
  }

  const { permissions: permissionsToVerify } = requestBody;

  // 验证请求体中的权限列表 (Validate the permissions list in the request body)
  if (!permissionsToVerify || !Array.isArray(permissionsToVerify) || permissionsToVerify.some(p => typeof p !== 'string')) {
    return errorResponse('无效请求："permissions" 必须是一个字符串数组。(Invalid request: "permissions" must be an array of strings.)', 400, 'validation_error_permissions_format');
  }
  if (permissionsToVerify.length === 0) {
    return errorResponse('无效请求："permissions" 数组不能为空。(Invalid request: "permissions" array cannot be empty.)', 400, 'validation_error_permissions_empty');
  }

  try {
    // 1. 检查目标用户是否存在 (Check if target user exists)
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isActive: true } // 只需ID和状态 (Only need ID and status)
    });

    if (!targetUser) {
      return errorResponse('目标用户未找到 (Target user not found).', 404, 'user_not_found');
    }
    // （可选）如果用户非激活，权限校验可能需要特殊处理
    // (Optional: if user is inactive, permission check might need special handling)
    // if (!targetUser.isActive) {
    //   return errorResponse('目标用户非活动状态 (Target user is not active).', 400, 'user_inactive');
    // }

    // 2. 使用 PermissionService 批量校验权限
    // (Use PermissionService to batch check permissions)
    // PermissionService.checkBatchPermissions expects an array of objects like { name: "perm_name" }
    const permissionCheckRequests = permissionsToVerify.map(pName => ({ name: pName }));

    const results = await permissionServiceInstance.checkBatchPermissions(targetUserId, permissionCheckRequests);

    // 3. 返回校验结果 (Return verification results)
    return NextResponse.json({
      userId: targetUserId,
      results: results, // results from PermissionService.checkBatchPermissions
    }, { status: 200 });

  } catch (error: any) {
    console.error(`管理员 ${performingAdmin?.id} 在为用户 ${targetUserId} 验证权限时出错: (Error verifying permissions for user ${targetUserId} by admin ${performingAdmin?.id}:)`, error);
    return errorResponse('验证用户权限时发生意外错误。(An unexpected error occurred while verifying user permissions.)', 500, 'server_error');
  }
}

// 使用 'users:permissions:verify' 权限保护此端点
// (Protect this endpoint with 'users:permissions:verify' permission)
export const POST = requirePermission('users:permissions:verify', verifyUserPermissionsHandler);
