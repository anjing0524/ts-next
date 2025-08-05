// 文件路径: app/api/v2/auth/check/route.ts
// 描述: 统一权限检查端点 (Unified permission check endpoint)

import { prisma } from '@repo/database';
import { errorResponse, JWTUtils, successResponse } from '@repo/lib/node';
import { NextRequest } from 'next/server';
// import { PermissionService } from '@/lib/services/permissionService'; // 理想情况下，权限检查逻辑应位于服务层

// --- 辅助函数 ---

/**
 * 检查用户是否拥有特定权限 (Checks if a user has a specific permission)
 * 注意: 这是一个简化的实现，直接放在路由文件中。理想情况下，它应该在服务层（例如 PermissionService）。
 * (Note: This is a simplified implementation directly in the route file. Ideally, it should be in a service layer, e.g., PermissionService.)
 * @param userId 用户ID (User ID)
 * @param permissionName 要检查的权限名称 (Name of the permission to check, e.g., "resource:action")
 * @returns Promise<boolean> 用户是否拥有该权限 (Promise<boolean> whether the user has the permission)
 */
async function checkUserPermission(userId: string, permissionName: string): Promise<boolean> {
  if (!userId || !permissionName) {
    return false;
  }

  // 1. 获取用户的所有角色 (Get all roles of the user)
  const userRoles = await prisma.userRole.findMany({
    where: { userId: userId },
    include: {
      role: {
        // 包含角色信息 (Include role information)
        include: {
          rolePermissions: {
            // 包含角色的权限关联 (Include role's permission associations)
            include: {
              permission: true, // 包含具体的权限对象 (Include the actual permission object)
            },
          },
        },
      },
    },
  });

  if (!userRoles || userRoles.length === 0) {
    return false; // 用户没有任何角色 (User has no roles)
  }

  // 2. 遍历用户的角色和权限，查找匹配项 (Iterate through user's roles and permissions to find a match)
  for (const userRole of userRoles) {
    if (userRole.role && userRole.role.rolePermissions) {
      for (const rolePermission of userRole.role.rolePermissions) {
        if (
          rolePermission.permission &&
          rolePermission.permission.name === permissionName &&
          rolePermission.permission.isActive
        ) {
          // 权限匹配且权限本身是激活的 (Permission matches and the permission itself is active)
          // 还需要检查角色是否激活 (Also need to check if the role is active)
          if (userRole.role.isActive) {
            return true; // 找到匹配的、激活的权限和激活的角色 (Found a matching, active permission and active role)
          }
        }
      }
    }
  }

  return false; // 未找到匹配的权限 (No matching permission found)
}

// --- 主处理函数 ---

export async function POST(req: NextRequest) {
  // 1. 认证用户 (Authenticate user)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return errorResponse({
      message: '缺少或无效的Authorization头',
      statusCode: 401,
      details: { code: 'unauthorized' },
    });
  }
  const token = authHeader.substring(7);
  if (!token) {
    return errorResponse({
      message: '缺少访问令牌',
      statusCode: 401,
      details: { code: 'unauthorized' },
    });
  }

  const { valid, payload, error: tokenError } = await JWTUtils.verifyToken(token);
  if (!valid || !payload) {
    return errorResponse({
      message: `令牌无效或已过期。${tokenError || ''}`.trim(),
      statusCode: 401,
      details: { code: 'invalid_token' },
    });
  }
  const userId = payload.user_id as string | undefined;
  if (!userId) {
    return errorResponse({
      message: '令牌无效：缺少用户ID',
      statusCode: 401,
      details: { code: 'invalid_token_payload' },
    });
  }

  // 2. 解析请求体 (Parse request body)
  let requestBody;
  try {
    requestBody = await req.json();
  } catch {
    return errorResponse({
      message: '无效的JSON请求体',
      statusCode: 400,
      details: { code: 'invalid_request' },
    });
  }

  const { permission } = requestBody; // context 当前未使用，但为未来扩展保留 (context is currently unused but reserved for future extension)

  if (!permission || typeof permission !== 'string') {
    return errorResponse({
      message: '必须提供权限字符串',
      statusCode: 400,
      details: { code: 'invalid_request' },
    });
  }

  try {
    // 3. 权限检查逻辑 (Permission check logic)
    // 调用辅助函数或服务层方法 (Call helper function or service layer method)
    const hasPermission = await checkUserPermission(userId, permission);

    // 4. 返回响应 (Return response)
    return successResponse({ allowed: hasPermission }, 200, '权限检查完成');
  } catch (error: any) {
    console.error(`权限检查异常: user ${userId}, permission ${permission}:`, error);
    return errorResponse({
      message: '权限检查时发生意外错误',
      statusCode: 500,
      details: { code: 'server_error' },
    });
  }
}

// 确保 JWTUtils.verifyAccessToken 在 lib/auth/oauth2.ts 中声明或实现
// (Ensure JWTUtils.verifyAccessToken is declared or implemented in lib/auth/oauth2.ts)
/*
declare module '@repo/lib' {
  export class JWTUtils {
    static async verifyAccessToken(token: string): Promise<{
      valid: boolean;
      payload?: { user_id: string; username: string; roles?: string[], aud?: string, [key: string]: any };
      error?: string;
    }>;
    // ... other methods
  }
}
*/

// 理想情况下，PermissionService 和 checkUserPermission 方法的定义
// (Ideally, the definition of PermissionService and checkUserPermission method)
/*
// In lib/services/permissionService.ts
import { prisma } from '@repo/lib';

export class PermissionService {
  static async checkUserPermission(userId: string, permissionName: string): Promise<boolean> {
    // ... (implementation as above or more sophisticated)
    // This could involve more complex logic like wildcard matching, resource-specific checks using context, etc.
    // It might also cache permissions for performance.
    if (!userId || !permissionName) return false;

    const userRoles = await prisma.userRole.findMany({
      where: { userId: userId, role: { isActive: true } }, // Only consider active roles
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: { where: { isActive: true } }, // Only consider active permissions
              },
            },
          },
        },
      },
    });

    for (const userRole of userRoles) {
      for (const rp of userRole.role.rolePermissions) {
        if (rp.permission && rp.permission.name === permissionName) {
          return true;
        }
        // Add wildcard/pattern matching here if needed
        // e.g., if permissionName is "document:read" and user has "document:*"
      }
    }
    return false;
  }
}
*/
