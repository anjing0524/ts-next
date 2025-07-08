import { NextResponse } from 'next/server';

declare function generateRequestId(): string;
declare function successResponse<T>(data: T, statusCode?: number, message?: string, meta?: {
    totalItems?: number;
    itemCount?: number;
    itemsPerPage?: number;
    totalPages?: number;
    currentPage?: number;
}): NextResponse;
declare function errorResponse({ message, statusCode, details, }: {
    message: string;
    statusCode?: number;
    details?: any;
}): NextResponse;

export { errorResponse, generateRequestId, successResponse };
