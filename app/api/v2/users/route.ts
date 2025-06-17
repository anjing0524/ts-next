// 文件路径: app/api/v2/users/route.ts
// 描述: 此文件处理用户集合的 API 请求，包括创建用户 (POST) 和列出用户 (GET)。
// 使用 `requirePermission` 中间件来保护这些端点，确保只有具有适当权限的用户才能执行操作。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Prisma ORM 客户端，用于数据库交互。 // Corrected import to use the alias
import { User, Prisma } from '@prisma/client'; // Prisma 生成的类型，User 用于类型提示，Prisma 用于高级查询类型。
import bcrypt from 'bcrypt'; // bcrypt 库，用于密码哈希。
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入 requirePermission 高阶函数和 AuthenticatedRequest 类型。
// Zod is imported from schemas.ts
// import { z } from 'zod';
import { userCreatePayloadSchema, userListQuerySchema } from './schemas'; // Import Zod schemas

// 定义获取用户列表时分页的默认页面大小。
const DEFAULT_PAGE_SIZE_CONST = 10; // Renamed to avoid conflict with schema default if any
// 定义获取用户列表时分页允许的最大页面大小，以防止滥用。
const MAX_PAGE_SIZE_CONST = 100; // Renamed

// --- 辅助函数 ---

/**
 * 创建并返回一个标准化的 JSON 错误响应。
 * @param message - 错误描述信息。
 * @param status - HTTP 状态码。
 * @param errorCode - (可选) 应用特定的错误代码字符串。
 * @returns NextResponse 对象，包含 JSON 格式的错误信息。
 */
function errorResponse(message: string, status: number, errorCode?: string): NextResponse {
  return NextResponse.json({ error: errorCode || 'request_failed', message }, { status });
}

// `isUserAdmin` 函数不再需要，因为权限检查现在由 `requirePermission` 中间件统一处理。
// 之前的逻辑可能是检查请求者是否是管理员，现在通过检查请求者是否具有如 'users:create' 或 'users:list' 等权限来实现。

/**
 * 从用户对象中排除敏感字段 (如 passwordHash)，以便安全地返回给客户端。
 * @param user - User 对象或部分 User 对象。
 * @returns 一个新的对象，其中不包含 passwordHash 字段。
 */
function excludeSensitiveUserFields(user: User | Partial<User>): Partial<User> {
  // 使用对象解构排除 passwordHash 字段。
  // 'as any' 用于处理 User 和 Partial<User> 类型，因为 passwordHash 可能在 Partial<User> 中不存在。
  const { passwordHash, ...rest } = user as any;
  return rest; // 返回剩余的字段
}


// --- POST /api/v2/users (管理员创建新用户) ---
// 此端点用于创建新用户，受到 `requirePermission('users:create')` 的保护。
// 只有拥有 'users:create' 权限的用户 (通常是管理员) 才能调用此接口。
async function createUserHandler(req: AuthenticatedRequest): Promise<NextResponse> {
  const performingAdmin = req.user;
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to create a new user.`);

  let requestBody;
  try {
    requestBody = await req.json();
  } catch (e) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  // 步骤 2: 使用 Zod 进行输入数据验证 (schema imported from ./schemas)
  const validationResult = userCreatePayloadSchema.safeParse(requestBody);
  if (!validationResult.success) {
    // 返回400错误，包含Zod解析出的具体错误信息
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }

  // 从验证结果中获取处理过的数据 (Validated data)
  const {
    username, email, password, firstName, lastName, displayName, avatar,
    organization, department, isActive, mustChangePassword, /* phone (if added) */
  } = validationResult.data;


  try {
    // 步骤 3: 检查用户名或邮箱是否已在数据库中存在 (冲突检查)。
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
      return errorResponse(`${conflictField} already exists. Please choose a different ${conflictField}.`, 409, 'conflict');
    }

    // 步骤 4: 哈希密码。
    const saltRounds = 12; // Recommended salt rounds for bcrypt
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 步骤 5: 在数据库中创建用户记录。
    const newUser = await prisma.user.create({
      data: {
        username: trimmedUsername,
        email: trimmedEmail,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        displayName: displayName || trimmedUsername,
        avatar: avatar || null,
        // phone: phone || null, // if added to schema and validation
        organization: organization || null,
        department: department || null,
        isActive: Boolean(isActive),
        mustChangePassword: Boolean(mustChangePassword),
        createdBy: performingAdmin?.id, // 记录创建者ID (Record creator ID)
        failedLoginAttempts: 0,
      },
      // 选择返回给客户端的字段 (Select fields to return to client)
      select: {
        id: true, username: true, email: true, firstName: true, lastName: true,
        displayName: true, avatar: true, organization: true, department: true,
        isActive: true, mustChangePassword: true, createdAt: true, updatedAt: true, createdBy: true,
      }
    });

    // 步骤 6: 返回成功响应。
    // (No need to call excludeSensitiveUserFields as `select` already handles it)
    return NextResponse.json(newUser, { status: 201 });

  } catch (error: any) {
    // 错误处理：
    console.error(`Admin user creation error by ${performingAdmin?.id}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = (error.meta?.target as string[]) || ['field'];
      return errorResponse(`Conflict: The ${target.join(', ')} you entered is already in use.`, 409, 'conflict');
    }
    return errorResponse('An unexpected error occurred during user creation. Please try again later.', 500, 'server_error');
  }
}
// 将 createUserHandler 函数与 'users:create' 权限绑定，并导出为 POST 请求的处理函数。
export const POST = requirePermission('users:create')(createUserHandler); // Corrected: wrap with HOF


// --- GET /api/v2/users (管理员获取用户列表) ---
// 此端点用于获取用户列表，支持分页、过滤和排序。
// 受到 `requirePermission('users:list')` 的保护。
async function listUsersHandler(req: AuthenticatedRequest): Promise<NextResponse> {
  const performingAdmin = req.user;
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) listing users.`);

  // 步骤 1: 使用 Zod 解析和验证查询参数。
  const { searchParams } = new URL(req.url);
  const queryParamsRaw: Record<string, string> = {};
  searchParams.forEach((value, key) => { queryParamsRaw[key] = value; });

  const validationResult = userListQuerySchema.safeParse(queryParamsRaw);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }

  let {
    page,
    pageSize,
    username: usernameQuery,
    email: emailQuery,
    isActive: isActiveQuery,
    sortBy,
    sortOrder
  } = validationResult.data;

  // Apply page size constraints
  pageSize = Math.min(pageSize ?? DEFAULT_PAGE_SIZE_CONST, MAX_PAGE_SIZE_CONST);
  if ((pageSize ?? DEFAULT_PAGE_SIZE_CONST) <=0) pageSize = DEFAULT_PAGE_SIZE_CONST;


  // 步骤 2: 构建 Prisma 查询条件 (`where` 和 `orderBy`)。
  const where: Prisma.UserWhereInput = {};
  if (usernameQuery) where.username = { contains: usernameQuery, mode: 'insensitive' };
  if (emailQuery) where.email = { contains: emailQuery, mode: 'insensitive' };
  if (isActiveQuery !== undefined) where.isActive = isActiveQuery; // Already boolean from Zod transform

  const validSortByFields: (keyof User)[] = ['username', 'email', 'createdAt', 'updatedAt', 'lastLoginAt', 'displayName', 'firstName', 'lastName'];
  const safeSortBy = validSortByFields.includes(sortBy as keyof User) ? sortBy : 'createdAt';
  const orderBy: Prisma.UserOrderByWithRelationInput = { [safeSortBy]: sortOrder };

  try {
    // 步骤 3: 从数据库获取用户列表和用户总数。
    const users = await prisma.user.findMany({
      where,    // 应用过滤条件
      orderBy,  // 应用排序条件
      skip: (page - 1) * pageSize, // 计算跳过的记录数，用于分页
      take: pageSize,             // 获取指定数量的记录
      select: { // 确保排除敏感字段
        id: true, username: true, email: true, firstName: true, lastName: true,
        displayName: true, avatar: true, organization: true, department: true,
        isActive: true, mustChangePassword: true, createdAt: true, updatedAt: true, createdBy: true, lastLoginAt: true,
        // Explicitly exclude passwordHash, even though it's not selected above, good practice
        // No, select *only* includes these. passwordHash is not here.
      }
    });
    // 使用 `prisma.user.count` 获取满足过滤条件的用户总数，用于计算总页数。
    const totalUsers = await prisma.user.count({ where });

    // 步骤 4: 返回格式化的响应数据。
    // excludeSensitiveUserFields is not strictly needed if `select` is used correctly.
    return NextResponse.json({
      users: users, // users are already shaped by `select`
      total: totalUsers,          // 用户总数。
      page: page,                 // 当前页码。
      pageSize: pageSize,         // 每页数量。
      totalPages: Math.ceil(totalUsers / pageSize), // 总页数。
    }, { status: 200 }); // HTTP 200 OK。

  } catch (error: any) {
    // 错误处理：记录错误并返回500服务器错误。
    console.error(`Admin user listing error by ${performingAdmin?.id}:`, error);
    return errorResponse('An unexpected error occurred while listing users. Please try again later.', 500, 'server_error');
  }
}
// 将 listUsersHandler 函数与 'users:list' 权限绑定，并导出为 GET 请求的处理函数。
export const GET = requirePermission('users:list')(listUsersHandler); // Corrected: wrap with HOF


// 类型声明，用于在其他模块中正确提示 isValidEmail 函数 (如果需要)。
// 通常，如果 isValidEmail 是从 @/lib/utils 正确导出的，并且 tsconfig Paths 配置正确，
// 则不需要在此处重新声明。这更像是一个占位符或提醒。
// declare module '@/lib/utils' {
//   export function isValidEmail(email: string): boolean;
// }
