// app/api/v2/roles/[roleId]/permissions/[permissionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';

interface RouteContext {
  params: {
    roleId: string;       // 角色的ID (ID of the role)
    permissionId: string; // 要移除的权限的ID (ID of the permission to remove)
  };
}

/**
 * 从特定角色移除单个权限 (Remove a single permission from a specific role)
 * Permission: roles:permissions:remove
 */
async function removePermissionFromRoleHandler(req: AuthenticatedRequest, context: RouteContext) {
  const { roleId, permissionId } = context.params;
  const performingAdmin = req.user;

  console.log(`管理员 ${performingAdmin?.id} 正在从角色 ${roleId} 移除权限 ${permissionId}。(Admin ${performingAdmin?.id} removing permission ${permissionId} from role ${roleId}.)`);

  try {
    // 检查角色和权限是否存在，以提供更明确的错误消息（可选，因为deleteMany不会因目标不存在而失败）
    // (Optional: Check if role and permission exist for clearer error messages, as deleteMany won't fail if targets don't exist)
    const roleExists = await prisma.role.count({ where: { id: roleId } });
    if (roleExists === 0) {
      return NextResponse.json({ message: '角色未找到 (Role not found)' }, { status: 404 });
    }
    const permissionExists = await prisma.permission.count({ where: { id: permissionId } });
    if (permissionExists === 0) {
      return NextResponse.json({ message: '权限未找到 (Permission not found)' }, { status: 404 });
    }

    // 删除 RolePermission 关联记录 (Delete the RolePermission association record)
    const deleteResult = await prisma.rolePermission.deleteMany({
      where: {
        roleId: roleId,
        permissionId: permissionId,
      },
    });

    if (deleteResult.count === 0) {
      // 如果没有记录被删除，说明该角色原本就没有这个权限的分配
      // (If no records were deleted, it means the role was not assigned this permission)
      return NextResponse.json({ message: '权限未分配给此角色或已移除 (Permission not assigned to this role or already removed)' }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 }); // No Content

  } catch (error) {
    console.error(`从角色 ${roleId} 移除权限 ${permissionId} 失败 (Failed to remove permission ${permissionId} from role ${roleId}):`, error);
    // PrismaClientKnownRequestError P2003 (Foreign key constraint) should ideally not happen here
    // if we are just deleting from a join table, unless other direct relations exist on RolePermission.
    return NextResponse.json({ message: '移除角色权限失败 (Failed to remove role permission)' }, { status: 500 });
  }
}

export const DELETE = requirePermission('roles:permissions:remove')(removePermissionFromRoleHandler);

[end of app/api/v2/roles/[roleId]/permissions/[permissionId]/route.ts]
