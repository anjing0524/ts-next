export interface ApiResponse<T> {
    code?: number;
    message?: string;
    data?: T | null;
    timestamp?: string;
    requestId?: string;
    success?: boolean;
    error?: unknown;
}
export declare function generateRequestId(): string;
export declare function successResponse<T>(data: T, statusCode?: number, message?: string, customRequestId?: string): ApiResponse<T>;
export declare function errorResponse(message: string, statusCode: number, errors?: string, customRequestId?: string): ApiResponse<String>;
//# sourceMappingURL=apiResponse.d.ts.map