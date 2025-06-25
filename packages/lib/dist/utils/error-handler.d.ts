/**
 * @fileoverview 统一错误处理和API响应工具函数。
 * (Unified error handling and API response utility functions.)
 * @author 开发团队 (Development Team)
 * @since 1.0.0
 * @see docs/工具函数规范.md Section 5.2
 */
import { NextRequest, NextResponse } from 'next/server';
import { BaseError } from '../errors';
/**
 * 记录错误信息。
 * (Logs error information.)
 * 此函数可以根据需要扩展，例如集成到更复杂的日志系统中。
 * (This function can be expanded as needed, e.g., integrated into a more complex logging system.)
 * @param error 要记录的错误对象。 (The error object to log.)
 * @param req 可选的 NextRequest 对象，用于提取请求相关信息。 (Optional NextRequest object to extract request-related information.)
 * @param requestId 可选的请求ID，用于追踪。 (Optional request ID for tracking.)
 */
export declare function logError(error: Error | BaseError | any, req?: NextRequest, requestId?: string): void;
/**
 * 处理在API路由处理程序中发生的错误，并将其转换为标准化的NextResponse。
 * (Handles errors occurring in API route handlers and converts them into standardized NextResponse.)
 * @param error 捕获到的错误对象。 (The caught error object.)
 * @param req 可选的 NextRequest，用于日志记录。 (Optional NextRequest for logging.)
 * @param requestId 可选的请求ID。 (Optional request ID.)
 * @returns 一个 NextResponse 对象，包含格式化的错误响应。
 * (A NextResponse object containing the formatted error response.)
 */
export declare function handleError(error: Error | any, req?: NextRequest, requestId?: string): NextResponse;
/**
 * 高阶函数 (HOF)，用于包装 Next.js API 路由处理程序，以提供统一的错误处理。
 * (Higher-Order Function (HOF) to wrap Next.js API route handlers for unified error handling.)
 * @param handler 要包装的API路由处理函数。 (The API route handler function to wrap.)
 *                它应该是一个异步函数，接收 NextRequest 和一个可选的上下文对象。
 *                (It should be an async function receiving NextRequest and an optional context object.)
 * @returns 一个新的函数，它将执行原始处理程序并在发生错误时调用 handleError。
 * (A new function that will execute the original handler and call handleError if an error occurs.)
 *
 * @example
 * ```ts
 * // app/api/some/route.ts
 * import { withErrorHandling } from '@/lib/utils/error-handler';
 *
 * async function myHandler(req: NextRequest) {
 *   // ... 你的逻辑 (your logic)
 *   if (someCondition) {
 *     throw new ValidationError('Invalid input.');
 *   }
 *   return NextResponse.json({ message: 'Success' });
 * }
 *
 * export const POST = withErrorHandling(myHandler);
 * ```
 */
export declare function withErrorHandling<T extends NextRequest, P = any>(handler: (req: T, params?: P) => Promise<NextResponse>): (req: T, params?: P) => Promise<NextResponse>;
/**
 * 安全地执行一个函数，并处理其可能抛出的同步或异步错误。
 * (Safely executes a function and handles any synchronous or asynchronous errors it might throw.)
 * @template T 函数的预期返回类型。 (The expected return type of the function.)
 * @param fn 要执行的函数 (可以是同步或异步)。 (The function to execute (can be sync or async).)
 * @param failureMessage 当函数执行失败时，用于创建错误对象的自定义消息。 (Custom message for creating an error object if the function fails.)
 * @param ErrorType 发生错误时要实例化的错误类，默认为 BaseError。 (The error class to instantiate on failure, defaults to BaseError.)
 * @returns 一个包含 `data` (如果成功) 或 `error` (如果失败) 的对象。
 * (An object containing either `data` (on success) or `error` (on failure).)
 *
 * @example
 * ```ts
 * const { data, error } = await safeExecute(
 *   () => someFunctionThatMightThrow(),
 *   'Failed to execute someFunction'
 * );
 * if (error) {
 *   // 处理错误 (handle error)
 * } else {
 *   // 使用 data (use data)
 * }
 * ```
 */
export declare function safeExecute<T>(fn: () => Promise<T> | T, failureMessage?: string, ErrorType?: new (...args: any[]) => BaseError): Promise<{
    data?: T;
    error?: BaseError;
}>;
/**
 * 错误处理中间件
 * Error handling middleware
 */
export type RouteHandler = (req: NextRequest, ...args: any[]) => Promise<NextResponse>;
/**
 * 错误处理包装器，用于 API 路由
 * Error handling wrapper for API routes
 */
export declare function withErrorHandler(handler: RouteHandler): RouteHandler;
/**
 * 错误响应处理
 * Error response handling
 */
export declare function errorResponse(message: string, status: number, errorCode?: string): NextResponse<{
    success: boolean;
    error: string;
    message: string;
}>;
/**
 * 成功响应处理
 * Success response handling
 */
export declare function successResponse(data: any, message?: string, status?: number): NextResponse<{
    success: boolean;
    data: any;
    message: string;
}>;
//# sourceMappingURL=error-handler.d.ts.map