/**
 * Consolidated API Client - Unified HTTP client
 * 
 * This is the primary API client implementation that combines:
 * - EnhancedAPIClient (feature-rich)
 * - EnhancedAPIClientWithStore (Zustand integration)
 * - RetryWithCircuitBreaker (resilience)
 * - APICacheLayer (caching)
 * 
 * Features:
 * - Automatic retry with exponential backoff
 * - Circuit breaker pattern
 * - Token refresh
 * - CSRF protection
 * - SSR compatibility
 * - Request deduplication
 * - Cache integration
 * - Error handling
 */

import { EnhancedAPIClient } from './enhanced-api-client';
import { RetryWithCircuitBreaker } from './retry-with-circuit-breaker';
import { APICacheLayer } from './cache-layer';
import { useAppStore } from '@/store';

export interface RequestOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
  skipAuthRefresh?: boolean;
  dedupeKey?: string;
  cacheKey?: string;
  cacheTTL?: number;
  skipCache?: boolean;
  showLoading?: boolean;
  showError?: boolean;
  loadingKey?: string;
  errorKey?: string;
  forceRefresh?: boolean;
  staleWhileRevalidate?: boolean;
  useCircuitBreaker?: boolean;
  circuitBreakerKey?: string;
}

export class APIClient {
  private static readonly BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:6188/api/v2';
  private static cache = APICacheLayer.getInstance();

  /**
   * Make an HTTP request with all consolidated features
   */
  static async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const {
      cacheKey,
      cacheTTL = 300000, // 5 minutes default
      skipCache = false,
      showLoading = true,
      showError = true,
      loadingKey,
      errorKey = endpoint,
      useCircuitBreaker = true,
      circuitBreakerKey = endpoint,
      forceRefresh = false,
      staleWhileRevalidate = false,
      ...fetchOptions
    } = options;

    const url = `${this.BASE_URL}${endpoint}`;
    const cacheKeyFinal = cacheKey || `${options.method || 'GET'}:${url}`;

    // SSR check
    if (typeof window === 'undefined') {
      // Server-side: skip caching and store integration
      return this.serverSideRequest<T>(url, fetchOptions);
    }

    const store = useAppStore.getState();

    // Check cache first if enabled
    if (!skipCache && !forceRefresh) {
      const cached = this.cache.get<T>(url, fetchOptions, {
        key: cacheKeyFinal,
        ttl: cacheTTL,
        staleWhileRevalidate,
      });
      if (cached) {
        return cached;
      }
    }

    // Set loading state
    if (showLoading && loadingKey) {
      store.setLoadingState(loadingKey, true);
    }

    try {
      let result: T;

      if (useCircuitBreaker) {
        // Use circuit breaker pattern
        result = await RetryWithCircuitBreaker.execute<T>(
          circuitBreakerKey,
          () => EnhancedAPIClient.request<T>(endpoint, fetchOptions),
          {
            maxAttempts: options.retries || 3,
            baseDelay: options.retryDelay || 1000,
          }
        );
      } else {
        // Use basic retry logic from EnhancedAPIClient
        result = await EnhancedAPIClient.request<T>(endpoint, fetchOptions);
      }

      // Cache the result
      if (!skipCache) {
        this.cache.set(url, result, fetchOptions, {
          key: cacheKeyFinal,
          ttl: cacheTTL,
        });
      }

      // Clear any previous error
      if (errorKey) {
        store.clearAPIError(errorKey);
      }

      return result;
    } catch (error) {
      // Handle error
      if (showError && errorKey) {
        const errorMessage = error instanceof Error ? error.message : 'Request failed';
        store.setAPIError(errorKey, errorMessage);
        
        // Show notification
        store.addNotification({
          type: 'error',
          message: errorMessage,
        });
      }

      throw error;
    } finally {
      // Clear loading state
      if (showLoading && loadingKey) {
        store.clearLoadingState(loadingKey);
      }
    }
  }

  /**
   * Server-side request (SSR compatible)
   */
  private static async serverSideRequest<T>(url: string, options: RequestInit): Promise<T> {
    // In SSR, skip authentication and caching
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Check if running in SSR environment
   */
  static isSSR(): boolean {
    return typeof window === 'undefined';
  }

  /**
   * Safe request that handles SSR gracefully
   */
  static async safeRequest<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T | null> {
    try {
      return await this.request<T>(endpoint, options);
    } catch (error) {
      if (this.isSSR()) {
        // In SSR, fail gracefully and return null
        console.warn(`SSR request failed for ${endpoint}:`, error);
        return null;
      }
      throw error;
    }
  }

  /**
   * GET request with caching
   */
  static async get<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  static async post<T>(
    endpoint: string,
    data?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * PUT request
   */
  static async put<T>(
    endpoint: string,
    data?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * DELETE request
   */
  static async delete<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * PATCH request
   */
  static async patch<T>(
    endpoint: string,
    data?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Upload file
   */
  static async upload<T>(
    endpoint: string,
    file: File,
    options: RequestOptions = {}
  ): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    });
  }

  /**
   * Clear cache for specific endpoint or all cache
   */
  static clearCache(key?: string): void {
    if (key) {
      this.cache.remove(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): any {
    return this.cache.getStats();
  }

  /**
   * Cleanup expired cache entries
   */
  static cleanupCache(): number {
    const before = this.cache.getSize();
    this.cache.cleanup();
    const after = this.cache.getSize();
    return before - after;
  }

  /**
   * Prefetch data for better performance
   */
  static async prefetch<T>(
    endpoints: Array<{
      endpoint: string;
      options?: RequestOptions;
    }>
  ): Promise<void> {
    // Use requestIdleCallback for non-critical prefetching
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => {
        endpoints.forEach(({ endpoint, options }) => {
          this.request<T>(endpoint, {
            ...options,
            showLoading: false,
            showError: false,
          }).catch(() => {
            // Silent fail for prefetch
          });
        });
      });
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(() => {
        endpoints.forEach(({ endpoint, options }) => {
          this.request<T>(endpoint, {
            ...options,
            showLoading: false,
            showError: false,
          }).catch(() => {
            // Silent fail for prefetch
          });
        });
      }, 1000);
    }
  }
}

// Re-export for backward compatibility
export { APIClient as EnhancedAPIClient };
export default APIClient;