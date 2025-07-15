import { NextRequest, NextResponse } from 'next/server';
import { successResponse, errorResponse } from '@repo/lib/node';
import { prisma } from '@repo/database';
import { Prisma } from '@prisma/client';
import z from 'zod';

const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sort: z.string().default('createdAt:desc'),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const validation = auditLogQuerySchema.safeParse(searchParams);

    if (!validation.success) {
      return errorResponse({
        message: '无效的查询参数。',
        statusCode: 400,
        details: validation.error.flatten(),
      });
    }

    const { page, pageSize, userId, action, resource, startDate, endDate, sort } = validation.data;

    const where: Prisma.AuditLogWhereInput = {};
    if (userId) where.userId = userId;
    if (action) where.action = { contains: action };
    if (resource) where.resourceType = { contains: resource };
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }

    const [sortField, sortOrder] = sort ? sort.split(':') : ['timestamp', 'desc'];
    const validSortFields = ['timestamp', 'action', 'resourceType', 'status'];
    let orderBy: Prisma.AuditLogOrderByWithRelationInput[] = [{ timestamp: 'desc' }];

    if (
      sortField &&
      sortOrder &&
      validSortFields.includes(sortField) &&
      ['asc', 'desc'].includes(sortOrder)
    ) {
      orderBy = [{ [sortField]: sortOrder as 'asc' | 'desc' }];
    }

    const totalItems = await prisma.auditLog.count({ where });
    const logs = await prisma.auditLog.findMany({
      where,
      take: pageSize,
      skip: (page - 1) * pageSize,
      orderBy,
    });

    return successResponse({
      items: logs,
      pagination: {
        totalItems,
        currentPage: page,
        pageSize,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    });
  } catch (error) {
    console.error('获取审计日志失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}