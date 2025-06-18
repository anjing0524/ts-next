// 文件路径: app/api/v2/auth/me/route.ts
// File path: app/api/v2/auth/me/route.ts
// 描述: 获取当前认证用户信息端点
// Description: Get current authenticated user information endpoint

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/auth/middleware'; // 引入 requirePermission HOF (Import requirePermission HOF)
import type { AuthenticatedRequest, AuthenticatedUser } from '@/lib/auth/types'; // 引入 AuthenticatedRequest 类型 (Import AuthenticatedRequest type)
import { ApiResponse } from '@/lib/types/api'; // 标准API响应类型 (Standard API response type)
import { ResourceNotFoundError, AuthenticationError, BaseError } from '@/lib/errors'; // 自定义错误类 (Custom error classes)
import { withErrorHandling } from '@/lib/utils/error-handler'; // 错误处理高阶函数 (Error handling HOF)
import { User } from '@prisma/client'; // Prisma User type

// 定义成功响应中用户信息的类型
// Define type for user information in successful response
// 这个类型应该包含 User 模型中的所有非敏感字段以及从 AuthenticatedUser 载荷中获取的额外字段
// This type should include all non-sensitive fields from the User model plus extra fields from AuthenticatedUser payload
type UserMeResponse = Omit<User, 'passwordHash' | 'failedLoginAttempts' | 'lockedUntil'> & {
  permissions: string[]; // 来自令牌的权限 (Permissions from token)
  client_id?: string;    // 来自令牌的客户端ID (Client ID from token)
};


/**
 * @swagger
 * /api/v2/auth/me:
 *   get:
 *     summary: 获取当前用户信息 (Get Current User Information)
 *     description: (需要 'auth:me:read' 权限) 获取当前已认证用户的详细信息，包括基本资料、权限和客户端信息（如果适用）。
 *                  ((Requires 'auth:me:read' permission) Gets detailed information for the currently authenticated user, including basic profile, permissions, and client information (if applicable).)
 *     tags: [认证 (Authentication)]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: 成功获取用户信息。 (Successfully fetched user information.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseUserMe'
 *       '401':
 *         description: 未经授权或令牌无效/过期。 (Unauthorized or token invalid/expired.)
 *       '403':
 *         description: 禁止访问（权限不足或账户非活动）。 (Forbidden (insufficient permissions or inactive account).)
 *       '404':
 *         description: 与令牌关联的用户在数据库中未找到。 (User associated with token not found in database.)
 *       '500':
 *         description: 服务器内部错误或配置问题。 (Internal server error or configuration issue.)
 * components:
 *   schemas:
 *     UserMeResponseData:
 *       type: object
 *       properties:
 *         id: { type: string, format: cuid }
 *         username: { type: string, nullable: true }
 *         email: { type: string, format: email, nullable: true }
 *         firstName: { type: string, nullable: true }
 *         lastName: { type: string, nullable: true }
 *         displayName: { type: string, nullable: true }
 *         avatar: { type: string, format: url, nullable: true }
 *         phone: { type: string, nullable: true }
 *         organization: { type: string, nullable: true }
 *         department: { type: string, nullable: true }
 *         workLocation: { type: string, nullable: true }
 *         isActive: { type: boolean }
 *         mustChangePassword: { type: boolean }
 *         lastLoginAt: { type: string, format: "date-time", nullable: true }
 *         createdAt: { type: string, format: "date-time" }
 *         updatedAt: { type: string, format: "date-time" }
 *         permissions: { type: array, items: { type: string } }
 *         client_id: { type: string, nullable: true }
 *     ApiResponseUserMe:
 *       allOf:
 *         - $ref: '#/components/schemas/ApiResponseBase'
 *         - type: object
 *           properties:
 *             data: { $ref: '#/components/schemas/UserMeResponseData' }
 */
// GET 处理函数，用于获取当前用户信息
// GET handler function for fetching current user information
async function getMeHandlerInternal(req: AuthenticatedRequest): Promise<NextResponse> {
  // 用户认证和权限检查已由 requirePermission 中间件处理
  // User authentication and permission check is handled by the requirePermission middleware
  const authenticatedUserPayload = req.user; // 从 AuthenticatedRequest 获取由中间件注入的用户信息
                                             // Get user information injected by the middleware from AuthenticatedRequest

  // 理论上，如果 requirePermission 正常工作，authenticatedUserPayload 和其 id 字段应该始终存在
  // Theoretically, if requirePermission works correctly, authenticatedUserPayload and its id field should always exist
  if (!authenticatedUserPayload || !authenticatedUserPayload.id) {
    // 这是一个服务器端/中间件配置问题
    // This is a server-side/middleware configuration issue
    throw new BaseError('User context not available after authentication. This indicates a server setup error.', 500, 'SERVER_SETUP_ERROR_ME');
  }

  // 从认证载荷中获取用户ID（即JWT的'sub'声明）
  // Get user ID from the authenticated payload (which is the 'sub' claim of the JWT)
  const userId = authenticatedUserPayload.id;
  console.log(`Fetching /me data for authenticated user ID: ${userId}`); // 记录正在获取哪个用户的数据 (Log which user's data is being fetched)

  // 使用从令牌中获取的 userId 从数据库检索用户信息
  // Retrieve user information from the database using the userId obtained from the token
  const user = await prisma.user.findUnique({
    where: { id: userId },
    // 选择需要的字段，排除 passwordHash
    // Select required fields, excluding passwordHash
    select: {
        id: true, username: true, email: true, firstName: true, lastName: true,
        displayName: true, avatar: true, phone: true, organization: true, department: true, workLocation: true,
        isActive: true, emailVerified: true, mustChangePassword: true,
        lastLoginAt: true, createdAt: true, updatedAt: true, createdBy: true, updatedBy: true,
    }
  });

  // 如果令牌有效，但用户在数据库中不存在（例如，用户在此期间被删除）
  // If the token is valid but the user does not exist in the database (e.g., user deleted during this period)
  if (!user) {
    throw new ResourceNotFoundError('User associated with this token not found.', 'USER_NOT_FOUND_FROM_TOKEN_ME', { userId });
  }

  // 检查用户账户是否仍处于活动状态
  // Check if the user account is still active
  if (!user.isActive) {
      // 账户未激活，抛出 AuthenticationError (或 AuthorizationError，取决于策略)
      // Account inactive, throw AuthenticationError (or AuthorizationError, depending on policy)
      throw new AuthenticationError('User account is inactive.', { userId }, 'ACCOUNT_INACTIVE_ME');
  }

  // 构建并返回选择性的用户信息，并合并来自令牌的权限和客户端ID
  // Construct and return selective user information, merging permissions and client_id from token
  const userResponse: UserMeResponse = {
    ...(user as Omit<User, 'passwordHash' | 'failedLoginAttempts' | 'lockedUntil'>), // Prisma 返回的用户数据 (User data from Prisma)
    permissions: authenticatedUserPayload.permissions || [], // 来自令牌的权限 (Permissions from token)
    client_id: authenticatedUserPayload.clientId,    // 来自令牌的客户端ID (Client ID from token)
  };

  // 返回遵循 ApiResponse 结构的成功响应
  // Return a successful response following the ApiResponse structure
  return NextResponse.json<ApiResponse<UserMeResponse>>({
    success: true,
    data: userResponse,
    message: "User profile fetched successfully."
  }, { status: 200 });
}

// 使用 withErrorHandling 和 requirePermission 包装处理函数
// Wrap the handler with withErrorHandling and requirePermission
// 'auth:me:read' 是执行此操作所需的权限名
// 'auth:me:read' is the permission name required to perform this action
export const GET = withErrorHandling(requirePermission('auth:me:read')(getMeHandlerInternal));

// 文件结束 (End Of File)
// EOF
