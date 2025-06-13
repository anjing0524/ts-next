// 文件路径: app/api/v2/users/[userId]/profile/route.ts
// 描述: 管理员更新用户个人资料 (Admin updates user profile information)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User, Prisma } from '@prisma/client';
import { JWTUtils } from '@/lib/auth/oauth2';

// --- 辅助函数 (Copied/adapted) ---
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'request_failed', message }, { status });
}

async function isUserAdmin(userId: string): Promise<boolean> {
  // TODO: Implement real RBAC check.
  const userWithRoles = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } }
  });
  return userWithRoles?.userRoles.some(ur => ur.role.name === 'admin') || false;
}

function excludeSensitiveUserFields(user: User | Partial<User> | null): Partial<User> | null {
  if (!user) return null;
  const { passwordHash, ...rest } = user as any;
  return rest;
}

// 简单的电话号码格式验证 (Simple phone number format validation - very basic)
// 实际应用中可能需要更复杂的库，例如 google-libphonenumber
// (In real applications, a more complex library like google-libphonenumber might be needed)
function isValidPhone(phone: string): boolean {
  if (!phone) return true; // 允许为空 (Allow empty)
  // 这是一个非常基础的检查，例如数字、+、-、(、) 和长度
  // (This is a very basic check, e.g., digits, +, -, (, ), and length)
  const phoneRegex = /^[+\-\(\)\d\s]{7,20}$/;
  return phoneRegex.test(phone);
}

interface RouteContext {
  params: {
    userId: string; // 目标用户的ID (ID of the target user)
  };
}

// --- PUT /api/v2/users/{userId}/profile (更新用户个人资料) ---
// 注意: PUT 通常意味着全量替换资源。如果只想部分更新，PATCH 更合适。
// (Note: PUT usually means full replacement. For partial updates, PATCH is more appropriate.)
// 此处实现为仅更新请求体中提供的profile相关字段。
// (This implementation updates only the profile-related fields provided in the request body.)
export async function PUT(req: NextRequest, context: RouteContext) {
  const { params } = context;
  const targetUserId = params.userId;

  // 1. 管理员认证 (Admin Authentication)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return errorResponse('Unauthorized: Missing Authorization header.', 401, 'unauthorized');
  const token = authHeader.substring(7);
  if (!token) return errorResponse('Unauthorized: Missing token.', 401, 'unauthorized');

  const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);
  if (!valid || !payload) return errorResponse(`Unauthorized: Invalid token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
  const adminUserId = payload.userId as string | undefined;
  if (!adminUserId) return errorResponse('Unauthorized: Invalid token payload (Admin ID missing).', 401, 'invalid_token_payload');
  if (!(await isUserAdmin(adminUserId))) return errorResponse('Forbidden: Not an admin.', 403, 'forbidden');

  // 2. 解析请求体 (Parse request body)
  let requestBody: Partial<Pick<User, 'displayName' | 'phone' | 'organization' | 'department' | 'workLocation' | 'firstName' | 'lastName'>>;
  try {
    requestBody = await req.json();
  } catch (e) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  // 不允许通过此端点修改的字段 (Fields not allowed to be modified via this endpoint)
  const forbiddenFields = ['username', 'email', 'isActive', 'mustChangePassword', 'password', 'passwordHash', 'id', 'createdAt', 'updatedAt', 'lastLoginAt', 'failedLoginAttempts', 'lockedUntil', 'emailVerified', 'phoneVerified'];
  for (const field of forbiddenFields) {
    if (field in requestBody) {
      return errorResponse(`Field "${field}" cannot be updated via the profile endpoint.`, 400, 'validation_error_restricted_field');
    }
  }

  // 3. 数据验证 (Data validation)
  if (requestBody.phone && !isValidPhone(requestBody.phone)) {
    return errorResponse('Invalid phone number format.', 400, 'validation_error_phone');
  }
  // 其他字段长度或格式验证可在此添加 (Other field length or format validations can be added here)
  if (requestBody.displayName && requestBody.displayName.length > 255) {
     return errorResponse('Display name exceeds maximum length of 255 characters.', 400, 'validation_error_length');
  }
   if (requestBody.firstName && requestBody.firstName.length > 255) {
     return errorResponse('First name exceeds maximum length of 255 characters.', 400, 'validation_error_length');
  }
   if (requestBody.lastName && requestBody.lastName.length > 255) {
     return errorResponse('Last name exceeds maximum length of 255 characters.', 400, 'validation_error_length');
  }
  // ... and so on for other fields like organization, department, workLocation

  try {
    // 4. 检查目标用户是否存在 (Check if target user exists)
    const userToUpdate = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!userToUpdate) return errorResponse('User not found to update profile.', 404, 'user_not_found');

    // 5. 准备更新数据 (Prepare update data)
    // 只包含允许更新的字段 (Only include allowed fields for update)
    const profileDataToUpdate: Prisma.UserUpdateInput = {};
    if (requestBody.displayName !== undefined) profileDataToUpdate.displayName = requestBody.displayName;
    if (requestBody.phone !== undefined) profileDataToUpdate.phone = requestBody.phone;
    if (requestBody.organization !== undefined) profileDataToUpdate.organization = requestBody.organization;
    if (requestBody.department !== undefined) profileDataToUpdate.department = requestBody.department;
    if (requestBody.workLocation !== undefined) profileDataToUpdate.workLocation = requestBody.workLocation;
    if (requestBody.firstName !== undefined) profileDataToUpdate.firstName = requestBody.firstName;
    if (requestBody.lastName !== undefined) profileDataToUpdate.lastName = requestBody.lastName;

    if (Object.keys(profileDataToUpdate).length === 0) {
      // 如果没有提供任何可更新的字段 (If no updatable fields were provided)
      return NextResponse.json(excludeSensitiveUserFields(userToUpdate), { status: 200 }); // 返回当前用户数据 (Return current user data)
    }

    profileDataToUpdate.updatedAt = new Date(); // 手动更新时间戳 (Manually update timestamp)

    // 6. 更新用户个人资料 (Update user profile)
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: profileDataToUpdate,
    });

    // 7. 返回更新后的用户信息 (Return updated user information)
    return NextResponse.json(excludeSensitiveUserFields(updatedUser), { status: 200 });

  } catch (error: any) {
    console.error(`Error updating profile for user ${targetUserId} by admin ${adminUserId}:`, error);
    return errorResponse('An unexpected error occurred while updating user profile.', 500, 'server_error');
  }
}
