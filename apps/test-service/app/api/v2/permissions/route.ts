// 文件路径: app/api/v2/permissions/route.ts
// 描述: 此文件处理权限 (Permission) 集合的 API 请求，包括列出权限 (GET) 和创建新权限 (POST)。
// 权限是细粒度的访问控制单元，可以关联到角色。
// 使用 `requirePermission` 中间件进行访问控制。

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Prisma ORM 客户端。
import { Prisma, PermissionType, HttpMethod } from '@prisma/client'; // Prisma 生成的类型，包括枚举。
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // 引入权限控制中间件。
import { AuthorizationUtils } from '@/lib/auth/oauth2'; // For Audit Logging
import { z } from 'zod'; // Zod 库，用于数据验证。

// --- 常量定义 ---
// 默认分页大小和最大分页大小。
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

// --- Zod Schema 定义 ---
// 这些 Schema 用于验证创建和更新权限时请求体的数据结构和规则。

// API 类型权限的详细信息 Schema。
const ApiDetailsSchema = z.object({
  httpMethod: z.nativeEnum(HttpMethod), // HTTP方法，必须是 HttpMethod 枚举中定义的值。
  endpoint: z.string().startsWith('/', "API端点路径必须以'/'开头 (Endpoint path must start with '/')"), // 端点路径，必须以 '/' 开头。
  rateLimit: z.number().int().positive().optional(), // (可选) 速率限制，必须是正整数。
});

// 菜单类型权限的详细信息 Schema。
const MenuDetailsSchema = z.object({
  menuId: z.string().cuid("无效的菜单ID格式 (Invalid Menu ID format: must be a CUID)"), // 关联的菜单ID，必须是 CUID 格式。
  // menuKey: z.string().min(1), // (备选方案) 如果不使用CUID，可以使用菜单键 (menuKey)。
});

// 数据类型权限的详细信息 Schema。
const DataDetailsSchema = z.object({
  tableName: z.string().min(1, "表名不能为空 (Table name cannot be empty)"), // 关联的数据库表名。
  columnName: z.string().optional(), // (可选) 关联的特定列名。
  conditions: z.string().optional(), // (可选) JSON 字符串格式的条件，用于更细致的数据权限控制。
});

// 创建权限的主 Schema。
// 使用 `superRefine` 进行跨字段的条件验证，确保当选择了特定权限类型 (type) 时，
// 其对应的详细信息字段 (apiDetails, menuDetails, dataDetails) 也被提供。
const CreatePermissionSchema = z.object({
  // 权限名称 (内部唯一标识符)
  name: z.string()
    .min(3, "权限名称至少需要3个字符 (Permission name must be at least 3 characters long)")
    .max(100, "权限名称不能超过100个字符 (Permission name cannot exceed 100 characters long)")
    .regex(/^[a-zA-Z0-9_:-]+$/, "权限名称格式无效，只能包含字母、数字、下划线、冒号和连字符 (Invalid permission name format. Allowed: letters, numbers, underscore, colon, hyphen)"),
  // 权限显示名称 (用于UI展示)
  displayName: z.string().min(1, "显示名称不能为空 (Display name cannot be empty)").max(150, "显示名称不能超过150字符"),
  // 权限描述 (可选)
  description: z.string().max(255, "描述信息不能超过255字符").optional(),
  // 权限类型 (API, MENU, DATA)，必须是 PermissionType 枚举中定义的值。
  type: z.nativeEnum(PermissionType),
  // 权限作用的资源标识符 (例如，API端点路径，菜单键，表名)。
  resource: z.string().min(1, "资源标识不能为空 (Resource identifier cannot be empty)").max(200, "资源标识不能超过200字符"),
  // 权限允许的操作 (例如，READ, WRITE, EXECUTE, list, create)。
  action: z.string().min(1, "操作不能为空 (Action cannot be empty)").max(50, "操作名称不能超过50字符"),
  // 权限是否激活 (可选，默认为 true)。
  isActive: z.boolean().optional().default(true),
  // API 类型权限的详细信息 (可选，但如果 type === API 则为必需)。
  apiDetails: ApiDetailsSchema.optional(),
  // 菜单类型权限的详细信息 (可选，但如果 type === MENU 则为必需)。
  menuDetails: MenuDetailsSchema.optional(),
  // 数据类型权限的详细信息 (可选，但如果 type === DATA 则为必需)。
  dataDetails: DataDetailsSchema.optional(),
}).superRefine((data, ctx) => { // `superRefine` 用于进行依赖于多个字段的复杂验证。
  // 根据选择的权限类型 (type)，验证相应的 details 对象是否已提供。
  if (data.type === PermissionType.API && !data.apiDetails) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "API类型的权限必须提供apiDetails对象 (For API type permission, 'apiDetails' object must be provided)", path: ["apiDetails"] });
  }
  if (data.type === PermissionType.MENU && !data.menuDetails) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MENU类型的权限必须提供menuDetails对象 (For MENU type permission, 'menuDetails' object must be provided)", path: ["menuDetails"] });
  }
  if (data.type === PermissionType.DATA && !data.dataDetails) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "DATA类型的权限必须提供dataDetails对象 (For DATA type permission, 'dataDetails' object must be provided)", path: ["dataDetails"] });
  }
});


/**
 * GET /api/v2/permissions - 列出所有权限定义 (支持分页和过滤)
 * 此处理函数响应 GET 请求，返回系统中的权限列表。
 * 支持通过查询参数进行分页、按名称、类型、资源、操作等进行过滤。
 * 需要 'permissions:list' 权限。
 * @param req AuthenticatedRequest - 经过认证的请求对象。
 * @returns NextResponse - 包含权限列表和分页信息的 JSON 响应。
 */
async function listPermissionsHandler(req: AuthenticatedRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url); // 解析查询参数。

  // 分页参数处理。
  const page = parseInt(searchParams.get('page') || '1', 10);
  let pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10);
  pageSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE); // 确保 pageSize 在有效范围内。

  // 过滤参数处理。
  const nameQuery = searchParams.get('name'); // 按权限名称过滤。
  const typeQuery = searchParams.get('type') as PermissionType | null; // 按权限类型过滤。
  const resourceQuery = searchParams.get('resource'); // 按资源标识过滤。
  const actionQuery = searchParams.get('action'); // 按操作过滤。

  // 构建 Prisma 查询的 `where` 条件。
  const where: Prisma.PermissionWhereInput = {};
  if (nameQuery) where.name = { contains: nameQuery, mode: 'insensitive' }; // 名称模糊查询 (不区分大小写)。
  // 确保 typeQuery 是有效的 PermissionType 枚举值。
  if (typeQuery && Object.values(PermissionType).includes(typeQuery)) where.type = typeQuery;
  if (resourceQuery) where.resource = { contains: resourceQuery, mode: 'insensitive' };
  if (actionQuery) where.action = { contains: actionQuery, mode: 'insensitive' };

  try {
    // 从数据库查询权限列表。
    const permissions = await prisma.permission.findMany({
      where,
      include: { // (重要) 包含关联的、特定类型的权限详情。
        apiPermission: true,  // 如果是 API 权限，则加载 ApiPermission 记录。
        menuPermission: { include: { menu: true } }, // 如果是 MENU 权限，加载 MenuPermission 并进一步加载关联的 Menu 信息。
        dataPermission: true, // 如果是 DATA 权限，则加载 DataPermission 记录。
      },
      skip: (page - 1) * pageSize, // 分页：跳过的记录数。
      take: pageSize,             // 分页：获取的记录数。
      orderBy: { createdAt: 'desc' }, // 按创建时间降序排序。
    });
    // 获取满足过滤条件的总权限数，用于分页。
    const totalPermissions = await prisma.permission.count({ where });

    // 返回包含权限数据和分页信息的 JSON 响应。
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
    // 错误处理。
    console.error('列出权限失败 (Failed to list permissions):', error);
    return NextResponse.json({ message: '获取权限列表时发生错误 (An error occurred while retrieving permissions list)' }, { status: 500 });
  }
}

/**
 * POST /api/v2/permissions - 创建新权限定义
 * 此处理函数响应 POST 请求，用于在系统中创建一个新的权限及其特定类型的详细信息。
 * 请求体需要符合 `CreatePermissionSchema` 的定义。
 * 使用数据库事务确保权限基础记录和其特定类型详情记录的原子性创建。
 * 需要 'permissions:create' 权限。
 * @param req AuthenticatedRequest - 经过认证的请求对象。
 * @returns NextResponse - 包含新创建的完整权限信息或错误信息的 JSON 响应。
 */
async function createPermissionHandler(req: AuthenticatedRequest): Promise<NextResponse> {
  const performingAdmin = req.user;
  const ipAddress = req.ip || req.headers?.get('x-forwarded-for');
  const userAgent = req.headers?.get('user-agent');

  let body;
  try {
    body = await req.json(); // 解析请求体。
  } catch (e: any) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'PERMISSION_CREATE_FAILURE_INVALID_JSON',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: 'Invalid JSON request body for permission creation.',
        details: JSON.stringify({ error: e.message }),
    });
    return NextResponse.json({ message: '无效的JSON请求体 (Invalid JSON request body)' }, { status: 400 });
  }

  // 使用 Zod Schema 验证请求体数据。
  const validationResult = CreatePermissionSchema.safeParse(body);
  if (!validationResult.success) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'PERMISSION_CREATE_FAILURE_VALIDATION',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: 'Permission creation payload validation failed.',
        details: JSON.stringify({ issues: validationResult.error.format(), receivedBody: body }),
    });
    return NextResponse.json({
      message: '创建权限的输入数据验证失败 (Permission creation input validation failed)',
      errors: validationResult.error.format(),
    }, { status: 400 });
  }

  // 从验证成功的数据中解构出权限属性。
  const { name, displayName, description, type, resource, action, isActive, apiDetails, menuDetails, dataDetails } = validationResult.data;

  try {
    // 检查权限名称 (name) 是否已存在，因其需要唯一。
    const existingPermission = await prisma.permission.findUnique({ where: { name } });
    if (existingPermission) {
      await AuthorizationUtils.logAuditEvent({
          actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
          actorId: performingAdmin?.id || 'anonymous',
          userId: performingAdmin?.id,
          action: 'PERMISSION_CREATE_FAILURE_CONFLICT',
          status: 'FAILURE',
          ipAddress,
          userAgent,
          errorMessage: `Permission name "${name}" already exists.`,
          resourceType: 'Permission',
          resourceId: existingPermission.id,
          details: JSON.stringify({ name }),
      });
      return NextResponse.json({ message: `权限名称 "${name}" 已存在 (Permission name "${name}" already exists)` }, { status: 409 });
    }

    // 使用 Prisma 事务 (`$transaction`) 来确保权限基础记录及其特定类型详情记录的创建是原子操作。
    // 如果任何一步失败，整个事务将回滚。
    const createdPermission = await prisma.$transaction(async (tx) => {
      // 1. 创建权限基础记录 (Permission table)。
      const newPermission = await tx.permission.create({
        data: { name, displayName, description, type, resource, action, isActive },
      });

      // 2. 根据权限类型 (type)，创建对应的特定类型详情记录。
      if (type === PermissionType.API && apiDetails) {
        // 创建 ApiPermission 记录，并关联到新创建的 Permission ID。
        await tx.apiPermission.create({ data: { permissionId: newPermission.id, ...apiDetails } });
      } else if (type === PermissionType.MENU && menuDetails) {
        // 对于 MENU 类型，首先验证关联的 menuId 是否在 Menu 表中有效存在。
        const menuExists = await tx.menu.count({ where: { id: menuDetails.menuId }});
        if (menuExists === 0) {
            // 如果 menuId 无效，则抛出错误，这将导致事务回滚。
            throw new Error(`关联的菜单ID "${menuDetails.menuId}" 无效或不存在 (The associated Menu ID "${menuDetails.menuId}" is invalid or does not exist)`);
        }
        // 创建 MenuPermission 记录。
        await tx.menuPermission.create({ data: { permissionId: newPermission.id, menuId: menuDetails.menuId } });
      } else if (type === PermissionType.DATA && dataDetails) {
        // 创建 DataPermission 记录。
        await tx.dataPermission.create({ data: { permissionId: newPermission.id, ...dataDetails } });
      }
      // 从事务中返回新创建的权限基础记录。
      return newPermission;
    });

    // 为了在响应中返回完整的权限信息 (包括特定类型详情)，在事务成功后重新查询一次。
    const fullNewPermission = await prisma.permission.findUnique({
        where: { id: createdPermission.id },
        include: { apiPermission: true, menuPermission: { include: { menu: true } }, dataPermission: true } // 加载所有可能的关联详情。
    });

    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'PERMISSION_CREATE_SUCCESS',
        status: 'SUCCESS',
        resourceType: 'Permission',
        resourceId: createdPermission.id,
        ipAddress,
        userAgent,
        details: JSON.stringify({
            permissionId: createdPermission.id,
            name: createdPermission.name,
            type: createdPermission.type,
            resource: createdPermission.resource,
            action: createdPermission.action,
            apiDetails, menuDetails, dataDetails // Log the input details
        }),
    });
    // 返回新创建的完整权限信息，HTTP状态码为 201 Created。
    return NextResponse.json(fullNewPermission, { status: 201 });

  } catch (error: any) {
    console.error('创建权限失败 (Failed to create permission):', error);
    let errorMessage = 'An unexpected server error occurred during permission creation';
    let actionCode = 'PERMISSION_CREATE_FAILURE_DB_ERROR';
    let httpStatus = 500;

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      errorMessage = `Permission name "${name}" already exists due to a database constraint`;
      actionCode = 'PERMISSION_CREATE_FAILURE_CONFLICT_DB';
      httpStatus = 409;
    } else if (error.message.includes("菜单ID")) {
      errorMessage = error.message;
      actionCode = 'PERMISSION_CREATE_FAILURE_INVALID_MENU_ID';
      httpStatus = 400;
    }

    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: actionCode,
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: errorMessage,
        details: JSON.stringify({
            name, displayName, type, resource, action, // Log main fields
            apiDetailsAttempted: apiDetails,
            menuDetailsAttempted: menuDetails,
            dataDetailsAttempted: dataDetails,
            error: error.message,
            errorCode: (error as any).code,
        }),
    });
    return NextResponse.json({ message: errorMessage }, { status: httpStatus });
  }
}

// 使用 `requirePermission` 中间件包装处理函数，并导出为相应的 HTTP 方法。
export const GET = requirePermission('permissions:list')(listPermissionsHandler);
export const POST = requirePermission('permissions:create')(createPermissionHandler);

[end of app/api/v2/permissions/route.ts]
