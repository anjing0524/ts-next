import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { withAuth, AuthContext } from '@/lib/auth/middleware'; // Assuming this middleware handles auth and permissions
import { AuthorizationUtils } from '@/lib/auth/oauth2';
import { prisma } from '@/lib/prisma';

// Schema for creating a new role (角色创建的校验 Schema)
const CreateRoleSchema = z.object({
  // 角色唯一名称 (英文、数字、下划线)
  name: z
    .string()
    .min(3, 'Role name must be at least 3 characters')
    .max(50)
    .regex(
      /^[a-z0-9_]+$/,
      'Role name can only contain lowercase letters, numbers, and underscores'
    ),
  // 角色显示名称 (用于 UI 展示)
  displayName: z.string().min(1, 'Display name is required').max(100),
  // 角色描述 (可选)
  description: z.string().max(255).optional(),
  // isActive 字段用于控制角色是否激活，可以在创建时设置，或依赖 Prisma schema 的默认值
  isActive: z.boolean().optional().default(true),
});

// POST /api/roles - 创建新角色
async function createRole(request: NextRequest, authContext: AuthContext) {
  const body = await request.json();
  // 使用 Zod Schema 校验请求体. .parse will throw ZodError if validation fails.
  const { name, displayName, description, isActive } = CreateRoleSchema.parse(body);

  // 检查角色名称是否已存在 (name 是唯一标识符)
  const existingRole = await prisma.role.findUnique({
    where: { name },
  });
  if (existingRole) {
    // 审计日志 for "role_create_failed_duplicate" is removed.
    // handleApiError will log the ApiError.
    throw new ApiError(409, 'Role name already exists', 'ROLE_NAME_CONFLICT', { name });
  }

  // parentId 和 isSystem 字段已从 Schema 和 Role 模型中移除，相关逻辑不再需要

  // 创建角色
  const newRole = await prisma.role.create({
    data: {
      name,
      displayName,
      description,
      isActive, // 根据 CreateRoleSchema 中的定义，可以是 true/false 或依赖 schema 默认值
      // createdBy: authContext.user_id, // 如果 Role 模型中有 createdBy 字段
    },
  });

  // 记录审计日志：角色创建成功
  await AuthorizationUtils.logAuditEvent({
    userId: authContext.user_id,
    action: 'role_created',
    resource: `role:${newRole.id}`,
    success: true,
    metadata: {
      roleName: newRole.name,
      displayName: newRole.displayName,
      isActive: newRole.isActive,
    },
    ipAddress: request.ip || request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  });

  return NextResponse.json(newRole, { status: 201 });
}

// GET /api/roles - 列出所有角色
async function listRoles() {
  // TODO: 实现分页、筛选、排序功能
  // 例如: /api/roles?page=1&limit=10&sortBy=name&sortOrder=asc&isActive=true&search=admin
  const roles = await prisma.role.findMany({
    // where: { isActive: true }, // 示例：可以添加基于 isActive 的筛选
    include: {
      // _count: { select: { userRoles: true, rolePermissions: true } }, // 示例：包含用户和权限计数
    },
    orderBy: {
      name: 'asc', // 默认按名称升序排序
    },
  });

  // 列表操作通常不记录单独的成功审计日志，除非有特殊需求。
  // 访问控制应由中间件和路由权限配置保证。

  return NextResponse.json(roles, { status: 200 });
}

// 应用认证中间件。用户需要 'system:role:manage' 权限 (示例，具体权限标识符应更新为新格式)
// 注意: 这里的 'system:role:manage' 权限标识符可能需要根据新的权限命名规范进行调整
export const POST = withErrorHandler(
  withAuth(createRole, { requiredPermissions: ['system:role:manage'] })
);
export const GET = withErrorHandler(
  withAuth(listRoles, { requiredPermissions: ['system:role:manage'] })
); // 或更细粒度的读取权限 'system:role:read'
