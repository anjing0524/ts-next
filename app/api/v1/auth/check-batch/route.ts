// 文件路径: app/api/v1/auth/check-batch/route.ts
// 版本: v1 - 重定向
// 目标: 此端点 (原 /api/v1/permissions/batch-check) 现在重定向到 /api/permissions/check。
//       根据路由优化报告，这是一个重复的权限检查端点，应被废弃并重定向。
// 注意: 重定向目标 /api/permissions/check 现在处理【单个】权限请求。
//       因此，原先使用此批量端点的客户端在重定向后可能会遇到请求格式不匹配的问题。
//       强烈建议客户端迁移到新的 /api/v2/users/{userId}/permissions/batch-verify 以继续使用批量功能。

import { NextRequest, NextResponse } from 'next/server';

// 移除了所有旧的业务逻辑相关的导入

/**
 * @swagger
 * /api/v1/auth/check-batch:
 *   post:
 *     summary: (V1 - 已废弃, 重定向) 批量权限检查端点
 *     description: |
 *       此端点 `/api/v1/permissions/batch-check` 已废弃。
 *       所有请求将通过 HTTP 301 永久重定向到 `/api/permissions/check` (该端点处理单个权限检查)。
 *       客户端应更新其请求地址。对于批量权限检查，请使用新的 `/api/v2/users/{userId}/permissions/batch-verify`。
 *     tags:
 *       - Permissions V1 (Compatibility)
 *     deprecated: true
 *     responses:
 *       '301':
 *         description: 永久重定向到 `/api/permissions/check`。
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: '/api/permissions/check'
 */
async function redirectToUnifiedCheckHandler(request: NextRequest) {
  const targetPath = '/api/permissions/check'; // v1 的主检查路径 (现在是单个检查)

  console.warn(
    `警告 (Warning): 端点 /api/v1/auth/check-batch (原 /api/v1/permissions/batch-check) 已废弃，正在重定向到 ${targetPath}。` +
    `注意: 目标端点处理单个权限请求。对于批量操作，请迁移到 /api/v2/users/{userId}/permissions/batch-verify。`
  );

  // 执行 301 永久重定向
  return NextResponse.redirect(new URL(targetPath, request.url), 301);
}

export const POST = redirectToUnifiedCheckHandler;

// OPTIONS handler (if needed for CORS)
// export async function OPTIONS(request: NextRequest) {
//   return new NextResponse(null, {
//     status: 204,
//     headers: {
//       'Access-Control-Allow-Origin': '*',
//       'Access-Control-Allow-Methods': 'POST, OPTIONS',
//       'Access-Control-Allow-Headers': 'Content-Type, Authorization',
//     },
//   });
// }
EOF
