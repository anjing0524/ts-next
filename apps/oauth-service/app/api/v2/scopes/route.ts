// /api/v2/scopes
// 描述: 管理OAuth权限范围 (Scopes) - 创建和列表。
// (Manages OAuth Scopes - Create and List.)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from 'lib/prisma';
import { requirePermission } from 'lib/auth/middleware';
import { Prisma } from '@prisma/client';

// Zod Schema for creating a new scope
// 创建新权限范围的Zod Schema
const scopeCreateSchema = z.object({
  name: z.string().min(3, "Scope name must be at least 3 characters long / 范围名称至少需要3个字符")
    .max(100, "Scope name must be at most 100 characters long / 范围名称长度不超过100字符")
    .regex(/^[a-zA-Z0-9_:-]+$/, "Scope name can only contain alphanumeric characters, underscores, colons, and hyphens / 范围名称只能包含字母数字、下划线、冒号和连字符"),
  description: z.string().max(500, "Description must be at most 500 characters long / 描述长度不超过500字符").optional().nullable(),
  isPublic: z.boolean().default(false).optional(), // 公开客户端通常只能请求公开范围 (Public clients can usually only request public scopes)
  isActive: z.boolean().default(true).optional(),
});

// Zod Schema for listing scopes (query parameters)
// 列出权限范围的Zod Schema (查询参数)
const scopeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  name: z.string().optional(), // Filter by name (contains)
  isActive: z.preprocess(val => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    return undefined;
  }, z.boolean().optional()),
});

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;


/**
 * @swagger
 * /api/v2/scopes:
 *   get:
 *     summary: 列出所有可用权限范围 (OAuth Scope管理)
 *     description: 获取系统中所有已定义的OAuth权限范围 (scopes)。需要 'scopes:list' 权限。
 *     tags: [OAuth Scopes API]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         description: 页码。
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         description: 每页数量。
 *         schema: { type: integer, default: 10 }
 *       - name: name
 *         in: query
 *         description: 按名称筛选 (模糊匹配)。
 *         schema: { type: string }
 *       - name: isActive
 *         in: query
 *         description: 按激活状态筛选。
 *         schema: { type: boolean }
 *     responses:
 *       200: { description: "成功获取权限范围列表。" } # Schema defined in previous subtask
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问。" }
 */
async function listScopesHandler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const queryParams: Record<string, string | undefined> = {};
  searchParams.forEach((value, key) => { queryParams[key] = value; });

  const validationResult = scopeListQuerySchema.safeParse(queryParams);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }

  const { page, limit, name, isActive } = validationResult.data;

  const whereClause: Prisma.ScopeWhereInput = {};
  if (name) whereClause.name = { contains: name };
  if (isActive !== undefined) whereClause.isActive = isActive;

  try {
    const scopes = await prisma.scope.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const totalScopes = await prisma.scope.count({ where: whereClause });

    return NextResponse.json({
      data: scopes,
      pagination: {
        page,
        pageSize: limit,
        totalItems: totalScopes,
        totalPages: Math.ceil(totalScopes / limit),
      },
    });
  } catch (error) {
    console.error("Failed to list scopes:", error);
    return NextResponse.json({ message: "Error listing scopes." }, { status: 500 });
  }
}
export const GET = requirePermission('scopes:list')(listScopesHandler);


/**
 * @swagger
 * /api/v2/scopes:
 *   post:
 *     summary: 创建新的权限范围 (OAuth Scope管理)
 *     description: 在系统中定义一个新的OAuth权限范围。需要 'scopes:create' 权限。
 *     tags: [OAuth Scopes API]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ScopeCreatePayload'
 *     responses:
 *       201: { description: "权限范围已成功创建。" } # Schema defined in previous subtask
 *       400: { description: "无效请求，例如名称已存在或格式错误。" }
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问。" }
 *       409: { description: "名称冲突。" }
 * components:
 *   schemas:
 *     ScopeCreatePayload:
 *       type: object
 *       required: [name]
 *       properties:
 *         name: { type: string, description: "范围名称 (e.g. order:read)", example: "product:manage" }
 *         description: { type: string, description: "范围描述", example: "允许管理产品信息", nullable: true }
 *         isPublic: { type: boolean, description: "是否公开范围", default: false }
 *         isActive: { type: boolean, description: "是否激活", default: true }
 */
async function createScopeHandler(request: NextRequest) {
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body', message: 'Failed to parse JSON body.' }, { status: 400 });
  }

  const validationResult = scopeCreateSchema.safeParse(payload);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }

  const { name, description, isPublic, isActive } = validationResult.data;

  try {
    const existingScope = await prisma.scope.findUnique({ where: { name } });
    if (existingScope) {
      return NextResponse.json({ message: `Scope name "${name}" already exists.` }, { status: 409 });
    }

    const newScope = await prisma.scope.create({
      data: {
        name,
        description,
        isPublic,
        isActive,
      },
    });
    return NextResponse.json(newScope, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create scope:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ message: `Scope name "${name}" already exists (race condition).` }, { status: 409 });
    }
    return NextResponse.json({ message: "Error creating scope." }, { status: 500 });
  }
}
export const POST = requirePermission('scopes:create')(createScopeHandler);
