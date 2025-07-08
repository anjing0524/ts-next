import { z } from 'zod';
// 从 Prisma Client 导入基础类型
import type { User as PrismaUser, Role as PrismaRole } from '@repo/database';

/**
 * 用户核心实体接口
 * 代表一个系统用户
 */
export interface User extends PrismaUser {
  // 扩展 PrismaUser，添加前端可能需要的额外字段
  // 例如，如果 PrismaUser 不包含 roles 或 permissions，可以在这里添加
  roles?: { id: string; name: string }[]; // 用户所属的角色列表
  permissions?: string[]; // 用户最终拥有的所有权限名列表
  userRoles: { roleId: string }[];
  // createdAt 和 lastLogin 已经在 PrismaUser 中，但如果需要更具体的类型，可以在这里覆盖
}

/**
 * 用户状态枚举
 */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING = 'PENDING',
}

/**
 * 用于用户管理列表的分页响应数据结构
 */
export interface PaginatedUsersResponse {
  data: User[];
  meta: {
    totalItems: number;
    itemCount: number;
    itemsPerPage: number;
    totalPages: number;
    currentPage: number;
  };
}

// 为“更新用户”的表单/API输入创建 Zod 验证 Schema
// 字段应与 prisma.schema 中的 User 模型对应
export const UpdateUserSchema = z.object({
  displayName: z.string().min(1, '显示名称不能为空').optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  organization: z.string().optional(),
  department: z.string().optional(),
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
  // 假设我们通过 ID 数组来更新角色
  roleIds: z.array(z.string().cuid('无效的角色ID')).optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

// 为“创建用户”的表单/API输入创建 Zod 验证 Schema
export const CreateUserSchema = z
  .object({
    username: z.string().min(3, '用户名至少需要3个字符'),
    password: z.string().min(8, { message: '密码至少需要8个字符。' }).optional(), // 密码在创建时可选，如果为空则后端生成随机密码
    displayName: z.string().min(1, '显示名称不能为空'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    organization: z.string().optional(),
    department: z.string().optional(),
    isActive: z.boolean().default(true),
    mustChangePassword: z.boolean().default(true),
    roleIds: z.array(z.string().cuid('无效的角色ID')).default([]),
  });

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

// 导出 Role 类型
export type Role = PrismaRole;
