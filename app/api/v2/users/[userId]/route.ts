// 文件路径: app/api/v2/users/[userId]/route.ts
// 描述: 管理特定用户 (获取、更新、删除) (Manage Specific User - Get, Update, Delete)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User, Prisma } from '@prisma/client';
import { JWTUtils } from '@/lib/auth/oauth2'; // For V2 Auth session token verification
import { isValidEmail } from '@/lib/utils';   // For email validation
// bcrypt for potential password updates (though generally not recommended here for PUT/PATCH)
// import bcrypt from 'bcrypt';

// --- 辅助函数 ---

/**
 * 错误响应辅助函数
 * @param message 错误消息
 * @param status HTTP状态码
 * @param errorCode 可选的错误代码
 * @returns NextResponse
 */
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'request_failed', message }, { status });
}

/**
 * 模拟管理员检查 (Simulated Admin Check)
 * 在实际应用中，这里应进行基于角色/权限的检查
 * @param userId 要检查的用户ID
 * @returns Promise<boolean> 如果是管理员则为true
 */
async function isUserAdmin(userId: string): Promise<boolean> {
  // TODO: 实现真正的RBAC检查。
  const userWithRoles = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } }
  });
  // 检查用户是否具有名为 'admin' 的角色 (Check if user has a role named 'admin')
  return userWithRoles?.userRoles.some(ur => ur.role.name === 'admin') || false;
}

/**
 * 从用户对象中排除敏感字段 (Exclude sensitive fields from user object)
 * @param user User对象或部分User对象
 * @returns User对象 (不含敏感字段) 或 null
 */
function excludeSensitiveUserFields(user: User | Partial<User> | null): Partial<User> | null {
  if (!user) return null;
  // 使用类型断言 'as any' 来处理 Partial<User> 可能不包含 passwordHash 的情况
  // (Using type assertion 'as any' to handle cases where Partial<User> might not include passwordHash)
  const { passwordHash, ...rest } = user as any;
  return rest;
}

interface RouteContext {
  params: {
    userId: string; // 目标用户的ID (ID of the target user)
  };
}

// --- GET /api/v2/users/{userId} (获取用户详情) ---
export async function GET(req: NextRequest, context: RouteContext) {
  const { params } = context;
  const targetUserId = params.userId;

  // 1. 管理员认证 (Admin Authentication)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return errorResponse('Unauthorized: Missing or invalid Authorization header.', 401, 'unauthorized');
  const token = authHeader.substring(7);
  if (!token) return errorResponse('Unauthorized: Missing token.', 401, 'unauthorized');

  const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);
  if (!valid || !payload) return errorResponse(`Unauthorized: Invalid or expired token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
  const adminUserId = payload.userId as string | undefined;
  if (!adminUserId) return errorResponse('Unauthorized: Invalid token payload (Admin User ID missing).', 401, 'invalid_token_payload');

  // 执行管理员检查 (Perform admin check)
  if (!(await isUserAdmin(adminUserId))) {
    return errorResponse('Forbidden: You do not have permission to view user details.', 403, 'forbidden');
  }

  // 2. 获取用户 (Fetch user)
  try {
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) return errorResponse('User not found.', 404, 'user_not_found');
    return NextResponse.json(excludeSensitiveUserFields(user), { status: 200 });
  } catch (error) {
    console.error(`Error fetching user ${targetUserId} by admin ${adminUserId}:`, error);
    return errorResponse('An unexpected error occurred while fetching user details.', 500, 'server_error');
  }
}

// --- PUT /api/v2/users/{userId} (全量更新用户信息) ---
export async function PUT(req: NextRequest, context: RouteContext) {
  const { params } = context;
  const targetUserId = params.userId;

  // 1. 管理员认证 (Admin Authentication)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return errorResponse('Unauthorized: Missing or invalid Authorization header.', 401, 'unauthorized');
  const token = authHeader.substring(7);
  if (!token) return errorResponse('Unauthorized: Missing token.', 401, 'unauthorized');
  const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);
  if (!valid || !payload) return errorResponse(`Unauthorized: Invalid or expired token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
  const adminUserId = payload.userId as string | undefined;
  if (!adminUserId) return errorResponse('Unauthorized: Invalid token payload (Admin User ID missing).', 401, 'invalid_token_payload');
  if (!(await isUserAdmin(adminUserId))) return errorResponse('Forbidden: You do not have permission to update users.', 403, 'forbidden');

  // 2. 解析请求体 (Parse request body)
  let requestBody: Omit<User, 'id' | 'passwordHash' | 'createdAt' | 'updatedAt' | 'lastLoginAt' | 'failedLoginAttempts' | 'lockedUntil'> & Partial<Pick<User, 'isActive' | 'mustChangePassword' | 'emailVerified' | 'phoneVerified'>>;
  try {
    requestBody = await req.json();
  } catch (e) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  // 3. 数据验证 (Data validation)
  if ((requestBody as any).password || (requestBody as any).passwordHash) {
    return errorResponse('Password updates are not allowed via this endpoint. Use password change/reset specific flows.', 400, 'validation_error_password');
  }
  if (requestBody.email && !isValidEmail(requestBody.email)) {
    return errorResponse('Invalid email format.', 400, 'validation_error_email');
  }
  // 确保必需的字段存在于PUT请求中 (Ensure required fields for a "full update" are present if that's the strict PUT semantic)
  // 对于本例，我们允许部分字段的PUT，更像PATCH，但通常PUT应提供完整资源表示
  // (For this example, we allow partial fields for PUT, more like PATCH, but typically PUT expects full resource representation)
  if (typeof requestBody.username !== 'string' || typeof requestBody.email !== 'string') {
      // return errorResponse('Username and email are required for PUT operations.', 400, 'validation_error_required_fields');
      // Or handle more flexibly like PATCH if that's intended. For now, we'll be flexible.
  }


  try {
    const existingUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!existingUser) return errorResponse('User not found to update.', 404, 'user_not_found');

    // 检查用户名或邮箱唯一性（如果更改） (Check username/email uniqueness if changed)
    if (requestBody.username && requestBody.username.trim() !== existingUser.username) {
      const conflictingUser = await prisma.user.findUnique({ where: { username: requestBody.username.trim() } });
      if (conflictingUser) return errorResponse('Username already taken.', 409, 'username_conflict');
    }
    if (requestBody.email && requestBody.email.trim().toLowerCase() !== existingUser.email.toLowerCase()) {
      const conflictingUser = await prisma.user.findUnique({ where: { email: requestBody.email.trim().toLowerCase() } });
      if (conflictingUser) return errorResponse('Email already taken.', 409, 'email_conflict');
    }

    // 准备更新数据 (Prepare update data)
    const updateData: Prisma.UserUpdateInput = {
      username: requestBody.username?.trim(),
      email: requestBody.email?.trim().toLowerCase(),
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
      updatedAt: new Date(), // 手动更新时间戳 (Manually update timestamp)
    };
    // 移除 undefined 值，以便Prisma不会尝试将它们设置为null，除非它们本身就是null
    Object.keys(updateData).forEach(key => updateData[key as keyof Prisma.UserUpdateInput] === undefined && delete updateData[key as keyof Prisma.UserUpdateInput]);


    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
    });
    return NextResponse.json(excludeSensitiveUserFields(updatedUser), { status: 200 });

  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return errorResponse('Conflict: Username or email already exists.', 409, 'conflict_unique');
    }
    console.error(`Error updating user ${targetUserId} by admin ${adminUserId}:`, error);
    return errorResponse('An unexpected error occurred while updating user.', 500, 'server_error');
  }
}

// --- PATCH /api/v2/users/{userId} (部分更新用户信息) ---
export async function PATCH(req: NextRequest, context: RouteContext) {
  const { params } = context;
  const targetUserId = params.userId;

  // 1. 管理员认证 (Admin Authentication - similar to PUT/GET)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return errorResponse('Unauthorized: Missing or invalid Authorization header.', 401, 'unauthorized');
  const token = authHeader.substring(7);
  if (!token) return errorResponse('Unauthorized: Missing token.', 401, 'unauthorized');
  const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);
  if (!valid || !payload) return errorResponse(`Unauthorized: Invalid or expired token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
  const adminUserId = payload.userId as string | undefined;
  if (!adminUserId) return errorResponse('Unauthorized: Invalid token payload (Admin User ID missing).', 401, 'invalid_token_payload');
  if (!(await isUserAdmin(adminUserId))) return errorResponse('Forbidden: You do not have permission to partially update users.', 403, 'forbidden');

  // 2. 解析请求体 (Parse request body)
  let requestBody: Partial<Omit<User, 'id' | 'passwordHash' | 'createdAt' | 'updatedAt' | 'lastLoginAt' | 'failedLoginAttempts' | 'lockedUntil'>>;
  try {
    requestBody = await req.json();
  } catch (e) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }
  if (Object.keys(requestBody).length === 0) {
    return errorResponse('Request body cannot be empty for PATCH operations.', 400, 'validation_error_empty_body');
  }

  // 3. 数据验证 (Data validation)
  if ((requestBody as any).password || (requestBody as any).passwordHash) {
    return errorResponse('Password updates are not allowed via this endpoint.', 400, 'validation_error_password');
  }
  if (requestBody.email && typeof requestBody.email === 'string' && !isValidEmail(requestBody.email)) {
    return errorResponse('Invalid email format.', 400, 'validation_error_email');
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!existingUser) return errorResponse('User not found to update.', 404, 'user_not_found');

    // 检查用户名或邮箱唯一性（如果提供并更改）(Check username/email uniqueness if provided and changed)
    if (requestBody.username && typeof requestBody.username === 'string' && requestBody.username.trim() !== existingUser.username) {
      const conflictingUser = await prisma.user.findUnique({ where: { username: requestBody.username.trim() } });
      if (conflictingUser) return errorResponse('Username already taken.', 409, 'username_conflict');
    }
    if (requestBody.email && typeof requestBody.email === 'string' && requestBody.email.trim().toLowerCase() !== existingUser.email.toLowerCase()) {
      const conflictingUser = await prisma.user.findUnique({ where: { email: requestBody.email.trim().toLowerCase() } });
      if (conflictingUser) return errorResponse('Email already taken.', 409, 'email_conflict');
    }

    // 准备更新数据 (Prepare update data for PATCH)
    const patchData: Prisma.UserUpdateInput = {};
    if (requestBody.username !== undefined) patchData.username = requestBody.username.trim();
    if (requestBody.email !== undefined) patchData.email = requestBody.email.trim().toLowerCase();
    if (requestBody.firstName !== undefined) patchData.firstName = requestBody.firstName;
    if (requestBody.lastName !== undefined) patchData.lastName = requestBody.lastName;
    if (requestBody.displayName !== undefined) patchData.displayName = requestBody.displayName;
    if (requestBody.avatar !== undefined) patchData.avatar = requestBody.avatar;
    if (requestBody.phone !== undefined) patchData.phone = requestBody.phone;
    if (requestBody.organization !== undefined) patchData.organization = requestBody.organization;
    if (requestBody.department !== undefined) patchData.department = requestBody.department;
    if (requestBody.workLocation !== undefined) patchData.workLocation = requestBody.workLocation;
    if (requestBody.isActive !== undefined) patchData.isActive = Boolean(requestBody.isActive);
    if (requestBody.mustChangePassword !== undefined) patchData.mustChangePassword = Boolean(requestBody.mustChangePassword);
    if (requestBody.emailVerified !== undefined) patchData.emailVerified = Boolean(requestBody.emailVerified);
    if (requestBody.phoneVerified !== undefined) patchData.phoneVerified = Boolean(requestBody.phoneVerified);

    if (Object.keys(patchData).length > 0) {
        patchData.updatedAt = new Date(); // 手动更新时间戳 (Manually update timestamp if there are changes)
    } else {
        // 如果没有有效字段进行更新，则无需访问数据库 (If no valid fields to update, no need to hit DB)
        return NextResponse.json(excludeSensitiveUserFields(existingUser), { status: 200 });
    }


    // 4. 更新用户 (Update user)
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: patchData,
    });
    return NextResponse.json(excludeSensitiveUserFields(updatedUser), { status: 200 });

  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
       const target = (error.meta?.target as string[]) || ['field'];
      return errorResponse(`Conflict: The ${target.join(', ')} you entered is already in use.`, 409, 'conflict_unique');
    }
    console.error(`Error partially updating user ${targetUserId} by admin ${adminUserId}:`, error);
    return errorResponse('An unexpected error occurred while partially updating user.', 500, 'server_error');
  }
}

// --- DELETE /api/v2/users/{userId} (删除用户) ---
export async function DELETE(req: NextRequest, context: RouteContext) {
  const { params } = context;
  const targetUserId = params.userId;

  // 1. 管理员认证 (Admin Authentication)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return errorResponse('Unauthorized: Missing or invalid Authorization header.', 401, 'unauthorized');
  const token = authHeader.substring(7);
  if (!token) return errorResponse('Unauthorized: Missing token.', 401, 'unauthorized');
  const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);
  if (!valid || !payload) return errorResponse(`Unauthorized: Invalid or expired token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
  const adminUserId = payload.userId as string | undefined;
  if (!adminUserId) return errorResponse('Unauthorized: Invalid token payload (Admin User ID missing).', 401, 'invalid_token_payload');
  if (!(await isUserAdmin(adminUserId))) return errorResponse('Forbidden: You do not have permission to delete users.', 403, 'forbidden');

  // 2. 防止自我删除 (Prevent self-deletion)
  if (targetUserId === adminUserId) {
    return errorResponse('Action not allowed: Administrators cannot delete their own account.', 400, 'self_deletion_not_allowed');
  }

  try {
    // 3. 检查用户是否存在 (Check if user exists - Prisma delete throws error if not found, but explicit check is clearer)
    const userToDelete = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!userToDelete) return errorResponse('User not found to delete.', 404, 'user_not_found');

    // 4. 删除用户 (Delete user)
    // Prisma的级联删除规则将处理关联数据（如果schema中已配置 onDelete: Cascade）
    // (Prisma's cascading delete rules will handle related data if configured with onDelete: Cascade in schema)
    await prisma.user.delete({ where: { id: targetUserId } });

    // 5. 返回响应 (Return response)
    return new NextResponse(null, { status: 204 }); // 204 No Content

  } catch (error: any) {
    console.error(`Error deleting user ${targetUserId} by admin ${adminUserId}:`, error);
    // 处理可能的Prisma错误，例如外键约束（如果未设置为级联删除或相关记录阻止删除）
    // (Handle potential Prisma errors, e.g., foreign key constraints if not set to cascade or related records prevent deletion)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') { // Foreign key constraint failure
            return errorResponse('Cannot delete user: They are still referenced by other records.', 409, 'conflict_foreign_key');
        } else if (error.code === 'P2025') { // Record to delete not found (covered by explicit check above)
             return errorResponse('User not found to delete (P2025).', 404, 'user_not_found_prisma');
        }
    }
    return errorResponse('An unexpected error occurred while deleting user.', 500, 'server_error');
  }
}

// 确保 JWTUtils.verifyV2AuthAccessToken 和 isValidEmail 存在
// (Ensure JWTUtils.verifyV2AuthAccessToken and isValidEmail exist)
/*
declare module '@/lib/auth/oauth2' {
  export class JWTUtils {
    static async verifyV2AuthAccessToken(token: string): Promise<{
      valid: boolean;
      payload?: { userId: string; [key: string]: any };
      error?: string;
    }>;
  }
}
declare module '@/lib/utils' {
  export function isValidEmail(email: string): boolean;
}
*/
