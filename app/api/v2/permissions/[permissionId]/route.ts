// app/api/v2/permissions/[permissionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma, PermissionType, HttpMethod } from '@prisma/client';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { z } from 'zod';

interface RouteContext {
  params: {
    permissionId: string; // 权限的ID (ID of the permission)
  };
}

// Zod Schemas for Permission Update (similar to Create, but fields are optional)
const ApiDetailsUpdateSchema = z.object({
  httpMethod: z.nativeEnum(HttpMethod).optional(),
  endpoint: z.string().startsWith('/', "端点路径必须以'/'开头 (Endpoint path must start with '/')").optional(),
  rateLimit: z.number().int().positive().optional().nullable(),
});

const MenuDetailsUpdateSchema = z.object({
  menuId: z.string().cuid("无效的菜单ID格式 (Invalid Menu ID format)").optional(),
});

const DataDetailsUpdateSchema = z.object({
  tableName: z.string().min(1, "表名不能为空 (Table name cannot be empty)").optional(),
  columnName: z.string().optional().nullable(),
  conditions: z.string().optional().nullable(), // JSON string for conditions
});

const UpdatePermissionSchema = z.object({
  displayName: z.string().min(1, "显示名称不能为空 (Display name cannot be empty)").max(150).optional(),
  description: z.string().max(255).optional().nullable(),
  // name and type are typically immutable for a permission
  resource: z.string().min(1, "资源标识不能为空 (Resource identifier cannot be empty)").max(200).optional(),
  action: z.string().min(1, "操作不能为空 (Action cannot be empty)").max(50).optional(),
  isActive: z.boolean().optional(),
  apiDetails: ApiDetailsUpdateSchema.optional(),
  menuDetails: MenuDetailsUpdateSchema.optional(),
  dataDetails: DataDetailsUpdateSchema.optional(),
});


/**
 * 获取特定权限定义详情 (Get specific permission definition details)
 * Permission: permissions:read
 */
async function getPermissionByIdHandler(req: AuthenticatedRequest, context: RouteContext) {
  const { permissionId } = context.params;
  try {
    const permission = await prisma.permission.findUnique({
      where: { id: permissionId },
      include: {
        apiPermission: true,
        menuPermission: { include: { menu: true } },
        dataPermission: true,
      },
    });

    if (!permission) {
      return NextResponse.json({ message: '权限定义未找到 (Permission definition not found)' }, { status: 404 });
    }
    return NextResponse.json(permission);
  } catch (error) {
    console.error(`获取权限 ${permissionId} 失败 (Failed to fetch permission ${permissionId}):`, error);
    return NextResponse.json({ message: '获取权限定义详情失败 (Failed to retrieve permission definition details)' }, { status: 500 });
  }
}

/**
 * 更新特定权限定义信息 (Update specific permission definition information)
 * Permission: permissions:update
 * Note: Permission 'name' and 'type' are generally considered immutable.
 */
async function updatePermissionHandler(req: AuthenticatedRequest, context: RouteContext) {
  const { permissionId } = context.params;
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ message: '无效的JSON请求体 (Invalid JSON request body)' }, { status: 400 });
  }

  const validationResult = UpdatePermissionSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json({
      message: '更新权限验证失败 (Permission update validation failed)',
      errors: validationResult.error.format(),
    }, { status: 400 });
  }

  const updateData = validationResult.data;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ message: '请求体中至少需要一个待更新的字段 (At least one field to update is required)' }, { status: 400 });
  }

  try {
    const existingPermission = await prisma.permission.findUnique({ where: { id: permissionId } });
    if (!existingPermission) {
      return NextResponse.json({ message: '权限定义未找到 (Permission definition not found)' }, { status: 404 });
    }

    // 不允许修改 name 和 type (Do not allow modification of name and type)
    if ((updateData as any).name || (updateData as any).type) {
        return NextResponse.json({ message: '权限的名称和类型不可修改 (Permission name and type cannot be changed)' }, { status: 400 });
    }

    const updatedPermission = await prisma.$transaction(async (tx) => {
      const basePermissionUpdateData: Prisma.PermissionUpdateInput = {};
      if (updateData.displayName !== undefined) basePermissionUpdateData.displayName = updateData.displayName;
      if (updateData.description !== undefined) basePermissionUpdateData.description = updateData.description;
      if (updateData.resource !== undefined) basePermissionUpdateData.resource = updateData.resource;
      if (updateData.action !== undefined) basePermissionUpdateData.action = updateData.action;
      if (updateData.isActive !== undefined) basePermissionUpdateData.isActive = updateData.isActive;

      let perm = existingPermission;
      if (Object.keys(basePermissionUpdateData).length > 0) {
        perm = await tx.permission.update({
            where: { id: permissionId },
            data: basePermissionUpdateData,
        });
      }

      if (existingPermission.type === PermissionType.API && updateData.apiDetails) {
        await tx.apiPermission.update({ where: { permissionId }, data: updateData.apiDetails });
      } else if (existingPermission.type === PermissionType.MENU && updateData.menuDetails) {
        if (updateData.menuDetails.menuId) {
            const menuExists = await tx.menu.count({ where: { id: updateData.menuDetails.menuId }});
            if (menuExists === 0) {
                throw new Error(`菜单ID "${updateData.menuDetails.menuId}" 无效或不存在 (Menu ID "${updateData.menuDetails.menuId}" is invalid or does not exist)`);
            }
        }
        await tx.menuPermission.update({ where: { permissionId }, data: updateData.menuDetails });
      } else if (existingPermission.type === PermissionType.DATA && updateData.dataDetails) {
        await tx.dataPermission.update({ where: { permissionId }, data: updateData.dataDetails });
      }
      return perm; // Return the potentially updated base permission
    });

    const fullUpdatedPermission = await prisma.permission.findUnique({
        where: { id: updatedPermission.id },
        include: { apiPermission: true, menuPermission: { include: { menu: true } }, dataPermission: true }
    });
    return NextResponse.json(fullUpdatedPermission);

  } catch (error: any) {
    console.error(`更新权限 ${permissionId} 失败 (Failed to update permission ${permissionId}):`, error);
    if (error.message.includes("菜单ID")) {
        return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: '更新权限定义失败 (Failed to update permission definition)' }, { status: 500 });
  }
}

/**
 * 删除特定权限定义 (Delete a specific permission definition)
 * Permission: permissions:delete
 */
async function deletePermissionHandler(req: AuthenticatedRequest, context: RouteContext) {
  const { permissionId } = context.params;
  try {
    const permission = await prisma.permission.findUnique({ where: { id: permissionId } });
    if (!permission) {
      return NextResponse.json({ message: '权限定义未找到 (Permission definition not found)' }, { status: 404 });
    }

    // 检查权限是否仍被角色分配 (Check if permission is still assigned to any roles)
    const rolesWithPermission = await prisma.rolePermission.count({ where: { permissionId: permissionId } });
    if (rolesWithPermission > 0) {
      return NextResponse.json({ message: `权限 "${permission.name}" 仍被 ${rolesWithPermission} 个角色使用，无法删除 (Permission "${permission.name}" is still in use by ${rolesWithPermission} roles and cannot be deleted)` }, { status: 409 });
    }

    // 使用事务删除权限及其关联的类型特定权限记录
    // (Use transaction to delete permission and its associated type-specific permission record)
    await prisma.$transaction(async (tx) => {
      if (permission.type === PermissionType.API) {
        await tx.apiPermission.deleteMany({ where: { permissionId } });
      } else if (permission.type === PermissionType.MENU) {
        await tx.menuPermission.deleteMany({ where: { permissionId } });
      } else if (permission.type === PermissionType.DATA) {
        await tx.dataPermission.deleteMany({ where: { permissionId } });
      }
      await tx.permission.delete({ where: { id: permissionId } });
    });

    return new NextResponse(null, { status: 204 }); // No Content
  } catch (error) {
    console.error(`删除权限 ${permissionId} 失败 (Failed to delete permission ${permissionId}):`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        return NextResponse.json({ message: '无法删除权限，因为它仍与其他记录关联 (Cannot delete permission as it is still referenced by other records - check RolePermission)' }, { status: 409 });
    }
    return NextResponse.json({ message: '删除权限定义失败 (Failed to delete permission definition)' }, { status: 500 });
  }
}

export const GET = requirePermission('permissions:read')(getPermissionByIdHandler);
export const PUT = requirePermission('permissions:update')(updatePermissionHandler);
export const DELETE = requirePermission('permissions:delete')(deletePermissionHandler);

[end of app/api/v2/permissions/[permissionId]/route.ts]
