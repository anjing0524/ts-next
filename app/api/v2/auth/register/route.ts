// 文件路径: app/api/v2/auth/register/route.ts
// 描述: 管理员创建新用户端点 (Admin creates new user endpoint)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User, Prisma } from '@prisma/client'; // Prisma types
import bcrypt from 'bcrypt';
import { JWTUtils } from '@/lib/auth/oauth2'; // For verifying admin's token
import { isValidEmail } from '@/lib/utils'; // Assuming a utility for email validation

// 模拟的管理员用户ID列表或角色检查逻辑 (Simulated admin user ID list or role check logic)
// 在实际应用中，这应该是一个更健壮的RBAC检查 (In a real application, this should be a more robust RBAC check)
// const ADMIN_USER_IDS = ['cluser1test123456789012345']; // Example admin user ID
// const REQUIRED_ROLE_FOR_REGISTRATION = 'admin'; // Or a specific permission needed

// 辅助函数：错误响应 (Helper function: Error response)
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'registration_failed', message }, { status });
}

export async function POST(req: NextRequest) {
  // 1. 管理员认证/授权 (Admin Authentication/Authorization)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return errorResponse('Unauthorized: Missing or invalid Authorization header.', 401, 'unauthorized');
  }
  const token = authHeader.substring(7); // 提取令牌 (Extract token)
  if (!token) {
    return errorResponse('Unauthorized: Missing token.', 401, 'unauthorized');
  }

  // 验证管理员的访问令牌 (Verify admin's access token)
  const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);
  if (!valid || !payload) {
    return errorResponse(`Unauthorized: Invalid or expired token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
  }

  // Placeholder Admin Check: 实际应用中应基于角色或权限进行检查
  // (Placeholder Admin Check: In a real application, this should be based on roles or permissions)
  // 例如: const isAdmin = await checkUserAdminRole(payload.userId);
  // 为了本示例，我们假设如果令牌有效且包含 userId，则操作被允许。这非常不安全，仅用于演示。
  // (For this example, we assume if token is valid and contains userId, action is permitted. This is very insecure, for demo only.)
  if (!payload.userId) {
    console.warn(`Admin check failed: Malformed token payload or missing userId. Token: ${token.substring(0,10)}...`);
    return errorResponse('Forbidden: You do not have permission to perform this action (invalid token payload).', 403, 'forbidden');
  }
  const adminUserId = payload.userId;
  console.log(`Admin user ${adminUserId} is attempting to register a new user.`);
  // TODO: 在实际部署前，必须实现真正的RBAC检查 (MUST implement real RBAC check before deploying)


  // 2. 解析请求体 (Parse request body)
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (e) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  const {
    username, email, password,
    firstName, lastName, displayName, avatar, phone,
    organization, department, workLocation,
    isActive = true, // 默认为激活状态 (Defaults to active)
    mustChangePassword = true, // 默认需要修改密码 (Defaults to must change password)
  } = requestBody;

  // 3. 输入数据验证 (Input data validation)
  if (!username || !email || !password) {
    return errorResponse('Username, email, and password are required.', 400, 'validation_error');
  }
  if (password.length < 8) { // 密码最小长度示例 (Example: minimum password length)
    return errorResponse('Password must be at least 8 characters long.', 400, 'validation_error');
  }
  if (!isValidEmail(email)) { // 使用假设的工具函数验证邮箱格式 (Use assumed utility function to validate email format)
      return errorResponse('Invalid email format.', 400, 'validation_error');
  }

  try {
    // 4. 检查用户名或邮箱是否已存在 (Check if username or email already exists)
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ username: username.trim() }, { email: email.trim().toLowerCase() }] },
    });
    if (existingUser) {
      const conflictField = existingUser.username === username.trim() ? 'username' : 'email';
      return errorResponse(`${conflictField} already exists.`, 409, 'conflict');
    }

    // 5. 安全地哈希密码 (Securely hash the password)
    const passwordHash = await bcrypt.hash(password, 10); // 10 is the salt rounds

    // 6. 创建新用户记录 (Create new User record)
    const newUser = await prisma.user.create({
      data: {
        username: username.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        displayName: displayName || username.trim(), // 默认使用 username作为 displayName
        avatar: avatar || null,
        phone: phone || null,
        organization: organization || null,
        department: department || null,
        workLocation: workLocation || null,
        isActive: Boolean(isActive),
        mustChangePassword: Boolean(mustChangePassword),
        failedLoginAttempts: 0,
        // createdAt, updatedAt are auto-generated by Prisma
        // lastLoginAt, lockedUntil default to null
      },
    });

    // 7. 构建并返回响应 (Construct and return response)
    // 不应返回 passwordHash 或其他敏感内部字段 (Should not return passwordHash or other sensitive internal fields)
    const userResponse = {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      displayName: newUser.displayName,
      avatar: newUser.avatar,
      phone: newUser.phone,
      organization: newUser.organization,
      department: newUser.department,
      workLocation: newUser.workLocation,
      isActive: newUser.isActive,
      mustChangePassword: newUser.mustChangePassword,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,
    };

    return NextResponse.json(userResponse, { status: 201 }); // 201 Created

  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // 处理 Prisma 特定的已知请求错误 (Handle Prisma-specific known request errors)
      if (error.code === 'P2002') { // Unique constraint failed
        const target = (error.meta?.target as string[]) || ['field'];
        return errorResponse(`Conflict: The ${target.join(', ')} you entered is already in use.`, 409, 'conflict');
      }
    }
    console.error('User registration error by admin:', adminUserId, error);
    return errorResponse('An unexpected error occurred during user registration.', 500, 'server_error');
  }
}

// 确保 JWTUtils.verifyV2AuthAccessToken 和 isValidEmail 存在
// (Ensure JWTUtils.verifyV2AuthAccessToken and isValidEmail exist)
// 这些声明帮助TypeScript识别这些外部函数，实际实现应在各自的文件中。
// (These declarations help TypeScript recognize these external functions; actual implementations should be in their respective files.)
/*
declare module '@/lib/auth/oauth2' {
  export class JWTUtils {
    static async verifyV2AuthAccessToken(token: string): Promise<{
      valid: boolean;
      payload?: { userId: string; username: string; roles?: string[], [key: string]: any }; // 示例载荷 (Example payload)
      error?: string;
    }>;
    // ... other methods if any
  }
}

declare module '@/lib/utils' {
  export function isValidEmail(email: string): boolean;
}
*/
