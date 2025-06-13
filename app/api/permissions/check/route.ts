// 文件路径: app/api/permissions/check/route.ts
// 版本: v1 兼容层 (v1 Compatibility Layer) - 单个权限检查
// 目标: 此端点现在映射到 /api/v2/users/{userId}/permissions/verify 的核心逻辑。
//       根据路由优化报告，这是主要的v1权限检查端点，用于向后兼容。
// 注意: 此端点原先的实现可能是批量的，但根据报告的最终映射目标 (-> v2 单个验证),
//       现已调整为处理单个权限请求。

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { successResponse, errorResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { PermissionService } from '@/lib/services/permissionService';

// 初始化权限服务
const permissionService = new PermissionService();

// v1 请求体 Schema for Single Permission Check (保持与旧版本兼容或适配)
// 报告的目标是 /api/v1/permissions/check -> /api/v2/users/{userId}/permissions/verify (单个)
// 因此，此 v1 端点应该接受能映射到单个验证的请求。
// 假设 v1 的单个检查请求体包含 userId, resourceAttributes, 和 action
const V1SinglePermissionCheckRequestSchema = z.object({
  userId: z.string().min(1, '用户ID (userId) 不能为空'),
  // 假设 v1 的 'name' 字段 (e.g., 'resource:action') 或者分离的字段
  // 为了简单映射到 v2 的单个验证，我们假设 v1 请求可以提供 resourceId 和 actionType
  // 如果 v1 的请求格式是 { userId, permissionName: "resource:action" }, 需要解析 permissionName
  resourceAttributes: z.object({
    resourceId: z.string().min(1, '资源ID (resourceId) 不能为空'),
  }),
  action: z.object({
    type: z.string().min(1, '操作类型 (action.type) 不能为空'),
  }),
  // requestId 是可选的，用于客户端追踪
  requestId: z.string().optional().describe('客户端请求ID (requestId)'),
});

/**
 * @swagger
 * /api/permissions/check:
 *   post:
 *     summary: (V1 - 兼容层) 验证用户单个权限
 *     description: |
 *       此端点为v1版本的权限检查接口（处理单个权限），用于向后兼容。
 *       它现在内部调用新的v2单权限验证逻辑 (`/api/v2/users/{userId}/permissions/verify`)。
 *       请求体结构尽量保持与v1兼容或适配到单个权限检查。
 *     tags:
 *       - Permissions V1 (Compatibility)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: 需要验证权限的用户ID。
 *                 example: 'user_clerk_123abc'
 *               resourceAttributes:
 *                 type: object
 *                 properties:
 *                   resourceId:
 *                     type: string
 *                     description: 资源的唯一标识符。
 *                     example: 'document:123'
 *                 required:
 *                   - resourceId
 *               action:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     description: 对资源执行的操作类型。
 *                     example: 'read'
 *                 required:
 *                   - type
 *               requestId:
 *                 type: string
 *                 description: 客户端为单个请求提供的可选ID。
 *                 example: 'req_xyz_789'
 *             required:
 *               - userId
 *               - resourceAttributes
 *               - action
 *     responses:
 *       '200':
 *         description: 权限验证成功。响应结构与 v2 的单个验证类似。
 *         content:
 *           application/json:
 *             schema:
 *               # 与 /api/v2/users/{userId}/permissions/verify 的成功响应一致
 *               # 通常包含: allowed, reasonCode, message
 *               # 例如: successResponse(data, status, message, requestId)
 *               # success: true, status: 200, message: "...", data: { allowed, ... }
 *               # 为了v1兼容，可能返回更直接的结构
 *               type: object
 *               properties:
 *                 allowed:
 *                   type: boolean
 *                 reasonCode:
 *                   type: string
 *                 message:
 *                   type: string
 *                 requestId: # 对应请求中的 requestId
 *                   type: string
 *       '400':
 *         description: 无效的请求体。
 *       '500':
 *         description: 服务器内部错误。
 */
async function v1CompatSinglePermissionCheckHandler(
  request: NextRequest,
  authContext: AuthContext
) {
  const overallRequestId = (request as any).requestId; // from withErrorHandler
  console.warn(
    '警告 (Warning): /api/permissions/check (v1 - single check compat layer) 正在被调用。推荐迁移到 /api/v2/users/{userId}/permissions/verify。'
  );

  const body = await request.json();
  const validationResult = V1SinglePermissionCheckRequestSchema.safeParse(body);

  if (!validationResult.success) {
    const errorMessages = validationResult.error.flatten().fieldErrors;
    return NextResponse.json(
      errorResponse(
        400,
        `无效的请求体 (Invalid request body): ${JSON.stringify(errorMessages)}`,
        'VALIDATION_ERROR'
      ),
      { status: 400 }
    );
  }

  const {
    userId: targetUserId,
    resourceAttributes,
    action,
    requestId: clientRequestId,
  } = validationResult.data;

  // 构建权限名称，与 v2 单个验证的逻辑一致
  const permissionName = `${resourceAttributes.resourceId}:${action.type}`;

  // 调用核心权限服务进行单个验证 (与 v2 单个验证端点使用相同的服务调用)
  const hasPermission = await permissionService.checkPermission(targetUserId, permissionName);

  // 构建与 v2 类似的响应数据，但可能需要调整以匹配 v1 客户端的期望
  const decision = {
    requestId: clientRequestId, // 将客户端请求ID传回
    allowed: hasPermission,
    reasonCode: hasPermission ? 'V1_PERMISSION_GRANTED' : 'V1_PERMISSION_DENIED', // v1 特定 reason code
    message: hasPermission ? '权限已授予 (Permission granted).' : '权限被拒绝 (Permission denied).',
  };

  // 根据 v1 期望的格式返回。如果 v1 期望直接是 decision 对象：
  return NextResponse.json(decision, { status: 200 });
  // 如果 v1 期望包裹在 standard successResponse 中:
  // return NextResponse.json(successResponse(decision, 200, '权限验证完成。', overallRequestId), { status: 200 });
}

export const POST = withErrorHandler(
  withAuth(v1CompatSinglePermissionCheckHandler, {
    requiredPermissions: ['permissions:check:execute'], // 保持v1的权限要求或根据策略调整
    requireUserContext: true,
  })
);
