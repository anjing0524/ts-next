import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@repo/database';
import { successResponse, errorResponse } from '@repo/lib';
import { Prisma } from '@prisma/client';

const scopeCreateSchema = z.object({
  name: z.string().min(3).max(100).regex(/^[a-zA-Z0-9_:-]+$/),
  description: z.string().max(500).optional().nullable(),
  isPublic: z.boolean().default(false).optional(),
  isActive: z.boolean().default(true).optional(),
});

const scopeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  name: z.string().optional(),
  isActive: z.preprocess((val) => val === 'true' || undefined, z.boolean().optional()),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const queryParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const validationResult = scopeListQuerySchema.safeParse(queryParams);

    if (!validationResult.success) {
      return errorResponse({
        message: '查询参数验证失败',
        statusCode: 400,
        details: validationResult.error.flatten(),
      });
    }

    const { page, limit, name, isActive } = validationResult.data;
    const whereClause: Prisma.ScopeWhereInput = {};
    if (name) whereClause.name = { contains: name };
    if (isActive !== undefined) whereClause.isActive = isActive;

    const scopes = await prisma.scope.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const totalScopes = await prisma.scope.count({ where: whereClause });

    return successResponse({
      items: scopes,
      pagination: {
        page,
        pageSize: limit,
        totalItems: totalScopes,
        totalPages: Math.ceil(totalScopes / limit),
      },
    });
  } catch (error) {
    console.error('列出范围失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const validationResult = scopeCreateSchema.safeParse(payload);

    if (!validationResult.success) {
      return errorResponse({
        message: '创建范围验证失败',
        statusCode: 400,
        details: validationResult.error.flatten(),
      });
    }

    const { name, ...scopeData } = validationResult.data;

    const existingScope = await prisma.scope.findUnique({ where: { name } });
    if (existingScope) {
      return errorResponse({ message: `范围名称 "${name}" 已存在`, statusCode: 409 });
    }

    const newScope = await prisma.scope.create({
      data: { name, ...scopeData },
    });
    return successResponse(newScope, 201);
  } catch (error) {
    console.error('创建范围失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}