// 文件路径: app/api/v1/permissions/check/route.ts
// 描述: V1 版本 - 统一权限检查端点 (兼容旧版)
// (V1 Version - Unified permission check endpoint (for backward compatibility))

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
// 假设的V1认证函数 (Assumed V1 authentication function)
// import { verifyV1AuthAndGetUserId } from '@/lib/auth/v1auth';
// 理想情况下，权限检查逻辑应位于服务层
// import { PermissionService } from '@/lib/services/permissionService';

// --- 模拟V1认证和权限检查逻辑 (Simulating V1 Auth & Permission Check Logic) ---

/**
 * 模拟V1认证并获取用户ID (Simulates V1 authentication and gets user ID)
 * 注意: 这是一个模拟实现。实际的V1认证机制可能不同。
 * (Note: This is a mock implementation. Actual V1 auth mechanism might differ.)
 * @param req NextRequest
 * @returns Promise<string | null> 用户ID或null (User ID or null)
 */
async function verifyV1AuthAndGetUserId(req: NextRequest): Promise<string | null> {
  const authToken = req.headers.get('X-Auth-Token-V1'); // 假设V1使用不同的头部或令牌类型
  if (authToken === 'valid-v1-token-for-user-123') { // 极简模拟
    return 'cluser1test123456789012345'; // 返回一个已知的测试用户ID
  }
  // 在实际应用中，这里会验证V1令牌的有效性 (In a real app, this would validate the V1 token)
  // 例如: const { userId } = await decodeAndVerifyV1Token(authToken); return userId;
  return null;
}

/**
 * 检查用户是否拥有特定权限 (Checks if a user has a specific permission) - V1版本使用
 * 与V2版本中的 checkUserPermission 逻辑相同或相似。理想情况下应共享。
 * (Same or similar logic as checkUserPermission in V2. Ideally should be shared.)
 * @param userId 用户ID
 * @param permissionName 要检查的权限名称
 * @returns Promise<boolean> 用户是否拥有该权限
 */
async function checkUserPermissionV1(userId: string, permissionName: string): Promise<boolean> {
  if (!userId || !permissionName) return false;
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
  for (const userRole of userRoles) {
    for (const rp of userRole.role.rolePermissions) {
      if (rp.permission && rp.permission.name === permissionName) {
        return true;
      }
    }
  }
  return false;
}

// --- 主处理函数 ---

export async function POST(req: NextRequest) {
  // 1. V1 用户认证 (V1 User Authentication)
  const userId = await verifyV1AuthAndGetUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized', message: 'V1 Authentication failed.' }, { status: 401 });
  }

  // 2. 解析请求体 (Parse request body)
  // 假设V1请求体与V2相似，包含 "permission" 字段
  // (Assuming V1 request body is similar to V2, containing "permission" field)
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (e) {
    return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON request body.' }, { status: 400 });
  }

  const { permission, context } = requestBody; // context 当前未使用

  if (!permission || typeof permission !== 'string') {
    return NextResponse.json({ error: 'invalid_request', message: 'Permission string is required.' }, { status: 400 });
  }

  try {
    // 3. 权限检查逻辑 (Permission check logic)
    // 调用V1版本的权限检查函数 (Call V1 version of permission check function)
    const hasPermission = await checkUserPermissionV1(userId, permission);

    // 4. 返回V1格式的响应 (Return response in V1 format)
    // 假设V1期望的格式与V2类似: { "allowed": true/false }
    // (Assuming V1 expected format is similar to V2)
    return NextResponse.json({ allowed: hasPermission }, { status: 200 });

  } catch (error: any) {
    console.error(`V1 Permission check error for user ${userId}, permission ${permission}:`, error);
    return NextResponse.json({ error: 'server_error', message: 'An unexpected error occurred during V1 permission check.' }, { status: 500 });
  }
}
