import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { successResponse, errorResponse } from '@repo/lib';
import { z } from 'zod';

const updateRoleSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().max(255).optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
): Promise<NextResponse> {
  const { roleId } = await params;
  try {
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: { rolePermissions: { include: { permission: true } } },
    });

    if (!role) {
      return errorResponse({ message: '角色未找到', statusCode: 404 });
    }

    const { rolePermissions, ...roleData } = role;
    const formattedRole = {
      ...roleData,
      permissions: rolePermissions.map((rp) => rp.permission),
    };

    return successResponse(formattedRole);
  } catch (error) {
    console.error(`获取角色 ${roleId} 失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
): Promise<NextResponse> {
  const { roleId } = await params;
  try {
    const body = await req.json();
    const validationResult = updateRoleSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse({
        message: '更新角色验证失败',
        statusCode: 400,
        details: validationResult.error.flatten(),
      });
    }

    const updatedRole = await prisma.role.update({
      where: { id: roleId },
      data: validationResult.data,
    });

    return successResponse(updatedRole);
  } catch (error) {
    console.error(`更新角色 ${roleId} 失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
): Promise<NextResponse> {
  const { roleId } = await params;
  try {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (role?.isSystemRole) {
      return errorResponse({ message: '不能删除系统角色', statusCode: 403 });
    }

    await prisma.role.delete({ where: { id: roleId } });
    return successResponse(null, 204);
  } catch (error) {
    console.error(`删除角色 ${roleId} 失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}
