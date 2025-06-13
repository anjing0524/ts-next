// app/api/v2/roles/[roleId]/route.ts
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

// Zod Schema for Role Update
const UpdateRoleSchema = z.object({
  displayName: z.string().min(1, "显示名称不能为空 (Display name cannot be empty)")
    .max(100, "显示名称不能超过100个字符 (Display name cannot exceed 100 characters)").optional(),
  description: z.string().max(255, "描述信息不能超过255个字符 (Description cannot exceed 255 characters)").optional().nullable(),
  isActive: z.boolean().optional(),
});

// 核心系统角色，不允许删除 (Core system roles that should not be deleted)
const CORE_SYSTEM_ROLES = ['SYSTEM_ADMIN', 'USER', 'USER_ADMIN', 'PERMISSION_ADMIN', 'CLIENT_ADMIN', 'AUDIT_ADMIN'];


/**
 * 获取特定角色详情 (Get specific role details)
 * Permission: roles:read
 */
async function getRoleByIdHandler(req: AuthenticatedRequest, context: RouteContext) {
  const { roleId } = context.params;
  try {
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      // include: { rolePermissions: { include: { permission: true } } } // 可选：同时返回角色拥有的权限 (Optional: also return permissions owned by the role)
    });

    if (!role) {
      return NextResponse.json({ message: '角色未找到 (Role not found)' }, { status: 404 });
    }
    return NextResponse.json(role);
  } catch (error) {
    console.error(`获取角色 ${roleId} 失败 (Failed to fetch role ${roleId}):`, error);
    return NextResponse.json({ message: `获取角色详情失败 (Failed to retrieve role details for ID ${roleId})` }, { status: 500 });
  }
}

/**
 * 更新特定角色信息 (Update specific role information)
 * Permission: roles:update
 */
async function updateRoleHandler(req: AuthenticatedRequest, context: RouteContext) {
  const { roleId } = context.params;
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ message: '无效的JSON请求体 (Invalid JSON request body)' }, { status: 400 });
  }

  const validationResult = UpdateRoleSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json({
      message: '更新角色验证失败 (Role update validation failed)',
      errors: validationResult.error.format(),
    }, { status: 400 });
  }

  const { displayName, description, isActive } = validationResult.data;

  if (Object.keys(validationResult.data).length === 0) {
    return NextResponse.json({ message: '请求体中至少需要一个待更新的字段 (At least one field to update is required in the request body)' }, { status: 400 });
  }

  try {
    // 检查角色是否存在 (Check if role exists)
    const existingRole = await prisma.role.findUnique({ where: { id: roleId } });
    if (!existingRole) {
      return NextResponse.json({ message: '角色未找到 (Role not found)' }, { status: 404 });
    }

    // 不允许修改核心系统角色的名称或停用SYSTEM_ADMIN (Prevent modification of core system role names or deactivation of SYSTEM_ADMIN)
    if (CORE_SYSTEM_ROLES.includes(existingRole.name) && isActive === false && existingRole.name === 'SYSTEM_ADMIN') {
        return NextResponse.json({ message: '不能停用SYSTEM_ADMIN角色 (Cannot deactivate SYSTEM_ADMIN role)' }, { status: 403 });
    }
    // 角色名称 (name) 通常不应通过此端点修改，如果需要，应有专门流程或限制 (Role name usually should not be changed via this endpoint)

    const updatedRole = await prisma.role.update({
      where: { id: roleId },
      data: {
        displayName: displayName !== undefined ? displayName : undefined,
        description: description !== undefined ? description : undefined, // Handles explicit null to clear description
        isActive: isActive !== undefined ? isActive : undefined,
      },
    });
    return NextResponse.json(updatedRole);
  } catch (error) {
    console.error(`更新角色 ${roleId} 失败 (Failed to update role ${roleId}):`, error);
    return NextResponse.json({ message: `更新角色失败 (Failed to update role for ID ${roleId})` }, { status: 500 });
  }
}

/**
 * 删除特定角色 (Delete a specific role)
 * Permission: roles:delete
 */
async function deleteRoleHandler(req: AuthenticatedRequest, context: RouteContext) {
  const { roleId } = context.params;
  try {
    // 检查角色是否存在 (Check if role exists)
    const roleToDelete = await prisma.role.findUnique({ where: { id: roleId } });
    if (!roleToDelete) {
      return NextResponse.json({ message: '角色未找到 (Role not found)' }, { status: 404 });
    }

    // 防止删除核心系统角色 (Prevent deletion of core system roles)
    if (CORE_SYSTEM_ROLES.includes(roleToDelete.name)) {
      return NextResponse.json({ message: `核心系统角色 "${roleToDelete.name}" 不能被删除 (Core system role "${roleToDelete.name}" cannot be deleted)` }, { status: 403 });
    }

    // 检查角色是否仍被用户分配 (Check if role is still assigned to any users)
    const usersWithRole = await prisma.userRole.count({ where: { roleId: roleId } });
    if (usersWithRole > 0) {
      return NextResponse.json({ message: `角色 "${roleToDelete.name}" 仍被 ${usersWithRole} 个用户使用，无法删除 (Role "${roleToDelete.name}" is still in use by ${usersWithRole} users and cannot be deleted)` }, { status: 409 });
    }

    await prisma.role.delete({ where: { id: roleId } });
    return new NextResponse(null, { status: 204 }); // No Content
  } catch (error) {
    console.error(`删除角色 ${roleId} 失败 (Failed to delete role ${roleId}):`, error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P2003: Foreign key constraint failed (e.g. if RolePermission entries still exist but UserRole check passed - should not happen if relations are set up correctly)
        if (error.code === 'P2003') {
             return NextResponse.json({ message: '无法删除角色，因为它仍与其他记录关联 (Cannot delete role as it is still referenced by other records)' }, { status: 409 });
        }
    }
    return NextResponse.json({ message: `删除角色失败 (Failed to delete role for ID ${roleId})` }, { status: 500 });
  }
}

export const GET = requirePermission('roles:read')(getRoleByIdHandler);
export const PUT = requirePermission('roles:update')(updateRoleHandler);
export const DELETE = requirePermission('roles:delete')(deleteRoleHandler);

[end of app/api/v2/roles/[roleId]/route.ts]
