// 文件路径: app/api/v2/auth/register/route.ts
// File path: app/api/v2/auth/register/route.ts
// 描述: 管理员创建新用户端点
// Description: Admin creates new user endpoint

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User, Prisma } from '@prisma/client'; // Prisma 类型 (Prisma types)
import bcrypt from 'bcrypt'; // 用于密码哈希 (For password hashing)
import { requirePermission } from '@/lib/auth/middleware'; // 引入 requirePermission HOF (Import requirePermission HOF)
import type { AuthenticatedRequest } from '@/lib/auth/types'; // 引入 AuthenticatedRequest 类型 (Import AuthenticatedRequest type)
import { userCreatePayloadSchema, UserCreatePayload } from '../users/schemas'; // 导入用户创建的Zod模式和类型 (Import Zod schema and type for user creation from users API)
import { ApiResponse } from '@/lib/types/api'; // 标准API响应类型 (Standard API response type)
import { ValidationError, BaseError } from '@/lib/errors'; // 自定义错误类 (Custom error classes)
import { withErrorHandling } from '@/lib/utils/error-handler'; // 错误处理高阶函数 (Error handling HOF)

// 定义成功创建用户时返回的用户信息结构 (不含敏感信息)
// Define the structure of user information returned on successful user creation (without sensitive info)
// UserResponse 将从 app/api/v2/users/schemas.ts 或直接从 Prisma select 构建
// UserResponse will be constructed from Prisma select or could be imported from app/api/v2/users/schemas.ts if defined there
type UserRegistrationResponse = Omit<User, 'passwordHash' | 'failedLoginAttempts' | 'lockedUntil'>;


/**
 * @swagger
 * /api/v2/auth/register:
 *   post:
 *     summary: 管理员注册新用户 (Admin Registers New User)
 *     description: (需要 'auth:register' 权限) 管理员通过此接口创建新的用户账户。
 *                  ((Requires 'auth:register' permission) Admin creates a new user account via this interface.)
 *     tags: [认证 (Authentication)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserCreatePayload'
 *     responses:
 *       '201':
 *         description: 用户注册成功。 (User registered successfully.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseUserRegistration'
 *       '400':
 *         description: 请求体验证失败或JSON格式错误。 (Request body validation failed or malformed JSON.)
 *       '401':
 *         description: 未经授权的访问。 (Unauthorized access.)
 *       '403':
 *         description: 禁止访问（权限不足）。 (Forbidden (insufficient permissions).)
 *       '409':
 *         description: 用户名或邮箱已存在冲突。 (Username or email already exists (conflict).)
 *       '500':
 *         description: 服务器内部错误。 (Internal server error.)
 * components:
 *   schemas:
 *     UserCreatePayload: # 复用 users API 的 schema 定义 (Reuse schema definition from users API)
 *       type: object
 *       required: [username, email, password]
 *       properties:
 *         username: { type: string }
 *         email: { type: string, format: email }
 *         password: { type: string, minLength: 8 }
 *         firstName: { type: string, nullable: true }
 *         lastName: { type: string, nullable: true }
 *         displayName: { type: string, nullable: true }
 *         avatar: { type: string, format: url, nullable: true }
 *         phone: { type: string, nullable: true }
 *         organization: { type: string, nullable: true }
 *         department: { type: string, nullable: true }
 *         workLocation: { type: string, nullable: true }
 *         isActive: { type: boolean, default: true }
 *         mustChangePassword: { type: boolean, default: true }
 *     UserRegistrationResponseData:
 *       type: object
 *       properties:
 *         id: { type: string, format: cuid }
 *         username: { type: string, nullable: true }
 *         email: { type: string, format: email, nullable: true }
 *         # ... 其他 UserRegistrationResponse 中的字段 ...
 *         isActive: { type: boolean }
 *         mustChangePassword: { type: boolean }
 *         createdAt: { type: string, format: "date-time" }
 *         updatedAt: { type: string, format: "date-time" }
 *     ApiResponseUserRegistration:
 *       allOf:
 *         - $ref: '#/components/schemas/ApiResponseBase'
 *         - type: object
 *           properties:
 *             data: { $ref: '#/components/schemas/UserRegistrationResponseData' }
 *     ApiResponseBase:
 *       type: object
 *       properties:
 *         success: { type: boolean }
 *         message: { type: string, nullable: true }
 *     ApiResponseError:
 *       type: object
 *       properties:
 *         success: { type: boolean, example: false }
 *         error: { $ref: '#/components/schemas/ApiError' }
 *     ApiError:
 *       type: object
 *       properties:
 *         code: { type: string }
 *         message: { type: string }
 *         details: { type: object, additionalProperties: true, nullable: true }
 */
// POST 处理函数，用于管理员创建新用户，由 withErrorHandling 包装
// POST handler for admin creating a new user, wrapped by withErrorHandling
async function registerUserHandlerInternal(req: AuthenticatedRequest): Promise<NextResponse> {
  const adminUser = req.user;
  console.log(`Admin (ID: ${adminUser?.id}, ClientID: ${adminUser?.clientId}) is registering a new user (permission 'auth:register' granted).`);

  let requestBody;
  try {
    requestBody = await req.json();
  } catch (e) {
    // 无效的JSON，抛出 ValidationError
    // Invalid JSON, throw ValidationError
    throw new ValidationError('Invalid JSON request body.', { detail: (e as Error).message }, 'INVALID_JSON_BODY');
  }

  // 使用 Zod 模式验证请求体
  // Validate request body using Zod schema
  const validationResult = userCreatePayloadSchema.safeParse(requestBody);
  if (!validationResult.success) {
    // Zod 验证失败，抛出 ValidationError
    // Zod validation failed, throw ValidationError
    throw new ValidationError('User registration payload validation failed.', { issues: validationResult.error.flatten().fieldErrors }, 'REGISTRATION_VALIDATION_ERROR');
  }

  const {
    username, email, password, firstName, lastName, displayName, avatar, phone,
    organization, department, workLocation,
    isActive,
    mustChangePassword,
  } = validationResult.data as UserCreatePayload; // 类型断言 (Type assertion)

  // 检查用户名或邮箱是否已存在
  // Check if username or email already exists
  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim().toLowerCase(); // 邮箱统一小写处理 (Standardize email to lowercase)

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ username: trimmedUsername }, { email: trimmedEmail }] },
  });

  if (existingUser) {
    const conflictField = existingUser.username === trimmedUsername ? 'username' : 'email';
    // 用户名或邮箱冲突，抛出 BaseError (或 ConflictError 如果已定义)
    // Username or email conflict, throw BaseError (or ConflictError if defined)
    throw new BaseError(`${conflictField} already exists.`, 409, 'CONFLICT_USER_EXISTS', { field: conflictField });
  }

  // 安全地哈希密码
  // Securely hash the password
  const passwordHash = await bcrypt.hash(password, 10);

  // 创建新用户记录
  // Create new User record
  const newUser = await prisma.user.create({
    data: {
      username: trimmedUsername,
      email: trimmedEmail,
      passwordHash,
      firstName: firstName || null,
      lastName: lastName || null,
      displayName: displayName || trimmedUsername,
      avatar: avatar || null,
      phone: phone || null,
      organization: organization || null,
      department: department || null,
      workLocation: workLocation || null,
      isActive: Boolean(isActive),
      mustChangePassword: Boolean(mustChangePassword),
      failedLoginAttempts: 0,
      createdBy: adminUser?.id, // 记录创建者ID (Record creator ID)
    },
    // 选择返回给客户端的字段，确保不包含敏感信息
    // Select fields to return to the client, ensuring no sensitive info is included
    select: {
        id: true, username: true, email: true, firstName: true, lastName: true,
        displayName: true, avatar: true, phone: true, organization: true, department: true, workLocation: true,
        isActive: true, emailVerified: true, mustChangePassword: true,
        lastLoginAt: true, createdAt: true, updatedAt: true, createdBy: true, updatedBy: true,
    }
  });

  // 返回遵循 ApiResponse 结构的成功响应
  // Return a successful response following the ApiResponse structure
  return NextResponse.json<ApiResponse<UserRegistrationResponse>>({
    success: true,
    data: newUser as UserRegistrationResponse, // newUser 已通过 select 塑形 (newUser is already shaped by select)
    message: "User registered successfully by admin."
  }, { status: 201 });
}

// 使用 withErrorHandling 包装处理函数，并绑定 'auth:register' 权限
// Wrap the handler with withErrorHandling and bind the 'auth:register' permission
export const POST = requirePermission('auth:register')(withErrorHandling(registerUserHandlerInternal));

// isValidEmail 工具函数不再需要在此文件中声明，因其已由 Zod schema 处理
// The isValidEmail utility function is no longer needed for declaration in this file as it's handled by Zod schema.
// User 类型在此文件中未显式用作顶级类型，主要通过 Prisma Client 和推断类型交互。
// The User type is not explicitly used as a top-level type in this file; interaction is mainly via Prisma Client and inferred types.

// 文件结束 (End Of File)
// EOF
