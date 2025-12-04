"use server";

import { revalidatePath, revalidateTag } from "next/cache";

/**
 * Server Action 返回结果的标准接口
 * Standard interface for Server Action return results
 */
export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
  code?: string;
}

/**
 * Server Action 错误类型定义
 * Server Action error type definition
 */
export class ActionError extends Error {
  constructor(
    public message: string,
    public code: string = "ACTION_ERROR",
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "ActionError";
  }
}

/**
 * 验证 Server 端操作权限的基类
 * Base class for validating server-side operation permissions
 */
export interface AuthContext {
  userId?: string;
  email?: string;
  role?: string;
  permissions?: string[];
}

/**
 * Server Action 模板函数 - 标准化处理和错误管理
 *
 * 使用示例 / Usage example:
 * ```typescript
 * export const updateUser = async (userId: string, data: UserData) => {
 *   return serverActionTemplate<User>(
 *     async () => {
 *       // 验证权限 / Validate permissions
 *       // 调用 API / Call API
 *       const response = await api.updateUser(userId, data);
 *       return response;
 *     },
 *     ["users", `user-${userId}`] // 需要重新验证的缓存标签 / Cache tags to revalidate
 *   );
 * };
 * ```
 *
 * @param handler - 异步处理函数 / Async handler function
 * @param invalidateTags - 需要重新验证的缓存标签 / Cache tags to revalidate
 * @param invalidatePaths - 需要重新生成的路径 / Paths to revalidate
 * @returns ActionResult<T> - 标准化的操作结果 / Standardized operation result
 */
export async function serverActionTemplate<T = unknown>(
  handler: () => Promise<T>,
  options?: {
    invalidateTags?: string[];
    invalidatePaths?: string[];
  }
): Promise<ActionResult<T>> {
  try {
    const startTime = Date.now();

    // 执行处理函数 / Execute handler
    const data = await handler();

    // 重新验证指定的缓存标签 / Revalidate specified cache tags
    if (options?.invalidateTags && options.invalidateTags.length > 0) {
      for (const tag of options.invalidateTags) {
        revalidateTag(tag);
      }
    }

    // 重新生成指定的路径 / Revalidate specified paths
    if (options?.invalidatePaths && options.invalidatePaths.length > 0) {
      for (const path of options.invalidatePaths) {
        revalidatePath(path);
      }
    }

    return {
      success: true,
      data,
      timestamp: Date.now(),
    };
  } catch (error) {
    const errorMessage =
      error instanceof ActionError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unknown error occurred";

    const errorCode =
      error instanceof ActionError
        ? error.code
        : "UNKNOWN_ERROR";

    console.error("[Server Action Error]", {
      message: errorMessage,
      code: errorCode,
      error,
    });

    return {
      success: false,
      error: errorMessage,
      code: errorCode,
      timestamp: Date.now(),
    };
  }
}

/**
 * 创建带权限验证的 Server Action 模板
 * Create a Server Action template with permission validation
 *
 * 使用示例 / Usage example:
 * ```typescript
 * const deleteUser = createSecureAction<{ userId: string }>(
 *   async (input, auth) => {
 *     if (!auth.permissions?.includes("admin:delete-users")) {
 *       throw new ActionError("Insufficient permissions", "FORBIDDEN", 403);
 *     }
 *     return api.deleteUser(input.userId);
 *   },
 *   { requiredRole: "admin" }
 * );
 * ```
 */
export function createSecureAction<TInput = unknown, TOutput = unknown>(
  handler: (input: TInput, auth: AuthContext) => Promise<TOutput>,
  options?: {
    requiredRole?: string;
    requiredPermissions?: string[];
  }
) {
  return async (input: TInput, auth: AuthContext): Promise<ActionResult<TOutput>> => {
    // 验证角色 / Validate role
    if (options?.requiredRole && auth.role !== options.requiredRole) {
      return {
        success: false,
        error: "Insufficient permissions",
        code: "FORBIDDEN",
        timestamp: Date.now(),
      };
    }

    // 验证权限 / Validate permissions
    if (options?.requiredPermissions && auth.permissions) {
      const hasPermissions = options.requiredPermissions.every((perm) =>
        auth.permissions?.includes(perm)
      );

      if (!hasPermissions) {
        return {
          success: false,
          error: "Insufficient permissions",
          code: "FORBIDDEN",
          timestamp: Date.now(),
        };
      }
    }

    return serverActionTemplate<TOutput>(
      () => handler(input, auth)
    );
  };
}

/**
 * 从请求头获取认证上下文
 * Extract authentication context from request headers
 *
 * 注意：这是一个占位实现，需要根据实际的认证方案调整
 * Note: This is a placeholder implementation, adjust based on your actual auth scheme
 */
export async function getAuthContext(): Promise<AuthContext> {
  // TODO: 根据实际认证方案实现 / Implement based on your actual auth scheme
  // 例如从 headers() 或 cookies() 获取信息 / e.g., extract from headers() or cookies()
  return {};
}

/**
 * 分页参数标准化
 * Normalize pagination parameters
 */
export interface PaginationInput {
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
}

export function normalizePagination(input: PaginationInput) {
  const pageSize = input.pageSize || input.limit || 10;
  const page = input.page || 1;
  const offset = input.offset || (page - 1) * pageSize;

  return {
    pageSize,
    page,
    offset,
  };
}

/**
 * 排序参数标准化
 * Normalize sort parameters
 */
export interface SortInput {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export function normalizeSort(input: SortInput) {
  return {
    sortBy: input.sortBy || "createdAt",
    sortOrder: (input.sortOrder || "desc") as "asc" | "desc",
  };
}
