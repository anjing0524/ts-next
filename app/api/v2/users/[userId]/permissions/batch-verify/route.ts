// 文件路径: app/api/v2/users/[userId]/permissions/batch-verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { successResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { withAuth } from '@/lib/auth/middleware'; // 假设的认证中间件
import { PermissionService, BatchPermissionRequest as ServiceBatchPermissionRequest, BatchPermissionResult as ServiceBatchPermissionResult } from '@/lib/services/permissionService';

// 初始化权限服务
const permissionService = new PermissionService();

// 定义单个权限检查请求的 Schema (用于数组元素)
const IndividualPermissionItemSchema = z.object({
  requestId: z.string().optional().describe('客户端提供的用于关联结果的请求ID'),
  resourceAttributes: z.object({
    resourceId: z.string().min(1, '资源ID不能为空'), // 例如：'document:123'
    // resourceType: z.string().optional(),
  }),
  action: z.object({
    type: z.string().min(1, '操作类型不能为空'), // 例如：'read', 'write'
    // context: z.record(z.any()).optional(),
  }),
});

// 定义批量权限检查请求体 Schema
const BatchPermissionVerifyRequestSchema = z.object({
  requests: z.array(IndividualPermissionItemSchema).min(1, '至少需要一个权限验证请求'),
  // subjectAttributes 将从路径参数 userId 和认证上下文获取，不再从 body 中读取
});

// 定义路径参数 Schema
const PathParamsSchema = z.object({
  userId: z.string().min(1, '用户ID不能为空'),
});

// 输入给 PermissionService 的单个请求类型
// (与 service/permissionService.ts 中的 BatchPermissionRequest 类型对应)
// 在这里重新定义是为了确保此路由的独立性，或者直接从 service 导入
// export type ServiceBatchPermissionRequest = {
//   id?: string; // Corresponds to client's requestId
//   name: string; // The permission string, e.g., "resource:action"
//   // context?: Record<string, any>; // Optional context for ABAC
// };

/**
 * @swagger
 * /api/v2/users/{userId}/permissions/batch-verify:
 *   post:
 *     summary: 批量验证用户权限 (Batch verify permissions for a user)
 *     description: 根据用户ID和一组权限请求（每个请求包含资源属性和操作类型），批量验证用户是否拥有这些权限。
 *     tags:
 *       - Permissions V2
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         description: 需要验证权限的用户ID。
 *         schema:
 *           type: string
 *           example: 'user_clerk_123abc'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               requests:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     requestId:
 *                       type: string
 *                       description: 客户端提供的用于关联结果的请求ID (可选)。
 *                       example: 'req_1'
 *                     resourceAttributes:
 *                       type: object
 *                       properties:
 *                         resourceId:
 *                           type: string
 *                           description: 资源的唯一标识符。
 *                           example: 'document:123'
 *                       required:
 *                         - resourceId
 *                     action:
 *                       type: object
 *                       properties:
 *                         type:
 *                           type: string
 *                           description: 对资源执行的操作类型。
 *                           example: 'read'
 *                       required:
 *                         - type
 *                   required:
 *                     - resourceAttributes
 *                     - action
 *                 minItems: 1
 *             required:
 *               - requests
 *     responses:
 *       '200':
 *         description: 批量权限验证成功。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: 'Batch permission check completed.'
 *                 requestId:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           requestId:
 *                             type: string
 *                             description: 对应请求中的requestId。
 *                           allowed:
 *                             type: boolean
 *                             description: 是否允许操作。
 *                           reasonCode:
 *                             type: string
 *                             description: 允许或拒绝的原因代码。
 *                           message:
 *                             type: string
 *                             description: 详细信息。
 *       '400':
 *         description: 无效的请求体或路径参数。
 *       '401':
 *         description: 未经授权。
 *       '403':
 *         description: 禁止访问。
 *       '404':
 *         description: 用户未找到。
 *       '500':
 *         description: 服务器内部错误。
 */
async function verifyBatchPermissionHandler(
  request: NextRequest,
  context: { params: { userId: string } } // Next.js 动态路由的上下文
) {
  const overallRequestId = (request as any).requestId; // 由 withErrorHandler 中间件注入
  const { userId } = context.params; // 从路径中获取 userId

  // 验证路径参数
  const pathParamsValidation = PathParamsSchema.safeParse({ userId });
  if (!pathParamsValidation.success) {
    const errorMessages = pathParamsValidation.error.flatten().fieldErrors;
    throw new ApiError(400, `无效的路径参数: ${JSON.stringify(errorMessages)}`, 'VALIDATION_ERROR');
  }
  const targetUserId = pathParamsValidation.data.userId;

  // 解析请求体
  const body = await request.json();

  // 验证请求体
  const validationResult = BatchPermissionVerifyRequestSchema.safeParse(body);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.flatten().fieldErrors;
    throw new ApiError(400, `无效的请求体: ${JSON.stringify(errorMessages)}`, 'VALIDATION_ERROR');
  }

  const { requests: clientRequests } = validationResult.data;

  // 将客户端请求转换为权限服务期望的格式
  const serviceRequests: ServiceBatchPermissionRequest[] = clientRequests.map(
    (req) => ({
      id: req.requestId, // 传递客户端的 requestId 以便关联结果
      name: `${req.resourceAttributes.resourceId}:${req.action.type}`, // 构建权限名称
      // context: req.action.context, // 如果有上下文，则传递
    })
  );

  // 调用权限服务进行批量验证
  // 假设 PermissionService.checkBatchPermissions 返回一个结果数组
  const serviceResults: ServiceBatchPermissionResult[] = await permissionService.checkBatchPermissions(
    targetUserId,
    serviceRequests
  );

  // 构建响应数据中的 results 数组
  const responseResults = serviceResults.map((sr) => ({
    requestId: sr.id, // 这是来自客户端原始请求的 requestId
    allowed: sr.allowed,
    reasonCode: sr.reasonCode || (sr.allowed ? 'PERMISSION_GRANTED' : 'PERMISSION_DENIED'),
    message: sr.message || (sr.allowed ? '操作允许 (Operation allowed for this item).' : '操作拒绝 (Operation denied for this item).'),
  }));

  // 返回成功响应
  return NextResponse.json(
    successResponse(
      { results: responseResults },
      200,
      '批量权限验证完成 (Batch permission check completed).',
      overallRequestId
    ),
    { status: 200 }
  );
}

// 使用错误处理和认证中间件包装处理函数
export const POST = withErrorHandler(
  withAuth(verifyBatchPermissionHandler, {
    requiredPermissions: ['permissions.batchVerify'], // 示例权限
    requireUserContext: true,
  })
);
