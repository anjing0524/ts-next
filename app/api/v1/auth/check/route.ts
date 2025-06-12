// 文件路径: app/api/v1/auth/check/route.ts
// 版本: v1 - 重定向
// 目标: 此端点 (原 /api/v1/auth/permissions/check) 现在重定向到 /api/permissions/check。
//       根据路由优化报告，这是一个重复的权限检查端点，应被废弃并重定向。

import { NextRequest, NextResponse } from 'next/server';

// 移除旧的依赖：successResponse, withErrorHandler, ApiError, withAuth, PermissionService, SinglePermissionCheckRequestSchema
// 因为此路由不再执行实际逻辑，只进行重定向。
// 但 withErrorHandler 和 withAuth 可能仍需保留，以确保重定向本身是安全的，或符合某些全局策略。
// 为简单起见，暂时移除它们，如果重定向逻辑需要认证/错误处理上下文，可以再加回来。
// 实际上，Next.js 的 NextResponse.redirect 本身就能很好地处理。
// import { withErrorHandler } from '@/lib/api/errorHandler';
// import { withAuth } from '@/lib/auth/middleware';


/**
 * @swagger
 * /api/v1/auth/check:
 *   post:
 *     summary: (V1 - 已废弃, 重定向) 权限检查端点
 *     description: |
 *       此端点 `/api/v1/auth/permissions/check` 已废弃。
 *       所有请求将通过 HTTP 301 永久重定向到 `/api/permissions/check`。
 *       客户端应更新其请求地址到 `/api/permissions/check` 或新的 `/api/v2/users/{userId}/permissions/verify`。
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
 *       '400':
 *         description: (理论上不应发生) 如果请求无法被处理以进行重定向。
 */
async function redirectToUnifiedCheckHandler(request: NextRequest) {
  // 获取原始请求的 URL，用于构造目标 URL
  const originalUrl = new URL(request.url);
  const targetPath = '/api/permissions/check'; // v1 的主检查路径

  // 构造完整的重定向 URL。基本路径应与当前应用一致。
  // NextResponse.redirect 需要一个绝对 URL 或相对于当前域的路径。
  // 使用原始请求的 origin 来构建绝对 URL，或者直接使用路径。
  // const targetUrl = new URL(targetPath, originalUrl.origin).toString();
  // 对于 Next.js NextResponse.redirect，可以直接使用路径。

  console.warn(
    `警告 (Warning): 端点 /api/v1/auth/check (原 /api/v1/auth/permissions/check) 已废弃，正在重定向到 ${targetPath}。请更新客户端调用。`
  );

  // 执行 301 永久重定向
  // NextResponse.redirect(url, status_code)
  // status code for permanent redirect is 308 if method and body should be preserved,
  // but report asks for 301. Standard 301 might change POST to GET for some clients.
  // However, for API to API, client should handle 301 properly or server uses 308.
  // Given "301" is specified, we use 301.
  return NextResponse.redirect(new URL(targetPath, request.url), 301);
}

// 应用必要的中间件。如果不需要特殊处理，可以直接导出。
// export const POST = withErrorHandler(withAuth(redirectToUnifiedCheckHandler, { requiredPermissions: [] }));
// 如果不需要认证即可重定向:
export const POST = redirectToUnifiedCheckHandler;

// 如果需要 OPTIONS 请求处理 (例如，由于CORS):
// export async function OPTIONS(request: NextRequest) {
//   // Standard CORS preflight response
//   return new NextResponse(null, {
//     status: 204,
//     headers: {
//       'Access-Control-Allow-Origin': '*', // Adjust as needed
//       'Access-Control-Allow-Methods': 'POST, OPTIONS',
//       'Access-Control-Allow-Headers': 'Content-Type, Authorization',
//     },
//   });
// }

EOF
