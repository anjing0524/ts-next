// /api/v2/audit-logs/export
// 描述: 处理审计日志导出请求。
// (Handles audit log export requests.)

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { AuditLogQuerySchema } from '../schemas'; // Reuse for filter structure
import { Prisma, AuditLog } from '@prisma/client';
import { z } from 'zod';
import { Parser } from 'json2csv'; // For CSV export

// Zod Schema for the export request body
// 导出请求体的Zod Schema
const AuditLogExportBodySchema = z.object({
  format: z.enum(['json', 'csv']).default('csv'),
  filters: AuditLogQuerySchema.omit({ page: true, limit: true }).optional(), // Filters similar to list/search, pagination not applicable for full export
});

// 安全限制: 同步导出的最大记录数
// (Safety limit: Maximum number of records for synchronous export)
const MAX_EXPORT_RECORDS = 10000;

/**
 * @swagger
 * /api/v2/audit-logs/export:
 *   post:
 *     summary: 导出审计日志 (审计日志管理)
 *     description: 根据提供的筛选条件导出审计日志，支持CSV或JSON格式。此版本为同步导出，适用于中等大小的数据集。
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
 *               format:
 *                 type: string
 *                 enum: [csv, json]
 *                 default: csv
 *                 description: 导出格式。
 *               filters:
 *                 type: object
 *                 description: 与搜索接口类似的筛选条件 (不含分页)。
 *                 properties:
 *                   query: { type: string, nullable: true }
 *                   userId: { type: string, format: cuid, nullable: true }
 *                   action: { type: string, nullable: true }
 *                   startDate: { type: string, format: date-time, nullable: true }
 *                   endDate: { type: string, format: date-time, nullable: true }
 *                   success: { type: boolean, nullable: true }
 *                   clientId: { type: string, format: cuid, nullable: true }
 *     responses:
 *       200:
 *         description: 成功导出审计日志。响应体为JSON或CSV格式的文件内容。
 *         content:
 *           application/json:
 *             schema: { type: array, items: { $ref: '#/components/schemas/AuditLogEntry' } }
 *           text/csv:
 *             schema: { type: string }
 *       400: { description: "无效的请求参数或超出最大导出记录限制。" }
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问。" }
 *       500: { description: "服务器内部错误。" }
 */
async function exportAuditLogsHandler(request: AuthenticatedRequest) {
  const performingAdmin = request.user;
  console.log(`Admin user ${performingAdmin?.id} requesting audit log export.`);

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body', message: 'Failed to parse JSON body.' }, { status: 400 });
  }

  const validationResult = AuditLogExportBodySchema.safeParse(payload);
  if (!validationResult.success) {
    return NextResponse.json({
      error: 'Validation failed',
      message: 'Invalid export parameters.',
      issues: validationResult.error.issues
    }, { status: 400 });
  }

  const { format, filters } = validationResult.data;
  const { userId, action, startDate, endDate, success, clientId, query } = filters || {};

  const whereClause: Prisma.AuditLogWhereInput = {};
  if (query) {
    whereClause.OR = [
      { action: { contains: query, mode: 'insensitive' } },
      { resourceType: { contains: query, mode: 'insensitive' } },
      { resourceId: { contains: query, mode: 'insensitive' } },
      { actorId: { contains: query, mode: 'insensitive' } },
      { ipAddress: { contains: query, mode: 'insensitive' } },
      { details: { contains: query, mode: 'insensitive' } },
    ];
  }
  if (userId) whereClause.userId = userId;
  if (action && !query) whereClause.action = { contains: action, mode: 'insensitive' };
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
    if (totalRecords > MAX_EXPORT_RECORDS) {
      return NextResponse.json({
        error: 'Bad Request',
        message: `导出超过最大记录数限制 (${MAX_EXPORT_RECORDS})。请使用更精确的筛选条件缩小结果范围。(Export exceeds maximum record limit. Please refine filters.)`
      }, { status: 400 });
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { timestamp: 'asc' }, // 通常导出按时间升序
      take: MAX_EXPORT_RECORDS, // Apply safety limit
    });

    const now = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
    let responseBody: string;
    let contentType: string;
    let filename: string;

    if (format === 'json') {
      responseBody = JSON.stringify(auditLogs, null, 2);
      contentType = 'application/json';
      filename = `audit_logs_${now}.json`;
    } else { // csv
      const json2csvParser = new Parser();
      responseBody = auditLogs.length > 0 ? json2csvParser.parse(auditLogs) : ""; // Handle empty array for CSV
      contentType = 'text/csv';
      filename = `audit_logs_${now}.csv`;
    }

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error: any) {
    console.error("Audit log export failed:", error);
    return NextResponse.json({ error: "Internal Server Error", message: "Failed to export audit logs." }, { status: 500 });
  }
}

export const POST = requirePermission('auditlogs:export')(exportAuditLogsHandler);
