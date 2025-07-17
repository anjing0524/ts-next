import { NextRequest, NextResponse } from 'next/server';
import { successResponse, errorResponse } from '@repo/lib/node';
import { prisma } from '@repo/database';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import bcrypt from 'bcrypt';

import { excludePassword } from '@repo/lib/node';
import { listUsers, createUser } from '../../../../lib/auth/services/user-service';

const userQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  username: z.string().optional(),
  organization: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  sort: z.string().default('createdAt:desc'),
});

/**
 * GET /api/v2/users
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const validation = userQuerySchema.safeParse(searchParams);

    if (!validation.success) {
      return errorResponse({
        message: '无效的查询参数。',
        statusCode: 400,
        details: validation.error.flatten(),
      });
    }

    const { page, pageSize, sort, ...filters } = validation.data;
    // 调用service层
    const result = await listUsers({ page, pageSize, sort, filters });
    return successResponse(result);
  } catch (error) {
    console.error('获取用户列表失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

const createUserSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
  displayName: z.string().optional(),
  organization: z.string().optional(),
  department: z.string().optional(),
});

/**
 * POST /api/v2/users
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const validationResult = createUserSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse({
        message: '无效的输入。',
        statusCode: 400,
        details: validationResult.error.flatten(),
      });
    }
    // 调用service层
    const newUser = await createUser(validationResult.data);
    return successResponse(excludePassword(newUser), 201);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return errorResponse({ message: '用户名已存在。', statusCode: 409 });
    }
    console.error('创建用户失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}
