// app/api/v2/users/schemas.ts
import { z } from 'zod';

/**
 * Zod schema for password policy.
 * Defines complexity requirements for user passwords.
 */
export const passwordPolicySchema = z.string()
  .min(8, "密码长度至少为8位 (Password must be at least 8 characters long)")
  .max(64, "密码长度最多为64位 (Password must be at most 64 characters long)")
  .regex(/[A-Z]/, "密码必须包含至少一个大写字母 (Password must contain at least one uppercase letter)")
  .regex(/[a-z]/, "密码必须包含至少一个小写字母 (Password must contain at least one lowercase letter)")
  .regex(/[0-9]/, "密码必须包含至少一个数字 (Password must contain at least one number)")
  .regex(/[^A-Za-z0-9]/, "密码必须包含至少一个特殊字符 (Password must contain at least one special character)");

/**
 * Zod schema for the user creation request payload (POST /api/v2/users).
 */
export const userCreatePayloadSchema = z.object({
  username: z.string().min(3, "用户名长度至少为3位 (Username must be at least 3 characters long)"),
  password: passwordPolicySchema,
  email: z.string().email("无效的电子邮件地址 (Invalid email address)").optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  displayName: z.string().optional().nullable(),
  avatar: z.string().url("头像URL格式无效 (Invalid URL format for avatar)").optional().nullable(),
  // phone: z.string().regex(/^\+[1-9]\d{1,14}$/, "无效的电话号码格式 (Invalid phone number format)").optional().nullable(), // Example, if phone is added
  organization: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  // workLocation: z.string().optional().nullable(), // Example, if needed
  isActive: z.boolean().default(true).optional(),
  mustChangePassword: z.boolean().default(true).optional(),
});
export type UserCreatePayload = z.infer<typeof userCreatePayloadSchema>;


/**
 * Zod schema for user list query parameters (GET /api/v2/users).
 */
export const userListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).optional(),
  pageSize: z.coerce.number().int().positive().default(10).optional(), // Default from route, can be adjusted
  username: z.string().optional(),
  email: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional().transform(val => val === 'true' ? true : (val === 'false' ? false : undefined)),
  sortBy: z.string().default('createdAt').optional(), // Default from route
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(), // Default from route
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

/**
 * Zod schema for the user update request payload (PUT /api/v2/users/[userId]).
 * For PUT, all fields available for update are often expected, or treated as "replace".
 * However, this schema allows partial updates reflecting the current route implementation,
 * but explicitly disallows password changes via this method.
 * Username changes are also typically disallowed or handled with extreme care due to being an identifier.
 */
export const userUpdatePayloadSchema = z.object({
  // username: z.string().min(3, "用户名长度至少为3位").optional(), // Username typically not updatable or handled separately
  email: z.string().email("无效的电子邮件地址 (Invalid email address)").optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  displayName: z.string().optional().nullable(),
  avatar: z.string().url("头像URL格式无效 (Invalid URL format for avatar)").optional().nullable(),
  organization: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
  // emailVerified: z.boolean().optional(), // Admin might set this
  // phoneVerified: z.boolean().optional(), // Admin might set this
}).strict("请求体包含不允许更新的字段 (Request body includes fields not allowed for update via PUT)");
export type UserUpdatePayload = z.infer<typeof userUpdatePayloadSchema>;


/**
 * Zod schema for the user partial update request payload (PATCH /api/v2/users/[userId]).
 * All fields are optional. Includes password updates.
 */
export const userPatchPayloadSchema = z.object({
    // username: z.string().min(3, "用户名长度至少为3位").optional(), // Username modification disallowed in current PATCH handler
    email: z.string().email("无效的电子邮件地址 (Invalid email address)").optional().nullable(),
    password: passwordPolicySchema.optional(), // Password can be updated, uses the defined policy
    firstName: z.string().optional().nullable(),
    lastName: z.string().optional().nullable(),
    displayName: z.string().optional().nullable(),
    avatar: z.string().url("头像URL格式无效 (Invalid URL format for avatar)").optional().nullable(),
    organization: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
    mustChangePassword: z.boolean().optional(),
    // emailVerified: z.boolean().optional(),
    // phoneVerified: z.boolean().optional(),
  }).strict("请求体包含不允许更新的字段 (Request body includes fields not allowed for update via PATCH)");
export type UserPatchPayload = z.infer<typeof userPatchPayloadSchema>;

/**
 * Zod schema for assigning roles to a user (POST /api/v2/users/[userId]/roles).
 * Expects an array of role IDs.
 */
export const userRoleAssignmentPayloadSchema = z.object({
  roleIds: z.array(z.string().cuid({ message: "每个角色ID必须是有效的CUID (Each role ID must be a valid CUID)" }), {
    required_error: "角色ID列表roleIds是必需的 (Role IDs array 'roleIds' is required)",
    invalid_type_error: "roleIds必须是字符串ID的数组 (roleIds must be an array of string IDs)",
  }).min(1, "至少需要提供一个角色ID (At least one role ID must be provided)"),
});
export type UserRoleAssignmentPayload = z.infer<typeof userRoleAssignmentPayloadSchema>;

/**
 * Zod schema for an individual role item in the list response for user roles.
 */
export const userRoleListItemSchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  displayName: z.string().nullable(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  // assignedAt: z.date().optional(), // If you include assignment-specific data
});

/**
 * Zod schema for the response of listing user roles (GET /api/v2/users/[userId]/roles).
 */
export const userRoleListResponseSchema = z.object({
  roles: z.array(userRoleListItemSchema),
});
export type UserRoleListResponse = z.infer<typeof userRoleListResponseSchema>;


// etc.
