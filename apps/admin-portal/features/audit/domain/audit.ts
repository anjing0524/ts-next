import { z } from 'zod';
// 从 Prisma Client 导入基础类型
import type { AuditLog as PrismaAuditLog } from '@repo/database';

// 导出领域实体类型
export type AuditLog = PrismaAuditLog;

// 审计日志实体的 Zod Schema，用于数据校验和确保类型一致性
export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.date(),
  userId: z.string().nullable(),
  actorType: z.string(),
  actorId: z.string(),
  action: z.string(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  details: z.any().nullable(), // Prisma's Json type maps to `any`
  status: z.string(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
});

// 用于筛选审计日志的 Zod Schema
export const AuditLogFilterSchema = z.object({
  search: z.string().optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  userId: z.string().cuid().optional(),
  action: z.string().optional(),
  status: z.enum(['SUCCESS', 'FAILURE', 'PENDING', 'ACCESS_DENIED']).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

export type AuditLogFilters = z.infer<typeof AuditLogFilterSchema>;
