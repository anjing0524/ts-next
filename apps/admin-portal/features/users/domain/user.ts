import { z } from 'zod';
// 从类型定义导入单一权威的 User 类型（确保全应用一致性）
import type { User, Role as PrismaRole } from '@/types/auth';

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
export interface PaginatedResponse<T> {
  data: T[];
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
export const CreateUserSchema = z.object({
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

// 重新导出类型（从 types/auth 获取，以支持从 './user' 导入）
export type Role = PrismaRole;
export type { User };
