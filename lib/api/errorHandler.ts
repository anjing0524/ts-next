import { NextResponse, NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import logger from '@/utils/logger';
import { errorResponse, generateRequestId, ApiResponse } from './apiResponse'; // Adjusted path

interface ApiErrorDetail {
  message: string;
  code: string;
  field?: string; // For validation errors on specific fields
  path?: (string | number)[]; // For Zod field errors
  details?: any; // For more specific error details
}

// interface ApiErrorResponse { // This might be deprecated or become internal
//   errors: ApiErrorDetail[];
// }

// Custom Error class (optional for now, but good for future)
export class ApiError extends Error {
  statusCode: number;
  errorCode: string;
  details?: any;

  constructor(statusCode: number, message: string, errorCode: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  toErrorResponse(): ApiErrorResponse {
    return { errors: [{ message: this.message, code: this.errorCode, details: this.details }] };
  }
}

// Updated function signature and return type
export function handleApiError(error: any, requestId?: string): NextResponse<ApiResponse<null>> {
  const currentRequestId = requestId || generateRequestId();
  logger.error('[API Error Handled]', {
    requestId: currentRequestId, // Log requestId
    message: error.message,
    stack: error.stack,
    name: error.name,
    cause: error.cause,
    meta: error.meta // For Prisma errors
  });

  if (error instanceof ApiError) {
    // Use errorResponse helper
    return NextResponse.json(errorResponse(error.message, error.statusCode, currentRequestId, error.errorCode), { status: error.statusCode });
  }

  if (error instanceof ZodError) {
    const errorDetails: ApiErrorDetail[] = error.errors.map(err => ({
      message: err.message,
      code: 'VALIDATION_ERROR', // This code can be part of the message or a specific field in ApiResponse if extended
      path: err.path,
      field: err.path.join('.')
    }));
    // Construct a detailed message from Zod errors
    const customMessage = errorDetails.map(e => `${e.field || (e.path && e.path.join('.')) || 'error'}: ${e.message}`).join(', ');
    return NextResponse.json(errorResponse(customMessage || 'Validation failed', 400, currentRequestId, 'VALIDATION_ERROR'), { status: 400 });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    let statusCode = 500;
    let message = 'A database error occurred.';
    let code = 'DB_ERROR';
    let details: any = { prismaCode: error.code };

    switch (error.code) {
      case 'P2002': // Unique constraint violation
        statusCode = 409;
        message = `Conflict: A record with this unique value already exists.`;
        if (error.meta?.target && Array.isArray(error.meta.target) && error.meta.target.length > 0) {
            message = `Conflict: The value for field '${error.meta.target.join(', ')}' already exists or is not unique.`;
        } else if (error.meta?.target) {
             message = `Conflict: The value for field '${error.meta.target}' already exists or is not unique.`;
        }
        code = 'DB_CONFLICT';
        details.target = error.meta?.target;
        break;
      case 'P2025': // Record to update/delete not found
        statusCode = 404;
        message = 'Resource not found. The requested record does not exist.';
        code = 'DB_NOT_FOUND';
        details.cause = error.meta?.cause;
        break;
      case 'P2003': // Foreign key constraint failed
        statusCode = 400; // Or 409
        message = `Bad Request: A related record required for this operation does not exist. Field: ${error.meta?.field_name}`;
        code = 'DB_FOREIGN_KEY_CONSTRAINT_FAILED';
        details.field_name = error.meta?.field_name;
        break;
      // Add more Prisma error codes as needed
      default:
        message = `A database error occurred. Prisma Code: ${error.code}`;
        break;
    }
    // Use errorResponse helper, include Prisma code in message
    return NextResponse.json(errorResponse(`${message} (Prisma Code: ${error.code})`, statusCode, currentRequestId, code), { status: statusCode });
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    // Use errorResponse helper
    return NextResponse.json(
      errorResponse(`Database validation error: ${error.message.substring(error.message.lastIndexOf('Reason:') + 7)}`, 400, currentRequestId, 'DB_VALIDATION_ERROR'),
      { status: 400 }
    );
  }

  // Generic fallback
  // Use errorResponse helper
  return NextResponse.json(
    errorResponse('An unexpected internal server error occurred.', 500, currentRequestId, 'INTERNAL_SERVER_ERROR'),
    { status: 500 }
  );
}

// Higher-Order Function to wrap API handlers
export function withErrorHandler<T extends NextRequest, U>(
  handler: (request: T, context: U) => Promise<NextResponse>
) {
  return async (request: T, context: U): Promise<NextResponse> => {
    // Ensure requestId is generated or retrieved and passed through
    const req = request as any;
    const existingRequestId = req.requestId;
    const requestId = existingRequestId || generateRequestId();

    if (!existingRequestId) {
      req.requestId = requestId; // Attach requestId to request if not already present
    }

    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof NextResponse) {
        return error; // Already a response, do not re-wrap
      }
      // Pass requestId to handleApiError
      return handleApiError(error, requestId);
    }
  };
}
