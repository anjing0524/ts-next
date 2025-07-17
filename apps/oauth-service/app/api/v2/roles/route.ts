import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { Prisma } from '@prisma/client';
import { successResponse, errorResponse } from '@repo/lib/node';
import { z } from 'zod';
import { listRoles, createRole } from '../../../../lib/auth/services/role-service';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const createRoleSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_:-]+$/),
  displayName: z.string().min(1).max(100),
  description: z.string().max(255).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  permissionIds: z.array(z.string().cuid()).optional().default([]),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    let pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10);
    pageSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
    const nameQuery = searchParams.get('name');
    const isActiveQuery = searchParams.get('isActive');
    // 调用service层
    const result = await listRoles({
      page,
      pageSize,
      name: nameQuery || undefined,
      isActive: isActiveQuery !== null ? isActiveQuery === 'true' : undefined,
    });
    return successResponse(result);
  } catch (error) {
    console.error('列出角色失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const validationResult = createRoleSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse({
        message: '创建角色验证失败',
        statusCode: 400,
        details: validationResult.error.flatten(),
      });
    }
    // 调用service层
    const newRole = await createRole(validationResult.data);
    return successResponse(newRole, 201);
  } catch (error) {
    console.error('创建角色失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}
