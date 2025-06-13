// app/api/v2/permissions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma, PermissionType, HttpMethod } from '@prisma/client';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { z } from 'zod';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

// Zod Schemas for Permission Creation
const ApiDetailsSchema = z.object({
  httpMethod: z.nativeEnum(HttpMethod),
  endpoint: z.string().startsWith('/', "端点路径必须以'/'开头 (Endpoint path must start with '/')"),
  rateLimit: z.number().int().positive().optional(),
});

const MenuDetailsSchema = z.object({
  menuId: z.string().cuid("无效的菜单ID格式 (Invalid Menu ID format)"),
  // menuKey: z.string().min(1), // Alternative if menuId is not CUID or using key
});

const DataDetailsSchema = z.object({
  tableName: z.string().min(1, "表名不能为空 (Table name cannot be empty)"),
  columnName: z.string().optional(),
  conditions: z.string().optional(), // JSON string for conditions
});

const CreatePermissionSchema = z.object({
  name: z.string().min(3, "权限名称至少3字符 (Permission name at least 3 chars)")
    .max(100, "权限名称不超过100字符 (Permission name max 100 chars)")
    .regex(/^[a-zA-Z0-9_:-]+$/, "权限名称格式无效 (Invalid permission name format)"),
  displayName: z.string().min(1, "显示名称不能为空 (Display name cannot be empty)").max(150),
  description: z.string().max(255).optional(),
  type: z.nativeEnum(PermissionType),
  resource: z.string().min(1, "资源标识不能为空 (Resource identifier cannot be empty)").max(200),
  action: z.string().min(1, "操作不能为空 (Action cannot be empty)").max(50),
  isActive: z.boolean().optional().default(true),
  apiDetails: ApiDetailsSchema.optional(),
  menuDetails: MenuDetailsSchema.optional(),
  dataDetails: DataDetailsSchema.optional(),
}).superRefine((data, ctx) => {
  // 根据权限类型验证对应的详细信息是否存在
  // (Validate corresponding details exist based on permission type)
  if (data.type === PermissionType.API && !data.apiDetails) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "API类型的权限必须提供apiDetails (API type permission must provide apiDetails)", path: ["apiDetails"] });
  }
  if (data.type === PermissionType.MENU && !data.menuDetails) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MENU类型的权限必须提供menuDetails (MENU type permission must provide menuDetails)", path: ["menuDetails"] });
  }
  if (data.type === PermissionType.DATA && !data.dataDetails) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "DATA类型的权限必须提供dataDetails (DATA type permission must provide dataDetails)", path: ["dataDetails"] });
  }
});


/**
 * 列出所有权限定义 (List all permission definitions with pagination)
 * Permission: permissions:list
 */
async function listPermissionsHandler(req: AuthenticatedRequest) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  let pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10);
  pageSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);

  const nameQuery = searchParams.get('name');
  const typeQuery = searchParams.get('type') as PermissionType | null;
  const resourceQuery = searchParams.get('resource');
  const actionQuery = searchParams.get('action');

  const where: Prisma.PermissionWhereInput = {};
  if (nameQuery) where.name = { contains: nameQuery, mode: 'insensitive' };
  if (typeQuery && Object.values(PermissionType).includes(typeQuery)) where.type = typeQuery;
  if (resourceQuery) where.resource = { contains: resourceQuery, mode: 'insensitive' };
  if (actionQuery) where.action = { contains: actionQuery, mode: 'insensitive' };

  try {
    const permissions = await prisma.permission.findMany({
      where,
      include: { // 包括关联的类型特定权限详情 (Include related type-specific permission details)
        apiPermission: true,
        menuPermission: { include: { menu: true } }, // Also include Menu details if menuId is used
        dataPermission: true,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    const totalPermissions = await prisma.permission.count({ where });

    return NextResponse.json({
      data: permissions,
      pagination: {
        page,
        pageSize,
        totalItems: totalPermissions,
        totalPages: Math.ceil(totalPermissions / pageSize),
      },
    });
  } catch (error) {
    console.error('列出权限失败 (Failed to list permissions):', error);
    return NextResponse.json({ message: '获取权限列表失败 (Failed to retrieve permissions)' }, { status: 500 });
  }
}

/**
 * 创建新权限定义 (Create a new permission definition)
 * Permission: permissions:create
 */
async function createPermissionHandler(req: AuthenticatedRequest) {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ message: '无效的JSON请求体 (Invalid JSON request body)' }, { status: 400 });
  }

  const validationResult = CreatePermissionSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json({
      message: '创建权限验证失败 (Permission creation validation failed)',
      errors: validationResult.error.format(),
    }, { status: 400 });
  }

  const { name, displayName, description, type, resource, action, isActive, apiDetails, menuDetails, dataDetails } = validationResult.data;

  try {
    const existingPermission = await prisma.permission.findUnique({ where: { name } });
    if (existingPermission) {
      return NextResponse.json({ message: `权限名称 "${name}" 已存在 (Permission name "${name}" already exists)` }, { status: 409 });
    }

    const createdPermission = await prisma.$transaction(async (tx) => {
      const newPermission = await tx.permission.create({
        data: { name, displayName, description, type, resource, action, isActive },
      });

      if (type === PermissionType.API && apiDetails) {
        await tx.apiPermission.create({ data: { permissionId: newPermission.id, ...apiDetails } });
      } else if (type === PermissionType.MENU && menuDetails) {
        // Ensure menuId is valid before attempting to link
        const menuExists = await tx.menu.count({ where: { id: menuDetails.menuId }});
        if (menuExists === 0) {
            throw new Error(`菜单ID "${menuDetails.menuId}" 无效或不存在 (Menu ID "${menuDetails.menuId}" is invalid or does not exist)`);
        }
        await tx.menuPermission.create({ data: { permissionId: newPermission.id, menuId: menuDetails.menuId } });
      } else if (type === PermissionType.DATA && dataDetails) {
        await tx.dataPermission.create({ data: { permissionId: newPermission.id, ...dataDetails } });
      }
      return newPermission;
    });

    // 查询完整创建的权限以返回 (Query the fully created permission to return)
    const fullNewPermission = await prisma.permission.findUnique({
        where: { id: createdPermission.id },
        include: { apiPermission: true, menuPermission: { include: { menu: true } }, dataPermission: true }
    });

    return NextResponse.json(fullNewPermission, { status: 201 });

  } catch (error: any) {
    console.error('创建权限失败 (Failed to create permission):', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ message: `权限名称 "${name}" 已存在 (Permission name "${name}" already exists)` }, { status: 409 });
    }
    if (error.message.includes("菜单ID")) { // Custom error from transaction
        return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: '创建权限时发生服务器错误 (Server error during permission creation)' }, { status: 500 });
  }
}

export const GET = requirePermission('permissions:list')(listPermissionsHandler);
export const POST = requirePermission('permissions:create')(createPermissionHandler);

[end of app/api/v2/permissions/route.ts]
