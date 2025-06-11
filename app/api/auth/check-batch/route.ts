// /app/api/auth/check-batch/route.ts

// /app/api/auth/check-batch/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Prisma客户端实例 (Prisma client instance)
import { withAuth, AuthContext } from '@/lib/auth/middleware'; // 假设的认证中间件 (Assumed authentication middleware)
import { z } from 'zod'; // 用于数据校验的Zod库 (Zod library for data validation)
import { Permission } from '@prisma/client'; // 导入Permission类型 (Import Permission type)

// 单个权限检查请求的 Zod Schema (Zod Schema for a single permission check request)
const IndividualCheckRequestSchema = z.object({
  requestId: z.string().optional(), // (可选) 请求的唯一标识符 (Optional: Unique request identifier)
  resourceAttributes: z.object({
    resourceId: z.string(), // (必需) 被访问资源的唯一标识 (Required: Unique identifier of the resource)
    resourceType: z.string().optional(), // (可选) 资源类型 (Optional: Resource type)
  }),
  action: z.object({
    type: z.string(), // (必需) 操作类型 (Required: Action type)
  }),
  environmentAttributes: z.record(z.any()).optional(), // (可选) 环境属性 (Optional: Environment attributes)
});

// 批量权限检查请求体的 Zod Schema (Zod Schema for the batch permission check request body)
const BatchCheckRequestBodySchema = z.object({
  subjectAttributes: z.object({
    userId: z.string(), // (必需) 用户唯一标识 (Required: User's unique identifier)
  }),
  requests: z.array(IndividualCheckRequestSchema).min(1), // (必需) 权限检查请求列表，至少一个 (Required: List of permission checks, at least one)
});

interface ServiceAuthContext extends AuthContext {
  callingServiceId?: string;
}

// 辅助函数：获取用户的所有有效权限 (Helper function: Get all effective permissions for a user)
async function getUserEffectivePermissions(userId: string): Promise<Set<string>> {
  // 根据用户ID查询用户角色 (Query user roles based on userId)
  const userWithRoles = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: { // 包含用户的角色关联 (Include user's role associations)
        where: { role: { isActive: true } }, // 只考虑激活的角色 (Only consider active roles)
        include: {
          role: { // 包含角色本身的详细信息 (Include details of the role itself)
            include: {
              rolePermissions: { // 包含角色的权限关联 (Include role's permission associations)
                where: { permission: { isActive: true } }, // 只考虑激活的权限 (Only consider active permissions)
                include: {
                  permission: true, // 包含权限的详细信息 (Include details of the permission)
                },
              },
            },
          },
        },
      },
    },
  });

  if (!userWithRoles) {
    // 用户不存在或未激活 (User does not exist or is not active)
    return new Set<string>();
  }

  const effectivePermissions = new Set<string>();
  userWithRoles.userRoles.forEach(userRole => {
    userRole.role.rolePermissions.forEach(rolePermission => {
      const perm = rolePermission.permission;
      // 构造权限字符串，例如 "resourceName:actionType" (Construct permission string, e.g., "resourceName:actionType")
      // 注意: PRD中scope的格式是 "resource:action" 或 "resource_group:resource:action"
      // Note: PRD scope format is "resource:action" or "resource_group:resource:action"
      // 这里的 'perm.resource' 和 'perm.action' 需要与 Permission 模型中的字段对应
      // 'perm.resource' and 'perm.action' here need to match fields in the Permission model
      effectivePermissions.add(`${perm.resource.toLowerCase()}:${perm.action.toLowerCase()}`);
    });
  });

  return effectivePermissions;
}

// POST /api/auth/check-batch - 处理批量权限检查请求 (Handles batch permission check requests)
async function handleBatchPermissionCheck(request: NextRequest, context: ServiceAuthContext) {
  try {
    const body = await request.json();
    const validationResult = BatchCheckRequestBodySchema.safeParse(body);

    if (!validationResult.success) {
      // 如果校验失败，向客户端返回400错误，并附带详细的校验失败信息
      // (If validation fails, return a 400 error to the client with detailed validation failure information)
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { subjectAttributes, requests } = validationResult.data;

    // 1. 获取用户的有效权限集合 (Get the user's effective permission set)
    const userPermissionsSet = await getUserEffectivePermissions(subjectAttributes.userId);

    if (userPermissionsSet.size === 0 && requests.length > 0) { // 当用户无任何权限且有检查请求时 (When user has no permissions and there are check requests)
      const results = requests.map(req => ({
        requestId: req.requestId,
        allowed: false,
        reasonCode: 'NO_PERMISSIONS',
        message: '用户无任何有效权限 (User has no effective permissions)', // 统一消息 (Unified message)
      }));
      return NextResponse.json({ results });
    }

    const results = requests.map(req => {
      const requestedPermission = `${req.resourceAttributes.resourceId.toLowerCase()}:${req.action.type.toLowerCase()}`;
      const isAllowed = userPermissionsSet.has(requestedPermission);

      // 为每种情况提供消息 (Provide a message for each case)
      let message = ''; // 初始化消息变量 (Initialize message variable)
      if (isAllowed) {
        message = '操作允许 (Operation allowed)';
      } else {
        // 检查是否因为用户根本没有任何权限 (Check if it's because the user has no permissions at all)
        // 这个分支理论上在 userPermissionsSet.size === 0 时已处理，但作为额外防御或用于更细致原因
        // This branch is theoretically handled by userPermissionsSet.size === 0, but as an extra defense or for more detailed reasons
        if (userPermissionsSet.size === 0) {
             message = '用户无任何有效权限 (User has no effective permissions)';
        } else {
             message = '权限不足，操作被拒绝 (Insufficient permission, operation denied)';
        }
      }

      return {
        requestId: req.requestId,
        allowed: isAllowed,
        reasonCode: isAllowed ? 'PERMISSION_GRANTED' : (userPermissionsSet.size === 0 ? 'NO_PERMISSIONS' : 'PERMISSION_DENIED'),
        message: message, // 添加消息字段 (Add message field)
      };
    });

    return NextResponse.json({ results });

  } catch (error: any) {
    // 捕获在处理过程中发生的任何未预期错误 (Catch any unexpected errors that occur during processing)
    console.error('批量权限检查接口发生严重错误 (Critical error in batch permission check API):', error); // 更具体的服务端日志消息 (More specific server-side log message)

    // 向客户端返回通用的500服务器错误，避免泄露内部错误详情
    // (Return a generic 500 server error to the client, avoiding leakage of internal error details)
    return NextResponse.json(
      { error: 'Internal Server Error', message: '处理权限请求时发生内部错误，请稍后重试 (An internal error occurred while processing permission requests, please try again later)' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handleBatchPermissionCheck, {
  requiredPermissions: ['service:permission_check_batch'],
  requireUserContext: false,
});
