import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@repo/database';
import { successResponse, errorResponse } from '@repo/lib/node';
import { Prisma } from '@prisma/client';

const scopeUpdateSchema = z.object({
  description: z.string().max(500).optional().nullable(),
  isPublic: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ scopeId: string }> }
): Promise<NextResponse> {
  const { scopeId } = await params;
  try {
    const scope = await prisma.scope.findUnique({
      where: { id: scopeId },
    });

    if (!scope) {
      return errorResponse({ message: `范围 ID "${scopeId}" 未找到`, statusCode: 404 });
    }
    return successResponse(scope);
  } catch (error) {
    console.error(`获取范围 ${scopeId} 失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ scopeId: string }> }
): Promise<NextResponse> {
  const { scopeId } = await params;
  try {
    const payload = await req.json();
    const validationResult = scopeUpdateSchema.safeParse(payload);

    if (!validationResult.success) {
      return errorResponse({
        message: '更新范围验证失败',
        statusCode: 400,
        details: validationResult.error.flatten(),
      });
    }

    const updatedScope = await prisma.scope.update({
      where: { id: scopeId },
      data: validationResult.data,
    });
    return successResponse(updatedScope);
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return errorResponse({ message: `范围 ID "${scopeId}" 未找到`, statusCode: 404 });
    }
    console.error(`更新范围 ${scopeId} 失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ scopeId: string }> }
): Promise<NextResponse> {
  const { scopeId } = await params;
  try {
    await prisma.scope.delete({
      where: { id: scopeId },
    });
    return successResponse(null, 204);
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return errorResponse({ message: `范围 ID "${scopeId}" 未找到`, statusCode: 404 });
    }
    console.error(`删除范围 ${scopeId} 失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}
