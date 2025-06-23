// app/api/v2/clients/schemas.ts
import { z } from 'zod';
import { ClientType, Prisma } from '@prisma/client'; // Import ClientType for enum

/**
 * Zod schema for creating an OAuth Client (POST /api/v2/clients).
 */
export const clientCreateSchema = z.object({
  clientId: z.string().min(3, "客户端ID至少需要3个字符 (clientId must be at least 3 characters long)").max(100, "客户端ID长度不超过100 (clientId must be at most 100 characters long)").optional(),
  clientName: z.string().min(1, "客户端名称不能为空 (clientName is required)").max(100, "客户端名称长度不超过100 (clientName must be at most 100 characters long)"),
  clientDescription: z.string().max(500, "客户端描述长度不超过500 (clientDescription must be at most 500 characters long)").optional().nullable(),
  clientType: z.enum([ClientType.PUBLIC, ClientType.CONFIDENTIAL], {
    errorMap: () => ({ message: "客户端类型必须是 PUBLIC 或 CONFIDENTIAL (clientType must be PUBLIC or CONFIDENTIAL)" })
  }),
  clientSecret: z.string().min(8, "机密客户端密钥至少需要8个字符 (clientSecret must be at least 8 characters long for confidential clients)").max(100).optional(),
  redirectUris: z.array(z.string().url("每个重定向URI都必须是有效的URL (Each redirectUri must be a valid URL)")).min(1, "至少需要一个重定向URI (At least one redirectUri is required)"),
  allowedScopes: z.array(z.string().min(1, "作用域不能为空 (Scope cannot be empty)")).default([]),
  grantTypes: z.array(z.string().min(1, "授权类型不能为空 (Grant type cannot be empty)")).min(1, "至少需要一个授权类型 (At least one grantType is required)"),
  responseTypes: z.array(z.string().min(1, "响应类型不能为空 (Response type cannot be empty)")).default(['code']),
  accessTokenLifetime: z.number().int().positive("访问令牌生命周期必须是正整数 (Access token lifetime must be a positive integer)").optional().nullable(),
  refreshTokenLifetime: z.number().int().positive("刷新令牌生命周期必须是正整数 (Refresh token lifetime must be a positive integer)").optional().nullable(),
  authorizationCodeLifetime: z.number().int().positive("授权码生命周期必须是正整数 (Authorization code lifetime must be a positive integer)").optional().nullable(),
  requirePkce: z.boolean().default(true).optional(),
  requireConsent: z.boolean().default(true).optional(),
  logoUri: z.string().url("logoUri必须是有效的URL (logoUri must be a valid URL)").optional().nullable(),
  policyUri: z.string().url("policyUri必须是有效的URL (policyUri must be a valid URL)").optional().nullable(),
  tosUri: z.string().url("tosUri必须是有效的URL (tosUri must be a valid URL)").optional().nullable(),
  jwksUri: z.string().url("jwksUri必须是有效的URL (jwksUri must be a valid URL for private_key_jwt clients)").optional().nullable(),
  tokenEndpointAuthMethod: z.enum(['client_secret_basic', 'client_secret_post', 'private_key_jwt', 'none'], {
      errorMap: () => ({ message: "无效的令牌端点认证方法 (Invalid token endpoint authentication method)"})
  }).default('client_secret_basic').optional(),
  ipWhitelist: z.array(z.string().min(1, "IP地址/CIDR不能为空 (IP Address/CIDR cannot be empty)")).optional().nullable(),
  strictRedirectUriMatching: z.boolean().default(true).optional(),
  allowLocalhostRedirect: z.boolean().default(false).optional(),
  requireHttpsRedirect: z.boolean().default(true).optional(),
  isActive: z.boolean().default(true).optional(),
}).refine(data => {
  if (data.clientType === ClientType.CONFIDENTIAL &&
      data.tokenEndpointAuthMethod !== 'none' &&
      data.tokenEndpointAuthMethod !== 'private_key_jwt' &&
      !data.clientSecret) {
    return false;
  }
  return true;
}, {
  message: "对于使用密钥认证的机密客户端，clientSecret是必需的 (clientSecret is required for confidential clients using secret-based authentication)",
  path: ["clientSecret"],
}).refine(data => {
  if (data.tokenEndpointAuthMethod === 'private_key_jwt' && !data.jwksUri) {
    return false;
  }
  return true;
}, {
  message: "private_key_jwt认证方法需要jwksUri (jwksUri is required for tokenEndpointAuthMethod 'private_key_jwt')",
  path: ["jwksUri"],
}).refine(data => {
  if (data.clientType === ClientType.PUBLIC && data.tokenEndpointAuthMethod !== 'none') {
    return false;
  }
  return true;
}, {
  message: "公共客户端必须使用 'none' 作为认证方法 (Public clients must use 'none' as tokenEndpointAuthMethod)",
  path: ["tokenEndpointAuthMethod"],
});
export type ClientCreatePayload = z.infer<typeof clientCreateSchema>;

/**
 * Zod schema for listing OAuth Clients query parameters (GET /api/v2/clients).
 */
export const clientListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).optional(),
  pageSize: z.coerce.number().int().positive().default(10).optional(),
  clientName: z.string().optional(),
  clientId: z.string().optional(),
  clientType: z.enum([ClientType.PUBLIC, ClientType.CONFIDENTIAL]).optional(),
  sortBy: z.string().default('createdAt').optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
});
export type ClientListQuery = z.infer<typeof clientListQuerySchema>;


/**
 * Zod schema for the client response payload.
 * Fields like clientSecret (hashed) are omitted.
 * Array fields are correctly typed as arrays.
 */
export const clientResponseSchema = z.object({
    id: z.string(),
    clientId: z.string(),
    clientName: z.string(),
    clientDescription: z.string().nullable().optional(),
    clientType: z.enum([ClientType.PUBLIC, ClientType.CONFIDENTIAL]),
    redirectUris: z.array(z.string().url()),
    allowedScopes: z.array(z.string()),
    grantTypes: z.array(z.string()),
    responseTypes: z.array(z.string()),
    accessTokenLifetime: z.number().int().positive().nullable().optional(),
    refreshTokenLifetime: z.number().int().positive().nullable().optional(),
    authorizationCodeLifetime: z.number().int().positive().nullable().optional(),
    requirePkce: z.boolean(),
    requireConsent: z.boolean(),
    logoUri: z.string().url().nullable().optional(),
    policyUri: z.string().url().nullable().optional(),
    tosUri: z.string().url().nullable().optional(),
    jwksUri: z.string().url().nullable().optional(),
    tokenEndpointAuthMethod: z.string(), // Consider enum if all methods are fixed
    ipWhitelist: z.array(z.string()).nullable().optional(),
    strictRedirectUriMatching: z.boolean(),
    allowLocalhostRedirect: z.boolean(),
    requireHttpsRedirect: z.boolean(),
    isActive: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
    // Exclude clientSecret for responses
});
export type ClientResponse = z.infer<typeof clientResponseSchema>;

/**
 * Zod schema for the client list response (paginated).
 */
export const clientListResponseSchema = z.object({
    clients: z.array(clientResponseSchema),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
});
export type ClientListResponse = z.infer<typeof clientListResponseSchema>;

// Schemas for updating a client (PUT/PATCH) will be added here.
// Schema for regenerating client secret response.
export const clientSecretRegenerationResponseSchema = z.object({
    clientId: z.string(),
    newClientSecret: z.string(),
    message: z.string(),
});
export type ClientSecretRegenerationResponse = z.infer<typeof clientSecretRegenerationResponseSchema>;

/**
 * Zod schema for updating an OAuth Client (PUT /api/v2/clients/[clientId]).
 * All fields that can be updated. For PUT, typically all settable fields are expected.
 * This schema reflects a "flexible PUT" where only provided fields are updated.
 * `clientId` and `clientSecret` are not updatable via this schema.
 */
export const clientUpdateSchema = clientCreateSchema.omit({
  clientId: true, // clientId is part of the path param, not body
  clientSecret: true, // clientSecret is handled via a dedicated endpoint or not at all here
}).partial().extend({
  // Fields that might have different validation or be required in PUT vs create
  // For example, if clientName was optional in create but required to exist for update:
  // clientName: z.string().min(1, "客户端名称不能为空").max(100).optional(), // Keep optional if flexible PUT
}).strict("请求体包含不允许更新的字段 (Request body includes fields not allowed for update via PUT/PATCH)");
export type ClientUpdatePayload = z.infer<typeof clientUpdateSchema>;


/**
 * Zod schema for partially updating an OAuth Client (PATCH /api/v2/clients/[clientId]).
 * All fields are optional.
 * `clientId` and `clientSecret` are not updatable via this schema.
 */
export const clientPatchSchema = clientCreateSchema.omit({
  clientId: true,
  clientSecret: true,
}).partial().strict("请求体包含不允许更新的字段 (Request body includes fields not allowed for update via PUT/PATCH)");
export type ClientPatchPayload = z.infer<typeof clientPatchSchema>;
