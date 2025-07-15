import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { successResponse, errorResponse } from '@repo/lib/node';
import { prisma } from '@repo/database';
import { z } from 'zod';
import { getUserDetails, excludePassword } from '@repo/lib/node';

const updateUserSchema = z.object({
  displayName: z.string().max(100).optional(),
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  organization: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
  avatar: z.string().url().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
): Promise<NextResponse> {
  const { userId } = await params;
  try {
    const userDetails = await getUserDetails(userId);
    if (!userDetails) {
      return errorResponse({ message: '用户未找到。', statusCode: 404 });
    }
    return successResponse(userDetails);
  } catch (error) {
    console.error(`获取用户 ${userId} 失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
): Promise<NextResponse> {
  const { userId } = await params;
  try {
    const body = await req.json();
    const validation = updateUserSchema.safeParse(body);

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
    console.error(`更新用户 ${userId} 失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
): Promise<NextResponse> {
  const { userId } = await params;
  try {
    const headersList = await headers();
    const performingUserId = headersList.get('X-User-Id');
    if (userId === performingUserId) {
      return errorResponse({ message: '不能删除自己的账��。', statusCode: 400 });
    }

    await prisma.user.delete({
      where: { id: userId },
    });
    return successResponse(null, 204);
  } catch (error) {
    console.error(`删除用户 ${userId} 失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}