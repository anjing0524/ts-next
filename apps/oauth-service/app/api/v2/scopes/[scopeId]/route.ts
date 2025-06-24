// /api/v2/scopes/[scopeId]
// 描述: 管理特定OAuth权限范围 (Scope) - 获取详情、更新、删除。
// (Manages specific OAuth Scope - Get details, Update, Delete.)

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from 'lib/prisma';
import { requirePermission } from 'lib/auth/middleware';
import { Prisma } from '@prisma/client';

interface RouteContext {
  params: {
    scopeId: string; // The CUID of the Scope record
  };
}

// Zod Schema for updating a scope (PATCH)
// 更新权限范围的Zod Schema (PATCH)
const scopeUpdateSchema = z.object({
  // name is typically immutable for scopes once created.
  description: z.string().max(500, "描述长度不超过500字符").optional().nullable(),
  isPublic: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

/**
 * @swagger
 * /api/v2/scopes/{scopeId}:
 *   get:
 *     summary: 获取特定权限范围的详细信息 (OAuth Scope管理)
 *     description: 根据ID获取系统中特定OAuth权限范围的详细信息。需要 'scopes:read' 权限。
 *     tags: [OAuth Scopes API]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: scopeId {type: string, description: "权限范围的数据库ID (CUID)。"}
 *         in: path
 *         required: true
 *     responses:
 *       200: { description: "成功获取权限范围信息。" }
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问。" }
 *       404: { description: "未找到指定的权限范围。" }
 */
async function getScopeHandler(request: NextRequest, context: RouteContext) {
  const { scopeId } = context.params;

  // Validate scopeId format (CUID)
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
export const GET = requirePermission('scopes:read')(getScopeHandler);


/**
 * @swagger
 * /api/v2/scopes/{scopeId}:
 *   patch:
 *     summary: 更新特定权限范围的信息 (OAuth Scope管理)
 *     description: 更新系统中特定OAuth权限范围的信息 (例如描述, isPublic, isActive状态)。名称通常不可修改。需要 'scopes:update' 权限。
 *     tags: [OAuth Scopes API]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: scopeId {type: string, description: "权限范围的数据库ID (CUID)。"}
 *         in: path
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ScopeUpdatePayload'
 *     responses:
 *       200: { description: "权限范围已成功更新。" }
 *       400: { description: "无效请求。" }
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问。" }
 *       404: { description: "未找到指定的权限范围。" }
 * components:
 *   schemas:
 *     ScopeUpdatePayload:
 *       type: object
 *       properties:
 *         description: { type: string, nullable: true }
 *         isPublic: { type: boolean }
 *         isActive: { type: boolean }
 */
async function patchScopeHandler(request: NextRequest, context: RouteContext) {
  const { scopeId } = context.params;

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
  // Prevent 'name' field from being updated
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
      if (error.code === 'P2025') { // Record to update not found
        return NextResponse.json({ message: '权限范围未找到，无法更新 (Scope not found, cannot update)' }, { status: 404 });
      }
    }
    return NextResponse.json({ message: '更新Scope失败 (Error updating scope)' }, { status: 500 });
  }
}
export const PATCH = requirePermission('scopes:update')(patchScopeHandler); // Changed from PUT to PATCH


/**
 * @swagger
 * /api/v2/scopes/{scopeId}:
 *   delete:
 *     summary: 删除特定权限范围 (OAuth Scope管理)
 *     description: 从系统中删除一个OAuth权限范围。如果该范围仍被客户端使用，将阻止删除。需要 'scopes:delete' 权限。
 *     tags: [OAuth Scopes API]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: scopeId {type: string, description: "权限范围的数据库ID (CUID)。"}
 *         in: path
 *         required: true
 *     responses:
 *       204: { description: "权限范围已成功删除。" }
 *       400: { description: "无效的Scope ID格式。" }
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问。" }
 *       404: { description: "未找到指定的权限范围。" }
 *       409: { description: "无法删除，权限范围正在被使用。" }
 */
async function deleteScopeHandler(request: NextRequest, context: RouteContext) {
  const { scopeId } = context.params;

  if (!z.string().cuid().safeParse(scopeId).success) {
      return NextResponse.json({ message: '无效的Scope ID格式' }, { status: 400 });
  }

  try {
    const scopeToDelete = await prisma.scope.findUnique({ where: { id: scopeId } });
    if (!scopeToDelete) {
      return NextResponse.json({ message: '权限范围未找到，无法删除 (Scope not found, cannot delete)' }, { status: 404 });
    }

    // 检查此 Scope 是否仍被任何 OAuthClient 使用
    // This requires querying clients and parsing their `allowedScopes` JSON string.
    // This is a simplified check. A more robust check might involve a dedicated join table or more complex queries.
    const clientsUsingScope = await prisma.oAuthClient.count({
      where: {
        allowedScopes: {
          contains: `"${scopeToDelete.name}"` // Checks if the scope name is part of the JSON array string
        }
      }
    });

    if (clientsUsingScope > 0) {
      return NextResponse.json({ message: `Scope "${scopeToDelete.name}" is still in use by ${clientsUsingScope} client(s) and cannot be deleted.` }, { status: 409 });
    }

    // TODO: Check if scope is used in RolePermission table? (Permissions often use scope names in their 'name' field, e.g. 'scope:action')
    // This dependency might be more complex to check directly. For now, focusing on OAuthClient.allowedScopes.


    await prisma.scope.delete({ where: { id: scopeId } });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error(`删除Scope ${scopeId} 失败:`, error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return NextResponse.json({ message: '权限范围未找到，无法删除 (Scope not found, P2025)' }, { status: 404 });
      }
       // P2003 would be foreign key constraint, but we check explicitly above.
    }
    return NextResponse.json({ message: '删除Scope失败 (Error deleting scope)' }, { status: 500 });
  }
}
export const DELETE = requirePermission('scopes:delete')(deleteScopeHandler);
