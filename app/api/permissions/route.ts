import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';
import { PermissionType, HttpMethod } from '@prisma/client'; // 引入 Prisma 生成的枚举类型

// 定义权限类型枚举 (和 Prisma schema 中的 PermissionType 保持一致)
// PermissionTypeEnum 用于 Zod 校验，而 PermissionType 用于 Prisma 类型
const PermissionTypeEnum = z.nativeEnum(PermissionType);
const HttpMethodEnum = z.nativeEnum(HttpMethod); // 引入 HTTP 方法枚举

// API 类型权限的特定字段校验 Schema
const ApiPermissionDetailsSchema = z.object({
  httpMethod: HttpMethodEnum, // HTTP 方法，使用 Prisma 生成的 HttpMethod 枚举
  endpoint: z.string().min(1, 'Endpoint is required').max(255), // API 路径
  rateLimit: z.number().int().positive().optional(), // 可选的速率限制
});

// MENU 类型权限的特定字段校验 Schema
const MenuPermissionDetailsSchema = z.object({
  menuId: z.string().min(1, 'Menu ID is required').max(100), // 菜单唯一标识符
});

// DATA 类型权限的特定字段校验 Schema
const DataPermissionDetailsSchema = z.object({
  tableName: z.string().min(1, 'Table name is required').max(100), // 数据库表名
  columnName: z.string().min(1, 'Column name is required').max(100).optional(), // 可选的列名
  conditions: z.string().max(1000).optional(), // JSON 字符串表示的查询条件
});

// 创建权限的 Schema (已重构)
// 权限核心信息存储在 Permission 表，具体细节根据类型存储在关联表 (ApiPermission, MenuPermission, DataPermission)
const CreatePermissionSchema = z.object({
  // 权限唯一名称，例如：user:create_profile:api, report:view:menu, order:read_sensitive:data
  // 建议格式: <资源域>:<行为>:<类型> 或 <资源域>:<子资源>:<行为>:<类型>
  name: z.string().min(3, 'Name must be at least 3 characters').max(100)
    .regex(/^[a-z0-9_.:-]+$/, 'Name can only contain lowercase letters, numbers, underscores, colons, and hyphens'),
  displayName: z.string().min(1, 'Display name is required').max(100), // 权限在 UI 上显示的名称
  description: z.string().max(255).optional(), // 权限的详细描述
  resource: z.string().min(1, 'Resource is required').max(100), // 受权限控制的资源，例如 'user_profile', 'product_catalog', 'dashboard_widgets'
  action: z.string().min(1, 'Action is required').max(50),   // 对资源执行的操作，例如 'create', 'read', 'update', 'delete', 'view', 'manage'
  type: PermissionTypeEnum, // 权限类型，决定了哪个关联表将存储额外信息
  apiDetails: ApiPermissionDetailsSchema.optional(), // API 类型的权限详情
  menuDetails: MenuPermissionDetailsSchema.optional(), // MENU 类型的权限详情
  dataDetails: DataPermissionDetailsSchema.optional(), // DATA 类型的权限详情
}).refine(data => {
  // 校验逻辑：根据权限类型，确保对应的详情对象已提供
  if (data.type === 'API' && !data.apiDetails) {
    return false;
  }
  if (data.type === 'MENU' && !data.menuDetails) {
    return false;
  }
  if (data.type === 'DATA' && !data.dataDetails) {
    return false;
  }
  return true;
}, {
  message: 'Type-specific details are required for the selected permission type.',
  // 根据实际情况，可以将 path 指向更具体的字段，例如 ['apiDetails']
  // 但由于 Zod 的限制，通常指向触发校验的字段或共同的父级字段
  path: ['type'],
});


// POST /api/permissions - 创建新权限 (已重构)
async function createPermission(request: NextRequest, authContext: AuthContext) {
  try {
    const body = await request.json();
    const validationResult = CreatePermissionSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: validationResult.error.flatten() }, { status: 400 });
    }

    const { name, displayName, description, resource, action, type, apiDetails, menuDetails, dataDetails } = validationResult.data;

    // 检查权限名称是否已存在 (name 是新的唯一标识符)
    const existingPermission = await prisma.permission.findUnique({
      where: { name },
    });

    if (existingPermission) {
      await AuthorizationUtils.logAuditEvent({
        userId: authContext.user_id,
        action: 'permission_create_failed_duplicate',
        resource: `permission:${name}`, // 使用新的 name 字段
        success: false,
        errorMessage: 'Permission name already exists',
        ipAddress: request.ip || request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return NextResponse.json({ error: 'Permission name already exists' }, { status: 409 });
    }

    // 使用 Prisma 事务确保数据一致性：
    // 1. 创建核心 Permission 记录
    // 2. 根据 type 创建对应的详细权限记录 (ApiPermission, MenuPermission, or DataPermission)
    const newPermission = await prisma.$transaction(async (tx) => {
      const permission = await tx.permission.create({
        data: {
          name,
          displayName,
          description,
          type,
          resource,
          action,
          // createdBy: authContext.user_id, // 如果有 createdBy 字段
        },
      });

      // 根据权限类型，创建关联的详细信息记录
      if (type === 'API' && apiDetails) {
        await tx.apiPermission.create({
          data: {
            permissionId: permission.id,
            ...apiDetails,
          },
        });
      } else if (type === 'MENU' && menuDetails) {
        await tx.menuPermission.create({
          data: {
            permissionId: permission.id,
            ...menuDetails,
          },
        });
      } else if (type === 'DATA' && dataDetails) {
        await tx.dataPermission.create({
          data: {
            permissionId: permission.id,
            ...dataDetails,
          },
        });
      }
      return permission; // 返回创建的核心权限对象
    });

    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'permission_created',
      resource: `permission:${newPermission.id}`, // 使用新权限的 ID
      success: true,
      metadata: { permissionName: newPermission.name, displayName: newPermission.displayName, type: newPermission.type }, // 更新 metadata
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    // 返回创建的核心权限对象，客户端可以根据需要再查询详情
    return NextResponse.json(newPermission, { status: 201 });

  } catch (error) {
    console.error('Error creating permission:', error);
    // 确保记录审计日志时 authContext.user_id 可用
    const userIdForAudit = authContext && authContext.user_id ? authContext.user_id : 'system';
    await AuthorizationUtils.logAuditEvent({
      userId: userIdForAudit,
      action: 'permission_create_failed_exception',
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error while creating permission',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to create permission' }, { status: 500 });
  }
}

// GET /api/permissions - 列出所有权限 (已重构)
async function listPermissions(request: NextRequest, authContext: AuthContext) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    // 新增的筛选条件
    const type = searchParams.get('type') as PermissionType | null;
    const resourceQuery = searchParams.get('resource'); // 沿用之前的 resource 查询参数名
    const actionQuery = searchParams.get('action'); // 沿用之前的 action 查询参数名
    const nameQuery = searchParams.get('name'); // 按权限名称筛选
    const displayNameQuery = searchParams.get('displayName'); // 按显示名称筛选

    // 更新排序字段，确保它们在 Permission 模型中存在
    const validSortFields = ['name', 'displayName', 'type', 'resource', 'action', 'createdAt', 'updatedAt'];
    let sortBy = searchParams.get('sortBy') || 'name'; // 默认按 name 排序
    if (!validSortFields.includes(sortBy)) {
      sortBy = 'name'; // 如果提供的 sortBy 无效，则重置为默认值
    }
    const sortOrder = searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc'; // 默认为 asc

    const skip = (page - 1) * limit;
    
    // 构建查询条件
    const whereClause: any = {};
    if (type) whereClause.type = type;
    if (resourceQuery) whereClause.resource = { contains: resourceQuery, mode: 'insensitive' };
    if (actionQuery) whereClause.action = { contains: actionQuery, mode: 'insensitive' };
    if (nameQuery) whereClause.name = { contains: nameQuery, mode: 'insensitive' };
    if (displayNameQuery) whereClause.displayName = { contains: displayNameQuery, mode: 'insensitive' };

    // 数据获取逻辑：
    // 查询核心 Permission 记录，并根据其类型包含关联的详细信息
    // 这种方式会为每条记录都尝试包含所有类型的详情，客户端需要根据 type 字段来选用对应的详情对象
    // 对于特定类型的查询，可以优化为只 include 对应类型的详情
    const permissions = await prisma.permission.findMany({
      where: whereClause,
      include: {
        apiPermission: true,   // 包含 API 权限详情
        menuPermission: true,  // 包含菜单权限详情
        dataPermission: true,  // 包含数据权限详情
      },
      take: limit,
      skip: skip,
      orderBy: {
        [sortBy]: sortOrder,
      },
    });

    const totalPermissions = await prisma.permission.count({ where: whereClause });

    // 构造返回数据，将核心权限信息和其特定类型的详情组合起来
    // Prisma 的 include 会自动将关联数据嵌套，所以这里通常不需要额外处理 `permissions` 对象
    return NextResponse.json({
      data: permissions, // permissions 数组已包含嵌套的详情
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalPermissions / limit),
        totalItems: totalPermissions,
      },
    }, { status: 200 });

  } catch (error) {
    console.error('Error listing permissions:', error);
    // 确保记录审计日志时 authContext.user_id 可用
    // 注意: list 操作通常不直接记录审计日志，除非有特定需求或发生异常
    // 此处仅为示例，实际中可能不需要对列表操作的常规错误进行审计
    const userIdForAudit = authContext && authContext.user_id ? authContext.user_id : 'system';
     await AuthorizationUtils.logAuditEvent({
       userId: userIdForAudit,
       action: 'permission_list_failed_exception',
       success: false,
       errorMessage: error instanceof Error ? error.message : 'Unknown error while listing permissions',
       ipAddress: request.ip || request.headers.get('x-forwarded-for'),
       userAgent: request.headers.get('user-agent'),
     });
    return NextResponse.json({ error: 'Failed to list permissions' }, { status: 500 });
  }
}

// 应用权限中间件。用户需要 'system:permission:manage' 权限 (示例，具体权限标识符应更新为新格式)
// 注意: 这里的 'system:permission:manage' 权限标识符可能需要根据新的命名规范 (如 'permission:manage:system') 进行调整
export const POST = withAuth(createPermission, { requiredPermissions: ['system:permission:manage'] });
export const GET = withAuth(listPermissions, { requiredPermissions: ['system:permission:manage'] });
