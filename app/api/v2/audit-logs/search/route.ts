// /api/v2/audit-logs/search
// 描述: 提供高级搜索审计日志的功能，允许通过POST请求体传递复杂的查询参数。
// (Provides advanced search capabilities for audit logs, allowing complex query parameters via POST request body.)

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { AuditLogQuerySchema } from '../schemas'; // Reuse the schema from list view for query params
import { Prisma } from '@prisma/client';

// Zod Schema for the search request body. Can extend or reuse AuditLogQuerySchema.
// For now, we'll assume the search body can use the same parameters as the GET query.
// If more complex search structures are needed (e.g., nested logic), this schema would be different.
const AuditLogSearchBodySchema = AuditLogQuerySchema.extend({
  query: z.string().optional(), // General text search query
});


/**
 * @swagger
 * /api/v2/audit-logs/search:
 *   post:
 *     summary: 搜索审计日志 (审计日志管理)
 *     description: 根据提供的查询条件和过滤器搜索审计日志记录。使用POST请求以支持更复杂的查询体。
 *     tags: [Audit Logs API]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query: { type: string, description: "通用搜索关键词 (General search keyword for multiple fields)", nullable: true }
 *               page: { type: integer, default: 1, description: "页码" }
 *               limit: { type: integer, default: 10, description: "每页记录数" }
 *               userId: { type: string, format: cuid, description: "用户ID筛选", nullable: true }
 *               action: { type: string, description: "操作名称筛选", nullable: true }
 *               startDate: { type: string, format: date-time, description: "开始日期筛选", nullable: true }
 *               endDate: { type: string, format: date-time, description: "结束日期筛选", nullable: true }
 *               success: { type: boolean, description: "操作成功状态筛选", nullable: true }
 *               clientId: { type: string, format: cuid, description: "客户端ID筛选", nullable: true }
 *               # actorType, resourceType could be added from AuditLog model
 *     responses:
 *       200: { description: "成功获取审计日志搜索结果。" } # Schema similar to GET /audit-logs
 *       400: { description: "无效的请求参数。" }
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问。" }
 */
async function searchAuditLogsHandler(request: AuthenticatedRequest) {
  const performingAdmin = request.user;
  console.log(`Admin user ${performingAdmin?.id} performing audit log search.`);

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body', message: 'Failed to parse JSON body.' }, { status: 400 });
  }

  const validationResult = AuditLogSearchBodySchema.safeParse(payload);

  if (!validationResult.success) {
    const errorMessages = validationResult.error.flatten((issue) => issue.message).fieldErrors;
    const combinedErrorMessage = Object.entries(errorMessages)
      .map(([key, messages]) => `${key}: ${messages?.join(', ')}`)
      .join('; ');
    return NextResponse.json({
      error: 'Validation failed',
      message: `Invalid search parameters: ${combinedErrorMessage}`,
      issues: validationResult.error.issues
    }, { status: 400 });
  }

  const {
    page = 1,
    limit = 10,
    userId,
    action,
    startDate,
    endDate,
    success,
    clientId,
    query // General search query
  } = validationResult.data;

  const whereClause: Prisma.AuditLogWhereInput = {};

  // General text search across multiple relevant fields
  if (query) {
    whereClause.OR = [
      { action: { contains: query, mode: 'insensitive' } },
      { resourceType: { contains: query, mode: 'insensitive' } },
      { resourceId: { contains: query, mode: 'insensitive' } },
      { actorId: { contains: query, mode: 'insensitive' } }, // May include user IDs, client string IDs, system IDs
      { ipAddress: { contains: query, mode: 'insensitive' } },
      { details: { contains: query, mode: 'insensitive' } }, // Search within JSON details string
      // If searching by username/email, a sub-query or join would be needed, or denormalize username/email into audit log.
      // For simplicity, not adding user sub-queries here.
    ];
  }

  // Specific field filters (will be ANDed with the OR block if query is present)
  if (userId) whereClause.userId = userId; // Filters by specific user CUID
  if (action && !query) whereClause.action = { contains: action, mode: 'insensitive' }; // Avoid conflict if action is part of general query
  if (success !== undefined) whereClause.success = success;
  if (clientId) whereClause.clientId = clientId; // Filters by specific client CUID

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
    console.error("Audit log search failed:", error);
    return NextResponse.json({ error: "Internal Server Error", message: "Failed to search audit logs." }, { status: 500 });
  }
}

export const POST = requirePermission('auditlogs:search')(searchAuditLogsHandler);
