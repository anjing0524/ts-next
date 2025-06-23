// app/api/v2/roles/schemas.ts
import { z } from 'zod';

/**
 * Zod schema for creating a Role (POST /api/v2/roles).
 * 角色名称是必需的，显示名称和描述是可选的。
 */
export const roleCreateSchema = z.object({
  name: z.string().min(1, "角色名称不能为空 (Role name is required)").max(100, "角色名称长度不能超过100个字符 (Role name must be at most 100 characters)"),
  displayName: z.string().max(100, "显示名称长度不能超过100个字符 (Display name must be at most 100 characters)").optional().nullable(),
  description: z.string().max(500, "描述信息长度不能超过500个字符 (Description must be at most 500 characters)").optional().nullable(),
  isActive: z.boolean().default(true).optional(),
});
export type RoleCreatePayload = z.infer<typeof roleCreateSchema>;

/**
 * Zod schema for a single Role response.
 * 用于API响应中表示单个角色对象。
 */
export const roleResponseSchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  displayName: z.string().nullable(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(), // Or z.string().datetime() if you transform dates to strings
  updatedAt: z.date(), // Or z.string().datetime()
});
export type RoleResponse = z.infer<typeof roleResponseSchema>;

/**
 * Zod schema for listing Roles query parameters (GET /api/v2/roles).
 * 支持分页、按名称筛选、按激活状态筛选。
 */
export const roleListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).optional(),
  pageSize: z.coerce.number().int().positive().default(10).optional(),
  name: z.string().optional(), // Filter by role name (contains)
  isActive: z.enum(['true', 'false']).optional().transform(val => val === 'true' ? true : (val === 'false' ? false : undefined)),
  sortBy: z.string().default('createdAt').optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
});
export type RoleListQuery = z.infer<typeof roleListQuerySchema>;

/**
 * Zod schema for the paginated list of Roles response.
 * 包含角色列表和分页信息。
 */
export const roleListResponseSchema = z.object({
  roles: z.array(roleResponseSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});
export type RoleListResponse = z.infer<typeof roleListResponseSchema>;

/**
 * Zod schema for updating a Role (PUT /api/v2/roles/[roleId]).
 * PUT通常期望完整的资源表示，但这里允许部分更新（类似于PATCH），但名称是必需的。
 */
export const roleUpdateSchema = z.object({
  name: z.string().min(1, "角色名称不能为空 (Role name is required)").max(100).optional(), // Name might not be updatable or only in specific cases
  displayName: z.string().max(100).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
}).strict("请求体包含不允许更新的字段 (Request body includes fields not allowed for update via PUT)");
export type RoleUpdatePayload = z.infer<typeof roleUpdateSchema>;

/**
 * Zod schema for partially updating a Role (PATCH /api/v2/roles/[roleId]).
 * 所有字段都是可选的。
 */
export const rolePatchSchema = roleUpdateSchema.partial().strict("请求体包含不允许更新的字段 (Request body includes fields not allowed for update via PATCH)");
export type RolePatchPayload = z.infer<typeof rolePatchSchema>;


/**
 * Zod schema for assigning/updating permissions for a role (POST /api/v2/roles/[roleId]/permissions).
 * 期望一个权限ID的数组。
 */
export const rolePermissionAssignmentSchema = z.object({
  permissionIds: z.array(z.string().cuid({ message: "每个权限ID必须是有效的CUID (Each permission ID must be a valid CUID)" }), {
    required_error: "权限ID列表permissionIds是必需的 (Permission IDs array 'permissionIds' is required)",
    invalid_type_error: "permissionIds必须是字符串ID的数组 (permissionIds must be an array of string IDs)",
  }).min(0, "权限ID列表可以为空，表示移除所有权限 (Permission IDs array can be empty to remove all permissions)"), // Allow empty array to remove all permissions
});
export type RolePermissionAssignmentPayload = z.infer<typeof rolePermissionAssignmentSchema>;

/**
 * Zod schema for an individual permission item when listing role's permissions.
 */
export const rolePermissionListItemSchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  displayName: z.string().nullable(),
  description: z.string().nullable(),
  // assignedAt: z.date().optional(), // If you include assignment-specific data like when it was assigned to the role
});

/**
 * Zod schema for the response of listing a role's permissions (GET /api/v2/roles/[roleId]/permissions).
 */
export const rolePermissionsListResponseSchema = z.object({
  permissions: z.array(rolePermissionListItemSchema),
  total: z.number().int(),
});
export type RolePermissionsListResponse = z.infer<typeof rolePermissionsListResponseSchema>;
