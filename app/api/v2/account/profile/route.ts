// /api/v2/account/profile
// 描述: 处理当前认证用户个人资料的获取 (GET) 和更新 (PUT) 请求。
// (Handles GET and PUT requests for the currently authenticated user's profile.)

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { Prisma } from '@prisma/client';

// Zod schema for profile updates
// 个人资料更新的Zod Schema
const profileUpdateSchema = z.object({
  firstName: z.string().max(100, "名字长度不能超过100字符").optional().nullable(),
  lastName: z.string().max(100, "姓氏长度不能超过100字符").optional().nullable(),
  displayName: z.string().max(100, "显示名称长度不能超过100字符").optional().nullable(),
  avatar: z.string().url("头像必须是有效的URL").optional().nullable(),
  email: z.string().email("无效的电子邮件地址").max(255).optional(), // Email change might need separate verification flow in a real app
  // organization: z.string().max(100).optional().nullable(), // Example of other fields if they were user-editable
  // department: z.string().max(100).optional().nullable(),
});

// 从用户对象中排除敏感字段 (Exclude sensitive fields from user object)
function excludeSensitiveUserFields(user: any) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

/**
 * @swagger
 * /api/v2/account/profile:
 *   get:
 *     summary: 获取当前用户的个人资料 (个人账户管理)
 *     description: 检索当前已认证用户的详细个人资料信息。
 *     tags: [Account API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: "成功获取个人资料。" }
 *       401: { description: "用户未认证。" }
 *       404: { description: "用户未找到。" }
 */
async function getProfileHandler(request: AuthenticatedRequest) {
  const currentUserId = request.user?.id; // 从认证中间件获取用户ID (Get user ID from auth middleware)

  if (!currentUserId) {
    // This case should ideally be handled by requirePermission if it strictly enforces a user context
    return NextResponse.json({ message: "Unauthorized: User ID not found in token." }, { status: 401 });
  }

  try {
    const userProfile = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { // 选择要返回的字段 (Select fields to return)
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        avatar: true,
        organization: true,
        department: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      }
    });

    if (!userProfile) {
      return NextResponse.json({ message: "User profile not found." }, { status: 404 });
    }

    return NextResponse.json(userProfile);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return NextResponse.json({ message: "Error fetching user profile." }, { status: 500 });
  }
}
// For account profile, typically any authenticated user can access their own.
// Passing no specific permission string to requirePermission just validates the token and populates req.user.
export const GET = requirePermission()(getProfileHandler);


/**
 * @swagger
 * /api/v2/account/profile:
 *   put:
 *     summary: 更新当前用户的个人资料 (个人账户管理)
 *     description: 允许当前已认证用户更新其个人资料信息。
 *     tags: [Account API]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProfileUpdatePayload'
 *     responses:
 *       200: { description: "个人资料已成功更新。" }
 *       400: { description: "无效请求数据。" }
 *       401: { description: "用户未认证。" }
 *       404: { description: "用户未找到。" }
 *       409: { description: "邮箱已被其他用户使用。" }
 * components:
 *   schemas:
 *     ProfileUpdatePayload:
 *       type: object
 *       properties:
 *         firstName: { type: string, nullable: true }
 *         lastName: { type: string, nullable: true }
 *         displayName: { type: string, nullable: true }
 *         avatar: { type: string, format: url, nullable: true }
 *         email: { type: string, format: email, nullable: true }
 */
async function updateProfileHandler(request: AuthenticatedRequest) {
  const currentUserId = request.user?.id;

  if (!currentUserId) {
    return NextResponse.json({ message: "Unauthorized: User ID not found in token." }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body', message: 'Failed to parse JSON body.' }, { status: 400 });
  }

  const validationResult = profileUpdateSchema.safeParse(payload);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }

  const dataToUpdate = validationResult.data;

  if (Object.keys(dataToUpdate).length === 0) {
    return NextResponse.json({ message: "No fields provided for update." }, { status: 400 });
  }

  try {
    // 检查邮箱是否冲突 (Check for email conflict if email is being updated)
    if (dataToUpdate.email) {
      const existingUserWithEmail = await prisma.user.findFirst({
        where: {
          email: dataToUpdate.email,
          id: { not: currentUserId }, // Exclude current user
        },
      });
      if (existingUserWithEmail) {
        return NextResponse.json({ message: "Email address is already in use by another account." }, { status: 409 });
      }
    }

    const updatedUserPrisma = await prisma.user.update({
      where: { id: currentUserId },
      data: dataToUpdate as Prisma.UserUpdateInput, // Cast because Zod types can be slightly different
    });

    return NextResponse.json(excludeSensitiveUserFields(updatedUserPrisma));
  } catch (error) {
    console.error("Error updating user profile:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return NextResponse.json({ message: "User not found for update." }, { status: 404 });
    }
    return NextResponse.json({ message: "Error updating user profile." }, { status: 500 });
  }
}
export const PUT = requirePermission()(updateProfileHandler);
