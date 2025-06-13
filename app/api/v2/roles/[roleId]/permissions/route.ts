// 文件路径: app/api/v2/roles/[roleId]/permissions/route.ts
// 描述: 此文件处理特定角色 (由 roleId 标识) 与其关联权限 (Permissions) 之间的管理操作。
// 包括列出分配给角色的所有权限 (GET) 和为角色分配新的权限 (POST)。
// 使用 `requirePermission` 中间件进行访问控制。

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma ORM 客户端。
import { Prisma } from '@prisma/client'; // Prisma 生成的类型。
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入权限控制中间件。
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
  // 数组至少需要包含一个权限ID。
  permissionIds: z.array(z.string().cuid("无效的权限ID格式 (Invalid permission ID format: must be a CUID)"))
    .min(1, "至少需要一个权限ID才能执行分配操作 (At least one permission ID is required for assignment)"),
});

/**
 * GET /api/v2/roles/{roleId}/permissions - 列出特定角色的所有权限
 * 此处理函数响应 GET 请求，返回指定 roleId 的角色当前拥有的所有权限的详细信息。
 * 需要 'role:permissions:list' 或 'roles:permissions:read' 权限 (根据实际权限命名)。
 * @param req AuthenticatedRequest - 经过认证的请求对象。
 * @param context RouteContext - 包含从URL路径中提取的 roleId。
 * @returns NextResponse - 包含权限列表或错误信息的 JSON 响应。
 */
async function listRolePermissionsHandler(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { roleId } = context.params; // 从上下文中获取 roleId。
  try {
    // 步骤 1: 查询角色是否存在，并同时包含其关联的 RolePermission 及 Permission 记录。
    const roleWithPermissions = await prisma.role.findUnique({
      where: { id: roleId },
      include: { // 使用 include 加载关联数据。
        rolePermissions: { // 加载此角色的所有 RolePermission 记录。
          include: {
            permission: true, // 对于每个 RolePermission 记录，进一步加载关联的 Permission 对象的完整详情。
          },
          orderBy: { permission: { name: 'asc' } } // 按关联权限的名称升序排序。
        },
      },
    });

    if (!roleWithPermissions) {
      // 如果角色未找到，返回404错误。
      return NextResponse.json({ message: '角色未找到 (Role not found)' }, { status: 404 });
    }

    // 步骤 2: 从查询结果中提取并格式化权限列表。
    // roleWithPermissions.rolePermissions 是一个 RolePermission 对象的数组。
    // 我们需要的是每个 RolePermission 对象中的 permission 属性。
    const permissions = roleWithPermissions.rolePermissions
      .map(rp => rp.permission) // 提取 Permission 对象。
      .filter(p => p !== null && p.isActive === true); // 过滤掉可能为空或非激活的权限。
                                                      // 通常，只应展示和管理激活的权限。
    // 返回权限列表。
    return NextResponse.json({ permissions });
  } catch (error) {
    // 错误处理。
    console.error(`列出角色 ${roleId} 的权限失败 (Failed to list permissions for role ${roleId}):`, error);
    return NextResponse.json({ message: '获取角色权限列表时发生错误 (An error occurred while retrieving role permissions)' }, { status: 500 });
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
async function assignPermissionsToRoleHandler(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { roleId } = context.params; // 目标角色ID。
  let body;
  try {
    // 解析请求体中的 JSON 数据。
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ message: '无效的JSON请求体 (Invalid JSON request body)' }, { status: 400 });
  }

  // 使用 Zod Schema 验证请求体数据。
  const validationResult = AssignPermissionsSchema.safeParse(body);
  if (!validationResult.success) {
    // 如果验证失败，返回400错误及详细信息。
    return NextResponse.json({
      message: '分配权限的请求数据验证失败 (Assigning permissions input validation failed)',
      errors: validationResult.error.format(),
    }, { status: 400 });
  }

  // 从验证成功的数据中获取权限ID列表。
  const { permissionIds } = validationResult.data;

  try {
    // 步骤 1: 检查目标角色是否存在。
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return NextResponse.json({ message: '角色未找到，无法分配权限 (Role not found, cannot assign permissions)' }, { status: 404 });
    }
    // 安全检查: 可能不希望修改某些核心系统角色的权限。
    // if (CORE_SYSTEM_ROLES.includes(role.name)) {
    //   return NextResponse.json({ message: `核心系统角色 "${role.name}" 的权限不允许修改 (Permissions for core system role "${role.name}" cannot be modified)` }, { status: 403 });
    // }


    // 步骤 2: 验证请求中的所有 permissionId 是否都对应数据库中存在的、且处于激活状态的权限。
    // 这可以防止分配无效或已停用的权限。
    const validPermissions = await prisma.permission.findMany({
      where: {
        id: { in: permissionIds }, // 筛选出请求中提供的所有权限ID。
        isActive: true,            // 确保这些权限是激活的。
      },
    });

    // 如果找到的有效权限数量与请求的权限ID数量不匹配，说明部分ID无效或权限未激活。
    if (validPermissions.length !== permissionIds.length) {
      const foundIds = validPermissions.map(p => p.id); // 获取所有有效权限的ID。
      const notFoundOrInactive = permissionIds.filter(id => !foundIds.includes(id)); // 找出无效或未激活的ID。
      return NextResponse.json({ message: `以下权限ID无效或当前未激活: ${notFoundOrInactive.join(', ')} (Following permission IDs are invalid or currently inactive: ${notFoundOrInactive.join(', ')})` }, { status: 400 });
    }

    // 步骤 3: 使用数据库事务来批量创建 (或更新/创建) RolePermission 关联记录。
    // `upsert` 操作用于实现幂等性：
    // - 如果角色和权限之间的关联已存在 (通过 `where` 条件判断)，则不执行 `update` (空对象 `{}` 表示不更新)。
    // - 如果关联不存在，则执行 `create` 操作，创建新的 RolePermission 记录。
    // 这确保了即使重复发送相同的权限ID列表，也不会创建重复的关联记录。
    const operations = permissionIds.map(permissionId =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } }, // 唯一约束，用于查找现有记录。
        update: {}, // 如果记录已存在，不执行任何更新操作。
        create: { roleId, permissionId }, // 如果记录不存在，则创建。
      })
    );

    // 在一个事务中执行所有 upsert 操作，确保原子性。
    await prisma.$transaction(operations);

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
        include: { permission: true } // 包含完整的权限信息。
    });
    const permissionsToReturn = updatedRolePermissions.map(rp => rp.permission).filter(p => p !== null && p.isActive); // 确保只返回激活的权限

    return NextResponse.json({
        message: '权限已成功分配给角色 (Permissions have been successfully assigned to the role)',
        assignedPermissions: permissionsToReturn // 返回当前角色拥有的所有 (激活的) 权限。
    });

  } catch (error) {
    // 错误处理。
    console.error(`为角色 ${roleId} 分配权限失败 (Failed to assign permissions to role ${roleId}):`, error);
    // 捕获 Prisma 特定的错误。
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P2003: 外键约束失败 (例如，提供的某个 permissionId 在 Permission 表中不存在，尽管前面的验证应已捕获此情况)。
        if (error.code === 'P2003') {
             return NextResponse.json({ message: '分配权限失败：一个或多个提供的权限ID无效 (Failed to assign permissions: one or more provided permission IDs are invalid)' }, { status: 400 });
        }
    }
    return NextResponse.json({ message: '分配权限时发生服务器错误 (An unexpected server error occurred while assigning permissions)' }, { status: 500 });
  }
}

// 使用 `requirePermission` 中间件包装处理函数。
// GET 请求需要 'role:permissions:list' 权限 (或 'roles:permissions:read')。
// POST 请求需要 'roles:permissions:assign' 权限。
// 注意: 'role:permissions:list' 是根据种子数据中可能的权限命名推测的，实际应使用定义好的权限字符串。
export const GET = requirePermission('role:permissions:list')(listRolePermissionsHandler);
export const POST = requirePermission('roles:permissions:assign')(assignPermissionsToRoleHandler);

[end of app/api/v2/roles/[roleId]/permissions/route.ts]
