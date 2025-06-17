// /api/v2/audit-logs/security-events
// 描述: 提供查询特定安全相关审计事件的功能。
// (Provides functionality to query specific security-related audit events.)

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { AuditLogQuerySchema } from '../schemas'; // Can reuse part of this for filters
import { Prisma, AuditLog } from '@prisma/client';
import { z } from 'zod';

// 定义被视为安全事件的审计日志操作类型
// (Define audit log action types considered as security events)
const SECURITY_EVENT_ACTIONS: string[] = [
  'USER_LOGIN_FAILED', 'USER_LOGIN_SUCCESS', // Login related
  'USER_PASSWORD_CHANGED', 'USER_PASSWORD_RESET_REQUEST', 'USER_PASSWORD_RESET_SUCCESS', // Password related
  'USER_ACCOUNT_LOCKED', 'USER_ACCOUNT_UNLOCKED', // Account status
  'ROLE_PERMISSION_ASSIGNED', 'ROLE_PERMISSION_REMOVED', // Permission changes
  'USER_ROLE_ASSIGNED', 'USER_ROLE_REMOVED', // Role changes
  'CLIENT_SECRET_REGENERATED', 'CLIENT_CREATED', 'CLIENT_DELETED', // Client changes
  'TOKEN_REVOKED_REFRESH', 'TOKEN_REVOKED_ACCESS', // Token revocations
  // Add other relevant actions that should be considered security events
];

// Zod Schema for security event query parameters
// 安全事件查询参数的Zod Schema
const SecurityEventsQuerySchema = AuditLogQuerySchema.extend({
  eventType: z.string().optional(), // Specific type of security event, maps to 'action' field
}).omit({ action: true }); // 'action' from AuditLogQuerySchema is replaced by 'eventType' or the predefined list


/**
 * @swagger
 * /api/v2/audit-logs/security-events:
 *   get:
 *     summary: 获取特定安全相关审计事件 (审计日志管理)
 *     description: |
 *       专门用于查询与安全相关的审计事件。
 *       如果提供了 `eventType` 参数，则按该特定事件类型筛选。
 *       否则，返回所有预定义类型的安全事件。
 *     tags: [Audit Logs API]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: eventType
 *         in: query
 *         description: 特定安全事件类型 (例如 LOGIN_FAILURE, PASSWORD_CHANGED)。如果未提供，则返回所有类型的安全事件。
 *         schema: { type: string }
 *       - name: page
 *         in: query
 *         description: 页码。
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         description: 每页数量。
 *         schema: { type: integer, default: 10 }
 *       - name: dateFrom
 *         in: query
 *         description: 开始日期时间筛选。
 *         schema: { type: string, format: date-time }
 *       - name: dateTo
 *         in: query
 *         description: 结束日期时间筛选。
 *         schema: { type: string, format: date-time }
 *       - name: userId
 *         in: query
 *         description: 按用户ID筛选。
 *         schema: { type: string, format: cuid }
 *       - name: clientId
 *         in: query
 *         description: 按客户端ID筛选。
 *         schema: { type: string, format: cuid }
 *     responses:
 *       200: { description: "成功获取安全相关审计事件列表。" } # Schema similar to GET /audit-logs
 *       400: { description: "无效的请求参数。" }
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问。" }
 */
async function getSecurityEventsHandler(request: AuthenticatedRequest) {
  const performingAdmin = request.user;
  console.log(`Admin user ${performingAdmin?.id} requesting security event audit logs.`);

  const { searchParams } = new URL(request.url);
  const queryParams: Record<string, string | undefined> = {};
  searchParams.forEach((value, key) => { queryParams[key] = value; });

  const validationResult = SecurityEventsQuerySchema.safeParse(queryParams);
  if (!validationResult.success) {
    return NextResponse.json({
      error: 'Validation failed',
      message: 'Invalid query parameters for security events.',
      issues: validationResult.error.issues
    }, { status: 400 });
  }

  const {
    page = 1,
    limit = 10,
    userId,
    startDate,
    endDate,
    success, // This field is from AuditLogQuerySchema, might be useful for security events too
    clientId,
    eventType
  } = validationResult.data;

  const whereClause: Prisma.AuditLogWhereInput = {};

  // Base filter for security events
  if (eventType) { // If a specific eventType is requested, filter by that action
    if (SECURITY_EVENT_ACTIONS.includes(eventType.toUpperCase())) {
        whereClause.action = { equals: eventType.toUpperCase(), mode: 'insensitive' };
    } else {
        // If eventType is provided but not in our known list, it might be an error or return no results
        return NextResponse.json({ error: 'Bad Request', message: `Unsupported security eventType: ${eventType}` }, { status: 400 });
    }
  } else { // If no specific eventType, filter by the general list of security actions
    whereClause.action = { in: SECURITY_EVENT_ACTIONS, mode: 'insensitive' };
  }

  // Apply other filters
  if (userId) whereClause.userId = userId;
  if (success !== undefined) whereClause.success = success;
  if (clientId) whereClause.clientId = clientId;

  if (startDate && endDate) {
    whereClause.timestamp = { gte: startDate, lte: new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1) };
  } else if (startDate) {
    whereClause.timestamp = { gte: startDate };
  } else if (endDate) {
    whereClause.timestamp = { lte: new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1) };
  }

  try {
    const totalRecords = await prisma.auditLog.count({ where: whereClause });
    const auditLogs = await prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const responseData = {
      data: auditLogs,
      pagination: {
        page,
        pageSize: limit,
        totalItems: totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
    };
    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error("Failed to retrieve security event audit logs:", error);
    return NextResponse.json({ error: "Internal Server Error", message: "Failed to retrieve security event audit logs." }, { status: 500 });
  }
}

export const GET = requirePermission('auditlogs:read:securityevents')(getSecurityEventsHandler);
