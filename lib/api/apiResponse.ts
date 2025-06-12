export interface ApiResponse<T> {
  code: number; // HTTP status code
  message: string;
  data: T | null; // Data can be null, especially for errors
  timestamp: string;
  requestId: string;
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
  customRequestId?: string
  // errorCode?: string, // Optional: if we want to pass a string code too
): ApiResponse<null> {
  return {
    code: statusCode,
    message,
    data: null,
    timestamp: new Date().toISOString(),
    requestId: customRequestId || generateRequestId(),
    // ...(errorCode && { errorCodeString: errorCode }),
  };
}
