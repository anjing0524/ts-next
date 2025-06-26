// app/api/v2/scopes/schemas.ts
import { z } from 'zod';

/**
 * Zod schema for a single Scope response.
 * 用于API响应中表示单个OAuth作用域对象。
 */
export const scopeResponseSchema = z.object({
  id: z.string().cuid(),
  name: z
    .string()
    .describe(
      '作用域的唯一编码名称 (Unique coded name for the scope, e.g., openid, profile, user:read)'
    ),
  // displayName: z.string().optional().nullable().describe("作用域的显示名称 (Display name for the scope)"), // Not in Prisma Scope model
  description: z
    .string()
    .nullable()
    .optional()
    .describe('作用域的详细描述 (Detailed description of the scope)'),
  isPublic: z
    .boolean()
    .describe('此Scope是否对所有公开客户端可用 (Is this scope available to all public clients)'),
  isActive: z.boolean().describe('作用域是否激活 (Is the scope active)'),
  // isSystemScope: z.boolean().optional().describe("是否为系统预置作用域，不可删除/修改 (Is it a system predefined scope, non-deletable/modifiable)"), // Conceptual field
  createdAt: z.date().describe('创建时间 (Creation timestamp)'), // Or z.string().datetime()
  updatedAt: z.date().describe('最后更新时间 (Last update timestamp)'), // Or z.string().datetime()
});
export type ScopeResponse = z.infer<typeof scopeResponseSchema>;

/**
 * Zod schema for listing Scopes query parameters (GET /api/v2/scopes).
 * 支持分页、按名称筛选、按激活状态筛选。
 */
export const scopeListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).optional(),
  pageSize: z.coerce.number().int().positive().default(10).optional(),
  name: z.string().optional().describe('按作用域名称筛选 (Filter by scope name, contains)'),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  isPublic: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  sortBy: z
    .string()
    .default('name')
    .optional()
    .describe('排序字段 (Sort by field, e.g., name, createdAt)'),
  sortOrder: z
    .enum(['asc', 'desc'])
    .default('asc')
    .optional()
    .describe('排序顺序 (Sort order: asc, desc)'),
});
export type ScopeListQuery = z.infer<typeof scopeListQuerySchema>;

/**
 * Zod schema for the paginated list of Scopes response.
 * 包含作用域列表和分页信息。
 */
export const scopeListResponseSchema = z.object({
  scopes: z.array(scopeResponseSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});
export type ScopeListResponse = z.infer<typeof scopeListResponseSchema>;

/**
 * Zod schema for creating a Scope (POST /api/v2/scopes).
 * 作用域的创建通常是受控的，可能只通过seed脚本进行。如果允许API创建，则使用此schema。
 */
export const scopeCreateSchema = z.object({
  name: z
    .string()
    .min(1, '作用域名称不能为空')
    .max(100, '作用域名称长度不能超过100个字符')
    .regex(
      /^[a-zA-Z0-9_:-]+$/,
      '作用域名称格式无效 (Invalid scope name format. Allowed: letters, numbers, underscore, colon, hyphen)'
    ),
  // displayName: z.string().min(1, "显示名称不能为空").max(100).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  isPublic: z.boolean().default(false).optional(),
  isActive: z.boolean().default(true).optional(),
  // isSystemScope: z.boolean().default(false).optional(),
});
export type ScopeCreatePayload = z.infer<typeof scopeCreateSchema>;

/**
 * Zod schema for updating a Scope (PUT/PATCH /api/v2/scopes/[scopeId]).
 * 通常，作用域的 `name` (唯一标识) 不应更改。
 * 主要可更新的是 `description`, `isPublic`, `isActive`.
 */
export const scopeUpdateSchema = z
  .object({
    // name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_:-]+$/).optional(), // Typically name is immutable
    // displayName: z.string().min(1).max(100).optional().nullable(),
    description: z.string().max(500).optional().nullable(),
    isPublic: z.boolean().optional(),
    isActive: z.boolean().optional(),
    // isSystemScope: z.boolean().optional(), // Should not be updatable via API if it's a system scope
  })
  .strict('请求体包含不允许更新的字段 (Request body includes fields not allowed for update)');
export type ScopeUpdatePayload = z.infer<typeof scopeUpdateSchema>;

export const scopePatchSchema = scopeUpdateSchema.partial();
export type ScopePatchPayload = z.infer<typeof scopePatchSchema>;
