// app/api/v2/permissions/schemas.ts
import { z } from 'zod';
import { PermissionType } from '@prisma/client'; // Import enum from Prisma client

/**
 * Zod schema for a single Permission response.
 * 用于API响应中表示单个权限对象。
 */
export const permissionResponseSchema = z.object({
  id: z.string().cuid(),
  name: z.string().describe("权限的唯一编码名称 (Unique coded name for the permission, e.g., users:create)"),
  displayName: z.string().describe("权限的显示名称 (Display name for the permission)"),
  description: z.string().nullable().optional().describe("权限的详细描述 (Detailed description of the permission)"),
  resource: z.string().describe("权限关联的资源 (Resource associated with the permission, e.g., 'user', 'article')"),
  action: z.string().describe("权限允许的操作 (Action allowed by the permission, e.g., 'create', 'read', 'update', 'delete')"),
  type: z.nativeEnum(PermissionType).describe("权限类型 (Permission type: API, MENU, DATA)"),
  isActive: z.boolean().describe("权限是否激活 (Is the permission active)"),
  createdAt: z.date().describe("创建时间 (Creation timestamp)"), // Or z.string().datetime()
  updatedAt: z.date().describe("最后更新时间 (Last update timestamp)"), // Or z.string().datetime()
  // isSystemPermission: z.boolean().optional().describe("是否为系统预置权限，不可删除/修改 (Is it a system predefined permission, non-deletable/modifiable)"), // Example if such a field exists
});
export type PermissionResponse = z.infer<typeof permissionResponseSchema>;

/**
 * Zod schema for listing Permissions query parameters (GET /api/v2/permissions).
 * 支持分页、按名称/资源/操作/类型筛选。
 */
export const permissionListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).optional(),
  pageSize: z.coerce.number().int().positive().default(10).optional(),
  name: z.string().optional().describe("按权限名称筛选 (Filter by permission name, contains)"),
  resource: z.string().optional().describe("按资源筛选 (Filter by resource, contains)"),
  action: z.string().optional().describe("按操作筛选 (Filter by action, contains)"),
  type: z.nativeEnum(PermissionType).optional().describe("按类型筛选 (Filter by type)"),
  isActive: z.enum(['true', 'false']).optional().transform(val => val === 'true' ? true : (val === 'false' ? false : undefined)),
  sortBy: z.string().default('name').optional().describe("排序字段 (Sort by field, e.g., name, resource, createdAt)"),
  sortOrder: z.enum(['asc', 'desc']).default('asc').optional().describe("排序顺序 (Sort order: asc, desc)"),
});
export type PermissionListQuery = z.infer<typeof permissionListQuerySchema>;

/**
 * Zod schema for the paginated list of Permissions response.
 * 包含权限列表和分页信息。
 */
export const permissionListResponseSchema = z.object({
  permissions: z.array(permissionResponseSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});
export type PermissionListResponse = z.infer<typeof permissionListResponseSchema>;

/**
 * Zod schema for creating a Permission (POST /api/v2/permissions).
 * 权限的创建通常是受控的，可能只通过seed脚本进行。如果允许API创建，则使用此schema。
 */
export const permissionCreateSchema = z.object({
  name: z.string().min(3, "权限名称至少需要3个字符").max(100, "权限名称长度不能超过100个字符")
    .regex(/^[a-zA-Z0-9_:-]+$/, "权限名称只能包含字母、数字、下划线、冒号和连字符"),
  displayName: z.string().min(1, "显示名称不能为空").max(100),
  description: z.string().max(500).optional().nullable(),
  resource: z.string().min(1, "资源不能为空").max(100),
  action: z.string().min(1, "操作不能为空").max(100),
  type: z.nativeEnum(PermissionType).default(PermissionType.API),
  isActive: z.boolean().default(true).optional(),
  // isSystemPermission: z.boolean().default(false).optional(),
});
export type PermissionCreatePayload = z.infer<typeof permissionCreateSchema>;

/**
 * Zod schema for updating a Permission (PUT/PATCH /api/v2/permissions/[permissionId]).
 * 通常，权限的 `name`, `resource`, `action`, `type` 不应更改，因为它们定义了权限的本质。
 * 主要可更新的是 `displayName`, `description`, `isActive`.
 */
export const permissionUpdateSchema = z.object({
  displayName: z.string().min(1, "显示名称不能为空").max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  // Potentially other fields like type if they are mutable, but core fields (name, resource, action) usually aren't.
}).strict("请求体包含不允许更新的字段 (Request body includes fields not allowed for update)");
export type PermissionUpdatePayload = z.infer<typeof permissionUpdateSchema>;

export const permissionPatchSchema = permissionUpdateSchema.partial();
export type PermissionPatchPayload = z.infer<typeof permissionPatchSchema>;
