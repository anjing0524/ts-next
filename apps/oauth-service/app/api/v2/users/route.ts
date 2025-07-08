import { NextRequest, NextResponse } from 'next/server';
import { successResponse, errorResponse } from '@repo/lib';
import { prisma } from '@repo/database';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import bcrypt from 'bcrypt';

import { excludePassword } from '@repo/lib/utils';

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

    const where: Prisma.UserWhereInput = {};
    if (filters.username) where.username = { contains: filters.username };
    if (filters.organization) where.organization = { contains: filters.organization };
    if (typeof filters.isActive === 'boolean') where.isActive = filters.isActive;

    const [sortField, sortOrder] = sort.split(':');

    // 验证排序字段是否有效，防止注入风险
    const validSortFields = ['username', 'displayName', 'createdAt', 'organization'];
    let orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' }; // 默认排序

    if (
      sortField &&
      sortOrder &&
      validSortFields.includes(sortField) &&
      ['asc', 'desc'].includes(sortOrder)
    ) {
      orderBy = { [sortField]: sortOrder as 'asc' | 'desc' };
    }

    const totalItems = await prisma.user.count({ where });
    const users = await prisma.user.findMany({
      where,
      take: pageSize,
      skip: (page - 1) * pageSize,
      orderBy,
      select: {
        id: true,
        username: true,
        displayName: true,
        organization: true,
        department: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return successResponse({
      items: users,
      pagination: {
        totalItems,
        currentPage: page,
        pageSize,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    });
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

    const { password, ...userData } = validationResult.data;
    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        ...userData,
        passwordHash,
      },
    });

    return successResponse(excludePassword(newUser), 201);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return errorResponse({ message: '用户名已存在。', statusCode: 409 });
    }
    console.error('创建用户失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}
