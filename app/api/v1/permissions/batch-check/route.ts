// 文件路径: app/api/v1/permissions/batch-check/route.ts
// 描述: V1 版本 - 统一批量权限检查端点 (兼容旧版)
// (V1 Version - Unified batch permission check endpoint (for backward compatibility))

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
// 假设的V1认证函数 (Assumed V1 authentication function)
// import { verifyV1AuthAndGetUserId } from '@/lib/auth/v1auth';
// 理想情况下，权限检查逻辑应位于服务层
// import { PermissionService } from '@/lib/services/permissionService';

// --- 模拟V1认证和权限检查逻辑 (Simulating V1 Auth & Permission Check Logic) ---

/**
 * 模拟V1认证并获取用户ID (Simulates V1 authentication and gets user ID)
 * @param req NextRequest
 * @returns Promise<string | null> 用户ID或null
 */
async function verifyV1AuthAndGetUserId(req: NextRequest): Promise<string | null> {
  const authToken = req.headers.get('X-Auth-Token-V1');
  if (authToken === 'valid-v1-token-for-user-123') {
    return 'cluser1test123456789012345'; // 返回一个已知的测试用户ID
  }
  return null;
}

/**
 * 获取用户的所有有效权限名称集合 (Gets all effective permission names for a user as a Set) - V1版本使用
 * 与V2版本中的 getAllUserPermissionsSet 逻辑相同或相似。理想情况下应共享。
 * (Same or similar logic as getAllUserPermissionsSet in V2. Ideally should be shared.)
 * @param userId 用户ID
 * @returns Promise<Set<string>> 用户拥有的所有有效权限名称集合
 */
async function getAllUserPermissionsSetV1(userId: string): Promise<Set<string>> {
  if (!userId) return new Set<string>();
  const userRoles = await prisma.userRole.findMany({
    where: { userId: userId, role: { isActive: true } },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: {
              permission: { where: { isActive: true } },
            },
          },
        },
      },
    },
  });
  const permissionsSet = new Set<string>();
  for (const userRole of userRoles) {
    if (userRole.role?.rolePermissions) {
      for (const rp of userRole.role.rolePermissions) {
        if (rp.permission?.name) {
          permissionsSet.add(rp.permission.name);
        }
      }
    }
  }
  return permissionsSet;
}

// --- 主处理函数 ---

export async function POST(req: NextRequest) {
  // 1. V1 用户认证 (V1 User Authentication)
  const userId = await verifyV1AuthAndGetUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized', message: 'V1 Authentication failed.' }, { status: 401 });
  }

  // 2. 解析请求体 (Parse request body)
  // 假设V1请求体与V2相似，包含 "permissions" 数组
  // (Assuming V1 request body is similar to V2, containing "permissions" array)
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (e) {
    return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON request body.' }, { status: 400 });
  }

  const { permissions, context } = requestBody; // context 当前未使用

  if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
    return NextResponse.json({ error: 'invalid_request', message: 'Permissions array is required and cannot be empty.' }, { status: 400 });
  }
  if (!permissions.every(p => typeof p === 'string' && p.length > 0)) {
    return NextResponse.json({ error: 'invalid_request', message: 'All items in permissions array must be non-empty strings.' }, { status: 400 });
  }

  try {
    // 3. 权限检查逻辑 (Optimized Permission check logic)
    const userPermissionsSet = await getAllUserPermissionsSetV1(userId);

    const results = permissions.map((permissionName: string) => {
      return {
        permission: permissionName,
        allowed: userPermissionsSet.has(permissionName),
      };
    });

    // 4. 返回V1格式的响应 (Return response in V1 format)
    // 假设V1期望的格式与V2类似: { "results": [{ "permission": "...", "allowed": true/false }, ...] }
    // (Assuming V1 expected format is similar to V2)
    return NextResponse.json({ results }, { status: 200 });

  } catch (error: any) {
    console.error(`V1 Batch permission check error for user ${userId}, permissions [${permissions.join(', ')}]:`, error);
    return NextResponse.json({ error: 'server_error', message: 'An unexpected error occurred during V1 batch permission check.' }, { status: 500 });
  }
}
