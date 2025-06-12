// 文件路径: app/api/v2/users/[userId]/permissions/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { successResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { withAuth } from '@/lib/auth/middleware'; // 假设的认证中间件
import { PermissionService } from '@/lib/services/permissionService';

// 初始化权限服务
const permissionService = new PermissionService();

// 定义请求体 Schema (与 v1/auth/check 类似，但不包含 userId，因为它从路径获取)
const PermissionVerifyRequestSchema = z.object({
  resourceAttributes: z.object({
    resourceId: z.string().min(1, '资源ID不能为空'), // 例如：'document:123'
    // 根据需要可以添加更多资源相关属性
    // resourceType: z.string().optional(),
  }),
  action: z.object({
    type: z.string().min(1, '操作类型不能为空'), // 例如：'read', 'write'
    // 根据需要可以添加更多操作相关属性
    // context: z.record(z.any()).optional(),
  }),
  // subjectAttributes 将从路径参数 userId 和认证上下文获取，不再从 body 中读取
});

// 定义路径参数 Schema
const PathParamsSchema = z.object({
  userId: z.string().min(1, '用户ID不能为空'),
});

/**
 * @swagger
 * /api/v2/users/{userId}/permissions/verify:
 *   post:
 *     summary: 验证用户单个权限 (Verify a single permission for a user)
 *     description: 根据用户ID、资源属性和操作类型验证用户是否拥有特定权限。
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
 *             required:
 *               - resourceAttributes
 *               - action
 *     responses:
 *       '200':
 *         description: 权限验证成功。
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
 *                   example: 'Permission check completed.'
 *                 requestId:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     allowed:
 *                       type: boolean
 *                       description: 是否允许操作。
 *                     reasonCode:
 *                       type: string
 *                       description: 允许或拒绝的原因代码。
 *                     message:
 *                       type: string
 *                       description: 详细信息。
 *       '400':
 *         description: 无效的请求体或路径参数。
 *       '401':
 *         description: 未经授权。
 *       '403':
 *         description: 禁止访问（例如，调用此API的权限不足）。
 *       '404':
 *         description: 用户未找到。
 *       '500':
 *         description: 服务器内部错误。
 */
async function verifySinglePermissionHandler(
  request: NextRequest,
  context: { params: { userId: string } } // Next.js 动态路由的上下文
) {
  const requestId = (request as any).requestId; // 由 withErrorHandler 中间件注入
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
  const validationResult = PermissionVerifyRequestSchema.safeParse(body);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.flatten().fieldErrors;
    throw new ApiError(400, `无效的请求体: ${JSON.stringify(errorMessages)}`, 'VALIDATION_ERROR');
  }

  const { resourceAttributes, action } = validationResult.data;

  // 构建权限名称，例如："resourceId:actionType"
  // 注意：这里的构建方式需要与 PermissionService 中的期望一致
  const permissionName = `${resourceAttributes.resourceId}:${action.type}`;

  // 调用权限服务进行验证
  // 假设 PermissionService.checkPermission 需要用户ID和权限字符串
  const hasPermission = await permissionService.checkPermission(
    targetUserId,
    permissionName
    // 如果需要，可以传递更多上下文信息，例如 action.context
  );

  // 构建响应数据
  const decision = {
    allowed: hasPermission,
    reasonCode: hasPermission ? 'PERMISSION_GRANTED' : 'PERMISSION_DENIED',
    message: hasPermission ? '权限已授予 (Permission granted).' : '权限被拒绝 (Permission denied).',
  };

  // 返回成功响应
  return NextResponse.json(
    successResponse(decision, 200, '权限验证完成 (Permission check completed).', requestId),
    { status: 200 }
  );
}

// 使用错误处理和认证中间件包装处理函数
// 注意: requiredPermissions 可能需要调整为适合 v2 API 的权限
export const POST = withErrorHandler(
  withAuth(verifySinglePermissionHandler, {
    // 根据您的设计，调用此API可能需要特定的权限
    // 例如: 'permissions:v2:verify' 或针对特定用户的 'user:permissions:verify'
    requiredPermissions: ['permissions.verify'], // 示例权限
    requireUserContext: true, // 通常，验证他人权限的操作需要调用者是认证用户或服务
  })
);
