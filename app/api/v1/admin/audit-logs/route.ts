import { NextRequest, NextResponse } from 'next/server';

import { Prisma } from '@prisma/client';

import { successResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/prisma';

import { AuditLogQuerySchema } from './schemas';

async function getAuditLogsHandler(request: NextRequest) {
  const requestId = (request as { requestId?: string }).requestId; // Injected by withErrorHandler
  const { searchParams } = new URL(request.url);

  // Convert searchParams to a plain object for Zod parsing
  const queryParams: Record<string, string | string[] | undefined> = {};
  searchParams.forEach((value, key) => {
    // Handle multiple values for a key if necessary, though AuditLogQuerySchema expects single strings
    const existing = queryParams[key];
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        queryParams[key] = [existing, value];
      }
    } else {
      queryParams[key] = value;
    }
  });

  const validationResult = AuditLogQuerySchema.safeParse(queryParams);

  if (!validationResult.success) {
    // Flatten Zod errors for a more readable message
    const errorMessages = validationResult.error.flatten((issue) => issue.message).fieldErrors;
    const combinedErrorMessage = Object.entries(errorMessages)
      .map(([key, messages]) => `${key}: ${messages?.join(', ')}`)
      .join('; ');
    throw new ApiError(
      400,
      `Invalid query parameters: ${combinedErrorMessage}`,
      'VALIDATION_ERROR'
    );
  }

  const { page, limit, userId, action, startDate, endDate, success, clientId } =
    validationResult.data;

  const whereClause: Prisma.AuditLogWhereInput = {};
  if (userId) whereClause.userId = userId;
  if (action) whereClause.action = { contains: action, mode: 'insensitive' }; // Case-insensitive search
  if (success !== undefined) whereClause.success = success;
  if (clientId) whereClause.clientId = clientId;

  // Date range filtering
  if (startDate && endDate) {
    whereClause.timestamp = {
      gte: startDate,
      // To include the whole end day, set time to 23:59:59.999 or add 1 day and use 'lt'
      lte: new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1), // End of day
    };
  } else if (startDate) {
    whereClause.timestamp = { gte: startDate };
  } else if (endDate) {
    // If only endDate is provided, set it to end of that day.
    whereClause.timestamp = { lte: new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1) };
  }

  const totalRecords = await prisma.auditLog.count({ where: whereClause });
  const auditLogs = await prisma.auditLog.findMany({
    where: whereClause,
    orderBy: { timestamp: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
    // Optionally include related data, e.g., user or client details
    // include: { user: { select: { id: true, username: true } }, client: { select: { id: true, clientId: true, name: true }} }
  });

  const responseData = {
    logs: auditLogs,
    pagination: {
      currentPage: page,
      pageSize: limit,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
    },
  };

  return NextResponse.json(
    successResponse(responseData, 200, 'Audit logs retrieved successfully.', requestId)
  );
}

export const GET = withErrorHandler(
  withAuth(getAuditLogsHandler, {
    requiredPermissions: ['admin:audit-logs:read'], // Permission to read audit logs
    requireUserContext: true, // Ensure an authenticated user/admin is making the request
  })
);
