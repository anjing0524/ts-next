// 文件路径: app/api/v2/auth/login/route.ts
// 描述: 用户名密码登录端点，用于OAuth2.1授权码流程的第一步
// 主要职责:
// 1. 验证用户名密码凭据
// 3. 重定向到授权端点继续OAuth流程

import { prisma } from '@repo/database';
import {
  errorResponse,
  OAuth2Error,
  OAuth2ErrorCode,
  successResponse,
  withErrorHandling,
} from '@repo/lib/node';
import bcrypt from 'bcrypt';
import { NextRequest, NextResponse } from 'next/server';
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

// 主处理函数
async function loginHandler(req: NextRequest): Promise<NextResponse> {
  if (req.method !== 'POST') {
    throw new OAuth2Error('只支持POST方法', OAuth2ErrorCode.InvalidRequest, 405);
  }

  const body = await req.json();
  const validationResult = loginRequestSchema.safeParse(body);

  if (!validationResult.success) {
    const error = validationResult.error.errors[0];
    return errorResponse({
      message: `${error}`,
      statusCode: 400,
      details: { code: OAuth2ErrorCode.InvalidRequest },
    });
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
    return errorResponse({
      message: '客户端ID无效或已禁用',
      statusCode: 400,
      details: { code: OAuth2ErrorCode.InvalidClient },
    });
  }

  // 验证重定向URI
  let allowedRedirectUris: string[] = [];
  try {
    allowedRedirectUris = JSON.parse(client.redirectUris || '[]');
  } catch (error) {
    console.error('解析重定向URI失败:', error);
  }

  if (!allowedRedirectUris.includes(redirect_uri)) {
    return errorResponse({
      message: '重定向URI无效',
      statusCode: 400,
      details: { code: OAuth2ErrorCode.InvalidRequest },
    });
  }

  // 查找用户
  const user = await prisma.user.findUnique({
    where: { username, isActive: true },
  });

  if (!user) {
    // 记录登录失败
    await logLoginAttempt(username, null, false, 'USER_NOT_FOUND', req);

    return errorResponse({
      message: '用户名或密码错误',
      statusCode: 401,
      details: { code: OAuth2ErrorCode.InvalidClient },
    });
  }

  // 检查账户锁定
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await logLoginAttempt(username, user.id, false, 'ACCOUNT_LOCKED', req);

    return errorResponse({
      message: '账户已被锁定，请稍后再试',
      statusCode: 423,
      details: { code: 'account_locked' },
    });
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

    return errorResponse({
      message: '用户名或密码错误',
      statusCode: 401,
      details: { code: OAuth2ErrorCode.InvalidClient },
    });
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

  // 返回无状态响应，不设置cookie
  return successResponse(
    {
      redirect_url: authorizeUrl.toString(),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
    },
    200,
    '登录成功'
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
