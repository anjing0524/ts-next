import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { Prisma } from '@prisma/client';
import { successResponse, errorResponse } from '@repo/lib/node';
import { z } from 'zod';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const createRoleSchema = z.object({
  name: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_:-]+$/),
  displayName: z.string().min(1).max(100),
  description: z.string().max(255).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  permissionIds: z.array(z.string().cuid()).optional().default([]),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    let pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10);
    pageSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
    const nameQuery = searchParams.get('name');
    const isActiveQuery = searchParams.get('isActive');

    const where: Prisma.RoleWhereInput = {};
    if (nameQuery) where.name = { contains: nameQuery };
    if (isActiveQuery !== null) where.isActive = isActiveQuery === 'true';

    const roles = await prisma.role.findMany({
      where,
      include: { rolePermissions: { include: { permission: true } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    const totalRoles = await prisma.role.count({ where });

    const formattedRoles = roles.map(({ rolePermissions, ...roleData }) => ({
      ...roleData,
      permissions: rolePermissions.map((rp) => rp.permission),
    }));

    return successResponse({
      items: formattedRoles,
      pagination: {
        page,
        pageSize,
        totalItems: totalRoles,
        totalPages: Math.ceil(totalRoles / pageSize),
      },
    });
  } catch (error) {
    console.error('列出角色失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const validationResult = createRoleSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse({
        message: '创建角色验证失败',
        statusCode: 400,
        details: validationResult.error.flatten(),
      });
    }

    const { name, permissionIds, ...roleData } = validationResult.data;

    const existingRole = await prisma.role.findUnique({ where: { name } });
    if (existingRole) {
      return errorResponse({ message: `角色名称 "${name}" 已存在`, statusCode: 409 });
    }

    if (permissionIds && permissionIds.length > 0) {
      const foundPermissions = await prisma.permission.count({
        where: { id: { in: permissionIds } },
      });
      if (foundPermissions !== permissionIds.length) {
        return errorResponse({ message: '提供了无效或不存在的权限ID', statusCode: 400 });
      }
    }

    const newRole = await prisma.role.create({
      data: {
        name,
        ...roleData,
        rolePermissions: {
          create: permissionIds.map(permissionId => ({
            permission: { connect: { id: permissionId } },
          })),
        },
      },
      include: { rolePermissions: { include: { permission: true } } },
    });

    const { rolePermissions, ...newRoleData } = newRole;
    const formattedRole = {
      ...newRoleData,
      permissions: rolePermissions.map(rp => rp.permission),
    };

    return successResponse(formattedRole, 201);
  } catch (error) {
    console.error('创建角色失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}