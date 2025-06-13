// 文件路径: app/api/v2/roles/[roleId]/route.ts
// 描述: 此文件处理针对特定角色资源 (由 roleId 标识) 的 API 请求，
// 包括获取角色详情 (GET), 更新角色信息 (PUT), 以及删除角色 (DELETE)。
// 使用 `requirePermission` 中间件进行访问控制。

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma ORM 客户端。
import { Prisma } from '@prisma/client'; // Prisma 生成的类型。
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入权限控制中间件。
import { z } from 'zod'; // Zod 库，用于数据验证。

// 定义路由上下文接口，用于从动态路由参数中获取 roleId。
interface RouteContext {
  params: {
    roleId: string; // 目标角色的ID，从URL路径参数中提取。
  };
}

// --- Zod Schema 定义 ---
// 用于验证更新角色请求体的数据结构和规则。
// PUT 请求通常用于全量更新，但此处实现更接近 PATCH，允许部分字段更新。
// 明确禁止通过此接口修改角色的 `name` (内部标识符)。
const UpdateRoleSchema = z.object({
  // 角色显示名称 (可选更新)
  displayName: z.string()
    .min(1, "显示名称不能为空 (Display name cannot be empty)")
    .max(100, "显示名称不能超过100个字符 (Display name cannot exceed 100 characters long)")
    .optional(),
  // 角色描述 (可选更新，可以设置为 null 来清空)
  description: z.string()
    .max(255, "描述信息不能超过255个字符 (Description cannot exceed 255 characters long)")
    .optional()
    .nullable(), // 允许显式传递 null 来清空描述
  // 角色是否激活 (可选更新)
  isActive: z.boolean().optional(),
});

// 定义一组核心系统角色名称。这些角色通常具有特殊意义，不应被轻易删除或修改。
const CORE_SYSTEM_ROLES = ['SYSTEM_ADMIN', 'USER', 'USER_ADMIN', 'PERMISSION_ADMIN', 'CLIENT_ADMIN', 'AUDIT_ADMIN'];


/**
 * GET /api/v2/roles/{roleId} - 获取特定角色详情
 * 此处理函数响应 GET 请求，返回指定 roleId 的角色详细信息。
 * 需要 'roles:read' 权限。
 * @param req AuthenticatedRequest - 经过认证的请求对象。
 * @param context RouteContext - 包含从URL路径中提取的 roleId。
 * @returns NextResponse - 包含角色信息或错误信息的 JSON 响应。
 */
async function getRoleByIdHandler(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { roleId } = context.params; // 从上下文中获取 roleId。
  try {
    // 从数据库中查找具有指定 ID 的角色。
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      // (可选) 如果需要同时返回与此角色关联的权限信息，可以取消注释下面的 include：
      // include: { rolePermissions: { include: { permission: true } } }
    });

    if (!role) {
      // 如果未找到角色，返回404 Not Found错误。
      return NextResponse.json({ message: '角色未找到 (Role not found)' }, { status: 404 });
    }
    // 返回找到的角色信息，HTTP状态码为 200 OK。
    return NextResponse.json(role);
  } catch (error) {
    // 错误处理：记录错误并返回500服务器错误。
    console.error(`获取角色 ${roleId} 详情失败 (Failed to fetch role details for ID ${roleId}):`, error);
    return NextResponse.json({ message: `获取角色详情时发生错误 (An error occurred while retrieving role details for ID ${roleId})` }, { status: 500 });
  }
}

/**
 * PUT /api/v2/roles/{roleId} - 更新特定角色信息
 * 此处理函数响应 PUT 请求，用于更新指定 roleId 的角色信息。
 * 请求体需要符合 `UpdateRoleSchema` 的定义。
 * 禁止修改角色的 `name` 字段和停用 `SYSTEM_ADMIN` 角色。
 * 需要 'roles:update' 权限。
 * @param req AuthenticatedRequest - 经过认证的请求对象。
 * @param context RouteContext - 包含 roleId。
 * @returns NextResponse - 包含更新后的角色信息或错误信息的 JSON 响应。
 */
async function updateRoleHandler(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { roleId } = context.params; // 目标角色ID。
  let body;
  try {
    // 解析请求体中的 JSON 数据。
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ message: '无效的JSON请求体 (Invalid JSON request body)' }, { status: 400 });
  }

  // 使用 Zod Schema 验证请求体数据。
  const validationResult = UpdateRoleSchema.safeParse(body);
  if (!validationResult.success) {
    // 如果验证失败，返回400错误及详细信息。
    return NextResponse.json({
      message: '更新角色信息验证失败 (Role update input validation failed)',
      errors: validationResult.error.format(),
    }, { status: 400 });
  }

  // 从验证成功的数据中解构出待更新的字段。
  const { displayName, description, isActive } = validationResult.data;

  // 确保请求体中至少有一个字段需要更新。
  if (Object.keys(validationResult.data).length === 0) {
    return NextResponse.json({ message: '请求体中至少需要一个待更新的字段 (At least one field to update is required in the request body)' }, { status: 400 });
  }

  try {
    // 步骤 1: 检查角色是否存在。
    const existingRole = await prisma.role.findUnique({ where: { id: roleId } });
    if (!existingRole) {
      return NextResponse.json({ message: '角色未找到，无法更新 (Role not found, cannot update)' }, { status: 404 });
    }

    // 步骤 2: 安全性检查 - 防止修改核心系统角色的关键属性。
    // 特别地，不允许停用 'SYSTEM_ADMIN' 角色。
    // 角色的 'name' (内部标识符) 通常不应通过通用更新接口修改，以避免破坏系统依赖。
    // 如果需要修改 'name'，应考虑专门的、更受限的流程。
    if (CORE_SYSTEM_ROLES.includes(existingRole.name) && isActive === false && existingRole.name === 'SYSTEM_ADMIN') {
        return NextResponse.json({ message: '禁止操作：不能停用 SYSTEM_ADMIN 角色 (Forbidden: Cannot deactivate the SYSTEM_ADMIN role)' }, { status: 403 });
    }
    // 如果请求中尝试修改 'name' 字段，可以明确拒绝。
    // if (body.name && body.name !== existingRole.name) {
    //   return NextResponse.json({ message: '禁止操作：不允许修改角色名称 (Forbidden: Modifying the role name is not allowed)' }, { status: 403 });
    // }


    // 步骤 3: 执行角色信息更新。
    // Prisma `update` 操作会忽略值为 `undefined` 的字段，从而实现部分更新。
    const updatedRole = await prisma.role.update({
      where: { id: roleId }, // 指定要更新的角色。
      data: {
        // 只有当字段在 validationResult.data 中明确提供时，才包含在更新数据中。
        displayName: displayName !== undefined ? displayName : undefined,
        // 如果 description 显式设为 null，则会清空数据库中的描述。
        description: description !== undefined ? description : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
        // updatedAt 会由 Prisma 自动更新 (通常在 schema 中配置了 @updatedAt)。
      },
    });
    // 返回更新后的角色信息。
    return NextResponse.json(updatedRole);
  } catch (error) {
    // 错误处理。
    console.error(`更新角色 ${roleId} 失败 (Failed to update role ${roleId}):`, error);
    // 此处可以根据 Prisma 错误代码进行更细致的错误处理，例如 P2002 (唯一约束冲突，如果 displayName 也要求唯一)。
    return NextResponse.json({ message: `更新角色时发生错误 (An error occurred while updating role for ID ${roleId})` }, { status: 500 });
  }
}

/**
 * DELETE /api/v2/roles/{roleId} - 删除特定角色
 * 此处理函数响应 DELETE 请求，用于删除指定 roleId 的角色。
 * 核心系统角色不能被删除。如果角色仍被分配给任何用户，则也禁止删除。
 * 需要 'roles:delete' 权限。
 * @param req AuthenticatedRequest - 经过认证的请求对象。
 * @param context RouteContext - 包含 roleId。
 * @returns NextResponse - 成功时返回 204 No Content，或错误信息的 JSON 响应。
 */
async function deleteRoleHandler(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { roleId } = context.params; // 目标角色ID。
  try {
    // 步骤 1: 检查角色是否存在。
    const roleToDelete = await prisma.role.findUnique({ where: { id: roleId } });
    if (!roleToDelete) {
      return NextResponse.json({ message: '角色未找到，无法删除 (Role not found, cannot delete)' }, { status: 404 });
    }

    // 步骤 2: 防止删除核心系统角色。
    // `CORE_SYSTEM_ROLES` 数组包含了不能被删除的角色名称。
    if (CORE_SYSTEM_ROLES.includes(roleToDelete.name)) {
      return NextResponse.json({ message: `核心系统角色 "${roleToDelete.name}" 不能被删除 (Core system role "${roleToDelete.name}" cannot be deleted)` }, { status: 403 });
    }

    // 步骤 3: 检查角色是否仍被任何用户分配。
    // 如果角色仍在使用中，则不应删除，以维护数据完整性。
    const usersWithRoleCount = await prisma.userRole.count({ where: { roleId: roleId } });
    if (usersWithRoleCount > 0) {
      return NextResponse.json({ message: `角色 "${roleToDelete.name}" 仍被 ${usersWithRoleCount} 个用户使用，无法删除 (Role "${roleToDelete.name}" is still in use by ${usersWithRoleCount} users and cannot be deleted)` }, { status: 409 }); // 409 Conflict
    }

    // 步骤 4: 执行删除操作。
    // 注意：如果 Role 与 RolePermission 之间有关系，且 RolePermission 中有记录引用此 roleId，
    // 并且 Prisma Schema 中定义了限制性外键 (没有 onDelete: Cascade)，则此删除也会失败。
    // 需要确保在删除角色前，所有关联的 RolePermission 记录也已被处理。
    // （通常，RolePermission 记录应在角色被删除时级联删除，或在分配权限的接口中处理好解绑逻辑）。
    await prisma.role.delete({ where: { id: roleId } });

    // 返回 HTTP 204 No Content 表示成功删除且无内容返回。
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    // 错误处理。
    console.error(`删除角色 ${roleId} 失败 (Failed to delete role ${roleId}):`, error);
    // 捕获 Prisma 特定的错误。
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P2003: 外键约束失败。这可能发生在例如 RolePermission 记录仍然存在，
        // 并且数据库模式阻止删除被引用的角色时。
        if (error.code === 'P2003') {
             return NextResponse.json({ message: '无法删除角色，因为它仍被其他记录（如权限分配）所引用 (Cannot delete role as it is still referenced by other records, e.g., permission assignments)' }, { status: 409 });
        }
    }
    return NextResponse.json({ message: `删除角色时发生错误 (An error occurred while deleting role for ID ${roleId})` }, { status: 500 });
  }
}

// 使用 `requirePermission` 中间件包装处理函数，并导出为相应的 HTTP 方法。
export const GET = requirePermission('roles:read')(getRoleByIdHandler);
export const PUT = requirePermission('roles:update')(updateRoleHandler);
export const DELETE = requirePermission('roles:delete')(deleteRoleHandler);

[end of app/api/v2/roles/[roleId]/route.ts]
