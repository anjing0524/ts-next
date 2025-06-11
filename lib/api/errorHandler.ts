import { NextResponse, NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import logger from '@/utils/logger';

interface ApiErrorDetail {
  message: string;
  code: string;
  field?: string; // For validation errors on specific fields
  path?: (string | number)[]; // For Zod field errors
  details?: any; // For more specific error details
}

interface ApiErrorResponse {
  errors: ApiErrorDetail[];
}

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

export function handleApiError(error: any): NextResponse<ApiErrorResponse> {
  logger.error('[API Error Handled]', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    cause: error.cause,
    meta: error.meta // For Prisma errors
  });

  if (error instanceof ApiError) {
    return NextResponse.json(error.toErrorResponse(), { status: error.statusCode });
  }

  if (error instanceof ZodError) {
    const errorDetails: ApiErrorDetail[] = error.errors.map(err => ({
      message: err.message,
      code: 'VALIDATION_ERROR',
      path: err.path,
      field: err.path.join('.') // Simple field representation
    }));
    return NextResponse.json({ errors: errorDetails }, { status: 400 });
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
    return NextResponse.json({ errors: [{ message, code, details }] }, { status: statusCode });
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return NextResponse.json(
      { errors: [{ message: 'Database validation error. Check your input data types and constraints.', code: 'DB_VALIDATION_ERROR', details: error.message }] },
      { status: 400 }
    );
  }

  // Generic fallback
  return NextResponse.json(
    { errors: [{ message: 'An unexpected internal server error occurred.', code: 'INTERNAL_SERVER_ERROR' }] },
    { status: 500 }
  );
}

// Higher-Order Function to wrap API handlers
export function withErrorHandler<T extends NextRequest, U>(
  handler: (request: T, context: U) => Promise<NextResponse>
) {
  return async (request: T, context: U): Promise<NextResponse> => {
    try {
      return await handler(request, context);
    } catch (error) {
      // If the error is already a NextResponse (e.g. from a manual return NextResponse.json(...)), just return it
      if (error instanceof NextResponse) {
        return error;
      }
      return handleApiError(error);
    }
  };
}
