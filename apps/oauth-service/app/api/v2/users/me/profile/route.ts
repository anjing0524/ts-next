import { prisma } from '@repo/database';
import { successResponse, errorResponse } from '@repo/lib/node';
import { AuthContext } from '@/lib/auth/bearer-auth';
import { NextRequest } from 'next/server';
import { z } from 'zod';

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
      return errorResponse({ message: '参数校验失败', statusCode: 400 });
    }

    const userId = context.authContext.user_id;
    if (!userId) {
      return errorResponse({ message: '未找到用户上下文', statusCode: 401 });
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

    return successResponse(updated);
  } catch (e) {
    console.error('Update profile error', e);
    return errorResponse({ message: '服务器内部错误', statusCode: 500 });
  }
}

export async function PUT(request: NextRequest, context: { params: any }) {
  // 调用通用认证方法
  const { authenticateBearer } = await import('@/lib/auth/bearer-auth');
  const authResult = await authenticateBearer(request, {
    requireUserContext: true,
  });

  if (!authResult.success || !authResult.context) {
    return authResult.response ?? errorResponse({ message: '未授权', statusCode: 401 });
  }

  return handler(request, { authContext: authResult.context, params: context.params });
}
