import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { AuthContext } from '@repo/lib/middleware';
import { z } from 'zod';
import { successResponse, errorResponse } from '@repo/lib/apiResponse';

// 定义请求体校验
const profileSchema = z.object({
  displayName: z.string().max(100).optional(),
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  avatar: z.string().url().optional(),
  email: z.string().email().optional(),
});

/**
 * PUT /api/v2/users/me/profile
 * 更新当前登录用户资料
 */
async function handler(request: NextRequest, context: { authContext: AuthContext; params: any }) {
  try {
    const json = await request.json();
    const parsed = profileSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(errorResponse('参数校验失败', 400), { status: 400 });
    }

    const userId = context.authContext.user_id;
    if (!userId) {
      return NextResponse.json(errorResponse('未找到用户上下文', 401), { status: 401 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: parsed.data,
      select: {
        id: true,
        username: true,
        displayName: true,
        firstName: true,
        lastName: true,
        avatar: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(successResponse(updated), { status: 200 });
  } catch (e) {
    console.error('Update profile error', e);
    return NextResponse.json(errorResponse('服务器内部错误', 500), { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: { params: any }) {
  // 调用通用认证方法
  const { authenticateBearer } = await import('@repo/lib/middleware');
  const authResult = await authenticateBearer(request, {
    requireUserContext: true,
  });

  if (!authResult.success || !authResult.context) {
    return authResult.response ?? NextResponse.json(errorResponse('未授权', 401), { status: 401 });
  }

  return handler(request, { authContext: authResult.context, params: context.params });
}
