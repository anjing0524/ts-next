// 文件路径: app/api/v2/users/route.ts
// 描述: 此文件处理用户集合的 API 请求，包括创建用户 (POST) 和列出用户 (GET)。
// 使用 `requirePermission` 中间件来保护这些端点，确保只有具有适当权限的用户才能执行操作。

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma ORM 客户端，用于数据库交互。
import { User, Prisma } from '@prisma/client'; // Prisma 生成的类型，User 用于类型提示，Prisma 用于高级查询类型。
import bcrypt from 'bcrypt'; // bcrypt 库，用于密码哈希。
// import { JWTUtils } from '@/lib/auth/oauth2'; // REMOVED: 不再使用 V2 会话令牌。认证和授权通过 OAuth Bearer Token 和 requirePermission 中间件处理。
// import { isValidEmail } from '@/lib/utils';   // 辅助函数，用于验证电子邮件格式。 // Zod will handle email validation
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入 requirePermission 高阶函数和 AuthenticatedRequest 类型。
import { z } from 'zod'; // 引入 Zod 用于数据校验
import bcrypt from 'bcrypt'; // bcrypt 库，用于密码哈希。
// import { prisma } from '@/lib/prisma'; // prisma is already imported globally in the original file as "prisma" not "db"

// 定义密码的最小长度 - Zod schema will handle this.
// const MIN_PASSWORD_LENGTH = 8;
// 定义获取用户列表时分页的默认页面大小。
const DEFAULT_PAGE_SIZE = 10;
// 定义获取用户列表时分页允许的最大页面大小，以防止滥用。
const MAX_PAGE_SIZE = 100;

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
  // `requirePermission` 中间件已经处理了认证和权限检查。
  // `req.user` 包含了执行此操作的已认证用户 (管理员) 的信息。
  const performingAdmin = req.user; // 获取执行操作的管理员信息
  // 日志记录管理员尝试创建用户的行为，有助于审计和追踪。
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to create a new user.`);

  // 步骤 1: 解析请求体 (JSON 格式)
  let requestBody;
  try {
    requestBody = await req.json(); // 从请求中异步读取并解析 JSON 数据。
  } catch (e) {
    // 如果请求体不是有效的 JSON，则返回400错误。
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  // 从请求体中解构出用户相关字段。
  // 为 isActive 和 mustChangePassword 提供默认值。
  // const {
  //   username, email, password, // 必需字段 // These will come from validatedData
  //   firstName, lastName, displayName, avatar, phone, // 可选个人信息字段
  //   organization, department, workLocation, // 可选工作相关字段
  //   isActive = true,        // 用户状态，默认为 true (激活)
  //   mustChangePassword = true, // 是否需要在下次登录时强制修改密码，默认为 true
  // } = requestBody; // No longer directly destructuring from requestBody

  // Zod schema for password policy (moved to top level of the module)
  const passwordPolicySchema = z.string()
    .min(8, "Password must be at least 8 characters long / 密码长度至少为8位")
    .max(64, "Password must be at most 64 characters long / 密码长度最多为64位")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter / 密码必须包含至少一个大写字母")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter / 密码必须包含至少一个小写字母")
    .regex(/[0-9]/, "Password must contain at least one number / 密码必须包含至少一个数字")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character / 密码必须包含至少一个特殊字符");

  // Zod schema for user creation payload (moved to top level of the module)
  const userCreatePayloadSchema = z.object({
    username: z.string().min(3, "Username must be at least 3 characters long / 用户名长度至少为3位"),
    password: passwordPolicySchema,
    email: z.string().email("Invalid email address / 无效的电子邮件地址").optional().nullable(),
    firstName: z.string().optional().nullable(),
    lastName: z.string().optional().nullable(),
    displayName: z.string().optional().nullable(), // Added displayName
    avatar: z.string().url("Invalid URL format for avatar / 头像URL格式无效").optional().nullable(), // Added avatar with URL validation
    // phone: z.string().regex(/^\+[1-9]\d{1,14}$/, "Invalid phone number format / 无效的电话号码格式").optional().nullable(), // Example phone validation
    organization: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    // workLocation: z.string().optional().nullable(), // Assuming this is not in User model directly
    isActive: z.boolean().default(true).optional(),
    mustChangePassword: z.boolean().default(true).optional(),
  });

  // 步骤 2: 使用 Zod 进行输入数据验证
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
  // 管理员认证和权限检查已由 `requirePermission` 中间件处理。
  const performingAdmin = req.user; // 获取执行操作的管理员信息。
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) listing users.`);

  // 步骤 1: 处理查询参数 (用于分页、过滤、排序)。
  const { searchParams } = new URL(req.url); // 解析 URL 中的查询参数。

  // 分页参数: page (页码) 和 pageSize (每页数量)。
  // Define DEFAULT_PAGE_SIZE and MAX_PAGE_SIZE if not already defined at module level
  const DEFAULT_PAGE_SIZE = 10;
  const MAX_PAGE_SIZE = 100;

  const page = parseInt(searchParams.get('page') || '1', 10); // 默认为第1页。
  let pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10); // 默认为 DEFAULT_PAGE_SIZE。
  if (pageSize <= 0) pageSize = DEFAULT_PAGE_SIZE; // 防止 pageSize 小于等于0。
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE; // 限制最大页面大小，防止请求过多数据。

  // 过滤参数: username (按用户名过滤), email (按邮箱过滤), isActive (按用户状态过滤)。
  const usernameQuery = searchParams.get('username');
  const emailQuery = searchParams.get('email');
  const isActiveQuery = searchParams.get('isActive'); // 可能为 'true', 'false', 或 null/undefined。

  // 排序参数: sortBy (排序字段) 和 sortOrder (排序顺序 'asc' 或 'desc')。
  const sortBy = searchParams.get('sortBy') || 'createdAt'; // 默认按用户创建时间排序。
  const sortOrderInput = searchParams.get('sortOrder') || 'desc'; // 默认降序排列。
  // 验证 sortOrder 是否为 'asc' 或 'desc'，否则默认为 'desc'。
  const sortOrder = (sortOrderInput.toLowerCase() === 'asc' || sortOrderInput.toLowerCase() === 'desc') ? sortOrderInput.toLowerCase() as Prisma.SortOrder : 'desc';


  // 步骤 2: 构建 Prisma 查询条件 (`where` 和 `orderBy`)。
  const where: Prisma.UserWhereInput = {}; // 初始化空的 `where` 条件对象。
  // 如果提供了 usernameQuery，则添加用户名模糊查询条件 (不区分大小写)。
  if (usernameQuery) where.username = { contains: usernameQuery, mode: 'insensitive' };
  // 如果提供了 emailQuery，则添加邮箱模糊查询条件 (不区分大小写)。
  if (emailQuery) where.email = { contains: emailQuery, mode: 'insensitive' };
  // 如果提供了 isActiveQuery，则根据其值 (true/false) 添加用户状态过滤条件。
  if (isActiveQuery !== null && isActiveQuery !== undefined) {
    if (isActiveQuery.toLowerCase() === 'true') where.isActive = true;
    else if (isActiveQuery.toLowerCase() === 'false') where.isActive = false;
    // 如果 isActiveQuery 是其他无效值，则忽略此过滤条件。
  }

  // 确保 sortBy 参数是 User 模型的一个有效字段，以防止注入或错误。
  // `validSortByFields` 定义了允许排序的字段列表。
  const validSortByFields: (keyof User)[] = ['username', 'email', 'createdAt', 'updatedAt', 'lastLoginAt', 'displayName', 'firstName', 'lastName'];
  // 如果 sortBy 无效，则默认使用 'createdAt'。
  const safeSortBy = validSortByFields.includes(sortBy as keyof User) ? sortBy : 'createdAt';
  // 构建 Prisma `orderBy` 对象。
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
