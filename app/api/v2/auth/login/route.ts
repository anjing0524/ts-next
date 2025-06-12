// 文件路径: app/api/v2/auth/login/route.ts
// 描述: 用户登录API端点 (v2)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs'; // 使用 bcryptjs 进行密码比较
import crypto from 'crypto'; // 用于生成 refresh token hash

import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { JWTUtils, ScopeUtils, AuthorizationUtils } from '@/lib/auth/oauth2'; // JWT工具用于生成令牌
import { addDays, addHours } from 'date-fns'; // 用于设置令牌过期时间

// 确保 JWTUtils.getTokenHash 存在或在此处定义一个临时的
const getTokenHash = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};


// --- 请求 Schema ---
const LoginRequestSchema = z.object({
  username: z.string().min(1, '用户名 (username) 不能为空'),
  password: z.string().min(1, '密码 (password) 不能为空'),
  // clientId: z.string().optional().describe('可选的客户端ID，用于某些特定流程'),
  // scope: z.string().optional().describe('可选的作用域请求'),
});

/**
 * @swagger
 * /api/v2/auth/login:
 *   post:
 *     summary: 用户登录 (User Login)
 *     description: 使用用户名和密码进行身份验证，成功后返回访问令牌和刷新令牌。
 *     tags:
 *       - Auth V2
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: 用户的用户名或电子邮件地址。
 *                 example: 'johndoe'
 *               password:
 *                 type: string
 *                 format: password
 *                 description: 用户的密码。
 *                 example: 'SecureP@ssw0rd!'
 *     produces:
 *       - application/json
 *     responses:
 *       '200':
 *         description: 登录成功。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                   description: JWT访问令牌。
 *                 refresh_token:
 *                   type: string
 *                   description: JWT刷新令牌。
 *                 token_type:
 *                   type: string
 *                   example: "Bearer"
 *                   description: 令牌类型。
 *                 expires_in:
 *                   type: integer
 *                   description: 访问令牌的有效期 (秒)。
 *                   example: 3600
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *                     # ... 其他需要返回的用户信息
 *       '400':
 *         description: 无效的请求 (例如，缺少用户名或密码)。
 *       '401':
 *         description: 认证失败 (例如，用户名或密码错误，用户未激活或被锁定)。
 *       '500':
 *         description: 服务器内部错误。
 */
async function loginHandler(request: NextRequest) {
  const overallRequestId = (request as any).requestId; // from withErrorHandler
  const body = await request.json();

  const validationResult = LoginRequestSchema.safeParse(body);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.flatten().fieldErrors;
    return NextResponse.json(
      errorResponse(400, `无效的请求体: ${JSON.stringify(errorMessages)}`, 'VALIDATION_ERROR', overallRequestId),
      { status: 400 }
    );
  }

  const { username, password } = validationResult.data;

  // 1. 查找用户 (可以通过用户名或邮箱登录)
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: username },
        { email: username } // 允许使用邮箱登录
      ]
    }
  });

  if (!user) {
    await AuthorizationUtils.logAuditEvent({ // 审计登录失败
        action: 'login_failed_user_not_found',
        actorId: username, // 尝试登录的用户名
        ipAddress: request.ip,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: 'User not found',
    });
    return NextResponse.json(
      errorResponse(401, '认证失败: 用户名或密码错误 (Authentication failed: Invalid username or password)', 'INVALID_CREDENTIALS', overallRequestId),
      { status: 401 }
    );
  }

  // 2. 检查用户状态
  if (!user.isActive) {
     await AuthorizationUtils.logAuditEvent({
        userId: user.id,
        action: 'login_failed_user_inactive',
        ipAddress: request.ip,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: 'User account is inactive',
    });
    return NextResponse.json(
      errorResponse(401, '认证失败: 用户账户未激活 (Authentication failed: User account is inactive)', 'ACCOUNT_INACTIVE', overallRequestId),
      { status: 401 }
    );
  }
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    await AuthorizationUtils.logAuditEvent({
        userId: user.id,
        action: 'login_failed_user_locked',
        ipAddress: request.ip,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: `User account is locked until ${user.lockedUntil}`,
    });
    return NextResponse.json(
      errorResponse(401, `认证失败: 用户账户已锁定至 ${user.lockedUntil} (Authentication failed: Account locked)`, 'ACCOUNT_LOCKED', overallRequestId),
      { status: 401 }
    );
  }

  // 3. 验证密码
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    // 更新登录失败尝试次数，并可能锁定账户
    const newAttempts = (user.failedLoginAttempts || 0) + 1;
    let lockUntilDate: Date | null = null;
    const MAX_LOGIN_ATTEMPTS = 5; // 示例：5次失败后锁定
    const LOCKOUT_DURATION_MINUTES = 15; // 示例：锁定15分钟

    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      lockUntilDate = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: newAttempts, lockedUntil: lockUntilDate },
      });
       await AuthorizationUtils.logAuditEvent({
          userId: user.id,
          action: 'login_failed_account_locked',
          ipAddress: request.ip,
          userAgent: request.headers.get('user-agent') || undefined,
          success: false,
          errorMessage: `Invalid password, account locked for ${LOCKOUT_DURATION_MINUTES} minutes.`,
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: newAttempts },
      });
      await AuthorizationUtils.logAuditEvent({
          userId: user.id,
          action: 'login_failed_invalid_password',
          ipAddress: request.ip,
          userAgent: request.headers.get('user-agent') || undefined,
          success: false,
          errorMessage: 'Invalid password.',
          metadata: { attempts: newAttempts }
      });
    }
    const errorMsg = lockUntilDate ? `认证失败: 账户已锁定 (Authentication failed: Account locked due to too many failed attempts)` : '认证失败: 用户名或密码错误 (Authentication failed: Invalid username or password)';
    return NextResponse.json(errorResponse(401, errorMsg, 'INVALID_CREDENTIALS', overallRequestId), { status: 401 });
  }

  // 4. 登录成功，重置失败尝试次数，更新最后登录时间
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  // 5. 生成令牌 (需要一个 client_id 来创建令牌，即使是代表用户自身)
  //    对于纯用户登录，可能需要一个预定义的 "user_login" 客户端或类似机制。
  //    或者，如果登录API总是与某个特定应用（客户端）相关联，则应传递该客户端ID。
  //    这里假设一个通用的 client_id 用于用户直接登录。
  const defaultClientIdForUserLogin = process.env.DEFAULT_USER_LOGIN_CLIENT_ID || 'user-self-service';
  // 查找或确认此客户端ID有效性是推荐的步骤。
  // const client = await prisma.oAuthClient.findUnique({ where: { clientId: defaultClientIdForUserLogin }});
  // if (!client) throw new ApiError(500, '登录客户端配置错误');

  const userPermissions = await AuthorizationUtils.getUserPermissions(user.id);
  const defaultScopes = "openid profile email user:profile:read"; // 登录成功后授予的默认范围

  const accessToken = await JWTUtils.createAccessToken({
    user_id: user.id,
    client_id: defaultClientIdForUserLogin, // 代表用户自身或特定登录应用
    scope: defaultScopes, // 登录后用户具有的基本范围
    permissions: userPermissions,
    // username: user.username // 可选
  });
  const refreshToken = await JWTUtils.createRefreshToken({
    user_id: user.id,
    client_id: defaultClientIdForUserLogin,
    scope: defaultScopes,
  });

  // 存储 Refresh Token 到数据库
  await prisma.refreshToken.create({
    data: {
        token: refreshToken, // 实际项目中可能只存哈希
        tokenHash: getTokenHash(refreshToken),
        userId: user.id,
        clientId: defaultClientIdForUserLogin, // Prisma schema 需要 clientId
        scope: defaultScopes,
        expiresAt: addDays(new Date(), 30), // 与 JWTUtils 中 refreshToken 的 exp 一致
    }
  });
  // 存储 Access Token 到数据库 (可选，但有助于撤销和内省)
   await prisma.accessToken.create({
    data: {
        token: accessToken,
        tokenHash: getTokenHash(accessToken),
        userId: user.id,
        clientId: defaultClientIdForUserLogin,
        scope: defaultScopes,
        expiresAt: addHours(new Date(), 1), // 与 JWTUtils 中 accessToken 的 exp 一致
    }
  });


  await AuthorizationUtils.logAuditEvent({
      userId: user.id,
      clientId: defaultClientIdForUserLogin,
      action: 'user_login_success',
      ipAddress: request.ip,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true,
  });

  // 6. 返回响应
  return NextResponse.json(
    successResponse(
      {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: 3600, // 1 hour in seconds
        user: { // 返回部分用户信息
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          mustChangePassword: user.mustChangePassword,
        },
      },
      200,
      '登录成功 (Login successful)',
      overallRequestId
    ),
    { status: 200 }
  );
}

export const POST = withErrorHandler(loginHandler);

EOF
