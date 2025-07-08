import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { Prisma, PermissionType } from '@prisma/client';
import { successResponse, errorResponse } from '@repo/lib';
import { z } from 'zod';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const createPermissionSchema = z.object({
  name: z.string().min(3).max(100).regex(/^[a-zA-Z0-9_:-]+$/),
  displayName: z.string().min(1).max(150),
  description: z.string().max(255).optional(),
  type: z.nativeEnum(PermissionType),
  resource: z.string().min(1).max(200),
  action: z.string().min(1).max(50),
  isActive: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    let pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10);
    pageSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);

    const where: Prisma.PermissionWhereInput = {};
    if (searchParams.has('name')) where.name = { contains: searchParams.get('name')! };
    if (searchParams.has('type')) where.type = searchParams.get('type') as PermissionType;
    if (searchParams.has('resource')) where.resource = { contains: searchParams.get('resource')! };
    if (searchParams.has('action')) where.action = { contains: searchParams.get('action')! };

    const permissions = await prisma.permission.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    const totalPermissions = await prisma.permission.count({ where });

    return successResponse({
      items: permissions,
      pagination: {
        page,
        pageSize,
        totalItems: totalPermissions,
        totalPages: Math.ceil(totalPermissions / pageSize),
      },
    });
  } catch (error) {
    console.error('列出权限失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const validationResult = createPermissionSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse({
        message: '创建权限验证失败',
        statusCode: 400,
        details: validationResult.error.flatten(),
      });
    }

    const { name, ...permissionData } = validationResult.data;

    const existingPermission = await prisma.permission.findUnique({ where: { name } });
    if (existingPermission) {
      return errorResponse({ message: `权限名称 "${name}" 已存在`, statusCode: 409 });
    }

    const newPermission = await prisma.permission.create({
      data: { name, ...permissionData },
    });

    return successResponse(newPermission, 201);
  } catch (error) {
    console.error('创建权限失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}