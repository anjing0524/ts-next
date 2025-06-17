// app/api/v2/audit-logs/[logId]/route.ts
// 描述: 处理特定审计日志条目 (由 logId 标识) 的 API 请求，主要是获取详情。
// (Handles API requests for a specific audit log entry, identified by logId, primarily for fetching details.)

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { z } from 'zod'; // For CUID validation

interface RouteContext {
  params: {
    logId: string; // 审计日志的ID (Audit Log ID)
  };
}

// Zod schema to validate CUID format for logId
const LogIdSchema = z.string().cuid("无效的日志ID格式 (Invalid Log ID format: must be a CUID/UUID based on your schema)");


/**
 * @swagger
 * /api/v2/audit-logs/{logId}:
 *   get:
 *     summary: 获取特定审计日志条目详情 (管理员)
 *     description: 检索具有指定ID的单个审计日志条目的详细信息。
 *     tags: [Audit Logs API]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: logId
 *         in: path
 *         required: true
 *         description: 要检索的审计日志的ID。
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取审计日志详情。
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuditLogEntry' # Assuming you have AuditLogEntry schema defined elsewhere
 *       401:
 *         description: 用户未认证。
 *       403:
 *         description: 用户无权访问此资源。
 *       404:
 *         description: 未找到指定的审计日志条目。
 *       400:
 *         description: 无效的日志ID格式。
 */
async function getAuditLogByIdHandler(request: AuthenticatedRequest, context: RouteContext) {
  const performingAdmin = request.user;
  const { logId } = context.params;

  // 验证 logId 格式 (Validate logId format)
  const validationResult = LogIdSchema.safeParse(logId);
  if (!validationResult.success) {
    return NextResponse.json({
      error: 'Bad Request',
      message: '无效的日志ID格式 (Invalid Log ID format)',
      issues: validationResult.error.issues
    }, { status: 400 });
  }

  console.log(`Admin user ${performingAdmin?.id} attempting to retrieve audit log with ID: ${logId}.`);

  try {
    const auditLogEntry = await prisma.auditLog.findUnique({
      where: { id: logId },
      // 可选: 包含关联的用户或客户端信息 (Optionally include related user or client info)
      // include: {
      //   user: { select: { username: true, email: true } },
      //   client: { select: { clientId: true, clientName: true } }
      // }
    });

    if (!auditLogEntry) {
      return NextResponse.json({ error: 'Not Found', message: '审计日志条目未找到 (Audit log entry not found)' }, { status: 404 });
    }

    return NextResponse.json(auditLogEntry);
  } catch (error: any) {
    console.error(`Error retrieving audit log ${logId}:`, error);
    // 检查是否是由于无效的ID格式引起的Prisma错误 (Check if it's a Prisma error due to invalid ID format, though Zod should catch it first)
    if (error.code === 'P2023' || (error.message && error.message.includes("Malformed UUID"))) {
        return NextResponse.json({ error: 'Bad Request', message: '提供的日志ID格式不正确 (Incorrect format for Log ID provided)' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error', message: '获取审计日志详情失败 (Failed to retrieve audit log details)' }, { status: 500 });
  }
}

// 使用 'auditlogs:read' 权限保护此端点
// (Protect this endpoint with 'auditlogs:read' permission)
// 如果需要更细粒度的权限，例如 'auditlogs:read:detail'，可以在此处指定。
export const GET = requirePermission('auditlogs:read')(getAuditLogByIdHandler);
