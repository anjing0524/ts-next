import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { successResponse, errorResponse } from '@repo/lib';
import { z } from 'zod';

const assignPermissionsSchema = z.object({
  permissionIds: z.array(z.string().cuid()),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
): Promise<NextResponse> {
  try {
    const { roleId } = await params;
    const permissions = await prisma.permission.findMany({
      where: {
        rolePermissions: {
          some: {
            roleId: roleId,
          },
        },
      },
    });
    return successResponse(permissions);
  } catch (error) {
    console.error(`获取角色权限失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
): Promise<NextResponse> {
  try {
    const { roleId } = await params;
    const body = await req.json();
    const validationResult = assignPermissionsSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse({
        message: '请求数据验证失败',
        statusCode: 400,
        details: validationResult.error.flatten(),
      });
    }

    const { permissionIds } = validationResult.data;

    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: { roleId: roleId },
      });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: roleId,
            permissionId,
          })),
        });
      }
    });

    return successResponse({ message: '权限分配成功' });
  } catch (error) {
    console.error(`为角色分配权限失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}