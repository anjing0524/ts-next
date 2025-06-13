// app/api/v2/roles/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { z } from 'zod';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

// Zod Schema for Role Creation
const CreateRoleSchema = z.object({
  name: z.string().min(3, "角色名称至少需要3个字符 (Role name must be at least 3 characters)")
    .max(50, "角色名称不能超过50个字符 (Role name cannot exceed 50 characters)")
    .regex(/^[a-zA-Z0-9_:-]+$/, "角色名称只能包含字母、数字、下划线、冒号和连字符 (Role name can only contain letters, numbers, underscores, colons, and hyphens)"),
  displayName: z.string().min(1, "显示名称不能为空 (Display name cannot be empty)")
    .max(100, "显示名称不能超过100个字符 (Display name cannot exceed 100 characters)"),
  description: z.string().max(255, "描述信息不能超过255个字符 (Description cannot exceed 255 characters)").optional(),
  isActive: z.boolean().optional().default(true),
});

/**
 * 列出所有角色 (List all roles with pagination)
 * Permission: roles:list
 */
async function listRolesHandler(req: AuthenticatedRequest) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  let pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10);
  pageSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE); // Clamp page size

  const nameQuery = searchParams.get('name');
  const isActiveQuery = searchParams.get('isActive');

  const where: Prisma.RoleWhereInput = {};
  if (nameQuery) where.name = { contains: nameQuery, mode: 'insensitive' };
  if (isActiveQuery !== null) where.isActive = isActiveQuery === 'true';

  try {
    const roles = await prisma.role.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    const totalRoles = await prisma.role.count({ where });

    return NextResponse.json({
      data: roles,
      pagination: {
        page,
        pageSize,
        totalItems: totalRoles,
        totalPages: Math.ceil(totalRoles / pageSize),
      },
    });
  } catch (error) {
    console.error('列出角色失败 (Failed to list roles):', error);
    return NextResponse.json({ message: '获取角色列表失败 (Failed to retrieve roles)' }, { status: 500 });
  }
}

/**
 * 创建新角色 (Create a new role)
 * Permission: roles:create
 */
async function createRoleHandler(req: AuthenticatedRequest) {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ message: '无效的JSON请求体 (Invalid JSON request body)' }, { status: 400 });
  }

  const validationResult = CreateRoleSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json({
      message: '创建角色验证失败 (Role creation validation failed)',
      errors: validationResult.error.format(),
    }, { status: 400 });
  }

  const { name, displayName, description, isActive } = validationResult.data;

  try {
    // 检查角色名称是否唯一 (Check if role name is unique)
    const existingRole = await prisma.role.findUnique({ where: { name } });
    if (existingRole) {
      return NextResponse.json({ message: `角色名称 "${name}" 已存在 (Role name "${name}" already exists)` }, { status: 409 });
    }

    const newRole = await prisma.role.create({
      data: {
        name,
        displayName,
        description: description || null, // Prisma expects null for optional empty strings
        isActive,
      },
    });
    return NextResponse.json(newRole, { status: 201 });
  } catch (error) {
    console.error('创建角色失败 (Failed to create role):', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ message: `角色名称 "${name}" 已存在 (Role name "${name}" already exists)` }, { status: 409 });
    }
    return NextResponse.json({ message: '创建角色时发生服务器错误 (Server error during role creation)' }, { status: 500 });
  }
}

export const GET = requirePermission('roles:list')(listRolesHandler);
export const POST = requirePermission('roles:create')(createRoleHandler);

[end of app/api/v2/roles/route.ts]
