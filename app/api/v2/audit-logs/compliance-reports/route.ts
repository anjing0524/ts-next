// /api/v2/audit-logs/compliance-reports
// 描述: 生成或获取合规性报告。
// (Generates or retrieves compliance reports.)

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { z } from 'zod';
import { Prisma, AuditLog } from '@prisma/client';
import { Parser } from 'json2csv';
import { startOfDay, endOfDay, subDays } from 'date-fns';

// 支持的报告类型枚举 (Supported report types enum)
const ReportTypeEnum = z.enum([
    'USER_LOGIN_HISTORY',
    'PERMISSION_CHANGES' // Placeholder for future
]);

// Zod Schema for compliance report query parameters
// 合规报告查询参数的Zod Schema
const ComplianceReportQuerySchema = z.object({
  reportType: ReportTypeEnum,
  format: z.enum(['json', 'csv']).default('json'),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  targetUserId: z.string().cuid("无效的用户ID格式 (Invalid User ID format)").optional(),
}).refine(data => {
  if (data.dateFrom && data.dateTo && data.dateTo < data.dateFrom) {
    return false;
  }
  return true;
}, {
  message: "'dateTo' must not be earlier than 'dateFrom'. / 'dateTo' 不能早于 'dateFrom'。",
  path: ['dateTo'],
});

// 安全限制: 同步报告的最大记录数
// (Safety limit: Maximum number of records for synchronous report)
const MAX_REPORT_RECORDS = 5000;


/**
 * @swagger
 * /api/v2/audit-logs/compliance-reports:
 *   get:
 *     summary: 生成或获取合规性报告 (审计日志管理)
 *     description: |
 *       用于生成或检索预定义的合规性报告，这些报告通常基于审计日志数据。
 *       当前支持的 `reportType`:
 *         - `USER_LOGIN_HISTORY`: 用户登录历史报告。需要 `targetUserId` 参数。
 *       未来可能支持: `PERMISSION_CHANGES`, `DATA_ACCESS_REPORT`, 等。
 *       此版本为同步导出，适用于中等大小的数据集。
 *     tags: [Audit Logs API]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: reportType
 *         in: query
 *         required: true
 *         description: 请求的报告类型 (例如 USER_LOGIN_HISTORY)。
 *         schema:
 *           type: string
 *           enum: [USER_LOGIN_HISTORY, PERMISSION_CHANGES]
 *       - name: format
 *         in: query
 *         required: false
 *         description: 报告格式 (json, csv)。默认为json。
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *       - name: dateFrom
 *         in: query
 *         description: 报告的开始日期 (ISO 8601)。
 *         schema: { type: string, format: date-time }
 *       - name: dateTo
 *         in: query
 *         description: 报告的结束日期 (ISO 8601)。
 *         schema: { type: string, format: date-time }
 *       - name: targetUserId
 *         in: query
 *         description: 目标用户ID (例如，对于 USER_LOGIN_HISTORY 报告)。
 *         schema: { type: string, format: cuid }
 *     responses:
 *       200: { description: "成功获取合规性报告。" }
 *       400: { description: "无效的请求参数或报告类型。" }
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问。" }
 *       501: { description: "请求的报告类型暂未实现。" }
 */
async function getComplianceReportHandler(request: AuthenticatedRequest) {
  const performingAdmin = request.user;
  console.log(`Admin user ${performingAdmin?.id} requesting compliance report.`);

  const { searchParams } = new URL(request.url);
  const queryParams: Record<string, string | undefined> = {};
  searchParams.forEach((value, key) => { queryParams[key] = value; });

  const validationResult = ComplianceReportQuerySchema.safeParse(queryParams);
  if (!validationResult.success) {
    return NextResponse.json({
      error: 'Validation failed',
      message: 'Invalid query parameters for compliance report.',
      issues: validationResult.error.issues
    }, { status: 400 });
  }

  const { reportType, format, dateFrom, dateTo, targetUserId } = validationResult.data;

  let startDate = dateFrom ? startOfDay(dateFrom) : subDays(startOfDay(new Date()), 30); // Default to last 30 days if no dateFrom
  let endDate = dateTo ? endOfDay(dateTo) : endOfDay(new Date()); // Default to end of today if no dateTo

  if (dateFrom && !dateTo) endDate = endOfDay(new Date()); // If only dateFrom, set dateTo to now
  if (!dateFrom && dateTo) startDate = startOfDay(subDays(dateTo, 30)); // If only dateTo, set dateFrom to 30 days before dateTo


  const whereClause: Prisma.AuditLogWhereInput = {
    timestamp: { gte: startDate, lte: endDate },
  };

  let reportData: AuditLog[] = [];
  let reportFields: (keyof AuditLog)[] | undefined = undefined;


  if (reportType === 'USER_LOGIN_HISTORY') {
    if (!targetUserId) {
      return NextResponse.json({ error: 'Bad Request', message: 'targetUserId is required for USER_LOGIN_HISTORY report.' }, { status: 400 });
    }
    whereClause.userId = targetUserId;
    whereClause.OR = [ // 包含常见的登录相关操作
      { action: { contains: 'LOGIN', mode: 'insensitive' } },
      { action: { contains: 'LOGOUT', mode: 'insensitive' } },
      { action: { contains: 'PASSWORD_RESET_REQUEST', mode: 'insensitive' } },
      { action: { contains: 'PASSWORD_RESET_SUCCESS', mode: 'insensitive' } },
    ];
    reportFields = ['id', 'timestamp', 'action', 'success', 'ipAddress', 'userAgent', 'details'];
  } else if (reportType === 'PERMISSION_CHANGES') {
    // Placeholder for a more complex report type
    // whereClause.action = { contains: 'PERMISSION_UPDATE', mode: 'insensitive' }; // Example
    // reportFields = [...];
    return NextResponse.json({ message: `Report type '${reportType}' is not yet implemented.` }, { status: 501 });
  } else {
    return NextResponse.json({ error: 'Bad Request', message: `Unsupported reportType: ${reportType}` }, { status: 400 });
  }

  try {
    const totalRecords = await prisma.auditLog.count({ where: whereClause });
    if (totalRecords > MAX_REPORT_RECORDS) {
      return NextResponse.json({
        error: 'Bad Request',
        message: `报告超过最大记录数限制 (${MAX_REPORT_RECORDS})。请使用更精确的筛选条件缩小结果范围。(Report exceeds maximum record limit. Please refine filters.)`
      }, { status: 400 });
    }

    reportData = await prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { timestamp: 'asc' },
      take: MAX_REPORT_RECORDS, // Apply safety limit
      select: reportFields ? reportFields.reduce((obj, key) => ({ ...obj, [key]: true }), {}) : undefined,
    });

    const now = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
    let responseBody: string;
    let contentType: string;
    const filename = `${reportType}_${now}.${format}`;

    if (format === 'json') {
      responseBody = JSON.stringify(reportData, null, 2);
      contentType = 'application/json';
    } else { // csv
      const parser = new Parser({ fields: reportFields as string[] | undefined }); // Explicitly pass fields for CSV
      responseBody = reportData.length > 0 ? parser.parse(reportData) : "";
      contentType = 'text/csv';
    }

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error: any) {
    console.error(`Error generating compliance report ${reportType}:`, error);
    return NextResponse.json({ error: "Internal Server Error", message: "Failed to generate compliance report." }, { status: 500 });
  }
}

export const GET = requirePermission('auditlogs:read:compliance')(getComplianceReportHandler);
