export interface ApiResponse<T> {
    code: number;
    message: string;
    data: T | null;
    timestamp: string;
    requestId: string;
}
export declare function generateRequestId(): string;
export declare function successResponse<T>(data: T, statusCode?: number, message?: string, customRequestId?: string): ApiResponse<T>;
export declare function errorResponse(message: string, statusCode: number, customRequestId?: string): ApiResponse<null>;
//# sourceMappingURL=apiResponse.d.ts.map