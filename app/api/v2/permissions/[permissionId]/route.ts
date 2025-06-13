// 文件路径: app/api/v2/permissions/[permissionId]/route.ts
// 描述: 此文件处理针对特定权限定义 (由 permissionId 标识) 的 API 请求，
// 包括获取权限详情 (GET), 更新权限信息 (PUT), 以及删除权限 (DELETE)。
// 使用 `requirePermission` 中间件进行访问控制。

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma ORM 客户端。
import { Prisma, PermissionType, HttpMethod } from '@prisma/client'; // Prisma 生成的类型。
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入权限控制中间件。
import { z } from 'zod'; // Zod 库，用于数据验证。

// 定义路由上下文接口，用于从动态路由参数中获取 permissionId。
interface RouteContext {
  params: {
    permissionId: string; // 目标权限的ID。
  };
}

// --- Zod Schema 定义 ---
// 用于验证更新权限时，各特定类型权限详情的请求体数据结构。
// 所有字段都是可选的，因为 PATCH/PUT 可能只更新部分信息。

// API 类型权限详情更新 Schema。
const ApiDetailsUpdateSchema = z.object({
  httpMethod: z.nativeEnum(HttpMethod).optional(), // HTTP方法 (可选)。
  endpoint: z.string().startsWith('/', "API端点路径必须以'/'开头 (Endpoint path must start with '/')").optional(), // 端点路径 (可选)。
  rateLimit: z.number().int().positive().optional().nullable(), // 速率限制 (可选，可设为null清空)。
});

// 菜单类型权限详情更新 Schema。
const MenuDetailsUpdateSchema = z.object({
  menuId: z.string().cuid("无效的菜单ID格式 (Invalid Menu ID format: must be a CUID)").optional(), // 关联的菜单ID (可选)。
});

// 数据类型权限详情更新 Schema。
const DataDetailsUpdateSchema = z.object({
  tableName: z.string().min(1, "表名不能为空 (Table name cannot be empty)").optional(), // 表名 (可选)。
  columnName: z.string().optional().nullable(), // 列名 (可选，可设为null清空)。
  conditions: z.string().optional().nullable(), // JSON字符串条件 (可选，可设为null清空)。
});

// 更新权限的主 Schema。
// 注意: 权限的 `name` (内部唯一标识符) 和 `type` (权限类型) 通常被认为是不可变的。
// 如果需要修改这些，通常意味着删除旧权限并创建一个新权限。
const UpdatePermissionSchema = z.object({
  displayName: z.string().min(1, "显示名称不能为空 (Display name cannot be empty)").max(150, "显示名称长度不能超过150字符").optional(),
  description: z.string().max(255, "描述信息长度不能超过255字符").optional().nullable(),
  // `name` 和 `type` 字段在此处被省略，因为它们通常不应通过更新操作修改。
  resource: z.string().min(1, "资源标识不能为空 (Resource identifier cannot be empty)").max(200, "资源标识长度不能超过200字符").optional(),
  action: z.string().min(1, "操作不能为空 (Action cannot be empty)").max(50, "操作名称长度不能超过50字符").optional(),
  isActive: z.boolean().optional(), // 是否激活 (可选)。
  apiDetails: ApiDetailsUpdateSchema.optional(),   // API特定详情 (可选)。
  menuDetails: MenuDetailsUpdateSchema.optional(), // 菜单特定详情 (可选)。
  dataDetails: DataDetailsUpdateSchema.optional(), // 数据特定详情 (可选)。
});


/**
 * GET /api/v2/permissions/{permissionId} - 获取特定权限定义详情
 * 此处理函数响应 GET 请求，返回指定 permissionId 的权限详细信息，包括其特定类型的详情。
 * 需要 'permissions:read' 权限。
 * @param req AuthenticatedRequest - 经过认证的请求对象。
 * @param context RouteContext - 包含从URL路径中提取的 permissionId。
 * @returns NextResponse - 包含权限信息或错误信息的 JSON 响应。
 */
async function getPermissionByIdHandler(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { permissionId } = context.params; // 从上下文中获取 permissionId。
  try {
    // 从数据库中查找具有指定 ID 的权限。
    // 使用 `include` 同时加载关联的特定类型权限详情。
    const permission = await prisma.permission.findUnique({
      where: { id: permissionId },
      include: { // 加载所有可能的特定类型权限关联表。
        apiPermission: true,  // 如果是API权限，则加载ApiPermission记录。
        menuPermission: { include: { menu: true } }, // 如果是菜单权限，加载MenuPermission并进一步加载关联的Menu。
        dataPermission: true, // 如果是数据权限，则加载DataPermission记录。
      },
    });

    if (!permission) {
      // 如果未找到权限定义，返回404 Not Found错误。
      return NextResponse.json({ message: '权限定义未找到 (Permission definition not found)' }, { status: 404 });
    }
    // 返回找到的权限定义信息，HTTP状态码为 200 OK。
    return NextResponse.json(permission);
  } catch (error) {
    // 错误处理。
    console.error(`获取权限 ${permissionId} 详情失败 (Failed to fetch permission details for ID ${permissionId}):`, error);
    return NextResponse.json({ message: '获取权限定义详情时发生错误 (An error occurred while retrieving permission definition details)' }, { status: 500 });
  }
}

/**
 * PUT /api/v2/permissions/{permissionId} - 更新特定权限定义信息
 * 此处理函数响应 PUT 请求，用于更新指定 permissionId 的权限信息及其特定类型的详情。
 * 请求体需要符合 `UpdatePermissionSchema` 的定义。
 * 关键字段如 `name` 和 `type` 通常不允许修改。
 * 使用数据库事务确保基础权限记录和特定类型详情记录的原子性更新。
 * 需要 'permissions:update' 权限。
 * @param req AuthenticatedRequest - 经过认证的请求对象。
 * @param context RouteContext - 包含 permissionId。
 * @returns NextResponse - 包含更新后的完整权限信息或错误信息的 JSON 响应。
 */
async function updatePermissionHandler(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { permissionId } = context.params; // 目标权限ID。
  let body;
  try {
    body = await req.json(); // 解析请求体。
  } catch (e) {
    return NextResponse.json({ message: '无效的JSON请求体 (Invalid JSON request body)' }, { status: 400 });
  }

  // 使用 Zod Schema 验证请求体数据。
  const validationResult = UpdatePermissionSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json({
      message: '更新权限的输入数据验证失败 (Permission update input validation failed)',
      errors: validationResult.error.format(),
    }, { status: 400 });
  }

  const updateData = validationResult.data; // 获取验证后的待更新数据。

  // 如果请求体为空 (没有任何有效字段用于更新)，则返回400错误。
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ message: '请求体中至少需要一个待更新的字段 (At least one field to update is required in the request body)' }, { status: 400 });
  }

  try {
    // 步骤 1: 检查权限定义是否存在。
    const existingPermission = await prisma.permission.findUnique({ where: { id: permissionId } });
    if (!existingPermission) {
      return NextResponse.json({ message: '权限定义未找到，无法更新 (Permission definition not found, cannot update)' }, { status: 404 });
    }

    // 步骤 2: 安全性检查 - 明确禁止修改权限的 `name` (内部标识符) 和 `type` (类型)。
    // 这些字段通常被认为是权限的核心标识，修改它们可能会破坏系统依赖和一致性。
    if ((updateData as any).name || (updateData as any).type) {
        return NextResponse.json({ message: '权限的 "name" (名称) 和 "type" (类型) 字段不可修改 (The "name" and "type" fields of a permission cannot be changed)' }, { status: 400 });
    }

    // 步骤 3: 使用数据库事务执行更新操作，确保原子性。
    const updatedPermissionResult = await prisma.$transaction(async (tx) => {
      // 3a. 准备基础权限记录 (Permission table) 的更新数据。
      const basePermissionUpdateData: Prisma.PermissionUpdateInput = {};
      if (updateData.displayName !== undefined) basePermissionUpdateData.displayName = updateData.displayName;
      if (updateData.description !== undefined) basePermissionUpdateData.description = updateData.description; // 允许设为 null
      if (updateData.resource !== undefined) basePermissionUpdateData.resource = updateData.resource;
      if (updateData.action !== undefined) basePermissionUpdateData.action = updateData.action;
      if (updateData.isActive !== undefined) basePermissionUpdateData.isActive = updateData.isActive;

      let currentPermissionState = existingPermission; // 用于下面返回，如果基础部分未更新则返回原始状态
      // 如果基础权限部分有字段需要更新，则执行更新。
      if (Object.keys(basePermissionUpdateData).length > 0) {
        currentPermissionState = await tx.permission.update({
            where: { id: permissionId },
            data: basePermissionUpdateData,
        });
      }

      // 3b. 根据权限类型 (type)，更新对应的特定类型详情记录。
      // 确保只更新与 `existingPermission.type` 匹配的详情表。
      if (existingPermission.type === PermissionType.API && updateData.apiDetails) {
        await tx.apiPermission.update({ where: { permissionId }, data: updateData.apiDetails });
      } else if (existingPermission.type === PermissionType.MENU && updateData.menuDetails) {
        // 如果更新 menuDetails 并且包含 menuId，则验证新的 menuId 是否有效。
        if (updateData.menuDetails.menuId) {
            const menuExists = await tx.menu.count({ where: { id: updateData.menuDetails.menuId }});
            if (menuExists === 0) {
                throw new Error(`关联的菜单ID "${updateData.menuDetails.menuId}" 无效或不存在 (The associated Menu ID "${updateData.menuDetails.menuId}" is invalid or does not exist)`);
            }
        }
        await tx.menuPermission.update({ where: { permissionId }, data: updateData.menuDetails });
      } else if (existingPermission.type === PermissionType.DATA && updateData.dataDetails) {
        await tx.dataPermission.update({ where: { permissionId }, data: updateData.dataDetails });
      }
      // 从事务中返回更新后 (或原始) 的权限基础记录。
      return currentPermissionState;
    });

    // 步骤 4: 为了返回完整的更新后权限信息 (包括特定类型详情)，在事务成功后重新查询一次。
    const fullUpdatedPermission = await prisma.permission.findUnique({
        where: { id: updatedPermissionResult.id }, // 使用事务返回的ID确保一致性
        include: { apiPermission: true, menuPermission: { include: { menu: true } }, dataPermission: true }
    });
    // 返回更新后的完整权限信息。
    return NextResponse.json(fullUpdatedPermission);

  } catch (error: any) {
    // 错误处理。
    console.error(`更新权限 ${permissionId} 失败 (Failed to update permission ID ${permissionId}):`, error);
    // 处理在事务中自定义抛出的关于菜单ID无效的错误。
    if (error.message.includes("菜单ID")) {
        return NextResponse.json({ message: error.message }, { status: 400 });
    }
    // 其他 Prisma 错误或未知错误。
    return NextResponse.json({ message: '更新权限定义时发生错误 (An error occurred while updating permission definition)' }, { status: 500 });
  }
}

/**
 * DELETE /api/v2/permissions/{permissionId} - 删除特定权限定义
 * 此处理函数响应 DELETE 请求，用于删除指定 permissionId 的权限及其关联的特定类型详情。
 * 如果权限仍被任何角色分配，则禁止删除。
 * 使用数据库事务确保原子性删除。
 * 需要 'permissions:delete' 权限。
 * @param req AuthenticatedRequest - 经过认证的请求对象。
 * @param context RouteContext - 包含 permissionId。
 * @returns NextResponse - 成功时返回 204 No Content，或错误信息的 JSON 响应。
 */
async function deletePermissionHandler(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { permissionId } = context.params; // 目标权限ID。
  try {
    // 步骤 1: 检查权限定义是否存在。
    const permission = await prisma.permission.findUnique({ where: { id: permissionId } });
    if (!permission) {
      return NextResponse.json({ message: '权限定义未找到，无法删除 (Permission definition not found, cannot delete)' }, { status: 404 });
    }

    // 步骤 2: 检查此权限是否仍被任何角色分配。
    // 如果权限仍在使用中，则不应删除，以维护数据完整性和权限策略的一致性。
    const rolesWithPermissionCount = await prisma.rolePermission.count({ where: { permissionId: permissionId } });
    if (rolesWithPermissionCount > 0) {
      return NextResponse.json({ message: `权限 "${permission.name}" 仍被 ${rolesWithPermissionCount} 个角色使用，无法删除 (Permission "${permission.name}" is still in use by ${rolesWithPermissionCount} roles and cannot be deleted)` }, { status: 409 }); // 409 Conflict
    }

    // 步骤 3: 使用数据库事务来原子性地删除权限基础记录及其关联的特定类型权限记录。
    await prisma.$transaction(async (tx) => {
      // 3a. 根据权限类型删除对应的特定类型详情记录。
      if (permission.type === PermissionType.API) {
        await tx.apiPermission.deleteMany({ where: { permissionId } }); // 使用 deleteMany 以防万一 permissionId 不是主键或唯一键 (虽然通常是)
      } else if (permission.type === PermissionType.MENU) {
        await tx.menuPermission.deleteMany({ where: { permissionId } });
      } else if (permission.type === PermissionType.DATA) {
        await tx.dataPermission.deleteMany({ where: { permissionId } });
      }
      // 3b. 删除权限基础记录。
      await tx.permission.delete({ where: { id: permissionId } });
    });

    // 返回 HTTP 204 No Content 表示成功删除且无内容返回。
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    // 错误处理。
    console.error(`删除权限 ${permissionId} 失败 (Failed to delete permission ID ${permissionId}):`, error);
    // 捕获 Prisma 特定的错误。P2003 (外键约束)理论上已被上面的 RolePermission 检查所覆盖，
    // 但如果存在其他未预料的关联，则仍可能发生。
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        return NextResponse.json({ message: '无法删除权限，因为它可能仍被其他系统记录所引用 (Cannot delete permission as it might still be referenced by other system records)' }, { status: 409 });
    }
    return NextResponse.json({ message: '删除权限定义时发生错误 (An error occurred while deleting permission definition)' }, { status: 500 });
  }
}

// 使用 `requirePermission` 中间件包装处理函数，并导出为相应的 HTTP 方法。
export const GET = requirePermission('permissions:read')(getPermissionByIdHandler);
export const PUT = requirePermission('permissions:update')(updatePermissionHandler);
export const DELETE = requirePermission('permissions:delete')(deletePermissionHandler);

[end of app/api/v2/permissions/[permissionId]/route.ts]
