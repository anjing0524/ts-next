// 文件路径: app/api/v2/auth/login/route.ts
// 描述: 用户登录认证端点 (User login authentication endpoint)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User } from '@prisma/client'; // Prisma User type
import bcrypt from 'bcrypt'; // For password comparison
import { addMinutes, addHours } from 'date-fns'; // For time manipulation
import { JWTUtils } from '@/lib/auth/oauth2'; // Assuming JWTUtils for token generation
import crypto from 'crypto'; // For potential future use with refresh token (e.g. jti)

const MAX_FAILED_LOGIN_ATTEMPTS = 5; // 最大登录失败次数 (Max failed login attempts)
const LOCKOUT_DURATION_MINUTES = 15; // 账户锁定时间（分钟）(Account lockout duration in minutes)

// 辅助函数：错误响应 (Helper function: Error response)
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'login_failed', message }, { status });
}

export async function POST(req: NextRequest) {
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (error) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  const { username, email, password } = requestBody;

  // 确保提供了用户名（或邮箱）和密码 (Ensure username (or email) and password are provided)
  if ((!username && !email) || !password) {
    return errorResponse('Username (or email) and password are required.', 400, 'invalid_request');
  }

  try {
    // 1. 基于用户名或邮箱获取用户 (Fetch user by username or email)
    // 使用 findFirst 是因为 username 和 email 都应该是唯一的 (Using findFirst as username and email should be unique)
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username },
          { email: email ? email : undefined }, // 只有在提供了 email 时才使用 (Only use email if provided)
        ].filter(condition => condition.username !== undefined || condition.email !== undefined) as any[], // 过滤掉空的条件 (Filter out empty conditions)
      },
    });

    if (!user) {
      return errorResponse('Invalid credentials.', 401, 'invalid_credentials');
    }

    // 2. 检查账户是否被锁定 (Check if account is locked)
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesRemaining = Math.ceil((user.lockedUntil.getTime() - new Date().getTime()) / 60000);
      return errorResponse(
        `Account locked due to too many failed login attempts. Try again in ${minutesRemaining} minutes.`,
        403, // 403 Forbidden as action is temporarily prohibited
        'account_locked'
      );
    }

    // 3. 检查账户是否激活 (Check if account is active)
    if (!user.isActive) {
      return errorResponse('Account is not active. Please contact support.', 403, 'account_inactive');
    }

    // 4. 验证密码 (Verify password)
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      const newFailedAttempts = (user.failedLoginAttempts || 0) + 1;
      let updateData: Prisma.UserUpdateInput = { failedLoginAttempts: newFailedAttempts }; // Prisma.UserUpdateInput for type safety

      if (newFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        updateData.lockedUntil = addMinutes(new Date(), LOCKOUT_DURATION_MINUTES);
        // updateData.failedLoginAttempts = 0; // 选择在锁定后是否重置尝试次数，通常会重置 (Choose whether to reset attempts after lock, usually reset)
                                            // 或者在成功登录后重置 (Or reset on successful login)
                                            // 这里我们选择在成功登录后重置，锁定后不清零，以便观察
                                            // (Here we choose to reset on successful login, not clearing after lock for observation)
        await prisma.user.update({ where: { id: user.id }, data: updateData });
        return errorResponse(
          `Invalid credentials. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes due to too many failed attempts.`,
          401, // 401 for the attempt that caused the lock
          'account_locked_on_fail'
        );
      } else {
        await prisma.user.update({ where: { id: user.id }, data: updateData });
      }
      return errorResponse('Invalid credentials.', 401, 'invalid_credentials');
    }

    // 5. 登录成功 (Login successful)
    // 重置失败尝试并更新最后登录时间 (Reset failed attempts and update last login time)
    const successfulLoginUpdateData: Prisma.UserUpdateInput = {
      failedLoginAttempts: 0,
      lockedUntil: null, // 清除锁定 (Clear lockout)
      lastLoginAt: new Date(),
    };
    const updatedUser = await prisma.user.update({ // 获取更新后的用户信息 (Get updated user info)
      where: { id: user.id },
      data: successfulLoginUpdateData,
    });

    // 6. 生成JWT令牌 (Generate JWT tokens)
    // 这些是用于API v2自身认证的会话令牌，应区别于OAuth令牌
    // (These are session tokens for API v2's own auth, distinct from OAuth tokens)

    // 访问令牌 (Access Token - short-lived)
    const accessTokenPayload = {
      userId: updatedUser.id,
      username: updatedUser.username,
      // aud: 'urn:api:v2:session', // 建议使用audience区分令牌类型 (Recommended to use audience to differentiate token types)
      // roles: updatedUser.roles.map(role => role.name) // 假设角色信息已加载或可获取 (Assuming roles are loaded or fetchable)
    };
    // 假设JWTUtils有专门为此类令牌设计的方法 (Assuming JWTUtils has methods designed for such tokens)
    // 这些方法可能使用不同的签名密钥或有不同的声明 (e.g., 'aud')
    const accessToken = await JWTUtils.createV2AuthAccessToken(accessTokenPayload);
    const accessTokenExpiresIn = 3600; // 1小时 (1 hour)

    // 刷新令牌 (Refresh Token - long-lived)
    const refreshTokenPayload = {
      userId: updatedUser.id,
      // jti: crypto.randomBytes(16).toString('hex'), // 可选：为刷新令牌添加 JTI (Optional: add JTI for refresh token)
    };
    const refreshToken = await JWTUtils.createV2AuthRefreshToken(refreshTokenPayload);

    // 7. 构建响应 (Construct response)
    const userResponse = {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      displayName: updatedUser.displayName,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      avatar: updatedUser.avatar,
      mustChangePassword: updatedUser.mustChangePassword, // 包含此标志 (Include this flag)
      lastLoginAt: updatedUser.lastLoginAt,
    };

    return NextResponse.json({
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTokenExpiresIn,
      user: userResponse,
    });

  } catch (error: any) {
    console.error('Login endpoint error:', error);
    // 避免在生产中泄露敏感错误信息 (Avoid leaking sensitive error info in production)
    return errorResponse('An unexpected error occurred during login.', 500, 'server_error');
  }
}

// 确保 Prisma 客户端类型导入正确 (Ensure Prisma client types are imported correctly)
// For Prisma.UserUpdateInput
import { Prisma } from '@prisma/client';

// 声明 JWTUtils 中期望的方法 (Declare expected methods in JWTUtils)
// 实际实现应在 lib/auth/oauth2.ts 中
// (Actual implementation should be in lib/auth/oauth2.ts)
declare module '@/lib/auth/oauth2' {
  export class JWTUtils {
    static async createV2AuthAccessToken(payload: { userId: string; username: string; aud?: string; roles?: string[] }): Promise<string>;
    static async createV2AuthRefreshToken(payload: { userId: string; jti?: string }): Promise<string>;
    // ... other existing JWTUtils methods
  }
}
