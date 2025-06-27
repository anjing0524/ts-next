// 文件路径: app/api/v2/users/route.ts
// 描述: 此文件处理用户 (User) 集合的 API 请求，包括列出用户 (GET) 和创建新用户 (POST)。
// 使用权限控制中间件来保护这些端点，确保只有授权用户才能访问。

import { NextRequest, NextResponse } from 'next/server';
import { User } from '@prisma/client';
import { withAuth, type AuthContext } from '@repo/lib/middleware';
import { withErrorHandling } from '@repo/lib';
import { AuthorizationUtils } from '@repo/lib/auth';
import {
  UserService,
  CreateUserParams,
  UserQueryParams,
} from '../../../../lib/services/user-service';
import { z } from 'zod';

// 定义获取用户列表时分页的默认页面大小
const DEFAULT_PAGE_SIZE = 10;
// 定义获取用户列表时分页允许的最大页面大小，以防止滥用
const MAX_PAGE_SIZE = 100;

// --- Zod Schema 定义 ---
// 用于验证创建用户请求体的数据结构和规则
const CreateUserSchema = z.object({
  username: z
    .string()
    .min(3, '用户名至少需要3个字符 (Username must be at least 3 characters long)')
    .max(50, '用户名不能超过50个字符 (Username cannot exceed 50 characters long)')
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      '用户名只能包含字母、数字、下划线、点和连字符 (Username can only contain letters, numbers, underscores, dots, and hyphens)'
    ),
  password: z
    .string()
    .min(8, '密码至少需要8个字符 (Password must be at least 8 characters long)')
    .max(128, '密码不能超过128个字符 (Password cannot exceed 128 characters long)')
    .regex(
      /(?=.*[a-zA-Z])(?=.*\d)/,
      '密码必须包含至少一个字母和一个数字 (Password must contain at least one letter and one number)'
    ),
  displayName: z
    .string()
    .max(100, '显示名称不能超过100个字符 (Display name cannot exceed 100 characters long)')
    .optional(),
  firstName: z
    .string()
    .max(50, '名字不能超过50个字符 (First name cannot exceed 50 characters long)')
    .optional(),
  lastName: z
    .string()
    .max(50, '姓氏不能超过50个字符 (Last name cannot exceed 50 characters long)')
    .optional(),
  organization: z
    .string()
    .max(100, '组织名称不能超过100个字符 (Organization name cannot exceed 100 characters long)')
    .optional(),
  department: z
    .string()
    .max(100, '部门名称不能超过100个字符 (Department name cannot exceed 100 characters long)')
    .optional(),
  isActive: z.boolean().optional().default(true),
  mustChangePassword: z.boolean().optional().default(true),
});

/**
 * GET /api/v2/users - 列出所有用户 (支持分页和过滤)
 * 此处理函数响应 GET 请求，返回系统中的用户列表。
 * 支持通过查询参数进行分页、过滤和搜索。
 * 需要 'user:list' 权限才能访问。
 *
 * @param req NextRequest - 请求对象
 * @param context - 认证上下文
 * @returns NextResponse - 包含用户列表和分页信息的 JSON 响应
 */
async function listUsersHandler(
  req: NextRequest,
  context: { authContext: AuthContext; params: any }
): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const page = parseInt(searchParams.get('page') || '1', 10);
  let pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10);
  pageSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);

  const username = searchParams.get('username');
  const organization = searchParams.get('organization');
  const department = searchParams.get('department');
  const isActiveQuery = searchParams.get('isActive');
  const search = searchParams.get('search');

  const queryParams: UserQueryParams = {
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };

  if (username) queryParams.username = username;
  if (organization) queryParams.organization = organization;
  if (department) queryParams.department = department;
  if (isActiveQuery !== null) queryParams.isActive = isActiveQuery === 'true';
  if (search) queryParams.search = search;

  try {
    const { users, total } = await UserService.getUsers(queryParams);

    return NextResponse.json({
      data: users,
      pagination: {
        page,
        pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('列出用户失败 (Failed to list users):', error);
    return NextResponse.json(
      { message: '获取用户列表失败 (Failed to retrieve users list)' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v2/users - 创建新用户
 * 此处理函数响应 POST 请求，用于在系统中创建一个新的用户。
 * 请求体需要符合 CreateUserSchema 定义的结构和规则。
 * 需要 'user:create' 权限才能访问。
 *
 * @param req NextRequest - 请求对象
 * @param context - 认证上下文
 * @returns NextResponse - 包含新创建的用户信息或错误信息的 JSON 响应
 */
async function createUserHandler(
  req: NextRequest,
  context: { authContext: AuthContext; params: any }
): Promise<NextResponse> {
  const performingAdminId = context.authContext.user_id;
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  let body;
  try {
    body = await req.json();
  } catch (e: any) {
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'USER_CREATE_FAILURE_INVALID_JSON',
      success: false,
      ipAddress,
      userAgent,
      errorMessage: 'Invalid JSON request body for user creation.',
      metadata: { error: e.message },
    });
    return NextResponse.json(
      { message: '无效的JSON请求体 (Invalid JSON request body)' },
      { status: 400 }
    );
  }

  const validationResult = CreateUserSchema.safeParse(body);
  if (!validationResult.success) {
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdminId,
      action: 'USER_CREATE_FAILURE_VALIDATION',
      success: false,
      ipAddress,
      userAgent,
      errorMessage: 'User creation payload validation failed.',
      metadata: { issues: validationResult.error.format(), receivedBody: body },
    });
    return NextResponse.json(
      {
        message: '创建用户验证失败 (User creation input validation failed)',
        errors: validationResult.error.format(),
      },
      { status: 400 }
    );
  }

  const createParams: CreateUserParams = {
    ...validationResult.data,
    createdBy: performingAdminId,
  };

  try {
    const newUser = await UserService.createUser(createParams, {
      userId: performingAdminId,
      ipAddress,
      userAgent,
    });

    return NextResponse.json(
      {
        data: newUser,
        message: '用户创建成功 (User created successfully)',
      },
      { status: 201 }
    );
  } catch (error: any) {
    // UserService已经记录了审计日志，这里只处理HTTP响应
    return NextResponse.json(
      {
        message: error.message || '创建用户失败 (Failed to create user)',
      },
      { status: error.status || 500 }
    );
  }
}

// 导出处理函数，使用权限控制和错误处理包装器
export const GET = withErrorHandling(
  withAuth(listUsersHandler, { requiredPermissions: ['user:list'] })
) as any;

export const POST = withErrorHandling(
  withAuth(createUserHandler, { requiredPermissions: ['user:create'] })
) as any;
