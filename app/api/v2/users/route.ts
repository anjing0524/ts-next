// 文件路径: app/api/v2/users/route.ts
// File path: app/api/v2/users/route.ts
// 描述: 此文件处理用户集合的 API 请求，包括创建用户 (POST) 和列出用户 (GET)。
// Description: This file handles API requests for the user collection, including creating users (POST) and listing users (GET).
// 使用 `requirePermission` 中间件来保护这些端点，确保只有具有适当权限的用户才能执行操作。
// It uses the `requirePermission` middleware to protect these endpoints, ensuring only users with appropriate permissions can perform actions.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Prisma ORM 客户端，用于数据库交互。 (Prisma ORM client for database interaction.)
import { User, Prisma } from '@prisma/client'; // Prisma 生成的类型 (Prisma generated types)
import bcrypt from 'bcrypt'; // bcrypt 库，用于密码哈希。 (bcrypt library for password hashing.)
import { requirePermission } from '@/lib/auth/middleware'; // 引入 requirePermission 高阶函数 (Import requirePermission Higher-Order Function)
import type { AuthenticatedRequest } from '@/lib/auth/types'; // 引入 AuthenticatedRequest 类型定义 (Import AuthenticatedRequest type definition)
import { userCreatePayloadSchema, userListQuerySchema, UserCreatePayload, UserListQuery } from './schemas'; // 导入 Zod 模式 (Import Zod schemas and inferred types)
import { ApiResponse } from '@/lib/types/api'; // 标准API响应类型 (Standard API response type)
import { ValidationError, BaseError } from '@/lib/errors'; // 自定义错误类 (Custom error classes)
import { withErrorHandling } from '@/lib/utils/error-handler'; // 错误处理高阶函数 (Error handling HOF)

// 定义获取用户列表时分页的默认页面大小。
// Define the default page size for pagination when fetching the user list.
const DEFAULT_PAGE_SIZE_CONST = 10;
// 定义获取用户列表时分页允许的最大页面大小，以防止滥用。
// Define the maximum allowed page size for pagination when fetching the user list, to prevent abuse.
const MAX_PAGE_SIZE_CONST = 100;

// 定义成功创建用户时返回的用户信息结构 (不含敏感信息)
// Define the structure of user information returned on successful user creation (without sensitive info)
type UserResponse = Omit<User, 'passwordHash'>;

// 定义成功获取用户列表时返回的数据结构
// Define the data structure returned on successful user list fetch
interface ListUsersResponse {
  users: UserResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}


// --- POST /api/v2/users (管理员创建新用户) ---
// --- POST /api/v2/users (Admin creates a new user) ---
// 此端点用于创建新用户，受到 `requirePermission('users:create')` 的保护。
// This endpoint is used to create new users and is protected by `requirePermission('users:create')`.
/**
 * @swagger
 * /api/v2/users:
 *   post:
 *     summary: 创建新用户 (Create New User)
 *     description: (需要 'users:create' 权限) 管理员通过此接口创建新的用户账户。
 *                  ((Requires 'users:create' permission) Admin creates a new user account via this interface.)
 *     tags: [用户管理 (User Management)]
 *     security:
 *       - bearerAuth: [] # 表明需要 Bearer token 认证 (Indicates Bearer token authentication is required)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserCreatePayload' # 参考 Zod 模式生成的类型 (Reference to Zod schema generated type)
 *     responses:
 *       '201':
 *         description: 用户创建成功。 (User created successfully.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseUser' # 标准成功响应包裹 UserResponse (Standard success response wrapping UserResponse)
 *       '400':
 *         description: 请求体验证失败或JSON格式错误。 (Request body validation failed or malformed JSON.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError'
 *       '401':
 *         description: 未经授权的访问。 (Unauthorized access.)
 *       '403':
 *         description: 禁止访问（权限不足）。 (Forbidden (insufficient permissions).)
 *       '409':
 *         description: 用户名或邮箱已存在冲突。 (Username or email already exists (conflict).)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError'
 *       '500':
 *         description: 服务器内部错误。 (Internal server error.)
 */
async function createUserHandlerInternal(req: AuthenticatedRequest): Promise<NextResponse> {
  const performingAdmin = req.user; // 从 AuthenticatedRequest 中获取执行操作的管理员信息 (Get admin info from AuthenticatedRequest)
  // It's better to get ip and userAgent from the original NextRequest if AuthenticatedRequest doesn't carry them.
  // Assuming 'req' has these properties or they can be accessed.
  const ipAddress = req.ip || req.headers?.get('x-forwarded-for');
  const userAgent = req.headers?.get('user-agent');

  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to create a new user.`);

  let requestBody;
  try {
    requestBody = await req.json();
  } catch (e: any) {
    await AuthorizationUtils.logAuditEvent({ // Audit: Invalid JSON
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        action: 'USER_CREATE_FAILURE_INVALID_JSON',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: 'Invalid JSON request body.',
        details: JSON.stringify({ error: e.message }),
    });
    throw new ValidationError('Invalid JSON request body.', { detail: e.message }, 'INVALID_JSON');
  }

  // 使用 Zod 进行输入数据验证
  // Use Zod for input data validation
  const validationResult = userCreatePayloadSchema.safeParse(requestBody);
  if (!validationResult.success) {
    await AuthorizationUtils.logAuditEvent({ // Audit: Payload validation failed
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        action: 'USER_CREATE_FAILURE_VALIDATION',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: 'User creation payload validation failed.',
        details: JSON.stringify({ issues: validationResult.error.flatten().fieldErrors, receivedBody: requestBody }),
    });
    throw new ValidationError('User creation payload validation failed.', { issues: validationResult.error.flatten().fieldErrors }, 'USER_VALIDATION_ERROR');
  }

  const {
    username, email, password, firstName, lastName, displayName, avatar,
    organization, department, isActive, mustChangePassword,
  } = validationResult.data as UserCreatePayload; // 类型断言为 UserCreatePayload (Type assertion to UserCreatePayload)

  // 检查用户名或邮箱是否已在数据库中存在 (冲突检查)
  // Check if username or email already exists in the database (conflict check)
  const trimmedUsername = username.trim();
  const trimmedEmail = email ? email.trim().toLowerCase() : null;

  const existingUserConditions: Prisma.UserWhereInput[] = [{ username: trimmedUsername }];
  if (trimmedEmail) {
    existingUserConditions.push({ email: trimmedEmail });
  }

  const existingUser = await prisma.user.findFirst({
    where: { OR: existingUserConditions },
  });

  if (existingUser) {
    const conflictField = existingUser.username === trimmedUsername ? 'username' : 'email';
    await AuthorizationUtils.logAuditEvent({ // Audit: Conflict
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        action: 'USER_CREATE_FAILURE_CONFLICT',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: `${conflictField} already exists.`,
        resourceType: 'User',
        resourceId: existingUser.id, // ID of the conflicting user
        details: JSON.stringify({ field: conflictField, triedUsername: trimmedUsername, triedEmail: trimmedEmail }),
    });
    throw new BaseError(`${conflictField} already exists. Please choose a different ${conflictField}.`, 409, 'CONFLICT_USER_EXISTS', { field: conflictField });
  }

  // 哈希密码
  // Hash the password
  let passwordHash;
  try {
    const saltRounds = 12;
    passwordHash = await bcrypt.hash(password, saltRounds);
  } catch (error: any) {
    await AuthorizationUtils.logAuditEvent({
      actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
      actorId: performingAdmin?.id || 'anonymous',
      action: 'USER_CREATE_FAILURE_PASSWORD_HASHING',
      status: 'FAILURE',
      ipAddress,
      userAgent,
      errorMessage: 'Password hashing failed.',
      details: JSON.stringify({ username: trimmedUsername, error: error.message }),
    });
    throw new BaseError('Password processing failed.', 500, 'PASSWORD_HASH_ERROR');
  }

  // 在数据库中创建用户记录
  // Create the user record in the database
  let newUser;
  try {
    newUser = await prisma.user.create({
      data: {
        username: trimmedUsername,
      email: trimmedEmail,
      passwordHash,
      firstName: firstName || null,
      lastName: lastName || null,
      displayName: displayName || trimmedUsername,
      avatar: avatar || null,
      organization: organization || null,
      department: department || null,
      isActive: Boolean(isActive),
      mustChangePassword: Boolean(mustChangePassword),
      createdBy: performingAdmin?.id,
      failedLoginAttempts: 0,
    },
    select: { // 选择返回的字段，排除 passwordHash (Select fields to return, excluding passwordHash)
      id: true, username: true, email: true, firstName: true, lastName: true,
      displayName: true, avatar: true, organization: true, department: true,
      isActive: true, mustChangePassword: true, createdAt: true, updatedAt: true, createdBy: true,
      lastLoginAt: true, // 确保与 UserResponse 类型匹配 (Ensure it matches UserResponse type)
      phone: true, workLocation: true, emailVerified: true, // 确保与 UserResponse 类型匹配 (Ensure it matches UserResponse type)
    }
    });
  } catch (error: any) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        action: 'USER_CREATE_FAILURE_DB_ERROR',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: 'Failed to create user in database.',
        details: JSON.stringify({ username: trimmedUsername, email: trimmedEmail, error: error.message }),
    });
    // Prisma specific error codes could be checked here for more detail if needed
    throw new BaseError('Failed to create user due to a database issue.', 500, 'DB_CREATE_USER_ERROR');
  }

  // Audit successful user creation
  await AuthorizationUtils.logAuditEvent({
      actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
      actorId: performingAdmin?.id || 'anonymous', // ID of the admin performing the action
      userId: performingAdmin?.id, // Admin's ID
      action: 'USER_CREATE_SUCCESS',
      status: 'SUCCESS',
      resourceType: 'User',
      resourceId: newUser.id, // ID of the newly created user
      ipAddress,
      userAgent,
      details: JSON.stringify({
          createdUserId: newUser.id,
          username: newUser.username,
          email: newUser.email,
          isActive: newUser.isActive,
          mustChangePassword: newUser.mustChangePassword,
      }),
  });

  // 返回遵循 ApiResponse 结构的成功响应
  // Return a successful response following the ApiResponse structure
  return NextResponse.json<ApiResponse<UserResponse>>({
    success: true,
    data: newUser as UserResponse, // newUser 已通过 select 塑形 (newUser is already shaped by select)
    message: "User created successfully."
  }, { status: 201 });
}
// 使用 withErrorHandling 包装 createUserHandlerInternal，并与 'users:create' 权限绑定
// Wrap createUserHandlerInternal with withErrorHandling and bind with 'users:create' permission
// Need to import AuthorizationUtils to make it available in this scope
import { AuthorizationUtils } from '@/lib/auth/oauth2'; // Assuming this is the correct path

export const POST = requirePermission('users:create')(withErrorHandling(createUserHandlerInternal));


// --- GET /api/v2/users (管理员获取用户列表) ---
// --- GET /api/v2/users (Admin gets user list) ---
// 此端点用于获取用户列表，支持分页、过滤和排序。
// This endpoint is used to get a list of users, supporting pagination, filtering, and sorting.
// 受到 `requirePermission('users:list')` 的保护。
// Protected by `requirePermission('users:list')`.
/**
 * @swagger
 * /api/v2/users:
 *   get:
 *     summary: 获取用户列表 (Get User List)
 *     description: (需要 'users:list' 权限) 管理员获取用户列表，支持分页、过滤和排序。
 *                  ((Requires 'users:list' permission) Admin gets a list of users, with support for pagination, filtering, and sorting.)
 *     tags: [用户管理 (User Management)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserListQueryPage'
 *       - $ref: '#/components/parameters/UserListQueryPageSize'
 *       - $ref: '#/components/parameters/UserListQueryUsername'
 *       // ... 其他查询参数的引用 (references to other query parameters)
 *     responses:
 *       '200':
 *         description: 成功获取用户列表。 (Successfully fetched user list.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseListUsers' # 标准成功响应包裹 ListUsersResponse (Standard success response wrapping ListUsersResponse)
 *       '400':
 *         description: 无效的查询参数。 (Invalid query parameters.)
 *       '401':
 *         description: 未经授权。 (Unauthorized.)
 *       '403':
 *         description: 禁止访问（权限不足）。 (Forbidden (insufficient permissions).)
 */
async function listUsersHandlerInternal(req: AuthenticatedRequest): Promise<NextResponse> {
  const performingAdmin = req.user;
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) listing users.`);

  const { searchParams } = new URL(req.url);
  const queryParamsRaw: Record<string, string | string[] | undefined> = {};
  searchParams.forEach((value, key) => {
    // 处理可能重复的查询参数 (例如 ?isActive=true&isActive=false，虽然不常见)
    // Handle potentially repeated query parameters (e.g., ?isActive=true&isActive=false, though uncommon)
    const existing = queryParamsRaw[key];
    if (existing) {
        if (Array.isArray(existing)) {
            existing.push(value);
        } else {
            queryParamsRaw[key] = [existing, value];
        }
    } else {
        queryParamsRaw[key] = value;
    }
  });


  const validationResult = userListQuerySchema.safeParse(queryParamsRaw);
  if (!validationResult.success) {
    // Zod 验证失败，抛出 ValidationError
    // Zod validation failed, throw ValidationError
    throw new ValidationError('User list query validation failed.', { issues: validationResult.error.flatten().fieldErrors }, 'USER_LIST_VALIDATION_ERROR');
  }

  let {
    page, pageSize, username: usernameQuery, email: emailQuery,
    isActive: isActiveQuery, sortBy, sortOrder
  } = validationResult.data as UserListQuery; // 类型断言 (Type assertion)

  pageSize = Math.min(pageSize ?? DEFAULT_PAGE_SIZE_CONST, MAX_PAGE_SIZE_CONST);
  if ((pageSize ?? DEFAULT_PAGE_SIZE_CONST) <=0) pageSize = DEFAULT_PAGE_SIZE_CONST;

  const where: Prisma.UserWhereInput = {};
  if (usernameQuery) where.username = { contains: usernameQuery, mode: 'insensitive' };
  if (emailQuery) where.email = { contains: emailQuery, mode: 'insensitive' };
  if (isActiveQuery !== undefined) where.isActive = isActiveQuery;

  const validSortByFields: (keyof User)[] = ['username', 'email', 'createdAt', 'updatedAt', 'lastLoginAt', 'displayName', 'firstName', 'lastName'];
  const safeSortBy = validSortByFields.includes(sortBy as keyof User) ? sortBy : 'createdAt';
  const orderBy: Prisma.UserOrderByWithRelationInput = { [safeSortBy]: sortOrder };

  const usersRaw = await prisma.user.findMany({
    where, orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: { // 确保排除敏感字段 (Ensure sensitive fields are excluded)
      id: true, username: true, email: true, firstName: true, lastName: true,
      displayName: true, avatar: true, organization: true, department: true,
      isActive: true, mustChangePassword: true, createdAt: true, updatedAt: true,
      createdBy: true, lastLoginAt: true, phone: true, workLocation: true, emailVerified: true,
    }
  });
  const totalUsers = await prisma.user.count({ where });

  // 将 usersRaw 转换为 UserResponse[] (如果 select 不足以保证类型匹配)
  // Convert usersRaw to UserResponse[] (if select isn't enough to guarantee type match)
  const users: UserResponse[] = usersRaw as UserResponse[];


  return NextResponse.json<ApiResponse<ListUsersResponse>>({
    success: true,
    data: {
      users,
      total: totalUsers,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(totalUsers / pageSize),
    },
    message: "Users listed successfully."
  }, { status: 200 });
}
// 使用 withErrorHandling 包装 listUsersHandlerInternal，并与 'users:list' 权限绑定
// Wrap listUsersHandlerInternal with withErrorHandling and bind with 'users:list' permission
export const GET = requirePermission('users:list')(withErrorHandling(listUsersHandlerInternal));

// 文件结束 (End Of File)
// EOF
