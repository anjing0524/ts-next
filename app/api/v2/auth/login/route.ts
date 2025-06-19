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
import { AuthorizationUtils } from '@/lib/auth/oauth2'; // For Audit Logging

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
  const ipAddress = req.ip || req.headers.get('x-forwarded-for');
  const userAgent = req.headers.get('user-agent');
  let attemptedLoginIdentifier: string | undefined = undefined; // For logging

  let requestBody;
  try {
    requestBody = await req.json();
    attemptedLoginIdentifier = requestBody.username || requestBody.email;
  } catch (error: any) {
    await AuthorizationUtils.logAuditEvent({
        action: 'USER_LOGIN_FAILURE_INVALID_JSON', status: 'FAILURE', ipAddress, userAgent,
        errorMessage: 'Invalid JSON request body for login.', actorType: 'ANONYMOUS', actorId: 'anonymous',
        details: JSON.stringify({ error: error.message }),
    });
    throw new ValidationError('Invalid JSON request body.', { context: error.message }, 'INVALID_JSON_BODY');
  }

  const { username, email, password } = requestBody;
  attemptedLoginIdentifier = username || email; // Update with actual parsed value

  if ((!username && !email) || !password) {
    await AuthorizationUtils.logAuditEvent({
        action: 'USER_LOGIN_FAILURE_MISSING_CREDENTIALS', status: 'FAILURE', ipAddress, userAgent,
        errorMessage: 'Username (or email) and password are required.', actorType: 'ANONYMOUS', actorId: 'anonymous',
        details: JSON.stringify({ usernameProvided: !!username, emailProvided: !!email, passwordProvided: !!password }),
    });
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

  if (!user) {
    await AuthorizationUtils.logAuditEvent({
        action: 'USER_LOGIN_FAILURE_USER_NOT_FOUND', status: 'FAILURE', ipAddress, userAgent,
        errorMessage: 'Invalid credentials (user not found).', actorType: 'ANONYMOUS', actorId: attemptedLoginIdentifier || 'unknown_identifier',
        details: JSON.stringify({ identifier: attemptedLoginIdentifier }),
    });
    throw new AuthenticationError('Invalid credentials.', undefined, 'INVALID_CREDENTIALS');
  }

  // For subsequent logs, we have user context
  const actorIdForLog = user.id;
  const actorTypeForLog = 'USER';

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesRemaining = Math.ceil((user.lockedUntil.getTime() - new Date().getTime()) / 60000);
    await AuthorizationUtils.logAuditEvent({
        userId: user.id, actorType: actorTypeForLog, actorId: actorIdForLog, action: 'USER_LOGIN_FAILURE_ACCOUNT_LOCKED', status: 'FAILURE',
        ipAddress, userAgent, errorMessage: `Account locked. Try again in ${minutesRemaining} minutes.`,
        resourceType: 'User', resourceId: user.id,
        details: JSON.stringify({ username: user.username, lockedUntil: user.lockedUntil.toISOString() }),
    });
    throw new AuthenticationError(
      `Account locked due to too many failed login attempts. Try again in ${minutesRemaining} minutes.`,
      { lockedUntil: user.lockedUntil.toISOString(), minutesRemaining },
      'ACCOUNT_LOCKED'
    );
  }

  if (!user.isActive) {
    await AuthorizationUtils.logAuditEvent({
        userId: user.id, actorType: actorTypeForLog, actorId: actorIdForLog, action: 'USER_LOGIN_FAILURE_ACCOUNT_INACTIVE', status: 'FAILURE',
        ipAddress, userAgent, errorMessage: 'Account is not active.', resourceType: 'User', resourceId: user.id,
        details: JSON.stringify({ username: user.username }),
    });
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
    let isLockedNow = false;

    if (newFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      updateData.lockedUntil = addMinutes(new Date(), LOCKOUT_DURATION_MINUTES);
      isLockedNow = true;
    }

    try {
        await prisma.user.update({ where: { id: user.id }, data: updateData });
    } catch (dbError: any) {
        await AuthorizationUtils.logAuditEvent({
            userId: user.id, actorType: actorTypeForLog, actorId: actorIdForLog, action: 'USER_LOGIN_FAILURE_DB_UPDATE_FAILED_ATTEMPT', status: 'FAILURE',
            ipAddress, userAgent, errorMessage: 'DB error updating failed login attempts.', resourceType: 'User', resourceId: user.id,
            details: JSON.stringify({ username: user.username, error: dbError.message, failedAttempts: newFailedAttempts }),
        });
        // Continue to throw auth error, but log DB issue
    }

    const failureAction = isLockedNow ? 'USER_LOGIN_FAILURE_ACCOUNT_LOCKED_NOW' : 'USER_LOGIN_FAILURE_INVALID_PASSWORD';
    const errorMessage = isLockedNow ? `Invalid credentials. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes due to too many failed attempts.`
                                     : 'Invalid credentials.';
    await AuthorizationUtils.logAuditEvent({
        userId: user.id, actorType: actorTypeForLog, actorId: actorIdForLog, action: failureAction, status: 'FAILURE',
        ipAddress, userAgent, errorMessage: errorMessage, resourceType: 'User', resourceId: user.id,
        details: JSON.stringify({ username: user.username, failedAttempts: newFailedAttempts, locked: isLockedNow }),
    });

    if (isLockedNow) {
        throw new AuthenticationError(errorMessage, { attempts: newFailedAttempts }, 'ACCOUNT_LOCKED_ON_FAIL');
    }
    throw new AuthenticationError(errorMessage, undefined, 'INVALID_CREDENTIALS');
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

  await AuthorizationUtils.logAuditEvent({
      userId: user.id, actorType: actorTypeForLog, actorId: actorIdForLog, action: 'USER_LOGIN_SUCCESS', status: 'SUCCESS',
      ipAddress, userAgent, resourceType: 'User', resourceId: user.id,
      details: JSON.stringify({ username: user.username, lastLoginAt: updatedUser.lastLoginAt }),
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
