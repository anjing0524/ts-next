import {
  createPermission,
  listPermissions,
} from '@/lib/auth/services/permission-service';
import { PermissionType } from '@repo/database';
import { errorResponse, successResponse } from '@repo/lib/node';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const createPermissionSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-zA-Z0-9_:-]+$/),
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
    // 调用service层
    const result = await listPermissions({
      page,
      pageSize,
      name: searchParams.get('name') || undefined,
      type: (searchParams.get('type') as any) || undefined,
      resource: searchParams.get('resource') || undefined,
      action: searchParams.get('action') || undefined,
    });
    return successResponse(result);
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
    // 调用service层
    const newPermission = await createPermission(validationResult.data);
    return successResponse(newPermission, 201);
  } catch (error) {
    console.error('创建权限失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}
