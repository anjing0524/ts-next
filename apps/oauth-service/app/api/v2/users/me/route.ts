import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { successResponse, errorResponse } from '@repo/lib';
import { prisma } from '@repo/database';
import { z } from 'zod';
import { getUserDetails } from '@repo/lib/services';

import { excludePassword } from '@repo/lib/utils';

export async function GET(): Promise<NextResponse> {
  try {
    const headersList = await headers();
    const userId = headersList.get('X-User-Id');
    if (!userId) {
      return errorResponse({ message: '无法从请求头中识别用户。', statusCode: 401 });
    }

    const userDetails = await getUserDetails(userId);
    if (!userDetails) {
      return errorResponse({ message: '用户未找到。', statusCode: 404 });
    }

    return successResponse(userDetails);
  } catch (error) {
    console.error('获取当前用户信息失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

const updateUserProfileSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
});

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const headersList = await headers();
    const userId = headersList.get('X-User-Id');
    if (!userId) {
      return errorResponse({ message: '无法从请求头中识别用户。', statusCode: 401 });
    }

    const body = await req.json();
    const validation = updateUserProfileSchema.safeParse(body);

    if (!validation.success) {
      return errorResponse({
        message: '无效的输入。',
        statusCode: 400,
        details: validation.error.flatten(),
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: validation.data,
    });

    return successResponse(excludePassword(updatedUser));
  } catch (error) {
    console.error('更新用户信息失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}
