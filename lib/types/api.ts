// lib/types/api.ts
/**
 * @fileoverview API相关的通用类型定义 (General type definitions related to API)
 * @author 开发团队 (Development Team)
 * @since 1.0.0
 */

/**
 * API错误对象结构 (API Error Object Structure)
 * 用于在API响应中标准化错误信息 (Used to standardize error information in API responses)
 */
export interface ApiError {
  /**
   * 错误代码 (Error code)
   * 通常是一个简短的、程序可读的字符串，用于标识特定的错误类型。
   * (Usually a short, programmatically readable string to identify the specific error type.)
   */
  code: string;

  /**
   * 错误消息 (Error message)
   * 一个人类可读的错误描述，可以展示给最终用户或用于日志记录。
   * (A human-readable description of the error, which can be shown to the end-user or used for logging.)
   */
  message: string;

  /**
   * 错误的详细信息 (Detailed error information - optional)
   * 一个可选的对象，包含关于错误的更具体的技术细节或上下文信息，有助于调试。
   * (An optional object containing more specific technical details or contextual information about the error, useful for debugging.)
   */
  details?: Record<string, any>;

  /**
   * @deprecated 旧版 context，请使用 details 字段。 (Legacy context, please use the details field.)
   * 用于兼容旧版错误结构中可能存在的 context 字段。新实现应优先使用 'details'。
   * (For compatibility with legacy error structures that might have a context field. New implementations should prefer 'details'.)
   */
  context?: Record<string, any>;
}

/**
 * API响应体结构 (API Response Body Structure)
 * @template T 成功响应时的数据类型 (Data type for successful response)
 * 这是一个通用的API响应结构，用于标准化所有API的返回格式。
 * (This is a generic API response structure used to standardize the return format of all APIs.)
 */
export interface ApiResponse<T = any> {
  /**
   * 表示操作是否成功 (Indicates if the operation was successful)
   * `true` 表示操作成功完成，`false` 表示操作失败。
   * (`true` indicates the operation completed successfully, `false` indicates failure.)
   */
  success: boolean;

  /**
   * 成功时返回的数据 (Data returned on success - optional)
   * 当 `success` 为 `true` 时，此字段可能包含请求的结果数据。
   * (When `success` is `true`, this field may contain the result data of the request.)
   */
  data?: T;

  /**
   * 失败时返回的错误对象 (Error object returned on failure - optional)
   * 当 `success` 为 `false` 时，此字段应包含一个 `ApiError` 对象，描述发生的错误。
   * (When `success` is `false`, this field should contain an `ApiError` object describing the error that occurred.)
   */
  error?: ApiError;

  /**
   * 可选的补充消息 (Optional supplementary message)
   * 一个可选的字符串，可以提供关于响应的额外信息（例如，成功消息或关于错误的进一步提示）。
   * (An optional string that can provide additional information about the response (e.g., a success message or further hints about an error).)
   */
  message?: string;
}

/**
 * 标准错误响应体 (Standard Error Response Body)
 * @deprecated 直接使用 `ApiResponse<never>` 并填充 `error` 字段。 (Use `ApiResponse<never>` directly and populate the `error` field.)
 * 此接口定义了一个仅包含错误信息的响应结构。为了统一响应格式，推荐使用 `ApiResponse<T>`，
 * 其中 `T` 可以是 `never` (如果错误时不返回数据)，并将 `success` 设置为 `false`。
 * (This interface defines a response structure containing only error information. To unify response formats, it's recommended to use `ApiResponse<T>`,
 * where `T` can be `never` (if no data is returned on error), and `success` is set to `false`.)
 */
export interface ApiErrorResponse {
    /**
     * 包含错误详细信息的对象。
     * (Object containing detailed error information.)
     */
    error: ApiError;
}
