import { z } from 'zod';
// 从 Prisma Client 导入基础类型
import type { AuditLog, AuditLogDetails } from '@/types/auth';

// 重新导出应用层类型
export type { AuditLog, AuditLogDetails };

// 审计日志详情的 Zod Schema
export const AuditLogDetailsSchema = z.record(z.unknown()).nullable();

// 审计日志实体的 Zod Schema，用于数据校验和确保类型一致性
export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string(), // ISO 8601 格式: "2025-12-02T10:30:00Z"
  userId: z.string().nullable(),
  actorType: z.string(),
  actorId: z.string(),
  action: z.string(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  details: AuditLogDetailsSchema, // 使用更具体的类型
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
  startDate: z.string().optional(), // ISO 8601 格式
  endDate: z.string().optional(), // ISO 8601 格式
});

export type AuditLogFilters = z.infer<typeof AuditLogFilterSchema>;
