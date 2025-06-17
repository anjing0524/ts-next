// 文件路径: app/api/v2/users/[userId]/route.ts
// 描述: 此文件处理针对特定用户资源 (由 userId 标识) 的 API 请求，
// 包括获取用户信息 (GET), 全量更新用户信息 (PUT), 部分更新用户信息 (PATCH), 以及删除用户 (DELETE)。
// 使用 `requirePermission` 中间件来保护这些端点，确保只有具有适当权限的用户才能执行操作。
// `RouteContext` 用于从动态路由参数中提取 `userId`。

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma ORM 客户端
import { User, Prisma } from '@prisma/client'; // Prisma 生成的类型
// import { JWTUtils } from '@/lib/auth/oauth2'; // REMOVED: 认证/授权由中间件处理
import { isValidEmail } from '@/lib/utils';   // 电子邮件格式验证辅助函数
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入权限控制中间件和认证请求类型
import bcrypt from 'bcrypt'; // bcrypt 用于密码处理，允许在PATCH中更新密码。
import { z } from 'zod'; // 引入Zod

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
  const performingAdmin = req.user;   // 执行操作的管理员。
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to PUT (full update) user ${targetUserId}.`);

  // 步骤 1: 解析请求体 (JSON 格式)。
  // 定义 requestBody 的类型，排除不允许通过此接口修改的字段 (如 id, passwordHash, 时间戳等)，
  // 并指明某些字段 (如 isActive) 是可选的 Partial<Pick<...>>。
  let requestBody: Omit<User, 'id' | 'passwordHash' | 'createdAt' | 'updatedAt' | 'lastLoginAt' | 'failedLoginAttempts' | 'lockedUntil'>
                   & Partial<Pick<User, 'isActive' | 'mustChangePassword' | 'emailVerified' | 'phoneVerified'>>;
  try {
    requestBody = await req.json();
  } catch (e) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  // 步骤 2: 数据验证。
  // 安全考虑: 明确禁止通过此通用更新接口修改密码。密码更改应通过专门的流程 (如密码重置或用户自行修改密码接口)。
  if ((requestBody as any).password || (requestBody as any).passwordHash) {
    return errorResponse('Password updates are not allowed via this PUT endpoint. Please use dedicated password change/reset flows.', 400, 'validation_error_password');
  }
  // 如果提供了 email，则验证其格式。
  if (requestBody.email && !isValidEmail(requestBody.email)) {
    return errorResponse('Invalid email format provided.', 400, 'validation_error_email');
  }
  // 对于严格的 PUT 操作，可能需要验证所有必需字段都已提供。
  // 此处实现较为灵活，更接近 PATCH 的行为，允许只更新部分字段。
  // 如果需要严格的 PUT，应取消注释下面的检查或添加更全面的验证。
  // if (typeof requestBody.username !== 'string' || typeof requestBody.email !== 'string') {
  //     return errorResponse('Username and email are required for PUT operations (full resource representation).', 400, 'validation_error_required_fields');
  // }

  try {
    // 步骤 3: 检查目标用户是否存在。
    const existingUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!existingUser) return errorResponse('User not found to update.', 404, 'user_not_found');

    // 步骤 4: 冲突检查 (如果 username 或 email 被更改)。
    // 如果请求中包含 username 且与现有 username 不同，则检查新 username 是否已被其他用户占用。
    if (requestBody.username && requestBody.username.trim() !== existingUser.username) {
      const conflictingUser = await prisma.user.findUnique({ where: { username: requestBody.username.trim() } });
      // 如果找到其他用户使用了该 username，返回 409 Conflict 错误。
      if (conflictingUser) return errorResponse('Username already taken by another user.', 409, 'username_conflict');
    }
    // 如果请求中包含 email 且与现有 email 不同 (忽略大小写)，则检查新 email 是否已被其他用户占用。
    if (requestBody.email && requestBody.email.trim().toLowerCase() !== existingUser.email.toLowerCase()) {
      const conflictingUser = await prisma.user.findUnique({ where: { email: requestBody.email.trim().toLowerCase() } });
      if (conflictingUser) return errorResponse('Email already taken by another user.', 409, 'email_conflict');
    }

    // 步骤 5: 准备更新数据对象。
    // 对于 PUT，理论上应使用请求体中的所有字段来替换现有资源。
    // 此实现中，我们只更新请求体中明确提供的字段。
    // 明确处理 boolean 类型字段，确保它们被正确转换为布尔值。
    const updateData: Prisma.UserUpdateInput = {
      username: requestBody.username?.trim(), // trim() 去除首尾空格
      email: requestBody.email?.trim().toLowerCase(), // trim() 和 toLowerCase() 标准化 email
      firstName: requestBody.firstName,
      lastName: requestBody.lastName,
      displayName: requestBody.displayName,
      avatar: requestBody.avatar,
      phone: requestBody.phone,
      organization: requestBody.organization,
      department: requestBody.department,
      workLocation: requestBody.workLocation,
      isActive: typeof requestBody.isActive === 'boolean' ? requestBody.isActive : undefined,
      mustChangePassword: typeof requestBody.mustChangePassword === 'boolean' ? requestBody.mustChangePassword : undefined,
      emailVerified: typeof requestBody.emailVerified === 'boolean' ? requestBody.emailVerified : undefined,
      phoneVerified: typeof requestBody.phoneVerified === 'boolean' ? requestBody.phoneVerified : undefined,
      updatedAt: new Date(), // 手动设置 updatedAt 时间戳，因为 Prisma 默认可能只在某些条件下自动更新。
    };
    // 清理 updateData 对象，移除值为 undefined 的属性。
    // 这样 Prisma 就不会尝试将这些字段更新为 null (除非它们在 requestBody 中显式设置为 null)。
    Object.keys(updateData).forEach(key => updateData[key as keyof Prisma.UserUpdateInput] === undefined && delete updateData[key as keyof Prisma.UserUpdateInput]);

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
  const performingAdmin = req.user;   // 执行操作的管理员。
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to PATCH user ${targetUserId}.`);

  // 步骤 1: 解析请求体 (JSON 格式)。
  // 类型定义为 Partial<...> 表示请求体中的所有字段都是可选的。
  let requestBody: Partial<Omit<User, 'id' | 'passwordHash' | 'createdAt' | 'updatedAt' | 'lastLoginAt' | 'failedLoginAttempts' | 'lockedUntil'>>;
  try {
    requestBody = await req.json();
  } catch (e) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }
  // PATCH 请求体不能为空。
  if (Object.keys(requestBody).length === 0) {
    return errorResponse('Request body cannot be empty for PATCH operations. Please provide at least one field to update.', 400, 'validation_error_empty_body');
  }

  // 步骤 2: Zod Schema 定义部分更新 (所有字段可选)
  // 密码策略与创建时相同
  const passwordPolicySchemaOptional = z.string()
    .min(8, "Password must be at least 8 characters long / 密码长度至少为8位")
    .max(64, "Password must be at most 64 characters long / 密码长度最多为64位")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter / 密码必须包含至少一个大写字母")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter / 密码必须包含至少一个小写字母")
    .regex(/[0-9]/, "Password must contain at least one number / 密码必须包含至少一个数字")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character / 密码必须包含至少一个特殊字符")
    .optional();

  const userPatchSchema = z.object({
    // 用户名通常不允许更改，如果允许，需谨慎处理冲突
    // username: z.string().min(3, "用户名长度至少为3位").optional(),
    email: z.string().email("Invalid email address / 无效的电子邮件地址").optional().nullable(),
    password: passwordPolicySchemaOptional, // 允许更新密码
    firstName: z.string().optional().nullable(),
    lastName: z.string().optional().nullable(),
    displayName: z.string().optional().nullable(),
    avatar: z.string().url("Invalid URL format for avatar / 头像URL格式无效").optional().nullable(),
    organization: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    // workLocation: z.string().optional().nullable(), // If present in schema
    isActive: z.boolean().optional(),
    mustChangePassword: z.boolean().optional(),
    // emailVerified: z.boolean().optional(), // If admin can change this
    // phoneVerified: z.boolean().optional(), // If admin can change this
  }).strict(); // 使用 .strict() 来禁止未知字段

  const validationResult = userPatchSchema.safeParse(requestBody);
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
