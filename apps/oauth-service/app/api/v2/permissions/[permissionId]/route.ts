import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { successResponse, errorResponse } from '@repo/lib';
import { z } from 'zod';

const updatePermissionSchema = z.object({
  displayName: z.string().min(1).max(150).optional(),
  description: z.string().max(255).optional().nullable(),
  resource: z.string().min(1).max(200).optional(),
  action: z.string().min(1).max(50).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ permissionId: string }> }
): Promise<NextResponse> {
  const { permissionId } = await params;
  try {
    const permission = await prisma.permission.findUnique({
      where: { id: permissionId },
    });

    if (!permission) {
      return errorResponse({ message: '权限未找到', statusCode: 404 });
    }
    return successResponse(permission);
  } catch (error) {
    console.error(`获取权限 ${permissionId} 失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ permissionId: string }> }
): Promise<NextResponse> {
  const { permissionId } = await params;
  try {
    const body = await req.json();
    const validationResult = updatePermissionSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse({
        message: '更新权限验证失败',
        statusCode: 400,
        details: validationResult.error.flatten(),
      });
    }

    const updatedPermission = await prisma.permission.update({
      where: { id: permissionId },
      data: validationResult.data,
    });
    return successResponse(updatedPermission);
  } catch (error) {
    console.error(`更新权限 ${permissionId} 失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ permissionId: string }> }
): Promise<NextResponse> {
  const { permissionId } = await params;
  try {
    await prisma.permission.delete({
      where: { id: permissionId },
    });
    return successResponse(null, 204);
  } catch (error) {
    console.error(`删除权限 ${permissionId} 失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}
