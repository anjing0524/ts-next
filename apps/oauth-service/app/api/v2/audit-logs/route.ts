import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { successResponse, errorResponse } from '@repo/lib/apiResponse';

/**
 * GET /api/v2/audit-logs
 * 查询审计日志，支持分页及多条件过滤
 * Query parameters:
 *  - page: 页码 (从1开始)
 *  - pageSize: 每页数量
 *  - clientId: OAuth客户端ID (actorId)
 *  - userId: 用户ID
 *  - eventType: 操作事件 (对应 action 字段)
 *  - startTime, endTime: 时间区间 (ISO8601 字符串)
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);

    const clientId = url.searchParams.get('clientId') || undefined;
    const userId = url.searchParams.get('userId') || undefined;
    const eventType = url.searchParams.get('eventType') || undefined;
    const startTime = url.searchParams.get('startTime');
    const endTime = url.searchParams.get('endTime');

    // 构建 Prisma 过滤条件
    const where: any = {};
    if (clientId) {
      where.actorId = clientId;
    }
    if (userId) {
      where.userId = userId;
    }
    if (eventType) {
      where.action = eventType;
    }
    if (startTime || endTime) {
      where.timestamp = {};
      if (startTime) {
        where.timestamp.gte = new Date(startTime);
      }
      if (endTime) {
        where.timestamp.lte = new Date(endTime);
      }
    }

    const skip = (page - 1) * pageSize;

    const [total, logs] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const res = successResponse({
      page,
      pageSize,
      total,
      data: logs,
    });
    return NextResponse.json(res, { status: 200 });
  } catch (error: any) {
    console.error('GET /audit-logs error', error);
    return NextResponse.json(errorResponse('服务器内部错误', 500), { status: 500 });
  }
} 