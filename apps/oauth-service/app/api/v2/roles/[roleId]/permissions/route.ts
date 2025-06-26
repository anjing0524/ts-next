// 文件路径: app/api/v2/roles/[roleId]/permissions/route.ts
// 描述: 此文件处理特定角色 (由 roleId 标识) 与其关联权限 (Permissions) 之间的管理操作。
// 包括列出分配给角色的所有权限 (GET) 和为角色分配新的权限 (POST)。
// 使用 `requirePermission` 中间件进行访问控制。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database'; // Prisma ORM 客户端。
import { Prisma } from '@prisma/client'; // Prisma 生成的类型。
import { withAuth, type AuthContext } from '@repo/lib/middleware'; // 引入权限控制中间件。
import { withErrorHandling } from '@repo/lib';
import { AuthorizationUtils } from '@repo/lib/auth'; // For Audit Logging
import { z } from 'zod'; // Zod 库，用于数据验证。

// 定义路由上下文接口，用于从动态路由参数中获取 roleId。
interface RouteContext {
  params: {
    roleId: string; // 目标角色的ID。
  };
}

// --- Zod Schema 定义 ---
// 用于验证分配权限请求体的数据结构和规则。
const AssignPermissionsSchema = z.object({
  // permissionIds 必须是一个字符串数组，每个字符串都应是有效的 CUID (Prisma ID格式)。
  // 数组可以为空，表示移除所有权限。
  permissionIds: z
    .array(z.string().cuid('无效的权限ID格式 (Invalid permission ID format: must be a CUID)'))
    .min(
      0,
      '权限ID列表可以为空，表示移除所有权限 (Permission IDs array can be empty to remove all permissions)'
    ),
});

/**
 * GET /api/v2/roles/{roleId}/permissions - 列出特定角色的所有权限
 * 此处理函数响应 GET 请求，返回指定 roleId 的角色当前拥有的所有权限的详细信息。
 * 需要 'role:permissions:list' 或 'roles:permissions:read' 权限 (根据实际权限命名)。
 * @param req AuthenticatedRequest - 经过认证的请求对象。
 * @param context RouteContext - 包含从URL路径中提取的 roleId。
 * @returns NextResponse - 包含权限列表或错误信息的 JSON 响应。
 */
async function listRolePermissionsHandler(
  req: NextRequest,
  context: RouteContext & { authContext: AuthContext }
): Promise<NextResponse> {
  const { roleId } = context.params; // 从上下文中获取 roleId。
  const performingAdmin = undefined as any; // TODO: 从认证中间件获取用户信息
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  try {
    // 步骤 1: 查询角色是否存在，并同时包含其关联的 RolePermission 及 Permission 记录。
    const roleWithPermissions = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        // 使用 include 加载关联数据。
        rolePermissions: {
          // 加载此角色的所有 RolePermission 记录。
          include: {
            permission: true, // 对于每个 RolePermission 记录，进一步加载关联的 Permission 对象的完整详情。
          },
          orderBy: { permission: { name: 'asc' } }, // 按关联权限的名称升序排序。
        },
      },
    });

    if (!roleWithPermissions) {
      await AuthorizationUtils.logAuditEvent({
        userId: performingAdmin?.id,
        action: 'ROLE_PERMISSIONS_LIST_FAILURE_ROLE_NOT_FOUND',
        resource: `Role:${roleId}`,
        success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Role not found when trying to list its permissions.',
      });
      return NextResponse.json({ message: '角色未找到 (Role not found)' }, { status: 404 });
    }

    // 步骤 2: 从查询结果中提取并格式化权限列表。
    // roleWithPermissions.rolePermissions 是一个 RolePermission 对象的数组。
    // 我们需要的是每个 RolePermission 对象中的 permission 属性。
    const permissions = roleWithPermissions.rolePermissions
      .map((rp) => rp.permission) // 提取 Permission 对象。
      .filter((p) => p !== null && p.isActive === true); // 过滤掉可能为空或非激活的权限。
    // 通常，只应展示和管理激活的权限。

    await AuthorizationUtils.logAuditEvent({
      userId: performingAdmin?.id,
      action: 'ROLE_PERMISSIONS_LIST_SUCCESS',
      resource: `Role:${roleId}`,
      success: true,
      ipAddress,
      userAgent,
      metadata: { roleName: roleWithPermissions.name, listedPermissionsCount: permissions.length },
    });
    // 返回权限列表。
    return NextResponse.json({ permissions });
  } catch (error: any) {
    // 错误处理。
    console.error(
      `列出角色 ${roleId} 的权限失败 (Failed to list permissions for role ${roleId}):`,
      error
    );
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdmin?.id,
      action: 'ROLE_PERMISSIONS_LIST_FAILURE_DB_ERROR',
      resource: `Role:${roleId}`,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: `Failed to list permissions for role ${roleId}.`,
      metadata: { error: error.message },
    });
    return NextResponse.json(
      {
        message: '获取角色权限列表时发生错误 (An error occurred while retrieving role permissions)',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v2/roles/{roleId}/permissions - 为特定角色分配一个或多个权限
 * 此处理函数响应 POST 请求，用于将请求体中提供的权限ID列表分配给指定的角色。
 * 实现为幂等操作：如果某个权限已分配给该角色，则不会重复分配。
 * 通常，此操作会替换角色现有的所有权限 (完全同步)，或进行增量添加/删除。
 * 当前实现是基于 `upsert` 的增量添加，如果权限已存在则不做操作。
 * **注意**: 要实现完全同步 (移除不再请求的权限)，需要额外的逻辑来删除不在 `permissionIds` 中的现有 `RolePermission` 记录。
 * 需要 'roles:permissions:assign' 权限。
 * @param req AuthenticatedRequest - 经过认证的请求对象。
 * @param context RouteContext - 包含 roleId。
 * @returns NextResponse - 包含操作结果或错误信息的 JSON 响应。
 */
async function assignPermissionsToRoleHandler(
  req: NextRequest,
  context: RouteContext & { authContext: AuthContext }
): Promise<NextResponse> {
  const { roleId } = context.params; // 目标角色ID。
  const performingAdmin = undefined as any; // TODO: 从认证中间件获取用户信息
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  let body;
  try {
    // 解析请求体中的 JSON 数据。
    body = await req.json();
  } catch (e: any) {
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdmin?.id,
      action: 'ROLE_PERMISSIONS_ASSIGN_FAILURE_INVALID_JSON',
      resource: `Role:${roleId}`,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: 'Invalid JSON request body for assigning permissions.',
      metadata: { error: e.message },
    });
    return NextResponse.json(
      { message: '无效的JSON请求体 (Invalid JSON request body)' },
      { status: 400 }
    );
  }

  // 使用 Zod Schema 验证请求体数据。
  const validationResult = AssignPermissionsSchema.safeParse(body);
  if (!validationResult.success) {
    await AuthorizationUtils.logAuditEvent({
      userId: performingAdmin?.id,
      action: 'ROLE_PERMISSIONS_ASSIGN_FAILURE_VALIDATION',
      resource: `Role:${roleId}`,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: 'Assigning permissions input validation failed.',
      metadata: { issues: validationResult.error.format(), receivedBody: body },
    });
    return NextResponse.json(
      {
        message: '分配权限的请求数据验证失败 (Assigning permissions input validation failed)',
        errors: validationResult.error.format(),
      },
      { status: 400 }
    );
  }

  // 从验证成功的数据中获取权限ID列表。
  const { permissionIds } = validationResult.data;

  try {
    // 步骤 1: 检查目标角色是否存在。
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      await AuthorizationUtils.logAuditEvent({
        userId: performingAdmin?.id,
        action: 'ROLE_PERMISSIONS_ASSIGN_FAILURE_ROLE_NOT_FOUND',
        resource: `Role:${roleId}`,
        success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Role not found, cannot assign permissions.',
      });
      return NextResponse.json(
        { message: '角色未找到，无法分配权限 (Role not found, cannot assign permissions)' },
        { status: 404 }
      );
    }
    // 安全检查: (Example - currently commented out, but if enabled, would need audit log)
    // if (CORE_SYSTEM_ROLES.includes(role.name)) {
    //   /* Audit Log for trying to modify core system role permissions */
    //   return NextResponse.json({ message: `核心系统角色 "${role.name}" 的权限不允许修改 (Permissions for core system role "${role.name}" cannot be modified)` }, { status: 403 });
    // }

    // 步骤 2: 验证请求中的所有 permissionId 是否都对应数据库中存在的、且处于激活状态的权限。
    // 这可以防止分配无效或已停用的权限。
    const validPermissions = await prisma.permission.findMany({
      where: {
        id: { in: permissionIds }, // 筛选出请求中提供的所有权限ID。
        isActive: true, // 确保这些权限是激活的。
      },
    });

    // 如果找到的有效权限数量与请求的权限ID数量不匹配，说明部分ID无效或权限未激活。
    if (validPermissions.length !== permissionIds.length) {
      const foundIds = validPermissions.map((p) => p.id);
      const notFoundOrInactive = permissionIds.filter((id) => !foundIds.includes(id));
      await AuthorizationUtils.logAuditEvent({
        userId: performingAdmin?.id,
        action: 'ROLE_PERMISSIONS_ASSIGN_FAILURE_INVALID_IDS',
        resource: `Role:${roleId}`,
        success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Some permission IDs are invalid or inactive.',
        metadata: {
          roleName: role.name,
          requestedPIDs: permissionIds,
          invalidPIDs: notFoundOrInactive,
        },
      });
      return NextResponse.json(
        {
          message: `以下权限ID无效或当前未激活: ${notFoundOrInactive.join(', ')} (Following permission IDs are invalid or currently inactive: ${notFoundOrInactive.join(', ')})`,
        },
        { status: 400 }
      );
    }

    // 步骤 3: 使用数据库事务来批量创建 (或更新/创建) RolePermission 关联记录。
    // `upsert` 操作用于实现幂等性：
    // - 如果角色和权限之间的关联已存在 (通过 `where` 条件判断)，则不执行 `update` (空对象 `{}` 表示不更新)。
    // - 如果关联不存在，则执行 `create` 操作，创建新的 RolePermission 记录。
    // 这确保了即使重复发送相同的权限ID列表，也不会创建重复的关联记录。
    // **修改开始：实现替换逻辑**
    await prisma.$transaction(async (tx) => {
      // 1. 删除当前角色所有已关联的权限
      await tx.rolePermission.deleteMany({
        where: { roleId: roleId },
      });

      // 2. 如果请求中提供了新的权限ID，则创建新的关联
      if (permissionIds.length > 0) {
        const newRolePermissionsData = permissionIds.map((permissionId) => ({
          roleId: roleId,
          permissionId: permissionId,
        }));
        await tx.rolePermission.createMany({
          data: newRolePermissionsData,
        });
      }
    });
    // **修改结束**

    // (可选) 步骤 4: 如果需要实现权限的完全同步 (即移除角色不再拥有的权限)，
    // 则在此处需要添加逻辑：
    // 1. 获取角色当前所有的 RolePermission 记录。
    // 2. 找出那些存在于当前记录中，但不在 `permissionIds` 请求列表中的 RolePermission。
    // 3. 删除这些多余的 RolePermission 记录。
    // 例如:
    // const currentRolePermissions = await prisma.rolePermission.findMany({ where: { roleId } });
    // const permissionsToRemove = currentRolePermissions.filter(rp => !permissionIds.includes(rp.permissionId));
    // if (permissionsToRemove.length > 0) {
    //   await prisma.rolePermission.deleteMany({
    //     where: { id: { in: permissionsToRemove.map(rp => rp.id) } }
    //   });
    // }

    // 步骤 5: 返回成功响应，通常包含更新后角色拥有的权限列表。
    const updatedRolePermissions = await prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true }, // 包含完整的权限信息。
    });
    const permissionsToReturn = updatedRolePermissions
      .map((rp) => rp.permission)
      .filter((p) => p !== null && p.isActive); // 确保只返回激活的权限

    return NextResponse.json({
      message: '权限已成功分配给角色 (Permissions have been successfully assigned to the role)',
      assignedPermissions: permissionsToReturn, // 返回当前角色拥有的所有 (激活的) 权限。
    });
  } catch (error: any) {
    console.error(
      `为角色 ${roleId} 分配权限失败 (Failed to assign permissions to role ${roleId}):`,
      error
    );
    let errorMessage = 'An unexpected server error occurred while assigning permissions';
    let actionCode = 'ROLE_PERMISSIONS_ASSIGN_FAILURE_DB_ERROR';
    let httpStatus = 500;

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      errorMessage =
        'Failed to assign permissions: one or more provided permission IDs are invalid (foreign key constraint).';
      actionCode = 'ROLE_PERMISSIONS_ASSIGN_FAILURE_FK_CONSTRAINT';
      httpStatus = 400;
    }
    // Other specific Prisma errors could be checked here.

    await AuthorizationUtils.logAuditEvent({
      userId: performingAdmin?.id,
      action: actionCode,
      success: false,
      ipAddress,
      userAgent,
      errorMessage: errorMessage,
      metadata: {
        roleId: roleId, // role variable not available in this scope
        requestedPIDs: permissionIds,
        error: error.message,
        errorCode: (error as any).code,
      },
    });
    return NextResponse.json({ message: errorMessage }, { status: httpStatus });
  }
}

// 使用 `withAuth` 中间件包装处理函数。
// GET 请求需要 'roles:permissions:read' 权限。
// POST 请求需要 'roles:permissions:assign' 权限。
export const GET = withErrorHandling(
  withAuth(
    async (
      request: NextRequest,
      context: { authContext: AuthContext; params: { roleId: string } }
    ) => {
      return listRolePermissionsHandler(request, {
        params: context.params,
        authContext: context.authContext,
      });
    },
    { requiredPermissions: ['roles:permissions:read'] }
  )
) as any;
export const POST = withErrorHandling(
  withAuth(
    async (
      request: NextRequest,
      context: { authContext: AuthContext; params: { roleId: string } }
    ) => {
      return assignPermissionsToRoleHandler(request, {
        params: context.params,
        authContext: context.authContext,
      });
    },
    { requiredPermissions: ['roles:permissions:assign'] }
  )
) as any;
