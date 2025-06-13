// 文件路径: app/api/v2/auth/me/route.ts
// 描述: 获取当前认证用户信息端点 (Get current authenticated user information endpoint)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { JWTUtils } from '@/lib/auth/oauth2'; // 假设 JWTUtils 包含验证V2认证令牌的方法

// 辅助函数：错误响应 (Helper function: Error response)
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'unauthorized', message }, { status });
}

export async function GET(req: NextRequest) {
  // 1. 提取并验证 Authorization header (Extract and validate Authorization header)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return errorResponse('Missing or invalid Authorization header.', 401, 'invalid_request');
  }

  const token = authHeader.substring(7); // 提取令牌 (Extract token)
  if (!token) {
    return errorResponse('Access token is missing.', 401, 'invalid_token');
  }

  try {
    // 2. 验证访问令牌 (Verify access token)
    // 假设 JWTUtils.verifyV2AuthAccessToken 用于验证此特定类型的令牌
    // (Assuming JWTUtils.verifyV2AuthAccessToken is used for this specific type of token)
    const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);

    if (!valid || !payload) {
      console.warn(`Token verification failed for /me endpoint. Error: ${tokenError || 'No payload'}`);
      return errorResponse(`Invalid or expired token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
    }

    // 3. 从令牌中获取 userId (Get userId from token)
    const userId = payload.userId as string | undefined; // 确保类型正确 (Ensure correct type)
    if (!userId) {
      console.warn('User ID (userId) not found in token payload for /me endpoint.');
      return errorResponse('Invalid token: User ID missing.', 401, 'invalid_token_payload');
    }

    // 4. 使用 userId 从数据库检索用户 (Retrieve user from database using userId)
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      // 如果令牌有效但用户在数据库中不存在 (If token is valid but user does not exist in DB)
      console.warn(`User with ID ${userId} from token not found in database.`);
      return errorResponse('User associated with this token not found.', 401, 'user_not_found');
    }

    // 5. 检查用户是否仍处于活动状态 (Check if user is still active)
    // 虽然令牌可能仍然有效，但用户状态可能已更改 (While token might be valid, user status could have changed)
    if (!user.isActive) {
        console.warn(`User ${userId} is inactive.`);
        return errorResponse('User account is inactive.', 403, 'account_inactive'); // 403 Forbidden might be more appropriate here
    }


    // 6. 构建并返回用户信息 (Construct and return user information)
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
      // 可以根据需要添加角色和权限信息，但这需要额外的查询或已包含在令牌中并进行验证
      // (Roles and permissions can be added if needed, but this requires extra queries or inclusion in token and validation)
      // roles: await getUserRoles(user.id),
    };

    return NextResponse.json(userResponse, { status: 200 });

  } catch (error: any) {
    console.error('/me endpoint error:', error);
    // 避免在生产中泄露敏感错误信息 (Avoid leaking sensitive error info in production)
    return errorResponse('An unexpected error occurred while retrieving user information.', 500, 'server_error');
  }
}

// 确保 JWTUtils.verifyV2AuthAccessToken 在 lib/auth/oauth2.ts 中声明或实现
// (Ensure JWTUtils.verifyV2AuthAccessToken is declared or implemented in lib/auth/oauth2.ts)
/*
declare module '@/lib/auth/oauth2' {
  export class JWTUtils {
    static async verifyV2AuthAccessToken(token: string): Promise<{
      valid: boolean;
      payload?: { userId: string; username: string; roles?: string[], aud?: string, [key: string]: any }; // 示例载荷 (Example payload)
      error?: string;
    }>;
    // ... other methods
  }
}
*/
