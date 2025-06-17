import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware'; // Updated import
import { AuditLogQuerySchema } from './schemas';
// successResponse and withErrorHandler are assumed to be compatible or handled by requirePermission's structure
// For now, let's assume requirePermission handles error responses adequately or we adapt.
// If successResponse is a specific wrapper, it might need to be integrated after handler execution.


async function getAuditLogsHandler(request: AuthenticatedRequest) { // Changed to AuthenticatedRequest
  // const requestId = (request as { requestId?: string }).requestId; // request.user.id can be used if needed
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
    // logs: auditLogs, // Keep original field name from existing code for now
    data: auditLogs, // Or change to 'data' if that's the new standard from successResponse
    pagination: {
      page: page, // Use 'page' consistent with Zod schema output
      pageSize: limit,
      totalItems: totalRecords, // Use 'totalItems' consistent with other list endpoints
      totalPages: Math.ceil(totalRecords / limit),
    },
  };
  // Assuming successResponse is not used with requirePermission, or handle it if needed.
  // The requirePermission HOF typically doesn't use successResponse wrapper.
  return NextResponse.json(responseData);
}

// Updated to use requirePermission with a new permission string
export const GET = requirePermission('auditlogs:list')(getAuditLogsHandler);
