import { z } from 'zod';

export const ClientType = z.enum(['PUBLIC', 'CONFIDENTIAL']);

// OAuth Client creation schema
export const CreateOAuthClientSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  clientType: ClientType,
  redirectUris: z.array(z.string().url()).min(1),
  grantTypes: z.array(z.string()).min(1),
  responseTypes: z.array(z.string()).min(1),
  allowedScopes: z.array(z.string()).min(1),
  
  // Optional fields
  logoUri: z.string().url().optional(),
  policyUri: z.string().url().optional(),
  tosUri: z.string().url().optional(),
  jwksUri: z.string().url().optional(),
  
  // Security settings
  tokenEndpointAuthMethod: z.enum([
    'client_secret_basic',
    'client_secret_post',
    'private_key_jwt',
    'none'
  ]).default('client_secret_basic'),
  requirePkce: z.boolean().default(true),
  requireConsent: z.boolean().default(true),
  strictRedirectUriMatching: z.boolean().default(true),
  allowLocalhostRedirect: z.boolean().default(false),
  requireHttpsRedirect: z.boolean().default(true),
  
  // Token settings
  accessTokenTtl: z.number().int().positive().default(3600),
  refreshTokenTtl: z.number().int().positive().default(2592000),
  authorizationCodeLifetime: z.number().int().positive().default(600),
  
  // IP restrictions
  ipWhitelist: z.array(z.string()).optional(),
});

// OAuth Client update schema (allows partial updates)
export const UpdateOAuthClientSchema = CreateOAuthClientSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// Query parameters schema for listing clients
export const ListClientsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  isActive: z.coerce.boolean().optional(),
  clientType: ClientType.optional(),
  search: z.string().optional(),
});

// Response schemas
export const OAuthClientResponseSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  clientType: ClientType,
  redirectUris: z.array(z.string()),
  grantTypes: z.array(z.string()),
  responseTypes: z.array(z.string()),
  allowedScopes: z.array(z.string()),
  logoUri: z.string().nullable(),
  policyUri: z.string().nullable(),
  tosUri: z.string().nullable(),
  jwksUri: z.string().nullable(),
  tokenEndpointAuthMethod: z.string(),
  requirePkce: z.boolean(),
  requireConsent: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  accessTokenTtl: z.number(),
  refreshTokenTtl: z.number(),
  authorizationCodeLifetime: z.number(),
  strictRedirectUriMatching: z.boolean(),
  allowLocalhostRedirect: z.boolean(),
  requireHttpsRedirect: z.boolean(),
});

export const OAuthClientWithSecretSchema = OAuthClientResponseSchema.extend({
  clientSecret: z.string().optional(),
});

export const ListClientsResponseSchema = z.object({
  data: z.array(OAuthClientResponseSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

// Types
export type CreateOAuthClientInput = z.infer<typeof CreateOAuthClientSchema>;
export type UpdateOAuthClientInput = z.infer<typeof UpdateOAuthClientSchema>;
export type ListClientsQuery = z.infer<typeof ListClientsQuerySchema>;
export type OAuthClientResponse = z.infer<typeof OAuthClientResponseSchema>;
export type OAuthClientWithSecret = z.infer<typeof OAuthClientWithSecretSchema>;