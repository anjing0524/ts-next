import { z } from 'zod';
// 从 Prisma Client 导入基础类型
import type { Role as PrismaRole, Permission as PrismaPermission } from '@repo/database';

// 导出领域实体类型
export type Role = PrismaRole;
export type Permission = PrismaPermission;

// 为“更新角色”的表单/API输入创建 Zod 验证 Schema
export const UpdateRoleSchema = z.object({
  displayName: z.string().min(1, '角色显示名称不能为空').optional(),
  description: z.string().optional(),
  // 假设我们通过权限 ID 数组来更新权限
  permissionIds: z.array(z.string().cuid('无效的权限ID')).optional(),
});
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;

// 为“创建角色”的表单/API输入创建 Zod 验证 Schema
export const CreateRoleSchema = z.object({
  name: z
    .string()
    .min(3, '角色名称至少需要3个字符')
    .regex(/^[a-z_]+$/, '角色名称只能包含小写字母和下划线'),
  displayName: z.string().min(1, '角色显示名称不能为空'),
  description: z.string().optional(),
  permissionIds: z.array(z.string().cuid('无效的权限ID')).default([]),
});
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
