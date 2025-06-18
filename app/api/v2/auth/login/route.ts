// 文件路径: app/api/v2/auth/login/route.ts
// File path: app/api/v2/auth/login/route.ts
// 描述: 用户登录认证端点
// Description: User login authentication endpoint

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcrypt'; // 用于密码比较 (For password comparison)
import { addMinutes } from 'date-fns'; // 用于时间操作 (For time manipulation)
import { Prisma } from '@prisma/client'; // Prisma 类型，例如 Prisma.UserUpdateInput (Prisma types, e.g., Prisma.UserUpdateInput)

import { ApiResponse } from '@/lib/types/api'; // 标准API响应类型 (Standard API response type)
import { AuthenticationError, ValidationError, BaseError } from '@/lib/errors'; // 自定义错误类 (Custom error classes)
import { withErrorHandling } from '@/lib/utils/error-handler'; // 错误处理高阶函数 (Error handling HOF)

// 最大登录失败次数
// Max failed login attempts
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
// 账户锁定时间（分钟）
// Account lockout duration in minutes
const LOCKOUT_DURATION_MINUTES = 15;

// 定义成功响应中用户信息的类型 (Define type for user information in successful response)
interface UserLoginResponse {
  id: string;
  username: string | null;
  email: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
}

/**
 * @swagger
 * /api/v2/auth/login:
 *   post:
 *     summary: 用户登录 (User Login)
 *     description: 使用用户名/邮箱和密码进行用户认证。成功登录后返回用户信息。
 *                  (Authenticates a user with username/email and password. Returns user information upon successful login.)
 *     tags: [认证 (Authentication)]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               username:
 *                 type: string
 *                 description: 用户名 (Username)
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 邮箱地址 (Email address)
 *               password:
 *                 type: string
 *                 format: password
 *                 description: 密码 (Password)
 *             example:
 *               username: "testuser"
 *               password: "password123"
 *     responses:
 *       '200':
 *         description: 登录成功，返回用户信息。 (Login successful, returns user information.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseUserLogin'
 *       '400':
 *         description: 请求无效（例如，缺少参数，JSON格式错误）。 (Invalid request (e.g., missing parameters, malformed JSON).)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError'
 *       '401':
 *         description: 认证失败（例如，凭证无效，账户因多次尝试失败而被锁定）。 (Authentication failed (e.g., invalid credentials, account locked due to multiple failed attempts).)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError'
 *       '403':
 *         description: 禁止访问（例如，账户未激活或已锁定）。 (Forbidden (e.g., account inactive or locked).)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError'
 *       '500':
 *         description: 服务器内部错误。 (Internal server error.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseError'
 * components:
 *   schemas:
 *     UserLoginResponseData:
 *       type: object
 *       properties:
 *         user:
 *           type: object
 *           properties:
 *             id: { type: string }
 *             username: { type: string, nullable: true }
 *             email: { type: string, format: email, nullable: true }
 *             displayName: { type: string, nullable: true }
 *             firstName: { type: string, nullable: true }
 *             lastName: { type: string, nullable: true }
 *             avatar: { type: string, nullable: true }
 *             mustChangePassword: { type: boolean }
 *             lastLoginAt: { type: string, format: date-time, nullable: true }
 *     ApiResponseUserLogin:
 *       type: object
 *       properties:
 *         success: { type: boolean, example: true }
 *         data: { $ref: '#/components/schemas/UserLoginResponseData' }
 *         message: { type: string, example: "Login successful. User authenticated." }
 *     ApiResponseError:
 *       type: object
 *       properties:
 *         success: { type: boolean, example: false }
 *         error: { $ref: '#/components/schemas/ApiError' }
 *     ApiError:
 *       type: object
 *       properties:
 *         code: { type: string }
 *         message: { type: string }
 *         details: { type: object, additionalProperties: true, nullable: true }
 */
// POST 处理函数，用于用户登录，现在由 withErrorHandling 包装
// POST handler function for user login, now wrapped by withErrorHandling
async function loginHandler(req: NextRequest): Promise<NextResponse> {
  let requestBody;
  try {
    // 解析请求体为 JSON
    // Parse request body as JSON
    requestBody = await req.json();
  } catch (error) {
    // 若解析失败，抛出 ValidationError
    // If parsing fails, throw ValidationError
    throw new ValidationError('Invalid JSON request body.', { context: (error as Error).message }, 'INVALID_JSON_BODY');
  }

  const { username, email, password } = requestBody;

  // 确保提供了用户名（或邮箱）和密码
  // Ensure username (or email) and password are provided
  if ((!username && !email) || !password) {
    throw new ValidationError('Username (or email) and password are required.', undefined, 'MISSING_CREDENTIALS');
  }

  // 1. 基于用户名或邮箱获取用户
  // 1. Fetch user by username or email
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: username },
        { email: email ? email.toLowerCase() : undefined }, // 邮箱不区分大小写 (Email is case-insensitive)
      ].filter(condition => condition.username !== undefined || condition.email !== undefined) as any[],
    },
  });

  // 如果未找到用户，抛出 AuthenticationError
  // If user not found, throw AuthenticationError
  if (!user) {
    // 出于安全考虑，不明确指出是用户名还是密码错误
    // For security reasons, do not specify whether username or password was incorrect
    throw new AuthenticationError('Invalid credentials.', undefined, 'INVALID_CREDENTIALS');
  }

  // 2. 检查账户是否被锁定
  // 2. Check if account is locked
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesRemaining = Math.ceil((user.lockedUntil.getTime() - new Date().getTime()) / 60000);
    // 账户被锁定，抛出 AuthenticationError 并提供特定错误码
    // Account locked, throw AuthenticationError with specific error code
    throw new AuthenticationError(
      `Account locked due to too many failed login attempts. Try again in ${minutesRemaining} minutes.`,
      { lockedUntil: user.lockedUntil.toISOString(), minutesRemaining },
      'ACCOUNT_LOCKED'
    );
  }

  // 3. 检查账户是否激活
  // 3. Check if account is active
  if (!user.isActive) {
    // 账户未激活，抛出 AuthenticationError 并提供特定错误码
    // Account inactive, throw AuthenticationError with specific error code
    throw new AuthenticationError('Account is not active. Please contact support.', undefined, 'ACCOUNT_INACTIVE');
  }

  // 4. 验证密码
  // 4. Verify password
  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    // 如果密码不匹配，增加失败尝试次数
    // If password does not match, increment failed login attempts
    const newFailedAttempts = (user.failedLoginAttempts || 0) + 1;
    let updateData: Prisma.UserUpdateInput = { failedLoginAttempts: newFailedAttempts };

    if (newFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      // 如果失败次数达到最大限制，则锁定账户
      // If failed attempts reach the maximum limit, lock the account
      updateData.lockedUntil = addMinutes(new Date(), LOCKOUT_DURATION_MINUTES);
      await prisma.user.update({ where: { id: user.id }, data: updateData });
      // 抛出 AuthenticationError，指示账户因多次失败尝试而被锁定
      // Throw AuthenticationError indicating account locked due to multiple failed attempts
      throw new AuthenticationError(
        `Invalid credentials. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes due to too many failed attempts.`,
        { attempts: newFailedAttempts },
        'ACCOUNT_LOCKED_ON_FAIL'
      );
    } else {
      // 如果未达到锁定阈值，仅更新失败尝试次数
      // If lockout threshold not reached, only update failed attempts
      await prisma.user.update({ where: { id: user.id }, data: updateData });
    }
    // 密码错误，抛出 AuthenticationError
    // Incorrect password, throw AuthenticationError
    throw new AuthenticationError('Invalid credentials.', undefined, 'INVALID_CREDENTIALS');
  }

  // 5. 登录成功
  // 5. Login successful
  // 重置失败尝试次数，清除锁定状态，并更新最后登录时间
  // Reset failed attempts, clear lockout status, and update last login time
  const successfulLoginUpdateData: Prisma.UserUpdateInput = {
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: new Date(),
  };
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: successfulLoginUpdateData,
  });

  // 6. 构建响应 (不再直接签发令牌)
  // 6. Construct response (no direct token issuance anymore)
  const userResponse: UserLoginResponse = {
    id: updatedUser.id,
    username: updatedUser.username,
    email: updatedUser.email,
    displayName: updatedUser.displayName,
    firstName: updatedUser.firstName,
    lastName: updatedUser.lastName,
    avatar: updatedUser.avatar,
    mustChangePassword: updatedUser.mustChangePassword,
    lastLoginAt: updatedUser.lastLoginAt,
  };

  // 返回遵循 ApiResponse 结构的成功响应
  // Return a successful response following the ApiResponse structure
  return NextResponse.json<ApiResponse<{ user: UserLoginResponse }>>({
    success: true,
    message: 'Login successful. User authenticated.',
    data: { user: userResponse },
  }, { status: 200 });
}

// 使用 withErrorHandling 包装处理函数，以统一处理可能抛出的错误
// Wrap the handler function with withErrorHandling for unified error processing
export const POST = withErrorHandling(loginHandler);
