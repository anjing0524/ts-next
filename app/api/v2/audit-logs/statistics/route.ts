// /api/v2/audit-logs/statistics
// 描述: 提供审计日志的统计数据。
// (Provides statistical data for audit logs.)

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { z } from 'zod';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import { Prisma } from '@prisma/client';

// Zod Schema for statistics query parameters
// 统计查询参数的Zod Schema
const AuditLogStatisticsQuerySchema = z.object({
  period: z.enum(['24h', '7d', '30d', 'custom']).default('24h'),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
}).refine(data => {
  if (data.period === 'custom' && (!data.dateFrom || !data.dateTo)) {
    return false; // Custom period requires dateFrom and dateTo
  }
  if (data.dateFrom && data.dateTo && data.dateTo < data.dateFrom) {
    return false; // endDate cannot be earlier than startDate
  }
  return true;
}, {
  message: "For 'custom' period, 'dateFrom' and 'dateTo' are required, and 'dateTo' must not be earlier than 'dateFrom'. / 对于 'custom' 周期，'dateFrom' 和 'dateTo' 是必需的，且 'dateTo' 不能早于 'dateFrom'。",
  path: ['customDateRange'], // Path for the refinement error
});


/**
 * @swagger
 * /api/v2/audit-logs/statistics:
 *   get:
 *     summary: 获取审计日志统计信息 (审计日志管理)
 *     description: 提供审计日志的统计数据，例如按操作类型、用户或时间段的事件计数。
 *     tags: [Audit Logs API]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: period
 *         in: query
 *         required: false
 *         description: 统计周期 (24h, 7d, 30d, custom)。
 *         schema:
 *           type: string
 *           enum: [24h, 7d, 30d, custom]
 *           default: "24h"
 *       - name: dateFrom
 *         in: query
 *         required: false
 *         description: 自定义周期的开始日期 (当 period=custom 时使用)。
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: dateTo
 *         in: query
 *         required: false
 *         description: 自定义周期的结束日期 (当 period=custom 时使用)。
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200: { description: "成功获取审计日志统计信息。" } # Schema defined in previous subtask.
 *       400: { description: "无效的请求参数。" }
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问。" }
 */
async function getAuditLogStatisticsHandler(request: AuthenticatedRequest) {
  const performingAdmin = request.user;
  console.log(`Admin user ${performingAdmin?.id} requesting audit log statistics.`);

  const { searchParams } = new URL(request.url);
  const queryParams: Record<string, string | undefined> = {};
  searchParams.forEach((value, key) => { queryParams[key] = value; });

  const validationResult = AuditLogStatisticsQuerySchema.safeParse(queryParams);
  if (!validationResult.success) {
    return NextResponse.json({
      error: 'Validation failed',
      message: 'Invalid query parameters for statistics.',
      issues: validationResult.error.issues
    }, { status: 400 });
  }

  const { period, dateFrom, dateTo } = validationResult.data;
  let startDate: Date;
  let endDate: Date = endOfDay(dateTo || new Date()); // Default end is end of today or specified dateTo

  if (period === 'custom') {
    if (!dateFrom) { // Already validated by Zod refine, but good for clarity
        return NextResponse.json({ error: 'Bad Request', message: "dateFrom is required for custom period." }, { status: 400 });
    }
    startDate = startOfDay(dateFrom);
    // endDate is already set from dateTo or default
  } else {
    const daysToSubtract = parseInt(period.replace('h', '').replace('d', ''));
    if (period.includes('h')) { // For '24h', it means last 24 hours from now.
        startDate = subDays(new Date(), daysToSubtract / 24); // approx
        endDate = new Date(); // now
    } else { // For '7d', '30d', it means last N full days including today.
        startDate = startOfDay(subDays(new Date(), daysToSubtract -1)); // -1 because we include today
        // endDate is end of today
    }
  }

  const dateFilter: Prisma.AuditLogWhereInput = {
    timestamp: {
      gte: startDate,
      lte: endDate,
    },
  };

  try {
    const totalEvents = await prisma.auditLog.count({ where: dateFilter });

    const eventsByActionTypeRaw = await prisma.auditLog.groupBy({
      by: ['action'],
      _count: { action: true },
      where: dateFilter,
      orderBy: { _count: { action: 'desc' } },
    });
    const eventsByActionType = eventsByActionTypeRaw.reduce((acc, item) => {
      acc[item.action] = item._count.action;
      return acc;
    }, {} as Record<string, number>);

    const eventsByUserRaw = await prisma.auditLog.groupBy({
      by: ['userId'],
      _count: { userId: true },
      where: { ...dateFilter, userId: { not: null } }, // Only count events with a userId
      orderBy: { _count: { userId: 'desc' } },
      take: 10, // Top 10 users
    });
    // Fetch user details for display names (optional, can be done on frontend)
    const userIds = eventsByUserRaw.map(item => item.userId).filter(id => id !== null) as string[];
    const users = await prisma.user.findMany({
        where: { id: { in: userIds }},
        select: { id: true, username: true, displayName: true }
    });
    const userMap = users.reduce((acc, user) => { acc[user.id] = user.displayName || user.username; return acc; }, {} as Record<string, string>);
    const eventsByUser = eventsByUserRaw.map(item => ({
      userId: item.userId,
      user: userMap[item.userId!] || item.userId, // Display name or username, fallback to ID
      count: item._count.userId,
    }));


    // Events over time (e.g., daily counts for the period)
    // This is more complex for dynamic periods and might require raw queries or careful Prisma usage.
    // For an MVP, we can show daily counts for up to 30 days.
    let eventsOverTime: { date: string, count: number }[] = [];
    // If the period is reasonably small (e.g., <= 30 days), calculate daily.
    const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
    if (diffDays <= 31) { // Max 31 data points for a month
        const dailyCounts = await prisma.auditLog.groupBy({
            by: ['timestamp'], // This will group by exact timestamp, need to process
            _count: { id: true },
            where: dateFilter,
            orderBy: { timestamp: 'asc' }
        });
        // Aggregate by day client-side or use a more complex query/loop for DB aggregation
        const dailyAggregated: Record<string, number> = {};
        dailyCounts.forEach(item => {
            const day = item.timestamp.toISOString().split('T')[0];
            dailyAggregated[day] = (dailyAggregated[day] || 0) + item._count.id;
        });
        eventsOverTime = Object.entries(dailyAggregated).map(([date, count]) => ({ date, count })).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } else {
        // For larger periods, this might be too much data or require different bucketing (e.g., weekly, monthly)
        // Or simply state that 'eventsOverTime' is only available for periods up to 30 days.
        eventsOverTime = [{date: "summary_for_large_period", count: totalEvents}]; // Placeholder
    }


    return NextResponse.json({
      period: {
        requested: period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      totalEvents,
      eventsByActionType,
      eventsByUser,
      eventsOverTime,
    });

  } catch (error: any) {
    console.error("Error fetching audit log statistics:", error);
    return NextResponse.json({ error: "Internal Server Error", message: "Failed to retrieve audit log statistics." }, { status: 500 });
  }
}

export const GET = requirePermission('auditlogs:read:statistics')(getAuditLogStatisticsHandler);
