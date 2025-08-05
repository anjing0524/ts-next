// packages/lib/src/services/user-service.ts
import { prisma } from '@repo/database';
import { excludePassword } from '@repo/lib/node';
import bcrypt from 'bcrypt';
import { Prisma, User } from '@repo/database';

/**
 * 根据用户ID获取用户详细信息，包括其角色和权限。
 */
export async function getUserDetails(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });
  if (!user) return null;
  const permissions = user.userRoles.flatMap(userRole =>
    userRole.role.rolePermissions.map(rolePermission => rolePermission.permission.name)
  );
  const userWithoutPassword = excludePassword(user);
  return {
    ...userWithoutPassword,
    permissions: [...new Set(permissions)],
  };
}

/**
 * 查询用户列表，支持分页、筛选、排序
 */
export async function listUsers(params: {
  page: number;
  pageSize: number;
  sort: string;
  filters: Partial<Pick<User, 'username' | 'organization' | 'isActive'>>;
}) {
  const { page, pageSize, sort, filters } = params;
  const where: Prisma.UserWhereInput = {};
  if (filters.username) where.username = { contains: filters.username };
  if (filters.organization) where.organization = { contains: filters.organization };
  if (typeof filters.isActive === 'boolean') where.isActive = filters.isActive;
  const [sortField, sortOrder] = sort.split(':');
  const validSortFields = ['username', 'displayName', 'createdAt', 'organization'];
  let orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };
  if (
    sortField &&
    sortOrder &&
    validSortFields.includes(sortField) &&
    ['asc', 'desc'].includes(sortOrder)
  ) {
    orderBy = { [sortField]: sortOrder as 'asc' | 'desc' };
  }
  const totalItems = await prisma.user.count({ where });
  const users = await prisma.user.findMany({
    where,
    take: pageSize,
    skip: (page - 1) * pageSize,
    orderBy,
    select: {
      id: true,
      username: true,
      displayName: true,
      organization: true,
      department: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return {
    items: users,
    pagination: {
      totalItems,
      currentPage: page,
      pageSize,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  };
}

/**
 * 创建新用户
 */
export async function createUser(data: {
  username: string;
  password: string;
  displayName?: string;
  organization?: string;
  department?: string;
}) {
  const { password, ...userData } = data;
  const passwordHash = await bcrypt.hash(password, 10);
  const newUser = await prisma.user.create({
    data: {
      ...userData,
      passwordHash,
    },
  });
  return newUser;
} 