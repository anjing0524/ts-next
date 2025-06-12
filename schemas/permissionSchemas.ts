import { PermissionType, HttpMethod } from '@prisma/client';
import { z } from 'zod';

export const PermissionTypeEnum = z.nativeEnum(PermissionType);
export const HttpMethodEnum = z.nativeEnum(HttpMethod);

export const ApiPermissionDetailsSchema = z.object({
  httpMethod: HttpMethodEnum,
  endpoint: z.string().min(1, 'Endpoint is required').max(255),
  rateLimit: z.number().int().positive().optional(),
});

export const MenuPermissionDetailsSchema = z.object({
  menuId: z.string().min(1, 'Menu ID is required').max(100),
});

export const DataPermissionDetailsSchema = z.object({
  tableName: z.string().min(1, 'Table name is required').max(100),
  columnName: z.string().min(1, 'Column name is required').max(100).optional(),
  conditions: z.string().max(1000).optional(),
});
