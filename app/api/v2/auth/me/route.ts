// 文件路径: app/api/v2/auth/me/route.ts
// 描述: 获取当前认证用户信息端点 (Get current authenticated user information endpoint)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
// import { verifyV2SessionAccessToken, V2AccessTokenPayload } from '@/lib/auth/v2AuthUtils'; // REMOVED
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入 requirePermission

// 辅助函数：错误响应 (Helper function: Error response) - Can be removed if requirePermission handles all errors
// function errorResponse(message: string, status: number, errorCode?: string) {
//   return NextResponse.json({ error: errorCode || 'unauthorized', message }, { status });
// }

async function getMeHandler(req: AuthenticatedRequest, event?: any) {
  // 用户认证和权限检查已由 requirePermission 处理
  // (User authentication and permission check is handled by requirePermission)
  const authenticatedUserPayload = req.user; // 从 AuthenticatedRequest 获取用户信息 (Get user info from AuthenticatedRequest)

  if (!authenticatedUserPayload || !authenticatedUserPayload.id) {
    // 这理论上不应发生，因为 requirePermission 应该已验证
    // (This should theoretically not happen as requirePermission should have validated)
    console.error('/me handler: req.user is not populated correctly by requirePermission.');
    return NextResponse.json({ error: 'server_error', message: 'User context not available after auth.' }, { status: 500 });
  }

  const userId = authenticatedUserPayload.id; // 'id' is the 'sub' claim (user ID)
  console.log(`Fetching /me data for authenticated user ID: ${userId}`);

  try {
    // 使用 userId 从数据库检索用户 (Retrieve user from database using userId)
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      // 如果令牌有效但用户在数据库中不存在 (If token is valid but user does not exist in DB)
      console.warn(`User with ID ${userId} from token not found in database for /me endpoint.`);
      // requirePermission should ideally prevent this if token sub is validated against DB user existence,
      // but an explicit check here is safer.
      return NextResponse.json({ error: 'user_not_found', message: 'User associated with this token not found.' }, { status: 404 });
    }

    // 检查用户是否仍处于活动状态 (Check if user is still active)
    if (!user.isActive) {
        console.warn(`User ${userId} is inactive for /me endpoint.`);
        return NextResponse.json({ error: 'account_inactive', message: 'User account is inactive.' }, { status: 403 });
    }

    // 构建并返回用户信息 (Construct and return user information)
    // 排除敏感信息，如 passwordHash (Exclude sensitive information like passwordHash)
    const userResponse = {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      avatar: user.avatar,
      phone: user.phone,
      organization: user.organization,
      department: user.department,
      workLocation: user.workLocation,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // 令牌中包含的权限 (Permissions included in the token)
      permissions: authenticatedUserPayload.permissions || [],
      // 令牌中包含的客户端ID (ClientID included in the token)
      client_id: authenticatedUserPayload.clientId,
    };

    return NextResponse.json(userResponse, { status: 200 });

  } catch (error: any) {
    console.error(`/me endpoint error for user ${userId}:`, error);
    return NextResponse.json({ error: 'server_error', message: 'An unexpected error occurred while retrieving user information.'}, { status: 500 });
  }
}

// 使用 'auth:me:read' 权限保护此端点
// (Protect this endpoint with 'auth:me:read' permission)
export const GET = requirePermission('auth:me:read', getMeHandler);
