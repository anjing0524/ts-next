import { z } from 'zod';
// 从应用层类型导入
import type { OAuthClient } from '@/types/auth';

// 重新导出 OAuthClient
export type { OAuthClient };

// 本地定义客户端类型（不依赖 Prisma）
export enum ClientType {
  CONFIDENTIAL = 'CONFIDENTIAL',
  PUBLIC = 'PUBLIC',
}

// 客户端类型的 Zod Schema
export const ClientTypeSchema = z.nativeEnum(ClientType);

// 基础的 Zod Schema，反映了 Prisma 模型
export const OAuthClientSchema = z.object({
  id: z.string().cuid(),
  clientId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  redirectUris: z.string(), // Stored as JSON string
  grantTypes: z.string(), // Stored as JSON string
  responseTypes: z.string(), // Stored as JSON string
  allowedScopes: z.string(), // Stored as JSON string
  clientType: ClientTypeSchema,
  tokenEndpointAuthMethod: z.string(),
  requirePkce: z.boolean(),
  requireConsent: z.boolean(),
  isActive: z.boolean(),
  accessTokenTtl: z.number().int(),
  refreshTokenTtl: z.number().int(),
  // ... other fields from prisma schema
});

// 用于表单验证和API输入的更友好的 Schema
const jsonStringToArray = (defaultVal: string[] = []) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : defaultVal;
        } catch (e) {
          return val
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }
      return val ?? defaultVal;
    })
    .pipe(z.array(z.string()));

export const ClientFormSchema = z.object({
  name: z.string().min(1, '客户端名称不能为空'),
  description: z.string().optional(),
  clientType: ClientTypeSchema,
  redirectUris: jsonStringToArray(),
  grantTypes: jsonStringToArray(['authorization_code', 'refresh_token']),
  allowedScopes: jsonStringToArray(['openid', 'profile']),
  accessTokenTtl: z.coerce.number().int().positive('必须是正整数'),
  refreshTokenTtl: z.coerce.number().int().positive('必须是正整数'),
  requirePkce: z.boolean().default(true),
  requireConsent: z.boolean().default(true),
});

export type ClientFormInput = z.infer<typeof ClientFormSchema>;
