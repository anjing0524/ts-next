// 文件路径: app/api/v2/users/route.ts
// 描述: 管理用户 (创建和列表) (Manage Users - Create and List)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User, Prisma } from '@prisma/client'; // User type is used for excludeSensitiveUserFields helper
import bcrypt from 'bcrypt';
// import { JWTUtils } from '@/lib/auth/oauth2'; // REMOVED: No longer using V2 session tokens
import { isValidEmail } from '@/lib/utils';   // For email validation
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入 requirePermission

const MIN_PASSWORD_LENGTH = 8; // 密码最小长度 (Minimum password length)
const DEFAULT_PAGE_SIZE = 10;  // 列表分页的默认页面大小 (Default page size for listing)
const MAX_PAGE_SIZE = 100;     // 列表分页的最大页面大小 (Maximum page size for listing)

// --- 辅助函数 ---

/**
 * 错误响应辅助函数
 * @param message 错误消息
 * @param status HTTP状态码
 * @param errorCode 可选的错误代码
 * @returns NextResponse
 */
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'request_failed', message }, { status });
}

// isUserAdmin function is no longer needed, permission is handled by requirePermission middleware.

/**
 * 从用户对象中排除敏感字段
 * @param user User对象
 * @returns User对象 (不含敏感字段)
 */
function excludeSensitiveUserFields(user: User | Partial<User>): Partial<User> {
  const { passwordHash, ...rest } = user as any; // 'as any' to handle potential Partial<User>
  return rest;
}


// --- POST /api/v2/users (管理员创建用户) ---
// Wrapped with requirePermission for 'users:create'
async function createUserHandler(req: AuthenticatedRequest) {
  // 管理员认证和权限检查已由 requirePermission 处理
  // (Admin authentication and permission check is handled by requirePermission)
  const performingAdmin = req.user;
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to create a new user.`);

  // 1. 解析请求体 (Parse request body) - Was step 2
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (e) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  const {
    username, email, password,
    firstName, lastName, displayName, avatar, phone,
    organization, department, workLocation,
    isActive = true, // 默认激活 (Default to active)
    mustChangePassword = true, // 默认需要修改密码 (Default to must change password)
  } = requestBody;

  // 3. 输入数据验证 (Input data validation)
  if (!username || !email || !password) {
    return errorResponse('Username, email, and password are required.', 400, 'validation_error');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return errorResponse(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`, 400, 'validation_error');
  }
  if (!isValidEmail(email)) { // isValidEmail 来自 @lib/utils
    return errorResponse('Invalid email format.', 400, 'validation_error');
  }

  try {
    // 4. 检查用户名或邮箱是否已存在 (Check for existing username or email)
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ username: username.trim() }, { email: email.trim().toLowerCase() }] },
    });
    if (existingUser) {
      const conflictField = existingUser.username === username.trim() ? 'username' : 'email';
      return errorResponse(`${conflictField} already exists.`, 409, 'conflict');
    }

    // 5. 哈希密码 (Hash password)
    const passwordHash = await bcrypt.hash(password, 10);

    // 6. 创建用户记录 (Create User record)
    const newUser = await prisma.user.create({
      data: {
        username: username.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        displayName: displayName || username.trim(),
        avatar: avatar || null,
        phone: phone || null,
        organization: organization || null,
        department: department || null,
        workLocation: workLocation || null,
        isActive: Boolean(isActive),
        mustChangePassword: Boolean(mustChangePassword),
        failedLoginAttempts: 0,
        // emailVerified and phoneVerified default to false as per schema
      },
    });

    // 7. 返回响应 (Return response)
    return NextResponse.json(excludeSensitiveUserFields(newUser), { status: 201 }); // 201 Created

  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = (error.meta?.target as string[]) || ['field'];
      return errorResponse(`Conflict: The ${target.join(', ')} you entered is already in use.`, 409, 'conflict');
    }
    console.error(`Admin user creation error by ${performingAdmin?.id}:`, error);
    return errorResponse('An unexpected error occurred during user creation.', 500, 'server_error');
  }
}
export const POST = requirePermission('users:create', createUserHandler);


// --- GET /api/v2/users (管理员获取用户列表) ---
// Wrapped with requirePermission for 'users:list'
async function listUsersHandler(req: AuthenticatedRequest) {
  // 管理员认证和权限检查已由 requirePermission 处理
  const performingAdmin = req.user;
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) listing users.`);

  // 1. 处理查询参数 (Process query parameters for pagination, filtering, sorting) - Was step 2
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  let pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10);
  if (pageSize <= 0) pageSize = DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE; // 限制最大页面大小 (Limit max page size)

  const usernameQuery = searchParams.get('username');
  const emailQuery = searchParams.get('email');
  const isActiveQuery = searchParams.get('isActive'); // 'true', 'false', or null

  const sortBy = searchParams.get('sortBy') || 'createdAt'; // 默认按创建时间排序 (Default sort by createdAt)
  const sortOrderInput = searchParams.get('sortOrder') || 'desc'; // 默认降序 (Default descending)
  const sortOrder = (sortOrderInput.toLowerCase() === 'asc' || sortOrderInput.toLowerCase() === 'desc') ? sortOrderInput.toLowerCase() as Prisma.SortOrder : 'desc';


  // 构建 Prisma 查询条件 (Construct Prisma query conditions)
  const where: Prisma.UserWhereInput = {};
  if (usernameQuery) where.username = { contains: usernameQuery, mode: 'insensitive' };
  if (emailQuery) where.email = { contains: emailQuery, mode: 'insensitive' };
  if (isActiveQuery !== null && isActiveQuery !== undefined) {
    if (isActiveQuery.toLowerCase() === 'true') where.isActive = true;
    else if (isActiveQuery.toLowerCase() === 'false') where.isActive = false;
    // 如果是其他值，则忽略isActiveQuery (If other value, ignore isActiveQuery)
  }

  // 确保 sortBy 是 User 模型的一个有效字段 (Ensure sortBy is a valid field of User model)
  // 这是一个简化的检查，实际应用可能需要更严格的允许列表
  // (This is a simplified check, real app might need a stricter allow-list)
  const validSortByFields: (keyof User)[] = ['username', 'email', 'createdAt', 'updatedAt', 'lastLoginAt', 'displayName', 'firstName', 'lastName'];
  const safeSortBy = validSortByFields.includes(sortBy as keyof User) ? sortBy : 'createdAt';
  const orderBy: Prisma.UserOrderByWithRelationInput = { [safeSortBy]: sortOrder };

  try {
    // 2. 获取用户列表和总数 (Fetch users list and total count) - Was step 3
    const users = await prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const totalUsers = await prisma.user.count({ where });

    // 3. 返回响应 (Return response) - Was step 4
    return NextResponse.json({
      users: users.map(user => excludeSensitiveUserFields(user)), // 确保排除敏感字段
      total: totalUsers,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(totalUsers / pageSize),
    }, { status: 200 });

  } catch (error: any) {
    console.error(`Admin user listing error by ${performingAdmin?.id}:`, error);
    return errorResponse('An unexpected error occurred while listing users.', 500, 'server_error');
  }
}
export const GET = requirePermission('users:list', listUsersHandler);


// Declaration for isValidEmail from lib/utils if not globally available or via specific import type
// declare module '@/lib/utils' {
//   export function isValidEmail(email: string): boolean;
// }
