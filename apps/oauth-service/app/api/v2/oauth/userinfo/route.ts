// 文件路径: app/api/v2/oauth/userinfo/route.ts
// File path: app/api/v2/oauth/userinfo/route.ts
// 描述: OAuth 2.0 / OpenID Connect UserInfo端点 (OIDC Core 1.0)
// Description: OAuth 2.0 / OpenID Connect UserInfo Endpoint (OIDC Core 1.0)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { withErrorHandling } from '@repo/lib/utils/error-handler';
// authenticateBearer 已移至 @repo/lib/middleware
import { OAuth2Error, OAuth2ErrorCode, BaseError } from '@repo/lib/errors';
import { userInfoResponseSchema, UserInfoResponse } from './schemas';
import { ApiResponse } from '@repo/lib/types/api';

/**
 * @swagger
 * /api/v2/oauth/userinfo:
 *   get:
 *     summary: OpenID Connect UserInfo端点 (OIDC Core 1.0)
 *     description: |
 *       返回已认证用户的用户信息。此端点受OAuth 2.0访问令牌保护。
 *       Returns user information for the authenticated user. This endpoint is protected by OAuth 2.0 Access Token.
 *       
 *       **认证要求**:
 *       - 必须在Authorization头中提供有效的Bearer访问令牌
 *       - 访问令牌必须包含'openid'范围才能访问此端点
 *       - 令牌必须通过Jose库的JWT验证
 *       
 *       **返回的用户信息**:
 *       基于访问令牌中的scope声明返回相应的用户信息声明。
 *     tags:
 *       - OAuth V2
 *       - OpenID Connect
 *     security:
 *       - BearerAuth: ['openid']
 *     produces:
 *       - application/json
 *     responses:
 *       '200':
 *         description: 成功返回用户信息 (Successfully returns user information)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseUserInfo'
 *       '401':
 *         description: 访问令牌无效或缺失 (Access token is invalid or missing)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError'
 *       '403':
 *         description: 访问令牌没有足够的权限(缺少openid scope) (Access token lacks sufficient permissions (missing openid scope))
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError'
 *       '404':
 *         description: 用户不存在 (User does not exist)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError'
 *       '500':
 *         description: 服务器内部错误 (Internal server error)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError'
 * components:
 *   schemas:
 *     ApiResponseUserInfo:
 *       allOf:
 *         - $ref: '#/components/schemas/ApiResponseBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/UserInfoResponse'
 *             message:
 *               type: string
 *               example: "User information retrieved successfully."
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: OAuth 2.0 访问令牌 (OAuth 2.0 Access Token)
 */

/**
 * UserInfo端点内部处理函数
 * UserInfo endpoint internal handler function
 */
async function userInfoHandlerInternal(request: NextRequest): Promise<NextResponse> {
  // --- 步骤1: JWT令牌认证 (使用Jose库) ---
  // --- Step 1: JWT Token Authentication (using Jose library) ---
  // 使用恢复的认证中间件逻辑
  const { authenticateBearer } = await import('@repo/lib/middleware');
  
  // 执行Bearer令牌认证
  const authResult = await authenticateBearer(request);
  if (!authResult.success) {
    // 认证失败，中间件已经准备好了响应
    return authResult.response!;
  }

  // 认证成功，但需要确保上下文存在
  if (!authResult.context) {
    throw new OAuth2Error(
      'Authentication context is missing after successful authentication.',
      OAuth2ErrorCode.ServerError,
      500
    );
  }

  const { user, scopes } = authResult.context;
  const userId = user?.id;
  
  if (!userId) {
    throw new OAuth2Error(
      'User ID not found in access token.',
      OAuth2ErrorCode.InvalidToken,
      401
    );
  }

  // 验证是否有openid scope (虽然中间件已检查，但为了安全再次确认)
  // Verify openid scope (although middleware has checked, confirm again for security)
  if (!scopes?.includes('openid')) {
    throw new OAuth2Error(
      'Insufficient scope. The "openid" scope is required to access UserInfo endpoint.',
      OAuth2ErrorCode.InsufficientScope,
      403,
      undefined,
      { requiredScope: 'openid', providedScopes: scopes }
    );
  }

  // --- 步骤3: 获取用户信息 ---
  // --- Step 3: Retrieve User Information ---
  const userData = await prisma.user.findUnique({
    where: { 
      id: userId,
      isActive: true // 只返回活跃用户的信息
    },
  });

  if (!userData) {
    throw new OAuth2Error(
      'User not found or inactive.',
      OAuth2ErrorCode.InvalidToken, // 用户不存在通常表示令牌无效
      404,
      undefined,
      { userId }
    );
  }

  // --- 步骤4: 构建响应数据 (基于scope) ---
  // --- Step 4: Build Response Data (based on scope) ---
  const userInfo: UserInfoResponse = {
    sub: userData.id, // subject - 必需字段
  };

  // 基于访问令牌的scope添加相应的用户信息
  // Add corresponding user information based on access token scope
  if (scopes.includes('profile')) {
    userInfo.name = userData.firstName && userData.lastName 
      ? `${userData.firstName} ${userData.lastName}`.trim() 
      : undefined;
    userInfo.given_name = userData.firstName || undefined;
    userInfo.family_name = userData.lastName || undefined;
    userInfo.preferred_username = userData.username || undefined;
    userInfo.picture = userData.avatar || undefined;
    userInfo.updated_at = userData.updatedAt ? Math.floor(userData.updatedAt.getTime() / 1000) : undefined;
    
    // 扩展字段 (如果用户模型支持)
    // Extended fields (if User model supports)
    userInfo.organization = userData.organization || undefined;
    userInfo.department = userData.department || undefined;
  }

  // email scope - 当前User模型不包含email字段，这些字段在schema中定义为可选
  // email scope - current User model doesn't include email fields, these are optional in schema
  if (scopes.includes('email')) {
    // 当前User模型没有email字段，保持为undefined
    // Current User model has no email fields, keep as undefined
    userInfo.email = undefined;
    userInfo.email_verified = undefined;
  }

  // 如果有phone scope (当前用户模型不支持phone字段)
  // If phone scope exists (current User model doesn't support phone fields)
  if (scopes.includes('phone')) {
    // 当前User模型没有phone字段，保持为undefined
    // Current User model has no phone fields, keep as undefined
    userInfo.phone_number = undefined;
    userInfo.phone_number_verified = undefined;
  }

  // 移除undefined值
  // Remove undefined values
  Object.keys(userInfo).forEach(key => {
    if (userInfo[key as keyof UserInfoResponse] === undefined) {
      delete userInfo[key as keyof UserInfoResponse];
    }
  });

  // --- 步骤5: 验证响应数据格式 ---
  // --- Step 5: Validate Response Data Format ---
  const validationResult = userInfoResponseSchema.safeParse(userInfo);
  if (!validationResult.success) {
    console.error('UserInfo response validation failed:', validationResult.error);
    throw new OAuth2Error(
      'Failed to generate valid user information response.',
      OAuth2ErrorCode.ServerError,
      500,
      undefined,
      { validationErrors: validationResult.error.flatten().fieldErrors }
    );
  }

  // --- 步骤6: 返回成功响应 ---
  // --- Step 6: Return Success Response ---
  return NextResponse.json<ApiResponse<UserInfoResponse>>({
    success: true,
    data: validationResult.data,
    message: 'User information retrieved successfully.',
  }, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate', // 用户信息不应缓存
      'Pragma': 'no-cache',
    },
  });
}

// 导出处理函数，使用错误处理包装器
// Export handler function with error handling wrapper
export const GET = withErrorHandling(userInfoHandlerInternal); 