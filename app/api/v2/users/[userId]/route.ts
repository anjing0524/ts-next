// 文件路径: app/api/v2/users/[userId]/route.ts
// 描述: 此文件处理针对特定用户资源 (由 userId 标识) 的 API 请求，
// 包括获取用户信息 (GET), 全量更新用户信息 (PUT), 部分更新用户信息 (PATCH), 以及删除用户 (DELETE)。
// 使用 `requirePermission` 中间件来保护这些端点，确保只有具有适当权限的用户才能执行操作。
// `RouteContext` 用于从动态路由参数中提取 `userId`。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Prisma ORM 客户端 // Corrected import
import { User, Prisma } from '@prisma/client'; // Prisma 生成的类型
// import { isValidEmail } from '@/lib/utils';   // Replaced by Zod email validation
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入权限控制中间件和认证请求类型
import bcrypt from 'bcrypt'; // bcrypt 用于密码处理，允许在PATCH中更新密码。
// import { z } from 'zod'; // Zod imported from schemas
import { userUpdatePayloadSchema, userPatchPayloadSchema, passwordPolicySchema } from '../schemas'; // Import schemas

// --- 辅助函数 ---

/**
 * 创建并返回一个标准化的 JSON 错误响应。
 * @param message - 错误描述信息。
 * @param status - HTTP 状态码。
 * @param errorCode - (可选) 应用特定的错误代码字符串。
 * @returns NextResponse 对象，包含 JSON 格式的错误信息。
 */
function errorResponse(message: string, status: number, errorCode?: string): NextResponse {
  return NextResponse.json({ error: errorCode || 'request_failed', message }, { status });
}

// `isUserAdmin` 函数不再需要，权限由 `requirePermission` 统一管理。

/**
 * 从用户对象中排除敏感字段 (如 passwordHash)，以便安全地返回给客户端。
 * @param user - User 对象、部分 User 对象或 null。
 * @returns 一个新的对象 (不含 passwordHash) 或 null。
 */
function excludeSensitiveUserFields(user: User | Partial<User> | null): Partial<User> | null {
  if (!user) return null; // 如果用户对象为空，则返回 null。
  // 使用对象解构排除 passwordHash 字段。
  // 'as any' 用于处理 User 和 Partial<User> 类型，因为 passwordHash 可能在 Partial<User> 中不存在。
  const { passwordHash, ...rest } = user as any;
  return rest; // 返回剩余的字段。
}

// 定义路由上下文接口，用于从动态路由参数中获取 userId。
interface RouteContext {
  params: {
    userId: string; // 目标用户的ID，从URL路径参数中提取。
  };
}

// --- GET /api/v2/users/{userId} (获取特定用户详情) ---
// 此端点用于获取指定 userId 的用户详细信息。
// 受到 `requirePermission('users:read')` 的保护，表示需要 'users:read' 权限才能访问。
async function getUserByIdHandler(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { params } = context; // 从路由上下文中解构出 params 对象。
  const targetUserId = params.userId; // 获取目标用户的 ID。
  const performingAdmin = req.user; // 获取执行此操作的已认证用户 (管理员) 的信息。

  // 日志记录操作，有助于审计。
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to GET user ${targetUserId}.`);

  try {
    // 步骤 1: 从数据库中查找指定 ID 的用户。
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    // 如果未找到用户，返回 404 Not Found 错误。
    if (!user) return errorResponse('User not found.', 404, 'user_not_found');

    // 步骤 2: 返回用户信息 (排除敏感字段)。
    // 使用 HTTP 200 OK 状态码。
    return NextResponse.json(excludeSensitiveUserFields(user), { status: 200 });
  } catch (error) {
    // 错误处理：记录未知错误，并返回500服务器错误。
    console.error(`Error fetching user ${targetUserId} by admin ${performingAdmin?.id}:`, error);
    return errorResponse('An unexpected error occurred while fetching user details.', 500, 'server_error');
  }
}
// 将 getUserByIdHandler 与 'users:read' 权限绑定，并导出为 GET 请求的处理函数。
export const GET = requirePermission('users:read', getUserByIdHandler);

// --- PUT /api/v2/users/{userId} (全量更新用户信息) ---
// 此端点用于全量更新指定 userId 的用户信息。
// PUT 请求通常期望客户端提供资源的完整表示。如果某些字段未提供，它们可能会被设置为空或默认值。
// 受到 `requirePermission('users:update')` 的保护。
async function updateUserHandler(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { params } = context;
  const targetUserId = params.userId; // 目标用户ID。
  const performingAdmin = req.user;
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to PUT (full update) user ${targetUserId}.`);

  // 步骤 1: 解析请求体并使用Zod验证
  let rawRequestBody;
  try {
    rawRequestBody = await req.json();
  } catch (e) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  const validationResult = userUpdatePayloadSchema.safeParse(rawRequestBody);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }
  // 从验证结果中获取处理过的数据
  const updateDataFromRequest = validationResult.data;

  // 安全考虑: 明确禁止通过此通用更新接口修改密码。
  // The userUpdatePayloadSchema already omits 'password'.
  // Username changes are also omitted from schema, preventing them here.

  try {
    // 步骤 3: 检查目标用户是否存在。
    const existingUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!existingUser) return errorResponse('User not found to update.', 404, 'user_not_found');

    // 步骤 4: 冲突检查 (仅 email, 因为 username 不允许更改 via this schema)。
    if (updateDataFromRequest.email && typeof updateDataFromRequest.email === 'string') {
      const trimmedEmail = updateDataFromRequest.email.trim().toLowerCase();
      // Only check for conflict if the email is actually changing and is not null
      if (trimmedEmail !== (existingUser.email || '').toLowerCase()) {
        const conflictingUser = await prisma.user.findFirst({
          where: {
            email: trimmedEmail,
            id: { not: targetUserId } // 排除当前用户自身
          }
        });
        if (conflictingUser) return errorResponse('Email already taken by another user.', 409, 'email_conflict');
      }
    }

    // 步骤 5: 准备更新数据对象。
    // Prisma's update data only includes fields present in updateDataFromRequest.
    // Zod's .optional().nullable() means fields might be explicitly null to clear them, or undefined to leave them unchanged.
    // Prisma handles undefined fields by not updating them.
    const updateData: Prisma.UserUpdateInput = { ...updateDataFromRequest };

    // Explicitly set email to null if it was provided as null in request, otherwise use trimmed/lowercased.
    if (updateDataFromRequest.email === null) {
        updateData.email = null;
    } else if (updateDataFromRequest.email) {
        updateData.email = updateDataFromRequest.email.trim().toLowerCase();
    }


    // Ensure boolean fields are correctly passed if they were part of the schema and request
    // (Zod's default/optional handles this, so direct assignment is fine)

    updateData.updatedAt = new Date(); // 手动设置 updatedAt 时间戳

    // 步骤 6: 执行用户更新操作。
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId }, // 指定要更新的用户
      data: updateData,           // 提供更新的数据
    });
    // 返回更新后的用户信息 (排除敏感字段)。
    return NextResponse.json(excludeSensitiveUserFields(updatedUser), { status: 200 });

  } catch (error: any) {
    // 错误处理：捕获 Prisma 特定的唯一约束冲突错误。
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return errorResponse('Conflict: The new username or email already exists.', 409, 'conflict_unique');
    }
    // 记录其他未知错误。
    console.error(`Error updating user ${targetUserId} (PUT) by admin ${performingAdmin?.id}:`, error);
    return errorResponse('An unexpected error occurred while updating user information.', 500, 'server_error');
  }
}
// 将 updateUserHandler 与 'users:update' 权限绑定，并导出为 PUT 请求的处理函数。
export const PUT = requirePermission('users:update', updateUserHandler);

// --- PATCH /api/v2/users/{userId} (部分更新用户信息) ---
// 此端点用于部分更新指定 userId 的用户信息。
// PATCH 请求只更新客户端在请求体中提供的字段。
// 受到 `requirePermission('users:update')` 的保护。
async function patchUserHandler(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { params } = context;
  const targetUserId = params.userId; // 目标用户ID。
  const performingAdmin = req.user;
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to PATCH user ${targetUserId}.`);

  // 步骤 1: 解析请求体 (JSON 格式)。
  let rawRequestBody;
  try {
    rawRequestBody = await req.json();
  } catch (e) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }
  if (Object.keys(rawRequestBody).length === 0) {
    return errorResponse('Request body cannot be empty for PATCH operations.', 400, 'validation_error_empty_body');
  }

  // 步骤 2: 使用 Zod 进行输入数据验证 (schema imported from ../schemas)
  // The imported userPatchPayloadSchema already includes passwordPolicySchema.optional()
  const validationResult = userPatchPayloadSchema.safeParse(rawRequestBody);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }

  const validatedData = validationResult.data;

  // 不允许通过此接口更改用户名 (Username changes not allowed via this endpoint)
  if (validatedData.hasOwnProperty('username')) {
    return errorResponse('Username modification is not allowed via PATCH request.', 400, 'validation_error_username_modification');
  }

  try {
    // 步骤 3: 检查目标用户是否存在。
    const existingUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!existingUser) return errorResponse('User not found to update.', 404, 'user_not_found');

    // 步骤 4: 冲突检查 (仅 email, 因为 username 不允许更改)。
    if (validatedData.email && typeof validatedData.email === 'string') {
      const trimmedEmail = validatedData.email.trim().toLowerCase();
      if (trimmedEmail !== existingUser.email) { // 仅当 email 实际更改时检查冲突
        const conflictingUser = await prisma.user.findFirst({
          where: {
            email: trimmedEmail,
            id: { not: targetUserId } // 排除当前用户自身
          }
        });
        if (conflictingUser) return errorResponse('Email already taken by another user.', 409, 'email_conflict');
      }
    }

    // 步骤 5: 动态构建 Prisma 更新数据对象 (`patchData`)。
    const patchData: Prisma.UserUpdateInput = {};

    // 处理非密码字段
    Object.keys(validatedData).forEach(key => {
      if (key !== 'password' && validatedData[key as keyof typeof validatedData] !== undefined) {
        if (key === 'email' && typeof validatedData.email === 'string') {
          patchData.email = validatedData.email.trim().toLowerCase();
        } else {
          patchData[key as keyof typeof patchData] = validatedData[key as keyof typeof validatedData];
        }
      }
    });

    // 处理密码更新
    if (validatedData.password) {
      const saltRounds = 12;
      patchData.passwordHash = await bcrypt.hash(validatedData.password, saltRounds);
      // 通常，如果管理员设置了密码，用户应该在下次登录时更改它。
      // 如果 mustChangePassword 未在请求中明确设置，则默认为 true。
      if (validatedData.mustChangePassword === undefined) {
        patchData.mustChangePassword = true;
      }
    }

    // 如果没有任何有效字段要更新 (例如，只提供了 username，但它被禁止更新)
    if (Object.keys(patchData).length === 0) {
      return NextResponse.json(excludeSensitiveUserFields(existingUser), { status: 200, message: "No valid fields provided for update." });
    }
    patchData.updatedAt = new Date(); // 手动设置更新时间

    // 步骤 6: 执行用户部分更新操作。
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: patchData,
      select: { // 确保返回的数据不包含 passwordHash
        id: true, username: true, email: true, firstName: true, lastName: true,
        displayName: true, avatar: true, organization: true, department: true,
        isActive: true, mustChangePassword: true, createdAt: true, updatedAt: true, createdBy: true, lastLoginAt: true,
      }
    });
    return NextResponse.json(updatedUser, { status: 200 });

  } catch (error: any) {
    console.error(`Error partially updating user ${targetUserId} (PATCH) by admin ${performingAdmin?.id}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
       const target = (error.meta?.target as string[]) || ['field'];
      return errorResponse(`Conflict: The ${target.join(', ')} you entered is already in use.`, 409, 'conflict_unique');
    }
    return errorResponse('An unexpected error occurred while partially updating user information.', 500, 'server_error');
  }
}
// 将 patchUserHandler 与 'users:update' 权限绑定，并导出为 PATCH 请求的处理函数。
export const PATCH = requirePermission('users:update')(patchUserHandler); // Corrected: wrap with HOF

// --- DELETE /api/v2/users/{userId} (删除用户) ---
// 此端点用于删除指定 userId 的用户。
// 受到 `requirePermission('users:delete')` 的保护。
async function deleteUserHandler(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { params } = context;
  const targetUserId = params.userId;       // 目标用户ID。
  const performingAdmin = req.user;         // 执行操作的管理员。
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to DELETE user ${targetUserId}.`);

  // 步骤 1: 防止管理员自我删除。
  // 安全考虑: 管理员不应能通过此接口删除自己的账户。
  if (targetUserId === performingAdmin?.id) {
    return errorResponse('Action not allowed: Administrators cannot delete their own account using this method.', 403, 'self_deletion_not_allowed');
  }

  try {
    // 步骤 2: 检查用户是否存在。
    // 在尝试删除之前，先确认用户记录确实存在。
    const userToDelete = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!userToDelete) return errorResponse('User not found to delete.', 404, 'user_not_found');

    // 步骤 3: 执行用户删除操作。
    // 注意: 如果用户有关联的其他记录 (例如，作为外键在其他表中被引用)，
    // 且数据库层面设置了限制性外键约束 (RESTRICT)，则删除操作可能会失败。
    // Prisma schema 中可以配置 onDelete 行为 (例如 Cascade, SetNull)。
    await prisma.user.delete({ where: { id: targetUserId } });

    // 步骤 4: 返回成功响应。
    // HTTP 204 No Content 表示操作成功执行，但响应体中没有内容。
    return new NextResponse(null, { status: 204 });

  } catch (error: any) {
    // 错误处理：
    console.error(`Error deleting user ${targetUserId} by admin ${performingAdmin?.id}:`, error);
    // 捕获 Prisma 特定的错误代码。
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P2003: 外键约束失败。这意味着用户可能还被其他数据表引用。
        if (error.code === 'P2003') {
            // error.meta.field_name 可能指示哪个外键约束失败了。
            const fieldName = (error.meta as any)?.field_name || 'related records';
            return errorResponse(`Cannot delete user: They are still referenced by other records (constraint: ${fieldName}). Consider deactivating the user instead.`, 409, 'conflict_foreign_key');
        } else if (error.code === 'P2025') { // 记录未找到 (理论上已被上面的 findUnique 覆盖，但作为双重检查)。
             return errorResponse('User not found to delete (Prisma P2025).', 404, 'user_not_found_prisma');
        }
    }
    // 返回通用服务器错误。
    return errorResponse('An unexpected error occurred while attempting to delete the user.', 500, 'server_error');
  }
}
// 将 deleteUserHandler 与 'users:delete' 权限绑定，并导出为 DELETE 请求的处理函数。
export const DELETE = requirePermission('users:delete', deleteUserHandler);

// 类型声明 (通常不需要，除非模块解析有问题)
// declare module '@/lib/utils' {
//   export function isValidEmail(email: string): boolean;
// }
