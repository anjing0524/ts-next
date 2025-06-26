// /api/v2/scopes/[scopeId]
// 描述: 管理特定OAuth权限范围 (Scope) - 获取详情、更新、删除。
// (Manages specific OAuth Scope - Get details, Update, Delete.)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@repo/database';
import { withAuth, type AuthContext } from '@repo/lib/middleware';
import { withErrorHandling } from '@repo/lib';
import { Prisma } from '@prisma/client';

interface RouteParams {
  scopeId: string;
}

const scopeUpdateSchema = z.object({
  description: z.string().max(500, "描述长度不超过500字符").optional().nullable(),
  isPublic: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/v2/scopes/{scopeId} - 获取特定权限范围的详细信息
 *需要 'scope:read' 权限。
 */
async function getScopeHandler(
  request: NextRequest,
  { params }: { authContext: AuthContext; params: RouteParams }
) {
  const { scopeId } = params;

  if (!z.string().cuid().safeParse(scopeId).success) {
      return NextResponse.json({ message: '无效的Scope ID格式 (Invalid Scope ID format)' }, { status: 400 });
  }

  try {
    const scope = await prisma.scope.findUnique({
      where: { id: scopeId },
    });

    if (!scope) {
      return NextResponse.json({ message: '权限范围未找到 (Scope not found)' }, { status: 404 });
    }
    return NextResponse.json(scope);
  } catch (error) {
    console.error(`获取Scope ${scopeId} 失败:`, error);
    return NextResponse.json({ message: '获取Scope详情失败 (Error fetching scope details)' }, { status: 500 });
  }
}

/**
 * PUT /api/v2/scopes/{scopeId} - 更新特定权限范围的信息
 * 需要 'scope:update' 权限。
 */
async function updateScopeHandler(
  request: NextRequest,
  { params }: { authContext: AuthContext; params: RouteParams }
) {
  const { scopeId } = params;

  if (!z.string().cuid().safeParse(scopeId).success) {
      return NextResponse.json({ message: '无效的Scope ID格式' }, { status: 400 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body', message: 'Failed to parse JSON body.' }, { status: 400 });
  }

  const validationResult = scopeUpdateSchema.safeParse(payload);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }

  const dataToUpdate = validationResult.data;

  if (Object.keys(dataToUpdate).length === 0) {
    return NextResponse.json({ message: "No fields provided for update." }, { status: 400 });
  }
  if ((dataToUpdate as any).name) {
    return NextResponse.json({ message: "Scope name cannot be changed." }, { status: 400 });
  }

  try {
    const updatedScope = await prisma.scope.update({
      where: { id: scopeId },
      data: dataToUpdate,
    });
    return NextResponse.json(updatedScope);
  } catch (error: any) {
    console.error(`更新Scope ${scopeId} 失败:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return NextResponse.json({ message: '权限范围未找到，无法更新 (Scope not found, cannot update)' }, { status: 404 });
      }
    }
    return NextResponse.json({ message: '更新Scope失败 (Error updating scope)' }, { status: 500 });
  }
}

/**
 * DELETE /api/v2/scopes/{scopeId} - 删除特定权限范围
 * 需要 'scope:delete' 权限。
 */
async function deleteScopeHandler(
  request: NextRequest,
  { params }: { authContext: AuthContext; params: RouteParams }
) {
  const { scopeId } = params;

  if (!z.string().cuid().safeParse(scopeId).success) {
      return NextResponse.json({ message: '无效的Scope ID格式' }, { status: 400 });
  }

  try {
    const scopeToDelete = await prisma.scope.findUnique({ where: { id: scopeId } });
    if (!scopeToDelete) {
      return NextResponse.json({ message: '权限范围未找到，无法删除 (Scope not found, cannot delete)' }, { status: 404 });
    }

    const clientsUsingScope = await prisma.oAuthClient.count({
      where: {
        allowedScopes: {
          contains: `"${scopeToDelete.name}"`
        }
      }
    });

    if (clientsUsingScope > 0) {
      return NextResponse.json({ message: `Scope "${scopeToDelete.name}" is still in use by ${clientsUsingScope} client(s) and cannot be deleted.` }, { status: 409 });
    }

    await prisma.scope.delete({ where: { id: scopeId } });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error(`删除Scope ${scopeId} 失败:`, error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return NextResponse.json({ message: '权限范围未找到，无法删除 (Scope not found, P2025)' }, { status: 404 });
      }
    }
    return NextResponse.json({ message: '删除Scope失败 (Error deleting scope)' }, { status: 500 });
  }
}

export const GET = withErrorHandling(
  withAuth(getScopeHandler, { requiredPermissions: ['scope:read'] })
);

export const PUT = withErrorHandling(
  withAuth(updateScopeHandler, { requiredPermissions: ['scope:update'] })
);

export const DELETE = withErrorHandling(
  withAuth(deleteScopeHandler, { requiredPermissions: ['scope:delete'] })
);
