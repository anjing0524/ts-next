export interface ApiResponse<T> {
  code?: number;
  message?: string;
  data?: T | null;
  timestamp?: string;
  requestId?: string;
  success?: boolean;
  error?: unknown;
}

import { nanoid } from 'nanoid';

export function generateRequestId(): string {
  return nanoid();
}

export function successResponse<T>(
  data: T,
  statusCode: number = 200,
  message: string = 'Operation successful',
  customRequestId?: string
): ApiResponse<T> {
  return {
    code: statusCode,
    message,
    data,
    timestamp: new Date().toISOString(),
    requestId: customRequestId || generateRequestId(),
  };
}

export function errorResponse(
  message: string,
  statusCode: number,
  errors?: string,
  customRequestId?: string
): ApiResponse<String> {
  return {
    code: statusCode,
    message,
    data: errors,
    timestamp: new Date().toISOString(),
    requestId: customRequestId || generateRequestId(),
  };
}
