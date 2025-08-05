import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { successResponse, errorResponse } from '@repo/lib/node';

/**
 * DELETE /api/v2/roles/[roleId]/permissions/[permissionId] - 从角色中移除单个权限
 * 权限: 'roles:permissions:remove' (需要添加到 permission-map.ts)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roleId: string; permissionId: string }> }
): Promise<NextResponse> {
  try {
    const { roleId, permissionId } = await params;

    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: roleId,
          permissionId: permissionId,
        },
      },
    });

    return successResponse(null, 204);
  } catch (error) {
    console.error(`从角色中移除权限失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

/**
 * PUT /api/v2/roles/[roleId]/permissions/[permissionId] - 为角色添加单个权限
 * 权限: 'roles:permissions:assign' (需要添加到 permission-map.ts)
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ roleId: string; permissionId: string }> }
): Promise<NextResponse> {
  try {
    const { roleId, permissionId } = await params;

    await prisma.rolePermission.create({
      data: {
        roleId: roleId,
        permissionId: permissionId,
      },
    });

    return successResponse({ message: '权限添加成功' }, 201);
  } catch (error) {
    console.error(`为角色添加权限失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}
