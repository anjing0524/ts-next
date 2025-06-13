// app/api/v2/roles/[roleId]/permissions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { z } from 'zod';

interface RouteContext {
  params: {
    roleId: string; // 角色的ID (ID of the role)
  };
}

// Zod Schema for Assigning Permissions
const AssignPermissionsSchema = z.object({
  permissionIds: z.array(z.string().cuid("无效的权限ID格式 (Invalid permission ID format)"))
    .min(1, "至少需要一个权限ID (At least one permission ID is required)"),
});

/**
 * 列出特定角色的权限 (List permissions for a specific role)
 * Permission: roles:permissions:read (or role:permissions:list from seed)
 */
async function listRolePermissionsHandler(req: AuthenticatedRequest, context: RouteContext) {
  const { roleId } = context.params;
  try {
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        rolePermissions: {
          include: {
            permission: true, // 包含完整的权限详情 (Include full permission details)
          },
          orderBy: { permission: { name: 'asc' } } // 按权限名称排序 (Order by permission name)
        },
      },
    });

    if (!role) {
      return NextResponse.json({ message: '角色未找到 (Role not found)' }, { status: 404 });
    }

    const permissions = role.rolePermissions.map(rp => rp.permission).filter(p => p !== null);
    return NextResponse.json({ permissions });
  } catch (error) {
    console.error(`列出角色 ${roleId} 的权限失败 (Failed to list permissions for role ${roleId}):`, error);
    return NextResponse.json({ message: '获取角色权限列表失败 (Failed to retrieve role permissions)' }, { status: 500 });
  }
}

/**
 * 为特定角色分配一个或多个权限 (Assign one or more permissions to a specific role)
 * Permission: roles:permissions:assign
 */
async function assignPermissionsToRoleHandler(req: AuthenticatedRequest, context: RouteContext) {
  const { roleId } = context.params;
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ message: '无效的JSON请求体 (Invalid JSON request body)' }, { status: 400 });
  }

  const validationResult = AssignPermissionsSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json({
      message: '分配权限验证失败 (Assigning permissions validation failed)',
      errors: validationResult.error.format(),
    }, { status: 400 });
  }

  const { permissionIds } = validationResult.data;

  try {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return NextResponse.json({ message: '角色未找到 (Role not found)' }, { status: 404 });
    }

    // 验证所有permissionId是否存在且有效 (Validate all permissionIds exist and are active)
    const validPermissions = await prisma.permission.findMany({
      where: {
        id: { in: permissionIds },
        isActive: true, // 通常只分配激活的权限 (Usually only assign active permissions)
      },
    });

    if (validPermissions.length !== permissionIds.length) {
      const foundIds = validPermissions.map(p => p.id);
      const notFoundOrInactive = permissionIds.filter(id => !foundIds.includes(id));
      return NextResponse.json({ message: `以下权限ID无效或未激活: ${notFoundOrInactive.join(', ')} (Following permission IDs are invalid or inactive: ${notFoundOrInactive.join(', ')})` }, { status: 400 });
    }

    // 使用事务批量创建 RolePermission 记录 (Use transaction to batch create RolePermission records)
    // upsert 用于幂等性：如果关联已存在，则不执行任何操作 (upsert for idempotency: if relation exists, do nothing)
    const operations = permissionIds.map(permissionId =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {}, // No update needed if it exists
        create: { roleId, permissionId },
      })
    );

    await prisma.$transaction(operations);

    // 返回更新后的角色权限列表 (Return the updated list of role permissions)
    const updatedRolePermissions = await prisma.rolePermission.findMany({
        where: { roleId },
        include: { permission: true }
    });
    const permissionsToReturn = updatedRolePermissions.map(rp => rp.permission).filter(p => p !== null);

    return NextResponse.json({
        message: '权限已成功分配给角色 (Permissions assigned successfully to role)',
        assignedPermissions: permissionsToReturn
    });

  } catch (error) {
    console.error(`为角色 ${roleId} 分配权限失败 (Failed to assign permissions to role ${roleId}):`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P2003: 外键约束失败 (Foreign key constraint failed) - e.g. permissionId doesn't exist
        if (error.code === 'P2003') {
             return NextResponse.json({ message: '一个或多个权限ID无效 (One or more permission IDs are invalid)' }, { status: 400 });
        }
    }
    return NextResponse.json({ message: '分配权限失败 (Failed to assign permissions)' }, { status: 500 });
  }
}

// 使用 'role:permissions:list' (来自种子文件) 作为读取权限
// Using 'role:permissions:list' (from seed file) as read permission
export const GET = requirePermission('role:permissions:list')(listRolePermissionsHandler);
export const POST = requirePermission('roles:permissions:assign')(assignPermissionsToRoleHandler);

[end of app/api/v2/roles/[roleId]/permissions/route.ts]
