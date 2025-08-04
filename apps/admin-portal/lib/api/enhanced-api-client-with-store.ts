/**
 * Enhanced API client with Zustand integration
 * 
 * Integrates with global state management for caching, loading states, and error handling
 */

import { EnhancedAPIClient, RequestOptions } from './enhanced-api-client';
import { useAppStore, useAPI } from '@/store';

interface CachedRequestOptions extends RequestOptions {
  cacheKey?: string;
  cacheTTL?: number;
  skipCache?: boolean;
  showLoading?: boolean;
  showError?: boolean;
  loadingKey?: string;
  errorKey?: string;
}

export class EnhancedAPIClientWithStore {
  /**
   * Make an HTTP request with store integration
   */
  static async request<T>(
    endpoint: string,
    options: CachedRequestOptions = {}
  ): Promise<T> {
    const {
      cacheKey,
      cacheTTL = 300000, // 5 minutes default
      skipCache = false,
      showLoading = true,
      showError = true,
      loadingKey,
      errorKey = endpoint,
      ...fetchOptions
    } = options;

    const store = useAppStore.getState();
    const apiStore = useAPI.getState();

    // Check cache first
    if (!skipCache && cacheKey) {
      const cached = apiStore.getCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Set loading state
    if (showLoading && loadingKey) {
      store.setLoadingState(loadingKey, true);
    }

    try {
      // Make the request
      const result = await EnhancedAPIClient.request<T>(endpoint, fetchOptions);

      // Cache the result
      if (!skipCache && cacheKey) {
        apiStore.setCache(cacheKey, result, cacheTTL);
      }

      // Clear any previous error
      if (errorKey) {
        apiStore.clearAPIError(errorKey);
      }

      return result;
    } catch (error) {
      // Handle error
      if (showError && errorKey) {
        const errorMessage = error instanceof Error ? error.message : 'Request failed';
        apiStore.setAPIError(errorKey, errorMessage);
        
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
        store.setLoadingState(loadingKey, false);
      }
    }
  }

  /**
   * GET request with caching
   */
  static async get<T>(
    endpoint: string,
    options: CachedRequestOptions = {}
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  static async post<T>(
    endpoint: string,
    data?: any,
    options: CachedRequestOptions = {}
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
    options: CachedRequestOptions = {}
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
    options: CachedRequestOptions = {}
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * PATCH request
   */
  static async patch<T>(
    endpoint: string,
    data?: any,
    options: CachedRequestOptions = {}
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
    options: CachedRequestOptions = {}
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
  static clearCache(key?: string) {
    const apiStore = useAPI.getState();
    apiStore.clearCache(key);
  }

  /**
   * Prefetch data for better performance
   */
  static async prefetch<T>(
    endpoints: Array<{
      endpoint: string;
      options: CachedRequestOptions;
    }>
  ) {
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

  /**
   * Retry failed requests
   */
  static async retryFailedRequests() {
    const apiStore = useAPI.getState();
    const failedRequests = Object.keys(apiStore.errors);

    for (const errorKey of failedRequests) {
      // Extract endpoint from error key (assuming error key is the endpoint)
      const endpoint = errorKey;
      
      try {
        await this.request(endpoint, {
          showLoading: true,
          showError: false,
          errorKey,
        });
      } catch (error) {
        // Retry failed, keep the error
        console.error(`Retry failed for ${endpoint}:`, error);
      }
    }
  }

  /**
   * Get cache statistics
   */
  static getCacheStats() {
    const apiStore = useAPI.getState();
    const cache = apiStore.cache;
    
    const stats = {
      totalEntries: Object.keys(cache).length,
      expiredEntries: 0,
      size: 0,
      entries: [] as Array<{
        key: string;
        size: number;
        ttl: number;
        age: number;
      }>,
    };

    const now = Date.now();
    
    Object.entries(cache).forEach(([key, entry]) => {
      const size = JSON.stringify(entry.data).length;
      const age = now - entry.timestamp;
      const ttl = entry.ttl;
      
      stats.size += size;
      stats.entries.push({ key, size, ttl, age });
      
      if (age > ttl) {
        stats.expiredEntries++;
      }
    });

    return stats;
  }

  /**
   * Cleanup expired cache entries
   */
  static cleanupCache() {
    const apiStore = useAPI.getState();
    const cache = apiStore.cache;
    const now = Date.now();
    
    const expiredKeys = Object.keys(cache).filter(key => {
      const entry = cache[key];
      return now - entry.timestamp > entry.ttl;
    });

    expiredKeys.forEach(key => {
      apiStore.clearCache(key);
    });

    return expiredKeys.length;
  }
}