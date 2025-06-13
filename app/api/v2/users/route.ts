// 文件路径: app/api/v2/users/route.ts
// 描述: 管理用户 (创建和列表) (Manage Users - Create and List)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { JWTUtils } from '@/lib/auth/oauth2'; // For V2 Auth session token verification
import { isValidEmail } from '@/lib/utils';   // For email validation

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

/**
 * 模拟管理员检查 (Simulated Admin Check)
 * 在实际应用中，这里应进行基于角色/权限的检查
 * @param userId 要检查的用户ID
 * @returns Promise<boolean> 如果是管理员则为true
 */
async function isUserAdmin(userId: string): Promise<boolean> {
  // TODO: 实现真正的RBAC检查。例如，查询用户角色并检查是否包含管理员角色。
  // (TODO: Implement real RBAC check. E.g., query user roles and check for admin role.)
  // 这是一个非常基础的占位符，假设特定用户ID是管理员。极不安全！
  // (This is a very basic placeholder assuming specific user ID is admin. Highly insecure!)
  // const adminUserIds = ['cluser1test123456789012345']; // 从配置或数据库中获取 (Get from config or DB)
  // if (adminUserIds.includes(userId)) {
  //   return true;
  // }
  // 尝试从数据库获取用户角色 (Attempt to fetch user roles from DB)
  const userWithRoles = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: {
          role: true
        }
      }
    }
  });
  if (userWithRoles?.userRoles.some(ur => ur.role.name === 'admin')) {
    return true;
  }
  return false; // 默认非管理员 (Default to not admin)
}

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
export async function POST(req: NextRequest) {
  // 1. 管理员认证和授权 (Admin Authentication and Authorization)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return errorResponse('Unauthorized: Missing or invalid Authorization header.', 401, 'unauthorized');
  }
  const token = authHeader.substring(7);
  if (!token) {
    return errorResponse('Unauthorized: Missing token.', 401, 'unauthorized');
  }

  const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);
  if (!valid || !payload) {
    return errorResponse(`Unauthorized: Invalid or expired token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
  }
  const adminUserId = payload.userId as string | undefined;
  if (!adminUserId) {
    return errorResponse('Unauthorized: Invalid token payload (Admin User ID missing).', 401, 'invalid_token_payload');
  }

  // 执行管理员检查 (Perform admin check)
  if (!(await isUserAdmin(adminUserId))) {
    return errorResponse('Forbidden: You do not have permission to create users.', 403, 'forbidden');
  }
  console.log(`Admin user ${adminUserId} attempting to create a new user.`);

  // 2. 解析请求体 (Parse request body)
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
    console.error(`Admin user creation error by ${adminUserId}:`, error);
    return errorResponse('An unexpected error occurred during user creation.', 500, 'server_error');
  }
}


// --- GET /api/v2/users (管理员获取用户列表) ---
export async function GET(req: NextRequest) {
  // 1. 管理员认证和授权 (Admin Authentication and Authorization)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return errorResponse('Unauthorized: Missing or invalid Authorization header.', 401, 'unauthorized');
  }
  const token = authHeader.substring(7);
  if (!token) {
    return errorResponse('Unauthorized: Missing token.', 401, 'unauthorized');
  }

  const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);
  if (!valid || !payload) {
    return errorResponse(`Unauthorized: Invalid or expired token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
  }
  const adminUserId = payload.userId as string | undefined;
  if (!adminUserId) {
    return errorResponse('Unauthorized: Invalid token payload (Admin User ID missing).', 401, 'invalid_token_payload');
  }
  if (!(await isUserAdmin(adminUserId))) {
    return errorResponse('Forbidden: You do not have permission to list users.', 403, 'forbidden');
  }

  // 2. 处理查询参数 (Process query parameters for pagination, filtering, sorting)
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
    // 3. 获取用户列表和总数 (Fetch users list and total count)
    const users = await prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const totalUsers = await prisma.user.count({ where });

    // 4. 返回响应 (Return response)
    return NextResponse.json({
      users: users.map(user => excludeSensitiveUserFields(user)), // 确保排除敏感字段
      total: totalUsers,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(totalUsers / pageSize),
    }, { status: 200 });

  } catch (error: any) {
    console.error(`Admin user listing error by ${adminUserId}:`, error);
    return errorResponse('An unexpected error occurred while listing users.', 500, 'server_error');
  }
}

// 确保 JWTUtils.verifyV2AuthAccessToken 和 isValidEmail 存在
// (Ensure JWTUtils.verifyV2AuthAccessToken and isValidEmail exist)
/*
declare module '@/lib/auth/oauth2' {
  export class JWTUtils {
    static async verifyV2AuthAccessToken(token: string): Promise<{
      valid: boolean;
      payload?: { userId: string; [key: string]: any }; // 确保 userId 在载荷中 (Ensure userId is in payload)
      error?: string;
    }>;
  }
}
declare module '@/lib/utils' {
  export function isValidEmail(email: string): boolean;
}
*/
