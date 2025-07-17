// 角色服务层，负责角色相关业务逻辑
// @file apps/oauth-service/app/services/role-service.ts
import { Prisma, Role } from '@prisma/client';
import { prisma } from '@repo/database';

/**
 * 查询角色列表，支持分页、筛选、排序
 * @param params 查询参数
 */
export async function listRoles(params: {
  page: number;
  pageSize: number;
  name?: string;
  isActive?: boolean;
}) {
  const { page, pageSize, name, isActive } = params;
  const where: Prisma.RoleWhereInput = {};
  if (name) where.name = { contains: name };
  if (typeof isActive === 'boolean') where.isActive = isActive;

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
  return {
    items: formattedRoles,
    pagination: {
      page,
      pageSize,
      totalItems: totalRoles,
      totalPages: Math.ceil(totalRoles / pageSize),
    },
  };
}

/**
 * 创建新角色
 * @param data 角色数据
 */
export async function createRole(data: {
  name: string;
  displayName: string;
  description?: string | null;
  isActive?: boolean;
  permissionIds?: string[];
}) {
  const { name, permissionIds = [], ...roleData } = data;
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
  return {
    ...newRoleData,
    permissions: rolePermissions.map(rp => rp.permission),
  };
} 