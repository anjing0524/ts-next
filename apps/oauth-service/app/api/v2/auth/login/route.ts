// 文件路径: app/api/v2/auth/login/route.ts
// 描述: 用户名密码登录端点，用于OAuth2.1授权码流程的第一步
// 主要职责:
// 1. 验证用户名密码凭据
// 2. 启动用户会话
// 3. 重定向到授权端点继续OAuth流程

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '@repo/database';
import { OAuth2Error, OAuth2ErrorCode, withErrorHandling } from '@repo/lib/node';
import { z } from 'zod';

// 登录请求验证模式
const loginRequestSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
  client_id: z.string().min(1, '客户端ID不能为空'),
  redirect_uri: z.string().url('重定向URI格式无效'),
  state: z.string().optional(),
  scope: z.string().optional(),
  response_type: z.string().default('code'),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
  nonce: z.string().optional(),
});

// 登录响应类型
interface LoginSuccessResponse {
  success: true;
  redirect_url: string;
  user: {
    id: string;
    username: string;
    displayName?: string;
  };
}

interface LoginErrorResponse {
  success: false;
  error: string;
  error_description: string;
}

// 主处理函数
async function loginHandler(req: NextRequest): Promise<NextResponse> {
  if (req.method !== 'POST') {
    throw new OAuth2Error('只支持POST方法', OAuth2ErrorCode.InvalidRequest, 405);
  }

  const body = await req.json();
  const validationResult = loginRequestSchema.safeParse(body);

  if (!validationResult.success) {
    const error = validationResult.error.errors[0];
    return NextResponse.json(
      {
        success: false,
        error: OAuth2ErrorCode.InvalidRequest,
        error_description: `${error}`,
      } as LoginErrorResponse,
      { status: 400 }
    );
  }

  const {
    username,
    password,
    client_id,
    redirect_uri,
    state,
    scope,
    response_type,
    code_challenge,
    code_challenge_method,
    nonce,
  } = validationResult.data;

  // 获取客户端信息
  const client = await prisma.oAuthClient.findUnique({
    where: { clientId: client_id, isActive: true },
  });

  if (!client) {
    return NextResponse.json(
      {
        success: false,
        error: OAuth2ErrorCode.InvalidClient,
        error_description: '客户端ID无效或已禁用',
      } as LoginErrorResponse,
      { status: 400 }
    );
  }

  // 验证重定向URI
  let allowedRedirectUris: string[] = [];
  try {
    allowedRedirectUris = JSON.parse(client.redirectUris || '[]');
  } catch (error) {
    console.error('解析重定向URI失败:', error);
  }

  if (!allowedRedirectUris.includes(redirect_uri)) {
    return NextResponse.json(
      {
        success: false,
        error: OAuth2ErrorCode.InvalidRequest,
        error_description: '重定向URI无效',
      } as LoginErrorResponse,
      { status: 400 }
    );
  }

  // 查找用户
  const user = await prisma.user.findUnique({
    where: { username, isActive: true },
  });

  if (!user) {
    // 记录登录失败
    await logLoginAttempt(username, null, false, 'USER_NOT_FOUND', req);

    return NextResponse.json(
      {
        success: false,
        error: OAuth2ErrorCode.InvalidClient,
        error_description: '用户名或密码错误',
      } as LoginErrorResponse,
      { status: 401 }
    );
  }

  // 检查账户锁定
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await logLoginAttempt(username, user.id, false, 'ACCOUNT_LOCKED', req);

    return NextResponse.json(
      {
        success: false,
        error: 'account_locked',
        error_description: '账户已被锁定，请稍后再试',
      } as LoginErrorResponse,
      { status: 423 }
    );
  }

  // 验证密码
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    // 更新失败次数和锁定状态
    const failedAttempts = user.failedLoginAttempts + 1;
    const maxAttempts = 5; // 最大尝试次数
    let lockedUntil: Date | null = null;

    if (failedAttempts >= maxAttempts) {
      lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 锁定15分钟
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: failedAttempts,
        lockedUntil,
      },
    });

    await logLoginAttempt(username, user.id, false, 'INVALID_CREDENTIALS', req);

    return NextResponse.json(
      {
        success: false,
        error: OAuth2ErrorCode.InvalidClient,
        error_description: '用户名或密码错误',
      } as LoginErrorResponse,
      { status: 401 }
    );
  }

  // 重置失败次数和锁定状态
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });

  // 记录成功登录
  await logLoginAttempt(username, user.id, true, 'SUCCESS', req);

  // 创建用户会话（通过JWT）
  const sessionToken = await createUserSession(user, client_id);

  // 构建授权端点URL
  const authorizeUrl = new URL('/api/v2/oauth/authorize', req.nextUrl.origin);
  authorizeUrl.searchParams.set('client_id', client_id);
  authorizeUrl.searchParams.set('redirect_uri', redirect_uri);
  authorizeUrl.searchParams.set('response_type', response_type);

  if (scope) authorizeUrl.searchParams.set('scope', scope);
  if (state) authorizeUrl.searchParams.set('state', state);
  if (code_challenge) authorizeUrl.searchParams.set('code_challenge', code_challenge);
  if (code_challenge_method)
    authorizeUrl.searchParams.set('code_challenge_method', code_challenge_method);
  if (nonce) authorizeUrl.searchParams.set('nonce', nonce);

  // 设置会话cookie
  const response = NextResponse.json({
    success: true,
    redirect_url: authorizeUrl.toString(),
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
    },
  } as LoginSuccessResponse);

  response.cookies.set('auth_center_session_token', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60, // 1小时
    path: '/',
  });

  return response;
}

// 创建用户会话
async function createUserSession(user: any, clientId: string): Promise<string> {
  const { JWTUtils } = await import('@repo/lib/node');

  return await JWTUtils.generateToken(
    {
      sub: user.id,
      aud: process.env.AUTH_CENTER_UI_AUDIENCE || 'urn:auth-center:ui',
      iss: process.env.JWT_ISSUER || 'oauth-service',
      client_id: clientId,
      username: user.username,
      session_type: 'auth_center_ui',
    },
    {
      expiresIn: '1h',
    }
  );
}

// 记录登录尝试
async function logLoginAttempt(
  username: string,
  userId: string | null,
  successful: boolean,
  failureReason: string,
  req: NextRequest
) {
  try {
    await prisma.loginAttempt.create({
      data: {
        username,
        userId,
        successful,
        failureReason,
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
      },
    });
  } catch (error) {
    console.error('记录登录尝试失败:', error);
  }
}

export const POST = withErrorHandling(loginHandler);
