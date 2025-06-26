// 文件路径: app/api/v2/permissions/[permissionId]/route.ts
// 描述: 此文件处理针对特定权限定义 (由 permissionId 标识) 的 API 请求，
// 包括获取权限详情 (GET), 更新权限信息 (PUT), 以及删除权限 (DELETE)。
// 使用 `withAuth` 中间件进行访问控制。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database'; // Prisma ORM 客户端。
import { Prisma, PermissionType, HttpMethod } from '@prisma/client'; // Prisma 生成的类型。
import { withAuth, type AuthContext } from '@repo/lib/middleware'; // 引入权限控制中间件。
import { withErrorHandling } from '@repo/lib';
import { AuthorizationUtils } from '@repo/lib/auth'; // For Audit Logging
import { z } from 'zod'; // Zod 库，用于数据验证。

// 定义路由上下文接口，用于从动态路由参数中获取 permissionId。
interface RouteParams {
  permissionId: string;
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
async function getPermissionByIdHandler(
  req: NextRequest,
  { authContext, params }: { authContext: AuthContext; params: RouteParams }
): Promise<NextResponse> {
  const { permissionId } = params;
  const performingAdminId = authContext.user_id;
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

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
      await AuthorizationUtils.logAuditEvent({
          userId: performingAdminId,
          action: 'PERMISSION_READ_FAILURE_NOT_FOUND',
          resource: `Permission:${permissionId}`,
          ipAddress,
          userAgent,
          success: false,
          errorMessage: 'Permission definition not found.',
          metadata: { permissionId }
      });
      return NextResponse.json({ message: '权限定义未找到 (Permission definition not found)' }, { status: 404 });
    }

    await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'PERMISSION_READ_SUCCESS',
        resource: `Permission:${permissionId}`,
        ipAddress,
        userAgent,
        success: true,
        metadata: { 
          permissionId,
          permissionName: permission.name, 
          permissionType: permission.type 
        }
    });
    return NextResponse.json(permission);
  } catch (error: any) {
    console.error(`获取权限 ${permissionId} 详情失败 (Failed to fetch permission details for ID ${permissionId}):`, error);
    await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'PERMISSION_READ_FAILURE_DB_ERROR',
        resource: `Permission:${permissionId}`,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: `Failed to fetch permission details for ID ${permissionId}.`,
        metadata: { permissionId, error: error.message }
    });
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
async function updatePermissionHandler(
  req: NextRequest,
  { authContext, params }: { authContext: AuthContext; params: RouteParams }
): Promise<NextResponse> {
  const { permissionId } = params;
  const performingAdminId = authContext.user_id;
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  let body;
  try {
    body = await req.json(); // 解析请求体。
  } catch (e: any) {
    await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'PERMISSION_UPDATE_FAILURE_INVALID_JSON',
          resource: `Permission:${permissionId}`,
          success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Invalid JSON request body for permission update.',
        metadata: { error: e.message }
    });
    return NextResponse.json({ message: '无效的JSON请求体 (Invalid JSON request body)' }, { status: 400 });
  }

  const validationResult = UpdatePermissionSchema.safeParse(body);
  if (!validationResult.success) {
    await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'PERMISSION_UPDATE_FAILURE_VALIDATION',
          resource: `Permission:${permissionId}`,
          success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Permission update payload validation failed.',
        metadata: { issues: validationResult.error.format(), receivedBody: body }
    });
    return NextResponse.json({
      message: '更新权限的输入数据验证失败 (Permission update input validation failed)',
      errors: validationResult.error.format()
    }, { status: 400 });
  }

  const updateData = validationResult.data;

  if (Object.keys(updateData).length === 0) {
    await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'PERMISSION_UPDATE_FAILURE_EMPTY_BODY',
          resource: `Permission:${permissionId}`,
          success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Request body empty for permission update.'
    });
    return NextResponse.json({ message: '请求体中至少需要一个待更新的字段 (At least one field to update is required in the request body)' }, { status: 400 });
  }

  try {
    const existingPermission = await prisma.permission.findUnique({ where: { id: permissionId } });
    if (!existingPermission) {
      await AuthorizationUtils.logAuditEvent({
          userId: performingAdminId,
          action: 'PERMISSION_UPDATE_FAILURE_NOT_FOUND',
          resource: `Permission:${permissionId}`,
          success: false,
          ipAddress,
          userAgent,
          errorMessage: 'Permission definition not found to update.'
      });
      return NextResponse.json({ message: '权限定义未找到，无法更新 (Permission definition not found, cannot update)' }, { status: 404 });
    }

    if ((updateData as any).name || (updateData as any).type) {
        await AuthorizationUtils.logAuditEvent({
            userId: performingAdminId,
            action: 'PERMISSION_UPDATE_FAILURE_IMMUTABLE_FIELDS',
          resource: `Permission:${permissionId}`,
          success: false,
            ipAddress,
            userAgent,
            errorMessage: 'Attempted to modify immutable fields (name or type) of a permission.',
            metadata: {
                attemptedName: (updateData as any).name,
                attemptedType: (updateData as any).type,
                currentName: existingPermission.name,
                currentType: existingPermission.type
            }
        });
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
    await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'PERMISSION_UPDATE_SUCCESS',
          resource: `Permission:${permissionId}`,
          success: true,
        ipAddress,
        userAgent,
        metadata: {
            permissionId: permissionId,
            updatedFields: Object.keys(updateData),
            originalName: existingPermission.name, // Log original name for context
        }
    });
    return NextResponse.json(fullUpdatedPermission);

  } catch (error: any) {
    console.error(`更新权限 ${permissionId} 失败 (Failed to update permission ID ${permissionId}):`, error);
    let errorMessage = 'An error occurred while updating permission definition';
    let actionCode = 'PERMISSION_UPDATE_FAILURE_DB_ERROR';
    let httpStatus = 500;

    if (error.message.includes("菜单ID")) {
        errorMessage = error.message;
        actionCode = 'PERMISSION_UPDATE_FAILURE_INVALID_MENU_ID';
        httpStatus = 400;
    }

    await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: actionCode,
          success: false,
        ipAddress,
        userAgent,
        errorMessage: errorMessage,
        metadata: {
            error: error.message,
            errorCode: (error as any).code,
            attemptedUpdateData: updateData
        }
    });
    return NextResponse.json({ message: errorMessage }, { status: httpStatus });
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
async function deletePermissionHandler(
  req: NextRequest,
  { authContext, params }: { authContext: AuthContext; params: RouteParams }
): Promise<NextResponse> {
  const { permissionId } = params;
  const performingAdminId = authContext.user_id;
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  try {
    // 步骤 1: 检查权限定义是否存在。
    const permission = await prisma.permission.findUnique({ where: { id: permissionId }, include: { rolePermissions: true } });
    if (!permission) {
      await AuthorizationUtils.logAuditEvent({
          userId: performingAdminId,
          action: 'PERMISSION_DELETE_FAILURE_NOT_FOUND',
          resource: `Permission:${permissionId}`,
          success: false,
          ipAddress,
          userAgent,
          errorMessage: 'Permission definition not found to delete.'
      });
      return NextResponse.json({ message: '权限定义未找到 (Permission definition not found)' }, { status: 404 });
    }

    // 步骤 2: 检查此权限是否仍被任何角色分配。
    const rolesWithPermissionCount = permission.rolePermissions.length;
    if (rolesWithPermissionCount > 0) {
      await AuthorizationUtils.logAuditEvent({
          userId: performingAdminId,
          action: 'PERMISSION_DELETE_FAILURE_IN_USE',
          resource: `Permission:${permissionId}`,
          success: false,
          ipAddress,
          userAgent,
          errorMessage: `Permission "${permission.name}" is still in use by ${rolesWithPermissionCount} roles.`,
          metadata: { permissionName: permission.name, rolesCount: rolesWithPermissionCount }
      });
      return NextResponse.json({ message: `此权限仍被 ${rolesWithPermissionCount} 个角色使用，无法删除 (This permission is still in use by ${rolesWithPermissionCount} roles and cannot be deleted)` }, { status: 409 }); // 409 Conflict
    }

    // 步骤 3: 使用数据库事务来原子性地删除权限基础记录及其关联的特定类型权限记录。
    await prisma.$transaction(async (tx) => {
      // 3a. 根据权限类型删除对应的特定类型详情记录。
      if (permission.type === PermissionType.API) {
        await tx.apiPermission.delete({ where: { permissionId } }); // 使用 deleteMany 以防万一 permissionId 不是主键或唯一键 (虽然通常是)
      } else if (permission.type === PermissionType.MENU) {
        await tx.menuPermission.delete({ where: { permissionId } });
      } else if (permission.type === PermissionType.DATA) {
        await tx.dataPermission.delete({ where: { permissionId } });
      }
      // 3b. 删除权限基础记录。
      await tx.permission.delete({ where: { id: permissionId } });
    });

    await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'PERMISSION_DELETE_SUCCESS',
          resource: `Permission:${permissionId}`,
          success: true,
        ipAddress,
        userAgent,
        metadata: { deletedPermissionName: permission.name }
    });
    // 返回 HTTP 204 No Content 表示成功删除且无内容返回。
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error(`删除权限 ${permissionId} 失败 (Failed to delete permission ID ${permissionId}):`, error);
    let errorMessage = 'An error occurred while deleting permission definition';
    let actionCode = 'PERMISSION_DELETE_FAILURE_DB_ERROR';
    let httpStatus = 500;

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        errorMessage = 'Cannot delete permission as it might still be referenced by other system records';
        actionCode = 'PERMISSION_DELETE_FAILURE_FOREIGN_KEY';
        httpStatus = 409;
    }

    await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: actionCode,
          success: false,
        ipAddress,
        userAgent,
        errorMessage: errorMessage,
        metadata: { error: error.message, permissionId }
    });
    return NextResponse.json({ message: errorMessage }, { status: httpStatus });
  }
}

// 使用 `withAuth` 中间件包装处理函数，并导出为相应的 HTTP 方法。
export const GET = withErrorHandling(
  withAuth(getPermissionByIdHandler, { requiredPermissions: ['permission:read'] })
);
export const PUT = withErrorHandling(
  withAuth(updatePermissionHandler, { requiredPermissions: ['permission:update'] })
);
export const DELETE = withErrorHandling(
  withAuth(deletePermissionHandler, { requiredPermissions: ['permission:delete'] })
);
