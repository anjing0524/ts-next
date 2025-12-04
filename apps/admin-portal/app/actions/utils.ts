/**
 * Server Actions 工具函数 (Server Actions Utilities)
 *
 * 提供统一的错误处理和响应处理工具
 * Provides unified error handling and response utilities
 */

import { ActionResult } from './types';

/**
 * 错误包装器 (Error Wrapper)
 * 将错误转换为可读的错误消息
 * Converts errors to readable error messages
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return '发生未知错误 (Unknown error occurred)';
}

/**
 * 带错误处理的异步操作包装器 (Async Operation Wrapper)
 * 统一处理所有 Server Actions 的成功/失败响应
 * Unified handling of success/failure responses for all Server Actions
 *
 * @param operation - 异步操作 (Async operation)
 * @param fallbackError - 后备错误消息 (Fallback error message)
 * @returns 统一格式的结果 (Unified format result)
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  fallbackError: string = '操作失败 (Operation failed)',
): Promise<ActionResult<T>> {
  try {
    const data = await operation();
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error) || fallbackError,
    };
  }
}

/**
 * 验证分页参数 (Validate Pagination Parameters)
 * 确保分页参数有效
 * Ensures pagination parameters are valid
 *
 * @param page - 页码 (Page number)
 * @param page_size - 每页数量 (Items per page)
 * @returns 验证后的参数 (Validated parameters)
 */
export function validatePaginationParams(
  page?: number,
  page_size?: number,
): { page: number; page_size: number } {
  const validPage = Math.max(1, page || 1);
  const validPageSize = Math.max(1, Math.min(page_size || 10, 100)); // 最大 100 items per page
  return { page: validPage, page_size: validPageSize };
}

/**
 * 从 JSON 响应中提取分页数据 (Extract Paginated Data from JSON)
 * 处理从 NAPI SDK 返回的分页响应
 * Processes paginated responses from NAPI SDK
 *
 * @param data - JSON 响应数据 (JSON response data)
 * @returns 提取的分页数据 (Extracted paginated data)
 */
export function extractPaginatedData<T>(
  data: any,
): { items: T[]; total: number; page: number; page_size: number; has_more: boolean } {
  return {
    items: data?.items || [],
    total: data?.total || 0,
    page: data?.page || 1,
    page_size: data?.page_size || 10,
    has_more: data?.has_more || false,
  };
}

/**
 * 验证必填字段 (Validate Required Fields)
 * 检查对象中的必填字段是否存在
 * Checks if required fields exist in an object
 *
 * @param obj - 对象 (Object to validate)
 * @param fields - 必填字段名列表 (Required field names)
 * @throws 如果缺少必填字段则抛出错误 (Throws if required fields are missing)
 */
export function validateRequired(obj: any, fields: string[]): void {
  for (const field of fields) {
    if (!obj[field]) {
      throw new Error(`缺少必填字段: ${field} (Missing required field: ${field})`);
    }
  }
}

/**
 * 日志记录工具 (Logging Utility)
 * 用于 Server Actions 中的调试日志
 * For debugging logs in Server Actions
 */
export const logger = {
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${message}`, data);
  },
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${message}`, error);
  },
  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${message}`, data);
  },
};
