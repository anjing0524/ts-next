// 文件路径: app/api/v2/roles/route.ts
// 描述: 此文件处理角色 (Role) 集合的 API 请求，包括列出角色 (GET) 和创建新角色 (POST)。
// 使用 `requirePermission` 中间件来保护这些端点，确保只有授权用户才能访问。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database'; // Prisma ORM 客户端，用于数据库交互。
import { Prisma, Role } from '@prisma/client'; // Prisma 生成的类型，用于高级查询和类型定义。
import { withAuth, type AuthContext } from '@repo/lib/middleware'; // 引入权限控制中间件和认证请求类型。
import { withErrorHandling } from '@repo/lib';
import { AuthorizationUtils } from '@repo/lib/auth'; // For Audit Logging
import { z } from 'zod'; // Zod 库，用于数据验证。

// 定义获取角色列表时分页的默认页面大小。
const DEFAULT_PAGE_SIZE = 10;
// 定义获取角色列表时分页允许的最大页面大小，以防止滥用。
const MAX_PAGE_SIZE = 100;

// --- Zod Schema 定义 ---
// 用于验证创建角色请求体的数据结构和规则。
const CreateRoleSchema = z.object({
  name: z.string()
    .min(3, "角色名称至少需要3个字符 (Role name must be at least 3 characters long)")
    .max(50, "角色名称不能超过50个字符 (Role name cannot exceed 50 characters long)")
    .regex(/^[a-zA-Z0-9_:-]+$/, "角色名称只能包含字母、数字、下划线、冒号和连字符 (Role name can only contain letters, numbers, underscores, colons, and hyphens)"),
  displayName: z.string()
    .min(1, "显示名称不能为空 (Display name cannot be empty)")
    .max(100, "显示名称不能超过100个字符 (Display name cannot exceed 100 characters long)"),
  description: z.string()
    .max(255, "描述信息不能超过255个字符 (Description cannot exceed 255 characters long)")
    .optional().nullable(), // 描述是可选的，且可以为null来清空
  isActive: z.boolean().optional().default(true),
  permissionIds: z.array(z.string().cuid("无效的权限ID格式 (Invalid Permission ID format: must be a CUID)"))
    .optional().default([]), // 权限ID列表，可选，默认为空数组
});

/**
 * GET /api/v2/roles - 列出所有角色 (支持分页和过滤)
 * 此处理函数响应 GET 请求，返回系统中的角色列表。
 * 支持通过查询参数进行分页 (`page`, `pageSize`)、按名称过滤 (`name`) 和按激活状态过滤 (`isActive`)。
 * 需要 'roles:list' 权限才能访问。
 * @param req AuthenticatedRequest - 经过认证的请求对象，包含用户信息。
 * @returns NextResponse - 包含角色列表和分页信息的 JSON 响应。
 */
async function listRolesHandler(
  req: NextRequest,
  context: { authContext: AuthContext; params: any }
): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const page = parseInt(searchParams.get('page') || '1', 10);
  let pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10);
  pageSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);

  const nameQuery = searchParams.get('name');
  const isActiveQuery = searchParams.get('isActive');

  const where: Prisma.RoleWhereInput = {};
  if (nameQuery) {
    where.name = { contains: nameQuery };
  }
  if (isActiveQuery !== null) {
    where.isActive = isActiveQuery === 'true';
  }

  try {
    const roles = await prisma.role.findMany({
      where,
      include: { // 包含与角色关联的权限信息
        rolePermissions: {
          include: {
            permission: true, // 包含每个关联的完整权限对象
          }
        }
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    const totalRoles = await prisma.role.count({ where });

    // 格式化角色数据以包含扁平化的权限列表
    const formattedRoles = roles.map(role => {
      const { rolePermissions, ...roleData } = role;
      return {
        ...roleData,
        permissions: rolePermissions.map(rp => rp.permission), // 直接提取permission对象
      };
    });

    return NextResponse.json({
      // data: roles, // Original structure
      data: formattedRoles, // New structure with permissions directly under role
      pagination: {
        page,
        pageSize,
        totalItems: totalRoles,
        totalPages: Math.ceil(totalRoles / pageSize)
      },
    });
  } catch (error) {
    console.error('列出角色失败 (Failed to list roles):', error);
    return NextResponse.json({ message: '获取角色列表失败 (Failed to retrieve roles list)' }, { status: 500 });
  }
}

/**
 * POST /api/v2/roles - 创建新角色
 * 此处理函数响应 POST 请求，用于在系统中创建一个新的角色。
 * 请求体需要符合 `CreateRoleSchema` 定义的结构和规则。
 * 如果提供了 `permissionIds`，则会在事务中创建角色并关联这些权限。
 * 需要 'roles:create' 权限才能访问。
 * @param req AuthenticatedRequest - 经过认证的请求对象。
 * @returns NextResponse - 包含新创建的角色信息或错误信息的 JSON 响应。
 */
async function createRoleHandler(
  req: NextRequest,
  { authContext }: { authContext: AuthContext; params: any }
): Promise<NextResponse> {
  const performingAdminId = authContext.user_id;
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  let body;
  try {
    body = await req.json();
  } catch (e: any) {
    await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'ROLE_CREATE_FAILURE_INVALID_JSON',
          success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Invalid JSON request body for role creation.',
        metadata: { error: e.message }
    });
    return NextResponse.json({ message: '无效的JSON请求体 (Invalid JSON request body)' }, { status: 400 });
  }

  const validationResult = CreateRoleSchema.safeParse(body);
  if (!validationResult.success) {
    await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'ROLE_CREATE_FAILURE_VALIDATION',
          success: false,
        ipAddress,
        userAgent,
        errorMessage: 'Role creation payload validation failed.',
        metadata: { issues: validationResult.error.format(), receivedBody: body }
    });
    return NextResponse.json({
      message: '创建角色验证失败 (Role creation input validation failed)',
      errors: validationResult.error.format()
    }, { status: 400 });
  }

  const { name, displayName, description, isActive, permissionIds } = validationResult.data;

  try {
    // 检查角色名称 (name) 是否已存在
    const existingRole = await prisma.role.findUnique({ where: { name } });
    if (existingRole) {
      await AuthorizationUtils.logAuditEvent({
          userId: performingAdminId,
          action: 'ROLE_CREATE_FAILURE_CONFLICT',
          resource: `Role:${existingRole.id}`,
          success: false,
          ipAddress,
          userAgent,
          errorMessage: `Role name "${name}" already exists.`,
          metadata: { name }
      });
      return NextResponse.json({ message: `角色名称 "${name}" 已存在 (Role name "${name}" already exists)` }, { status: 409 });
    }

    // 如果提供了 permissionIds，验证它们是否存在
    if (permissionIds && permissionIds.length > 0) {
      const foundPermissions = await prisma.permission.findMany({
        where: { id: { in: permissionIds } },
        select: { id: true },
      });
      if (foundPermissions.length !== permissionIds.length) {
        const notFoundIds = permissionIds.filter(id => !foundPermissions.some(p => p.id === id));
        await AuthorizationUtils.logAuditEvent({
            userId: performingAdminId,
            action: 'ROLE_CREATE_FAILURE_INVALID_PERMISSIONS',
          success: false,
            ipAddress,
            userAgent,
            errorMessage: 'Invalid or non-existent permissionIds provided.',
            metadata: { providedIds: permissionIds, notFoundIds }
        });
        return NextResponse.json({
          message: `提供了无效或不存在的权限ID (Invalid or non-existent permissionIds provided): ${notFoundIds.join(', ')}`
        }, { status: 400 });
      }
    }

    // 在事务中创建角色和角色权限关联
    const newRoleWithPermissions = await prisma.$transaction(async (tx) => {
      const newRole = await tx.role.create({
        data: {
          name,
          displayName,
          description: description || null,
          isActive
        },
      });

      if (permissionIds && permissionIds.length > 0) {
        const rolePermissionData = permissionIds.map(permissionId => ({
          roleId: newRole.id,
          permissionId: permissionId,
        }));
        await tx.rolePermission.createMany({
          data: rolePermissionData,
        });
      }
      return newRole;
    });

    // 获取新创建的角色及其关联的权限用于响应
    const roleForResponse = await prisma.role.findUnique({
        where: { id: newRoleWithPermissions.id },
        include: {
            rolePermissions: {
                include: { permission: true }
            }
        }
    });

    // 格式化响应
    const { rolePermissions, ...roleData } = roleForResponse!;
    const formattedRole = {
        ...roleData,
        permissions: rolePermissions.map(rp => rp.permission)
    };

    await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: 'ROLE_CREATE_SUCCESS',
          resource: `Role:${newRoleWithPermissions.id}`,
          success: true,
        ipAddress,
        userAgent,
        metadata: {
            roleId: newRoleWithPermissions.id,
            name: newRoleWithPermissions.name,
            displayName: newRoleWithPermissions.displayName,
            permissionIds: permissionIds
        }
    });

    return NextResponse.json(formattedRole, { status: 201 });
  } catch (error: any) {
    console.error('创建角色失败 (Failed to create role):', error);
    let errorMessage = 'An unexpected server error occurred during role creation';
    let actionCode = 'ROLE_CREATE_FAILURE_DB_ERROR';

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      errorMessage = `Role name "${name}" already exists due to a database constraint`;
      actionCode = 'ROLE_CREATE_FAILURE_CONFLICT_DB'; // More specific than the earlier check if transaction hits it
    }

    await AuthorizationUtils.logAuditEvent({
        userId: performingAdminId,
        action: actionCode,
          success: false,
        ipAddress,
        userAgent,
        errorMessage: errorMessage,
        metadata: { name, displayName, permissionIds, error: error.message, errorCode: (error as any).code }
    });

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ message: errorMessage }, { status: 409 });
    }
    return NextResponse.json({ message: '创建角色时发生服务器错误 (An unexpected server error occurred during role creation)' }, { status: 500 });
  }
}

// 使用 withAuth 和 withErrorHandling 包装处理器
export const GET = withErrorHandling(
  withAuth(listRolesHandler, { requiredPermissions: ['role:list'] })
);

export const POST = withErrorHandling(
  withAuth(createRoleHandler, { requiredPermissions: ['role:create'] })
);
