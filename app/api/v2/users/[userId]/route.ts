// 文件路径: app/api/v2/users/[userId]/route.ts
// File path: app/api/v2/users/[userId]/route.ts
// 描述: 此文件处理针对特定用户资源 (由 userId 标识) 的 API 请求，
// Description: This file handles API requests for specific user resources (identified by userId),
// 包括获取用户信息 (GET), 全量更新用户信息 (PUT), 部分更新用户信息 (PATCH), 以及删除用户 (DELETE)。
// including fetching user information (GET), fully updating user information (PUT), partially updating user information (PATCH), and deleting users (DELETE).
// 使用 `requirePermission` 中间件来保护这些端点，确保只有具有适当权限的用户才能执行操作。
// It uses the `requirePermission` middleware to protect these endpoints, ensuring only users with appropriate permissions can perform actions.
// `RouteContext` 用于从动态路由参数中提取 `userId`。
// `RouteContext` is used to extract `userId` from dynamic route parameters.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Prisma ORM 客户端 (Prisma ORM client)
import { User, Prisma } from '@prisma/client'; // Prisma 生成的类型 (Prisma generated types)
import { requirePermission } from '@/lib/auth/middleware'; // 引入权限控制中间件 (Import permission control middleware)
import type { AuthenticatedRequest } from '@/lib/auth/types'; // 引入认证请求类型 (Import AuthenticatedRequest type)
import bcrypt from 'bcrypt'; // bcrypt 用于密码处理，允许在PATCH中更新密码。 (bcrypt for password handling, allowing password updates in PATCH.)
import { userUpdatePayloadSchema, userPatchPayloadSchema, UserPatchPayload, UserUpdatePayload } from '../schemas'; // 导入 Zod 模式和推断类型 (Import Zod schemas and inferred types)
import { ApiResponse } from '@/lib/types/api'; // 标准API响应类型 (Standard API response type)
import { ResourceNotFoundError, ValidationError, BaseError, AuthorizationError } from '@/lib/errors'; // 自定义错误类 (Custom error classes)
import { withErrorHandling } from '@/lib/utils/error-handler'; // 错误处理高阶函数 (Error handling HOF)
import { AuthorizationUtils } from '@/lib/auth/oauth2'; // For Audit Logging


// 定义成功获取/更新用户时返回的用户信息结构 (不含敏感信息)
// Define the structure of user information returned on successful user get/update (without sensitive info)
type UserResponse = Omit<User, 'passwordHash'>;


// 定义路由上下文接口，用于从动态路由参数中获取 userId。
// Define the route context interface for extracting userId from dynamic route parameters.
interface RouteContext {
  params: {
    userId: string; // 目标用户的ID，从URL路径参数中提取。 (ID of the target user, extracted from URL path parameters.)
  };
}

// --- GET /api/v2/users/{userId} (获取特定用户详情) ---
// --- GET /api/v2/users/{userId} (Get specific user details) ---
/**
 * @swagger
 * /api/v2/users/{userId}:
 *   get:
 *     summary: 获取用户详情 (Get User Details)
 *     description: (需要 'users:read' 权限) 获取指定ID用户的详细信息。
 *                  ((Requires 'users:read' permission) Gets detailed information for a user specified by ID.)
 *     tags: [用户管理 (User Management)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userId
 *         in: path
 *         required: true
 *         description: 目标用户的ID。 (ID of the target user.)
 *         schema: { type: string, format: cuid }
 *     responses:
 *       '200':
 *         description: 成功获取用户信息。 (Successfully fetched user information.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseUser'
 *       '401':
 *         description: 未经授权。 (Unauthorized.)
 *       '403':
 *         description: 禁止访问（权限不足）。 (Forbidden (insufficient permissions).)
 *       '404':
 *         description: 用户未找到。 (User not found.)
 *       '500':
 *         description: 服务器内部错误。 (Internal server error.)
 */
async function getUserByIdHandlerInternal(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { params } = context;
  const targetUserId = params.userId;
  const performingAdmin = req.user;
  const ipAddress = req.ip || req.headers?.get('x-forwarded-for');
  const userAgent = req.headers?.get('user-agent');

  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to GET user ${targetUserId}.`);

  // 从数据库中查找指定 ID 的用户。
  // Find the user with the specified ID in the database.
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    // 使用 select 来排除 passwordHash (Use select to exclude passwordHash)
    select: {
        id: true, username: true, email: true, firstName: true, lastName: true,
        displayName: true, avatar: true, phone: true, organization: true, department: true, workLocation: true,
        isActive: true, emailVerified: true, mustChangePassword: true,
        lastLoginAt: true, createdAt: true, updatedAt: true, createdBy: true, updatedBy: true,
      }
  });

  if (!user) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'USER_READ_FAILURE_NOT_FOUND',
        status: 'FAILURE',
        resourceType: 'User',
        resourceId: targetUserId,
        ipAddress,
        userAgent,
        errorMessage: 'User not found.',
        details: JSON.stringify({ requestedUserId: targetUserId }),
    });
    throw new ResourceNotFoundError('User not found.', 'USER_NOT_FOUND', { userId: targetUserId });
  }

  await AuthorizationUtils.logAuditEvent({
      actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
      actorId: performingAdmin?.id || 'anonymous',
      userId: performingAdmin?.id,
      action: 'USER_READ_SUCCESS',
      status: 'SUCCESS',
      resourceType: 'User',
      resourceId: targetUserId,
      ipAddress,
      userAgent,
      details: JSON.stringify({ requestedUserId: targetUserId, returnedFields: Object.keys(user) }),
  });

  // 返回遵循 ApiResponse 结构的成功响应
  // Return a successful response following the ApiResponse structure
  return NextResponse.json<ApiResponse<UserResponse>>({
    success: true,
    data: user as UserResponse, // user 已通过 select 塑形 (user is already shaped by select)
    message: "User details fetched successfully."
  }, { status: 200 });
}
export const GET = requirePermission('users:read')(withErrorHandling(getUserByIdHandlerInternal));

// --- PUT /api/v2/users/{userId} (全量更新用户信息) ---
// --- PUT /api/v2/users/{userId} (Full update of user information) ---
/**
 * @swagger
 * /api/v2/users/{userId}:
 *   put:
 *     summary: 全量更新用户信息 (Full Update User Information)
 *     description: (需要 'users:update' 权限) 全量更新指定ID用户的账户信息。请求体中应包含所有要更新的字段。
 *                  ((Requires 'users:update' permission) Fully updates account information for a user specified by ID. Request body should contain all fields to be updated.)
 *     tags: [用户管理 (User Management)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdPath'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserUpdatePayload'
 *     responses:
 *       '200':
 *         description: 用户信息更新成功。 (User information updated successfully.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseUser'
 *       '400':
 *         description: 请求体验证失败或JSON格式错误。 (Request body validation failed or malformed JSON.)
 *       '401':
 *         description: 未经授权。 (Unauthorized.)
 *       '403':
 *         description: 禁止访问。 (Forbidden.)
 *       '404':
 *         description: 用户未找到。 (User not found.)
 *       '409':
 *         description: 邮箱已存在冲突。 (Email already exists (conflict).)
 */
async function updateUserHandlerInternal(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { params } = context;
  const targetUserId = params.userId;
  const performingAdmin = req.user;
  const ipAddress = req.ip || req.headers?.get('x-forwarded-for');
  const userAgent = req.headers?.get('user-agent');
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to PUT (full update) user ${targetUserId}.`);

  let rawRequestBody;
  try {
    rawRequestBody = await req.json();
  } catch (e: any) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'USER_UPDATE_FAILURE_INVALID_JSON',
        status: 'FAILURE',
        resourceType: 'User',
        resourceId: targetUserId,
        ipAddress,
        userAgent,
        errorMessage: 'Invalid JSON request body for PUT.',
        details: JSON.stringify({ error: e.message }),
    });
    throw new ValidationError('Invalid JSON request body.', { detail: e.message }, 'INVALID_JSON_BODY_PUT');
  }

  const validationResult = userUpdatePayloadSchema.safeParse(rawRequestBody);
  if (!validationResult.success) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'USER_UPDATE_FAILURE_VALIDATION',
        status: 'FAILURE',
        resourceType: 'User',
        resourceId: targetUserId,
        ipAddress,
        userAgent,
        errorMessage: 'User update payload validation failed.',
        details: JSON.stringify({ issues: validationResult.error.flatten().fieldErrors, receivedBody: rawRequestBody }),
    });
    throw new ValidationError('User update payload validation failed.', { issues: validationResult.error.flatten().fieldErrors }, 'USER_UPDATE_VALIDATION_ERROR');
  }
  const updateDataFromRequest = validationResult.data as UserUpdatePayload; // 类型断言 (Type assertion)

  // 检查目标用户是否存在。
  // Check if the target user exists.
  const existingUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!existingUser) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'USER_UPDATE_FAILURE_NOT_FOUND',
        status: 'FAILURE',
        resourceType: 'User',
        resourceId: targetUserId,
        ipAddress,
        userAgent,
        errorMessage: 'User not found to update (PUT).',
        details: JSON.stringify({ attemptedUpdateFor: targetUserId }),
    });
    throw new ResourceNotFoundError('User not found to update.', 'USER_NOT_FOUND_ON_PUT', { userId: targetUserId });
  }

  // 冲突检查 (仅 email, 因为 username 不允许通过此模式更改)。
  // Conflict check (only for email, as username changes are not allowed by this schema).
  if (updateDataFromRequest.email && typeof updateDataFromRequest.email === 'string') {
    const trimmedEmail = updateDataFromRequest.email.trim().toLowerCase();
    if (trimmedEmail !== (existingUser.email || '').toLowerCase()) {
      const conflictingUser = await prisma.user.findFirst({
        where: { email: trimmedEmail, id: { not: targetUserId } }
      });
      if (conflictingUser) {
        await AuthorizationUtils.logAuditEvent({
            actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
            actorId: performingAdmin?.id || 'anonymous',
            userId: performingAdmin?.id,
            action: 'USER_UPDATE_FAILURE_EMAIL_CONFLICT',
            status: 'FAILURE',
            resourceType: 'User',
            resourceId: targetUserId,
            ipAddress,
            userAgent,
            errorMessage: 'Email already taken by another user.',
            details: JSON.stringify({ triedEmail: trimmedEmail, conflictingUserId: conflictingUser.id }),
        });
        throw new BaseError('Email already taken by another user.', 409, 'EMAIL_CONFLICT_ON_PUT', { email: trimmedEmail });
      }
    }
  }

  const updateData: Prisma.UserUpdateInput = { ...updateDataFromRequest };
  if (updateDataFromRequest.email === null) {
      updateData.email = null;
  } else if (updateDataFromRequest.email) {
      updateData.email = updateDataFromRequest.email.trim().toLowerCase();
  }
  updateData.updatedAt = new Date();
  updateData.updatedBy = performingAdmin?.id; // 记录更新者 (Record updater)

  let updatedUser;
  try {
    updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
      select: { // 确保返回的数据不包含 passwordHash (Ensure returned data does not include passwordHash)
          id: true, username: true, email: true, firstName: true, lastName: true,
          displayName: true, avatar: true, phone: true, organization: true, department: true, workLocation: true,
          isActive: true, emailVerified: true, mustChangePassword: true,
          lastLoginAt: true, createdAt: true, updatedAt: true, createdBy: true, updatedBy: true,
        }
    });
  } catch (error: any) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'USER_UPDATE_FAILURE_DB_ERROR',
        status: 'FAILURE',
        resourceType: 'User',
        resourceId: targetUserId,
        ipAddress,
        userAgent,
        errorMessage: 'Failed to update user in database (PUT).',
        details: JSON.stringify({ error: error.message, updateData }),
    });
    throw new BaseError('Failed to update user due to a database issue.', 500, 'DB_UPDATE_USER_ERROR_PUT');
  }

  await AuthorizationUtils.logAuditEvent({
      actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
      actorId: performingAdmin?.id || 'anonymous',
      userId: performingAdmin?.id,
      action: 'USER_UPDATE_SUCCESS', // General update, could specify PUT if needed
      status: 'SUCCESS',
      resourceType: 'User',
      resourceId: targetUserId,
      ipAddress,
      userAgent,
      details: JSON.stringify({ updatedFields: Object.keys(updateDataFromRequest), userId: targetUserId }),
  });

  return NextResponse.json<ApiResponse<UserResponse>>({
    success: true,
    data: updatedUser as UserResponse,
    message: "User updated successfully."
  }, { status: 200 });
}
export const PUT = requirePermission('users:update')(withErrorHandling(updateUserHandlerInternal));

// --- PATCH /api/v2/users/{userId} (部分更新用户信息) ---
// --- PATCH /api/v2/users/{userId} (Partial update of user information) ---
/**
 * @swagger
 * /api/v2/users/{userId}:
 *   patch:
 *     summary: 部分更新用户信息 (Partial Update User Information)
 *     description: (需要 'users:update' 权限) 部分更新指定ID用户的账户信息。仅请求体中提供的字段会被更新。
 *                  ((Requires 'users:update' permission) Partially updates account information for a user specified by ID. Only fields provided in the request body will be updated.)
 *     tags: [用户管理 (User Management)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdPath'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserPatchPayload'
 *     responses:
 *       '200':
 *         description: 用户信息部分更新成功。 (User information partially updated successfully.)
 *       '400':
 *         description: 请求体验证失败、JSON格式错误或不允许的字段更新。 (Request body validation failed, malformed JSON, or disallowed field update.)
 *       '404':
 *         description: 用户未找到。 (User not found.)
 *       '409':
 *         description: 邮箱已存在冲突。 (Email already exists (conflict).)
 */
async function patchUserHandlerInternal(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { params } = context;
  const targetUserId = params.userId;
  const performingAdmin = req.user;
  const ipAddress = req.ip || req.headers?.get('x-forwarded-for');
  const userAgent = req.headers?.get('user-agent');
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to PATCH user ${targetUserId}.`);

  let rawRequestBody;
  try {
    rawRequestBody = await req.json();
  } catch (e: any) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'USER_PATCH_FAILURE_INVALID_JSON',
        status: 'FAILURE',
        resourceType: 'User',
        resourceId: targetUserId,
        ipAddress,
        userAgent,
        errorMessage: 'Invalid JSON request body for PATCH.',
        details: JSON.stringify({ error: e.message }),
    });
    throw new ValidationError('Invalid JSON request body.', { detail: e.message }, 'INVALID_JSON_BODY_PATCH');
  }
  if (Object.keys(rawRequestBody).length === 0) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'USER_PATCH_FAILURE_EMPTY_BODY',
        status: 'FAILURE',
        resourceType: 'User',
        resourceId: targetUserId,
        ipAddress,
        userAgent,
        errorMessage: 'Request body cannot be empty for PATCH.',
    });
    throw new ValidationError('Request body cannot be empty for PATCH operations.', undefined, 'EMPTY_PATCH_BODY');
  }

  const validationResult = userPatchPayloadSchema.safeParse(rawRequestBody);
  if (!validationResult.success) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'USER_PATCH_FAILURE_VALIDATION',
        status: 'FAILURE',
        resourceType: 'User',
        resourceId: targetUserId,
        ipAddress,
        userAgent,
        errorMessage: 'User patch payload validation failed.',
        details: JSON.stringify({ issues: validationResult.error.flatten().fieldErrors, receivedBody: rawRequestBody }),
    });
    throw new ValidationError('User patch payload validation failed.', { issues: validationResult.error.flatten().fieldErrors }, 'USER_PATCH_VALIDATION_ERROR');
  }

  const validatedData = validationResult.data as UserPatchPayload;

  if (validatedData.hasOwnProperty('username')) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'USER_PATCH_FAILURE_USERNAME_MODIFICATION',
        status: 'FAILURE',
        resourceType: 'User',
        resourceId: targetUserId,
        ipAddress,
        userAgent,
        errorMessage: 'Username modification is not allowed via PATCH.',
        details: JSON.stringify({ attemptedUsername: (validatedData as any).username }),
    });
    throw new ValidationError('Username modification is not allowed via PATCH request.', undefined, 'USERNAME_MODIFICATION_NOT_ALLOWED');
  }

  const existingUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!existingUser) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'USER_PATCH_FAILURE_NOT_FOUND',
        status: 'FAILURE',
        resourceType: 'User',
        resourceId: targetUserId,
        ipAddress,
        userAgent,
        errorMessage: 'User not found to update (PATCH).',
    });
    throw new ResourceNotFoundError('User not found to update.', 'USER_NOT_FOUND_ON_PATCH', { userId: targetUserId });
  }

  if (validatedData.email && typeof validatedData.email === 'string') {
    const trimmedEmail = validatedData.email.trim().toLowerCase();
    if (trimmedEmail !== (existingUser.email || '').toLowerCase()) {
      const conflictingUser = await prisma.user.findFirst({
        where: { email: trimmedEmail, id: { not: targetUserId } }
      });
      if (conflictingUser) {
        await AuthorizationUtils.logAuditEvent({
            actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
            actorId: performingAdmin?.id || 'anonymous',
            userId: performingAdmin?.id,
            action: 'USER_PATCH_FAILURE_EMAIL_CONFLICT',
            status: 'FAILURE',
            resourceType: 'User',
            resourceId: targetUserId,
            ipAddress,
            userAgent,
            errorMessage: 'Email already taken by another user (PATCH).',
            details: JSON.stringify({ triedEmail: trimmedEmail, conflictingUserId: conflictingUser.id }),
        });
        throw new BaseError('Email already taken by another user.', 409, 'EMAIL_CONFLICT_ON_PATCH', { email: trimmedEmail });
      }
    }
  } else if (validatedData.email === null && existingUser.email !== null) {
    // 允许将 email 设置为 null
    // Allow setting email to null
  }

  const patchData: Prisma.UserUpdateInput = {};
  Object.keys(validatedData).forEach(key => {
    if (key !== 'password' && validatedData[key as keyof UserPatchPayload] !== undefined) {
      if (key === 'email') { // email 特殊处理：null 或清理后的值 (Special handling for email: null or trimmed value)
        patchData.email = validatedData.email === null ? null : (validatedData.email as string).trim().toLowerCase();
      } else {
        patchData[key as keyof Prisma.UserUpdateInput] = validatedData[key as keyof UserPatchPayload];
      }
    }
  });

  if (validatedData.password) {
    try {
        const saltRounds = 12;
        patchData.passwordHash = await bcrypt.hash(validatedData.password, saltRounds);
        if (validatedData.mustChangePassword === undefined) {
        patchData.mustChangePassword = true;
        }
    } catch (error: any) {
        await AuthorizationUtils.logAuditEvent({
            actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
            actorId: performingAdmin?.id || 'anonymous',
            userId: performingAdmin?.id,
            action: 'USER_PATCH_FAILURE_PASSWORD_HASHING',
            status: 'FAILURE',
            resourceType: 'User',
            resourceId: targetUserId,
            ipAddress,
            userAgent,
            errorMessage: 'Password hashing failed during PATCH.',
            details: JSON.stringify({ error: error.message }),
        });
        throw new BaseError('Password processing failed during PATCH.', 500, 'PASSWORD_HASH_ERROR_PATCH');
    }
  }

  if (Object.keys(patchData).length === 0) {
    // No actual changes to be made, but still log the attempt if desired, or just return.
    // For now, treating as a "successful" no-op.
     await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'USER_PATCH_NO_CHANGES',
        status: 'SUCCESS', // Or 'INFO' if available
        resourceType: 'User',
        resourceId: targetUserId,
        ipAddress,
        userAgent,
        details: JSON.stringify({ message: "No valid fields provided for update." }),
    });
    return NextResponse.json<ApiResponse<UserResponse>>({
        success: true,
        data: existingUser as UserResponse, // Prisma's select will exclude passwordHash
        message: "No valid fields provided for update, no changes made."
    }, { status: 200 });
  }
  patchData.updatedAt = new Date();
  patchData.updatedBy = performingAdmin?.id; // 记录更新者 (Record updater)

  let updatedUser;
  try {
    updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: patchData,
      select: { // 确保返回的数据不包含 passwordHash (Ensure returned data does not include passwordHash)
          id: true, username: true, email: true, firstName: true, lastName: true,
          displayName: true, avatar: true, phone: true, organization: true, department: true, workLocation: true,
          isActive: true, emailVerified: true, mustChangePassword: true,
          lastLoginAt: true, createdAt: true, updatedAt: true, createdBy: true, updatedBy: true,
      }
    });
  } catch (error: any) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'USER_PATCH_FAILURE_DB_ERROR',
        status: 'FAILURE',
        resourceType: 'User',
        resourceId: targetUserId,
        ipAddress,
        userAgent,
        errorMessage: 'Failed to partially update user in database (PATCH).',
        details: JSON.stringify({ error: error.message, patchData }),
    });
    throw new BaseError('Failed to partially update user due to a database issue.', 500, 'DB_UPDATE_USER_ERROR_PATCH');
  }

  await AuthorizationUtils.logAuditEvent({
      actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
      actorId: performingAdmin?.id || 'anonymous',
      userId: performingAdmin?.id,
      action: 'USER_PATCH_SUCCESS',
      status: 'SUCCESS',
      resourceType: 'User',
      resourceId: targetUserId,
      ipAddress,
      userAgent,
      details: JSON.stringify({ updatedFields: Object.keys(validatedData), userId: targetUserId }),
  });

  return NextResponse.json<ApiResponse<UserResponse>>({
    success: true,
    data: updatedUser as UserResponse,
    message: "User partially updated successfully."
  }, { status: 200 });
}
export const PATCH = requirePermission('users:update')(withErrorHandling(patchUserHandlerInternal));

// --- DELETE /api/v2/users/{userId} (删除用户) ---
// --- DELETE /api/v2/users/{userId} (Delete user) ---
/**
 * @swagger
 * /api/v2/users/{userId}:
 *   delete:
 *     summary: 删除用户 (Delete User)
 *     description: (需要 'users:delete' 权限) 删除指定ID的用户账户。
 *                  ((Requires 'users:delete' permission) Deletes a user account specified by ID.)
 *     tags: [用户管理 (User Management)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdPath'
 *     responses:
 *       '200':
 *         description: 用户删除成功。 (User deleted successfully.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseNull' # ApiResponse<null>
 *       '401':
 *         description: 未经授权。 (Unauthorized.)
 *       '403':
 *         description: 禁止访问（例如，尝试自我删除）。 (Forbidden (e.g., attempting self-deletion).)
 *       '404':
 *         description: 用户未找到。 (User not found.)
 *       '409':
 *         description: 冲突（例如，由于外键约束无法删除）。 (Conflict (e.g., cannot delete due to foreign key constraints).)
 */
async function deleteUserHandlerInternal(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { params } = context;
  const targetUserId = params.userId;
  const performingAdmin = req.user;
  const ipAddress = req.ip || req.headers?.get('x-forwarded-for');
  const userAgent = req.headers?.get('user-agent');
  console.log(`Admin user ${performingAdmin?.id} (ClientID: ${performingAdmin?.clientId}) attempting to DELETE user ${targetUserId}.`);

  // 防止管理员自我删除。
  // Prevent admin self-deletion.
  if (targetUserId === performingAdmin?.id) {
    await AuthorizationUtils.logAuditEvent({
        actorType: 'USER',
        actorId: performingAdmin.id,
        userId: performingAdmin.id,
        action: 'USER_DELETE_FAILURE_SELF_DELETION',
        status: 'FAILURE',
        resourceType: 'User',
        resourceId: targetUserId,
        ipAddress,
        userAgent,
        errorMessage: 'Administrators cannot delete their own account.',
    });
    throw new AuthorizationError('Action not allowed: Administrators cannot delete their own account using this method.', undefined, 'SELF_DELETION_NOT_ALLOWED');
  }

  // 检查用户是否存在。
  // Check if the user exists.
  const userToDelete = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!userToDelete) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'USER_DELETE_FAILURE_NOT_FOUND',
        status: 'FAILURE',
        resourceType: 'User',
        resourceId: targetUserId,
        ipAddress,
        userAgent,
        errorMessage: 'User not found to delete.',
    });
    throw new ResourceNotFoundError('User not found to delete.', 'USER_NOT_FOUND_ON_DELETE', { userId: targetUserId });
  }

  try {
    await prisma.user.delete({ where: { id: targetUserId } });

    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'USER_DELETE_SUCCESS',
        status: 'SUCCESS',
        resourceType: 'User',
        resourceId: targetUserId, // ID of the deleted user
        ipAddress,
        userAgent,
        details: JSON.stringify({ deletedUserId: targetUserId, username: userToDelete.username }),
    });

  } catch (error: any) {
    let errorMessage = 'Failed to delete user due to a database issue.';
    let auditAction = 'USER_DELETE_FAILURE_DB_ERROR';
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') { // 外键约束失败 (Foreign key constraint failed)
            const fieldName = (error.meta as any)?.field_name || 'related records';
            errorMessage = `Cannot delete user: They are still referenced by other records (constraint: ${fieldName}). Consider deactivating the user instead.`;
            auditAction = 'USER_DELETE_FAILURE_FOREIGN_KEY';
            await AuthorizationUtils.logAuditEvent({
                actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
                actorId: performingAdmin?.id || 'anonymous',
                userId: performingAdmin?.id,
                action: auditAction,
                status: 'FAILURE',
                resourceType: 'User',
                resourceId: targetUserId,
                ipAddress,
                userAgent,
                errorMessage,
                details: JSON.stringify({ error: error.message, constraint: fieldName }),
            });
            throw new BaseError(errorMessage, 409, 'CONFLICT_FOREIGN_KEY_ON_DELETE', { constraint: fieldName });
        } else if (error.code === 'P2025') { // 记录未找到 (理论上已被上面的 findUnique 覆盖) (Record not found - theoretically covered by findUnique above)
             errorMessage = 'User not found to delete (Prisma P2025).';
             auditAction = 'USER_DELETE_FAILURE_NOT_FOUND_PRISMA';
             await AuthorizationUtils.logAuditEvent({
                actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
                actorId: performingAdmin?.id || 'anonymous',
                userId: performingAdmin?.id,
                action: auditAction,
                status: 'FAILURE',
                resourceType: 'User',
                resourceId: targetUserId,
                ipAddress,
                userAgent,
                errorMessage,
             });
             throw new ResourceNotFoundError(errorMessage, 'USER_NOT_FOUND_PRISMA_ON_DELETE', { userId: targetUserId });
        }
    }
    // For other Prisma errors or unknown errors
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: auditAction, // Will be USER_DELETE_FAILURE_DB_ERROR if not caught by specific Prisma errors above
        status: 'FAILURE',
        resourceType: 'User',
        resourceId: targetUserId,
        ipAddress,
        userAgent,
        errorMessage,
        details: JSON.stringify({ error: error.message }),
    });
    throw error; // Re-throw original error for withErrorHandling
  }

  // 返回遵循 ApiResponse 结构的成功响应 (状态码 200，因为 204 通常无响应体)
  // Return a successful response following ApiResponse structure (status 200, as 204 usually has no body)
  return NextResponse.json<ApiResponse<null>>({
    success: true,
    message: 'User deleted successfully.',
    data: null
  }, { status: 200 });
}
export const DELETE = requirePermission('users:delete')(withErrorHandling(deleteUserHandlerInternal));

// Swagger 组件模式定义 (可以提取到共享位置)
// Swagger component schema definitions (can be extracted to a shared location)
/**
 * @swagger
 * components:
 *   parameters:
 *     UserIdPath:
 *       name: userId
 *       in: path
 *       required: true
 *       description: 目标用户的ID。 (ID of the target user.)
 *       schema:
 *         type: string
 *         format: cuid
 *   schemas:
 *     UserResponse: # 用于 GET /users/{id}, PUT /users/{id}, PATCH /users/{id} 的成功响应数据部分
 *       type: object
 *       properties:
 *         id: { type: string, format: cuid }
 *         username: { type: string, nullable: true }
 *         email: { type: string, format: email, nullable: true }
 *         firstName: { type: string, nullable: true }
 *         lastName: { type: string, nullable: true }
 *         displayName: { type: string, nullable: true }
 *         avatar: { type: string, format: url, nullable: true }
 *         phone: { type: string, nullable: true }
 *         organization: { type: string, nullable: true }
 *         department: { type: string, nullable: true }
 *         workLocation: { type: string, nullable: true }
 *         isActive: { type: boolean }
 *         emailVerified: { type: boolean, nullable: true }
 *         mustChangePassword: { type: boolean }
 *         lastLoginAt: { type: string, format: "date-time", nullable: true }
 *         createdAt: { type: string, format: "date-time" }
 *         updatedAt: { type: string, format: "date-time" }
 *         createdBy: { type: string, format: cuid, nullable: true }
 *         updatedBy: { type: string, format: cuid, nullable: true }
 *     UserUpdatePayload: # PUT /users/{id} 的请求体
 *       type: object
 *       properties:
 *         # 根据 userUpdatePayloadSchema 定义 (Define according to userUpdatePayloadSchema)
 *         email: { type: string, format: email, nullable: true }
 *         firstName: { type: string, nullable: true }
 *         lastName: { type: string, nullable: true }
 *         displayName: { type: string, nullable: true }
 *         avatar: { type: string, format: url, nullable: true }
 *         phone: { type: string, nullable: true }
 *         organization: { type: string, nullable: true }
 *         department: { type: string, nullable: true }
 *         workLocation: { type: string, nullable: true }
 *         isActive: { type: boolean, default: true }
 *         mustChangePassword: { type: boolean, default: false }
 *     UserPatchPayload: # PATCH /users/{id} 的请求体
 *       type: object
 *       properties:
 *         # 根据 userPatchPayloadSchema 定义 (Define according to userPatchPayloadSchema)
 *         # (与 UserUpdatePayload 类似，但所有字段都是可选的)
 *         # (Similar to UserUpdatePayload, but all fields are optional)
 *         password: { type: string, minLength: 8, description: "新密码 (New password)" }
 *     ApiResponseUser: # 包裹 UserResponse 的标准API响应
 *       allOf:
 *         - $ref: '#/components/schemas/ApiResponseBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/UserResponse'
 *     ApiResponseNull: # 用于例如删除成功的响应
 *       allOf:
 *         - $ref: '#/components/schemas/ApiResponseBase'
 *         - type: object
 *           properties:
 *             data:
 *               type: 'null' # 或 object 但允许为 null (or object but nullable)
 *               nullable: true
 *     ApiResponseBase: # 基础API响应结构 (用于 allOf)
 *       type: object
 *       properties:
 *         success: { type: boolean }
 *         message: { type: string, nullable: true }
 *     ApiError: # 在 lib/types/api.ts 中定义 (Defined in lib/types/api.ts)
 *       type: object
 *       properties:
 *         code: { type: string }
 *         message: { type: string }
 *         details: { type: object, additionalProperties: true, nullable: true }
 *     ApiResponseError: # 标准错误API响应
 *       allOf:
 *         - $ref: '#/components/schemas/ApiResponseBase'
 *         - type: object
 *           properties:
 *             success: { type: boolean, example: false }
 *             error: { $ref: '#/components/schemas/ApiError' }
 */

// 文件结束 (End Of File)
// EOF
