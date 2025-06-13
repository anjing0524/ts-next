// 文件路径: app/api/v2/auth/check-batch/route.ts
// 描述: 统一批量权限检查端点 (Unified batch permission check endpoint)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { JWTUtils } from '@/lib/auth/oauth2'; // 假设 JWTUtils 包含验证V2认证令牌的方法

// --- 辅助函数 ---

/**
 * 获取用户的所有有效权限名称集合 (Gets all effective permission names for a user as a Set)
 * @param userId 用户ID (User ID)
 * @returns Promise<Set<string>> 用户拥有的所有有效权限名称集合 (Promise<Set<string>> a set of all effective permission names the user has)
 */
async function getAllUserPermissionsSet(userId: string): Promise<Set<string>> {
  if (!userId) {
    return new Set<string>();
  }

  const userRoles = await prisma.userRole.findMany({
    where: {
      userId: userId,
      role: { isActive: true } // 只考虑激活的角色 (Only consider active roles)
    },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: {
              permission: {
                where: { isActive: true } // 只考虑激活的权限 (Only consider active permissions)
              },
            },
          },
        },
      },
    },
  });

  const permissionsSet = new Set<string>();
  for (const userRole of userRoles) {
    if (userRole.role?.rolePermissions) {
      for (const rolePermission of userRole.role.rolePermissions) {
        if (rolePermission.permission?.name) {
          permissionsSet.add(rolePermission.permission.name);
        }
      }
    }
  }
  return permissionsSet;
}


// --- 主处理函数 ---

export async function POST(req: NextRequest) {
  // 1. 认证用户 (Authenticate user)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json({ error: 'unauthorized', message: 'Missing or invalid Authorization header.' }, { status: 401 });
  }
  const token = authHeader.substring(7);
  if (!token) {
    return NextResponse.json({ error: 'unauthorized', message: 'Access token is missing.' }, { status: 401 });
  }

  const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);
  if (!valid || !payload) {
    return NextResponse.json({ error: 'invalid_token', message: `Invalid or expired token. ${tokenError || ''}`.trim() }, { status: 401 });
  }
  const userId = payload.userId as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: 'invalid_token_payload', message: 'Invalid token: User ID missing.' }, { status: 401 });
  }

  // 2. 解析请求体 (Parse request body)
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (e) {
    return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON request body.' }, { status: 400 });
  }

  const { permissions, context } = requestBody; // context 当前未使用 (context is currently unused)

  if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
    return NextResponse.json({ error: 'invalid_request', message: 'Permissions array is required and cannot be empty.' }, { status: 400 });
  }
  if (!permissions.every(p => typeof p === 'string' && p.length > 0)) {
    return NextResponse.json({ error: 'invalid_request', message: 'All items in permissions array must be non-empty strings.' }, { status: 400 });
  }


  try {
    // 3. 权限检查逻辑 (Optimized Permission check logic)
    // 获取用户的所有有效权限一次 (Fetch all user's effective permissions once)
    const userPermissionsSet = await getAllUserPermissionsSet(userId);

    // 检查请求中的每个权限 (Check each requested permission)
    const results = permissions.map((permissionName: string) => {
      // 在这里可以根据 context 进行更复杂的动态权限检查 (More complex dynamic checks can be done here using context)
      // 例如: checkPermissionWithContext(userId, permissionName, context, userPermissionsSet)
      return {
        permission: permissionName,
        allowed: userPermissionsSet.has(permissionName),
      };
    });

    // 4. 返回响应 (Return response)
    return NextResponse.json({ results }, { status: 200 });

  } catch (error: any) {
    console.error(`Batch permission check error for user ${userId}, permissions [${permissions.join(', ')}]:`, error);
    return NextResponse.json({ error: 'server_error', message: 'An unexpected error occurred during batch permission check.' }, { status: 500 });
  }
}

// 确保 JWTUtils.verifyV2AuthAccessToken 在 lib/auth/oauth2.ts 中声明或实现
// (Ensure JWTUtils.verifyV2AuthAccessToken is declared or implemented in lib/auth/oauth2.ts)
/*
declare module '@/lib/auth/oauth2' {
  export class JWTUtils {
    static async verifyV2AuthAccessToken(token: string): Promise<{
      valid: boolean;
      payload?: { userId: string; username: string; roles?: string[], aud?: string, [key: string]: any };
      error?: string;
    }>;
    // ... other methods
  }
}
*/
