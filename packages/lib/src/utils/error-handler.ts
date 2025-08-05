// lib/utils/error-handler.ts
/**
 * @fileoverview 统一错误处理和API响应工具函数。
 * (Unified error handling and API response utility functions.)
 * @author 开发团队 (Development Team)
 * @since 1.0.0
 * @see docs/工具函数规范.md Section 5.2
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid'; // 用于生成唯一的请求ID (For generating unique request IDs)
import { BaseError, ValidationError } from '../errors'; // 导入自定义错误类 (Import custom error classes)
import { ApiResponse } from '../types/api'; // 导入API响应和错误类型 (Import API response and error types)

/**
 * 记录错误信息。
 * (Logs error information.)
 * 此函数可以根据需要扩展，例如集成到更复杂的日志系统中。
 * (This function can be expanded as needed, e.g., integrated into a more complex logging system.)
 * @param error 要记录的错误对象。 (The error object to log.)
 * @param req 可选的 NextRequest 对象，用于提取请求相关信息。 (Optional NextRequest object to extract request-related information.)
 * @param requestId 可选的请求ID，用于追踪。 (Optional request ID for tracking.)
 */
export function logError(
  error: Error | BaseError | any,
  req?: NextRequest,
  requestId?: string
): void {
  const logEntry: Record<string, any> = {
    timestamp: new Date().toISOString(),
    requestId: requestId || 'N/A',
    message: error.message || 'An unknown error occurred.',
    name: error.name || 'Error',
  };

  if (req) {
    logEntry.url = req.url;
    logEntry.method = req.method;
    logEntry.ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'; // 获取真实IP (Get real IP)
    logEntry.userAgent = req.headers.get('user-agent');
  }

  if (error instanceof BaseError) {
    logEntry.code = error.code;
    logEntry.status = error.status;
    if (error.context) logEntry.context = error.context;
  } else {
    // 对于非 BaseError 类型的错误，可能没有 code 和 status 属性
    // For non-BaseError type errors, code and status properties might be missing
    logEntry.code = 'UNHANDLED_EXCEPTION';
    logEntry.status = 500; // 默认为500 (Default to 500)
  }

  if (error.stack) {
    logEntry.stack = error.stack.split('\n').map((line: string) => line.trim());
  }

  // 此处使用 console.error，实际项目中可能替换为专业的日志库 (e.g., Pino, Winston)
  // Using console.error here, in a real project, replace with a professional logging library (e.g., Pino, Winston)
  console.error(JSON.stringify(logEntry, null, 2));
}

/**
 * 处理在API路由处理程序中发生的错误，并将其转换为标准化的NextResponse。
 * (Handles errors occurring in API route handlers and converts them into standardized NextResponse.)
 * @param error 捕获到的错误对象。 (The caught error object.)
 * @param req 可选的 NextRequest，用于日志记录。 (Optional NextRequest for logging.)
 * @param requestId 可选的请求ID。 (Optional request ID.)
 * @returns 一个 NextResponse 对象，包含格式化的错误响应。
 * (A NextResponse object containing the formatted error response.)
 */
export function handleError(
  error: Error | any,
  req?: NextRequest,
  requestId?: string
): NextResponse {
  const currentRequestId = requestId || uuidv4(); // 确保有一个请求ID (Ensure there is a request ID)

  logError(error, req, currentRequestId); // 首先记录错误 (Log the error first)

  if (error instanceof BaseError) {
    // 如果是 BaseError 的实例，使用其 toApiResponse 方法获取响应体
    // If it's an instance of BaseError, use its toApiResponse method to get the response body
    const apiResponse = error.toApiResponse();
    // 在错误响应中可能也包含 requestId
    // Optionally include requestId in the error response body
    if (apiResponse.error) {
      apiResponse.error.details = { ...apiResponse.error.details, requestId: currentRequestId };
    }
    return NextResponse.json(apiResponse, { status: error.status });
  }

  // 对于 OAuth2Error，它也继承自 BaseError，所以上面的分支会处理它。
  // For OAuth2Error, it also inherits from BaseError, so the branch above will handle it.
  // 如果需要 OAuth2Error 特有的响应格式 (例如，直接返回 error 和 error_description 而不是嵌套的 ApiError 对象)，
  // 则需要在此处添加特定逻辑。当前 BaseError.toApiResponse() 已经转换为 ApiError 结构。
  // If OAuth2Error specific response format is needed (e.g. returning error and error_description directly
  // instead of nested ApiError object), specific logic would be added here.
  // Currently BaseError.toApiResponse() already converts to ApiError structure.

  // 对于未知类型的错误，返回一个通用的500错误响应
  // For unknown error types, return a generic 500 error response
  const genericErrorResponse: ApiResponse<never> = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred.',
      details: { requestId: currentRequestId },
    },
  };
  return NextResponse.json(genericErrorResponse, { status: 500 });
}

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
export function withErrorHandling<T extends NextRequest, P = any>(
  handler: (req: T, params?: P) => Promise<NextResponse>
): (req: T, params?: P) => Promise<NextResponse> {
  return async (req: T, params?: P): Promise<NextResponse> => {
    const requestId = uuidv4(); // 为每个请求生成唯一的ID (Generate a unique ID for each request)

    // 可以选择将 requestId 附加到请求对象上，以便在处理程序内部访问
    // Optionally attach requestId to the request object for access within the handler
    (req as any).requestId = requestId;

    try {
      return await handler(req, params); // 执行原始处理程序 (Execute the original handler)
    } catch (error) {
      // 如果处理程序抛出错误，则使用 handleError 进行处理
      // If the handler throws an error, handle it using handleError
      return handleError(error, req, requestId);
    }
  };
}

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
export async function safeExecute<T>(
  fn: () => Promise<T> | T,
  failureMessage: string = 'Operation failed',
  ErrorType: new (...args: any[]) => BaseError = ValidationError // 默认使用具体的错误类型
): Promise<{ data?: T; error?: BaseError }> {
  try {
    const result = await fn(); // 执行函数 (Execute the function)
    return { data: result }; // 返回成功结果 (Return success result)
  } catch (error: any) {
    // 如果函数执行过程中发生错误
    // If an error occurs during function execution
    const requestId = uuidv4(); // 为此错误事件生成ID (Generate ID for this error event)
    logError(error, undefined, requestId); // 记录原始错误 (Log the original error)

    // 如果错误已经是 BaseError 的实例，则直接返回它
    // If the error is already an instance of BaseError, return it directly
    if (error instanceof BaseError) {
      return { error };
    }
    // 否则，创建一个新的指定类型的错误实例
    // Otherwise, create a new instance of the specified error type
    return {
      error: new ErrorType(
        `${failureMessage}: ${error.message || 'Unknown reason'}`,
        error.status || 500, // 尝试使用原始错误的状态码 (Try to use status from original error)
        error.code || 'OPERATION_FAILED', // 尝试使用原始错误的代码 (Try to use code from original error)
        { originalErrorName: error.name, requestId } // 包含原始错误名称和请求ID到上下文中 (Include original error name and request ID in context)
      ),
    };
  }
}

/**
 * 错误处理中间件
 * Error handling middleware
 */

export type RouteHandler = (req: NextRequest, ...args: any[]) => Promise<NextResponse>;

/**
 * 错误处理包装器，用于 API 路由
 * Error handling wrapper for API routes
 */
export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (req: NextRequest, ...args: any[]): Promise<NextResponse> => {
    try {
      return await handler(req, ...args);
    } catch (error) {
      console.error('API route error:', error);

      if (error instanceof BaseError) {
        return NextResponse.json(
          {
            success: false,
            error: error.code,
            message: error.message,
          },
          { status: error.status }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        },
        { status: 500 }
      );
    }
  };
}

/**
 * 错误响应处理
 * Error response handling
 */
export function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json(
    {
      success: false,
      error: errorCode || 'ERROR',
      message,
    },
    { status }
  );
}

/**
 * 成功响应处理
 * Success response handling
 */
export function successResponse(data: any, message?: string, status: number = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
      message: message || 'Success',
    },
    { status }
  );
}
