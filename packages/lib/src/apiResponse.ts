import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

export function generateRequestId(): string {
  return nanoid();
}

export function successResponse<T>(
  data: T,
  statusCode: number = 200,
  message: string = 'Operation successful',
  meta?: {
    totalItems?: number;
    itemCount?: number;
    itemsPerPage?: number;
    totalPages?: number;
    currentPage?: number;
  }
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      message,
      data,
      meta,
    },
    { status: statusCode }
  );
}

export function errorResponse({
  message,
  statusCode = 500,
  details,
}: {
  message: string;
  statusCode?: number;
  details?: any;
}): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        message,
        details,
      },
    },
    { status: statusCode }
  );
}
