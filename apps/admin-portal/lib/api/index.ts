/**
 * Consolidated API and Auth Library - Unified entry point
 *
 * This file serves as the single entry point for all API and auth functionality
 * after the consolidation of legacy files.
 */

import { APIClient, type RequestOptions } from './api-client-consolidated';

// API Client (consolidated)
export { APIClient } from './api-client-consolidated';
export { APIClient as EnhancedAPIClient } from './api-client-consolidated';
export type { RequestOptions } from './api-client-consolidated';

// Token Storage (consolidated)
export { TokenStorage } from '../auth/token-storage-consolidated';
export type { TokenStorageOptions } from '../auth/token-storage-consolidated';

// Supporting modules
export { APICacheLayer } from './cache-layer';
export { RetryWithCircuitBreaker } from './retry-with-circuit-breaker';

// Auth-related exports
export { EnhancedTokenStorage as AuthTokenStorage } from '../auth/enhanced-token-storage';

// --- Convenient API Request Functions ---

/**
 * 发送 API 请求的通用函数
 *
 * 使用示例：
 * ```typescript
 * const data = await apiRequest<ResponseType>('/endpoint', {
 *   method: 'POST',
 *   body: JSON.stringify(payload),
 * });
 * ```
 */
export const apiRequest = <T = any>(
  endpoint: string,
  options?: RequestOptions
): Promise<T> => APIClient.request<T>(endpoint, options);

/**
 * Admin Portal 特定功能的 API 助手函数集合
 *
 * 这些函数提供针对特定场景的便捷 API 调用，例如 OAuth 同意页面
 */
export const adminApi = {
  /**
   * 提交用户的授权同意决定
   *
   * @param action - 用户的决定：'allow' 允许 或 'deny' 拒绝
   * @param params - OAuth 参数（包括 client_id, redirect_uri, scope 等）
   * @returns 包含重定向 URI 的响应
   *
   * 工作流程：
   * 1. 用户在同意页面选择"允许"或"拒绝"
   * 2. 调用此函数提交决定到 OAuth Service
   * 3. OAuth Service 验证用户和权限
   * 4. 如果允许，生成授权码并返回重定向 URI
   * 5. 如果拒绝，返回带 error=access_denied 的重定向 URI
   * 6. 前端重定向到返回的 URI
   */
  async submitConsent(
    action: 'allow' | 'deny',
    params: URLSearchParams
  ): Promise<{ redirect_uri: string }> {
    const response = await apiRequest<{ redirect_uri: string }>(
      '/oauth/consent/submit',
      {
        method: 'POST',
        body: JSON.stringify({
          decision: action,
          ...Object.fromEntries(params),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        skipCache: true, // 不缓存同意决定
      }
    );
    return response;
  },
};

// Utility exports (removed to fix compilation issues)
// Note: Use direct imports instead: import { APIClient } from '@/lib/api'