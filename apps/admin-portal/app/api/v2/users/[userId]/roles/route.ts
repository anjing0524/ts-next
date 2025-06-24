// 文件路径: app/api/v2/users/[userId]/roles/route.ts
// 描述: 此文件处理特定用户角色分配的 API 请求。
// 包括获取用户当前拥有的角色列表 (GET) 和为用户分配一个或多个角色 (POST)。
// 使用 `requirePermission` 中间件进行访问控制。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Prisma ORM 客户端。 // Corrected import
import { Role, Prisma } from '@prisma/client'; // Prisma 生成的角色类型和高级查询类型。
import { requirePermission } from '@/lib/auth/middleware'; // 引入权限控制中间件。
import { userRoleAssignmentPayloadSchema, userRoleListResponseSchema } from '../schemas'; // Import Zod schemas

// --- 辅助函数 ---

/**
 * 创建并返回一个标准化的 JSON 错误响应。
 * @param message - 错误描述信息。
 * @param status - HTTP 状态码。
 * @param errorCode - (可选) 应用特定的错误代码字符串。
 * @returns NextResponse 对象。
 */
function errorResponse(message: string, status: number, errorCode?: string): NextResponse {
  return NextResponse.json({ error: errorCode || 'request_failed', message }, { status });
}

// `isUserAdmin` 函数已移除，权限由 `requirePermission` 统一管理。

// 定义路由上下文接口，用于从动态路由参数中获取 userId。
interface RouteContextGetPost {
  params: {
    userId: string; // 目标用户的ID。
  };
}

// --- GET /api/v2/users/{userId}/roles (获取用户拥有的角色列表) ---
// 此处理函数用于获取指定用户当前被分配的所有激活的角色。
// 受到 `requirePermission('users:roles:read')` (或类似权限) 的保护。
async function listUserRolesHandler(req: NextRequest, context: RouteContextGetPost): Promise<NextResponse> {
  const { params } = context; // 从路由上下文中获取路径参数。
  const targetUserId = params.userId; // 目标用户的ID。

  // `req.user` 由 `requirePermission` 中间件填充，包含执行操作的已认证用户信息。
  const performingUser = req.user;
  // 日志记录操作。
  console.log(`User ${performingUser?.id} (ClientID: ${performingUser?.clientId}) listing roles for user ${targetUserId}.`);

  try {
    // 步骤 1: 检查目标用户是否存在。
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return errorResponse('User not found, cannot list roles.', 404, 'user_not_found');
    }

    // 步骤 2: 从数据库获取用户的角色分配记录。
    // `include: { role: true }` 会同时加载每个 UserRole 记录关联的完整 Role 对象。
    // `where` 条件确保只获取那些关联的角色本身是激活 (`role: { isActive: true }`) 的分配。
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId: targetUserId,       // 筛选特定用户的角色
        role: { isActive: true }, // (重要) 只获取那些当前处于“激活”状态的角色
                                  // 这防止了返回已被逻辑删除或禁用的角色。
        // 根据业务需求，还可以添加对 UserRole 记录本身状态的过滤，
        // 例如，如果 UserRole 有自己的 `isActive` 或 `expiresAt` 字段。
        // e.g. AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }]
      },
      include: {
        role: true, // 包含关联的 Role 对象的完整信息。
      },
      orderBy: { role: { name: 'asc' } } // 按角色名称升序排序，便于展示。
    });

    // 步骤 3: 格式化响应数据。
    // 从 UserRole 记录中提取 Role 对象，并选择性地构造返回给客户端的角色信息。
    const rolesData = userRoles
      .map(ur => ur.role)
      .filter(role => role != null)
      .map(role => ({
        id: role.id,
        name: role.name,
        displayName: role.displayName,
        description: role.description,
        isActive: role.isActive,
      }));

    // Validate response with Zod schema
    const validatedResponse = userRoleListResponseSchema.safeParse({ roles: rolesData });
    if (!validatedResponse.success) {
        console.error("Failed to validate list user roles response:", validatedResponse.error.issues);
        return errorResponse('Internal server error: Failed to prepare role data.', 500, 'response_validation_failed');
    }

    return NextResponse.json(validatedResponse.data, { status: 200 });

  } catch (error) {
    // 错误处理：记录未知错误，并返回500服务器错误。
    console.error(`Error fetching roles for user ${targetUserId} by user ${performingUser?.id}:`, error);
    return errorResponse('An unexpected error occurred while fetching user roles.', 500, 'server_error');
  }
}
// 将 listUserRolesHandler 与 'users:roles:read' 权限绑定，并导出为 GET 请求的处理函数。
export const GET = requirePermission('users:roles:read', listUserRolesHandler);


// --- POST /api/v2/users/{userId}/roles (为用户分配一个或多个角色) ---
// 此处理函数用于为一个指定用户分配新的角色。通常是覆盖式分配或增量分配，具体取决于实现策略。
// 当前实现更接近于增量分配，但会跳过已存在的分配 (幂等性)。
// 受到 `requirePermission('users:roles:assign')` (或类似权限) 的保护。
async function assignRolesToUserHandler(req: NextRequest, context: RouteContextGetPost): Promise<NextResponse> {
  const { params } = context;
  const targetUserId = params.userId; // 目标用户ID。

  const performingAdmin = req.user; // 执行操作的管理员。
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) assigning roles to user ${targetUserId}.`);

  // 步骤 1: 解析请求体并使用Zod验证。
  let rawRequestBody;
  try {
    rawRequestBody = await req.json();
  } catch (e) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  const validationResult = userRoleAssignmentPayloadSchema.safeParse(rawRequestBody);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }
  const { roleIds } = validationResult.data; // 从验证结果中获取 roleIds

  try {
    // 步骤 2: 检查目标用户是否存在。
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return errorResponse('User not found, cannot assign roles.', 404, 'user_not_found');
    }

    // 步骤 3: 处理角色分配。
    const successfullyAssignedRoles: Partial<Role>[] = []; // 存储成功分配的角色信息。
    const assignmentErrors: { roleId: string, message: string }[] = []; // 存储分配失败的角色及原因。

    // 为了实现幂等性 (重复请求不会产生不同效果) 并避免重复创建 UserRole 记录，
    // 首先获取用户当前已拥有的所有角色ID。
    const existingUserRoles = await prisma.userRole.findMany({
        where: { userId: targetUserId },
        select: { roleId: true } // 只需要 roleId 用于比较。
    });
    const existingRoleIdsSet = new Set(existingUserRoles.map(ur => ur.roleId)); // 将已有角色ID存入 Set 以快速查找。

    // 遍历请求中提供的每个 roleId。
    for (const roleId of roleIds) {
      // 检查要分配的角色是否存在于数据库中且处于激活状态。
      // 不应允许分配不存在或已禁用的角色。
      const roleToAssign = await prisma.role.findUnique({
        where: { id: roleId, isActive: true },
      });

      if (!roleToAssign) {
        // 如果角色不存在或未激活，则记录错误。
        assignmentErrors.push({ roleId, message: 'Role not found or is not active.' });
        continue; // 继续处理下一个 roleId。
      }

      // 检查用户是否已经拥有此角色。
      if (existingRoleIdsSet.has(roleId)) {
        // 如果用户已拥有此角色，则跳过创建，并将此视为一次成功的“分配”(保持幂等性)。
        console.log(`User ${targetUserId} already has role ${roleId} (${roleToAssign.name}). Skipping assignment, considering as success.`);
        successfullyAssignedRoles.push({ id: roleToAssign.id, name: roleToAssign.name, displayName: roleToAssign.displayName });
        continue;
      }

      // 如果角色有效且用户尚未拥有，则在 UserRole 中间表中创建新的分配记录。
      await prisma.userRole.create({
        data: {
          userId: targetUserId,        // 目标用户ID。
          roleId: roleId,              // 要分配的角色ID。
          assignedBy: performingAdmin?.id, // (可选) 记录执行此分配操作的管理员ID，用于审计。
          // context 和 expiresAt 字段可以根据业务需求在此处设置。
        },
      });
      // 将成功分配的角色信息添加到列表中。
      successfullyAssignedRoles.push({ id: roleToAssign.id, name: roleToAssign.name, displayName: roleToAssign.displayName });
    }

    // 步骤 4: 返回响应。
    // 根据分配过程中是否发生错误，返回不同的状态码和消息。
    if (assignmentErrors.length > 0) {
      // 如果有部分角色分配成功，部分失败，则返回 207 Multi-Status。
      // 如果所有请求的角色都分配失败，则返回 400 Bad Request。
      const status = successfullyAssignedRoles.length > 0 ? 207 : 400;
      return NextResponse.json({
        message: status === 207 ? 'Some roles were assigned successfully, but others failed.' : 'Failed to assign one or more roles.',
        assignedRoles: successfullyAssignedRoles, // 列出成功分配的角色。
        errors: assignmentErrors                 // 列出分配失败的角色及其原因。
      }, { status });
    }

    // 如果所有角色都成功分配 (或已存在)。
    // HTTP 200 OK 或 201 Created 都可以。201 更侧重于新资源的创建 (UserRole记录)。
    // 此处使用 200 OK 表示请求已成功处理。
    return NextResponse.json({
        message: 'Roles assigned successfully to the user.',
        assignedRoles: successfullyAssignedRoles
    }, { status: 200 });

  } catch (error: any) {
    // 错误处理：
    // 捕获 Prisma 特定的已知请求错误。
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P2003: 外键约束失败 (例如，提供的 roleId 在 Role 表中不存在，尽管上面的检查应已捕获此情况)。
        if (error.code === 'P2003') {
             return errorResponse('Role assignment failed: One or more role IDs are invalid or do not exist.', 400, 'validation_error_fk_constraint');
        }
    }
    // 记录其他未知错误。
    console.error(`Error assigning roles to user ${targetUserId} by admin ${performingAdmin?.id}:`, error);
    return errorResponse('An unexpected error occurred while assigning roles to the user.', 500, 'server_error');
  }
}
// 将 assignRolesToUserHandler 与 'users:roles:assign' 权限绑定，并导出为 POST 请求的处理函数。
export const POST = requirePermission('users:roles:assign', assignRolesToUserHandler);

// JWTUtils 的声明不再需要，因为认证已由中间件处理。
// Declaration for JWTUtils is no longer needed.
