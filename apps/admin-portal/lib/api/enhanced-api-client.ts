/**
 * EnhancedAPIClient - Enhanced API client with automatic retry and error handling
 * 
 * Features:
 * - Automatic token refresh
 * - Request retry with exponential backoff
 * - Request/response interceptors
 * - Error handling and recovery
 * - Request deduplication
 */

import { TokenStorage } from '../auth/token-storage';
import { TokenRefreshManager } from '../auth/token-refresh';
import { triggerAuthError, triggerNetworkError, triggerApiError } from '@/components/error/global-error-handler';

interface RequestOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
  skipAuthRefresh?: boolean;
  dedupeKey?: string;
}

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

export class EnhancedAPIClient {
  private static readonly BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v2';
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000;
  private static readonly TIMEOUT = 30000;
  
  private static pendingRequests = new Map<string, PendingRequest>();
  private static tokenRefreshManager: TokenRefreshManager | null = null;

  /**
   * Initialize the API client
   */
  static initialize() {
    if (typeof window !== 'undefined') {
      this.tokenRefreshManager = new TokenRefreshManager();
      // Generate CSRF token if not exists
      if (!this.getCSRFToken()) {
        this.generateCSRFToken();
      }
    }
  }

  /**
   * Make an HTTP request with enhanced error handling and retry logic
   */
  static async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const {
      retries = this.MAX_RETRIES,
      retryDelay = this.RETRY_DELAY,
      skipAuthRefresh = false,
      dedupeKey,
      ...fetchOptions
    } = options;

    // Request deduplication
    if (dedupeKey) {
      const existingRequest = this.pendingRequests.get(dedupeKey);
      if (existingRequest) {
        return existingRequest.promise;
      }
    }

    const url = `${this.BASE_URL}${endpoint}`;
    const requestPromise = this.makeRequestWithRetry<T>(url, {
      ...fetchOptions,
      retries,
      retryDelay,
      skipAuthRefresh,
    });

    if (dedupeKey) {
      this.pendingRequests.set(dedupeKey, {
        promise: requestPromise,
        timestamp: Date.now(),
      });

      // Clean up pending requests after 5 seconds
      setTimeout(() => {
        this.pendingRequests.delete(dedupeKey);
      }, 5000);
    }

    return requestPromise;
  }

  /**
   * Make request with retry logic
   */
  private static async makeRequestWithRetry<T>(
    url: string,
    options: RequestOptions & { retries: number; retryDelay: number; skipAuthRefresh: boolean }
  ): Promise<T> {
    const { retries, retryDelay, skipAuthRefresh, ...fetchOptions } = options;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.makeSingleRequest<T>(url, fetchOptions, skipAuthRefresh);
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on certain errors
        if (this.shouldNotRetry(error)) {
          break;
        }

        // Wait before retrying (exponential backoff)
        if (attempt < retries) {
          const delay = retryDelay * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Make a single request with authentication
   */
  private static async makeSingleRequest<T>(
    url: string,
    options: RequestInit,
    skipAuthRefresh: boolean
  ): Promise<T> {
    // Prepare headers
    const headers = new Headers(options.headers || {});
    
    // Add authentication header
    if (!skipAuthRefresh) {
      const accessToken = TokenStorage.getAccessToken();
      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
      }
    }

    // Add CSRF token for state-changing requests
    if (options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) {
      const csrfToken = this.getCSRFToken();
      if (csrfToken) {
        headers.set('X-CSRF-Token', csrfToken);
      }
    }

    // Add default headers
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    // Add security headers
    headers.set('X-Requested-With', 'XMLHttpRequest');
    headers.set('X-Content-Type-Options', 'nosniff');

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
        // Add security attributes
        credentials: 'same-origin',
        mode: 'same-origin',
      });

      clearTimeout(timeoutId);

      // Handle CSRF errors
      if (response.status === 403) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.code === 'csrf_token_invalid') {
          throw new Error('CSRF token validation failed');
        }
      }

      // Handle authentication errors
      if (response.status === 401 && !skipAuthRefresh) {
        return await this.handleAuthError<T>(url, options);
      }

      // Handle other HTTP errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      throw error;
    }
  }

  /**
   * Get CSRF token from cookie
   */
  private static getCSRFToken(): string | null {
    try {
      const csrfToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('csrf_token='));
      return csrfToken ? csrfToken.split('=')[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Generate and set CSRF token
   */
  private static generateCSRFToken(): string {
    const array = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    const token = btoa(String.fromCharCode(...array)).replace(/[+/=]/g, '');
    
    // Set CSRF token cookie
    const isSecure = window.location.protocol === 'https:';
    const cookie = `csrf_token=${token}; Path=/; SameSite=Lax${isSecure ? '; Secure' : ''}`;
    document.cookie = cookie;
    
    return token;
  }

  /**
   * Handle authentication errors with token refresh
   */
  private static async handleAuthError<T>(url: string, options: RequestInit): Promise<T> {
    if (!this.tokenRefreshManager) {
      throw new Error('Token refresh manager not available');
    }

    try {
      // Try to refresh the token
      await this.tokenRefreshManager.refreshTokens();
      
      // Retry the request with the new token
      return this.makeSingleRequest<T>(url, options, true);
    } catch (refreshError) {
      // Token refresh failed, trigger auth error event
      triggerAuthError(
        '认证失败，请重新登录',
        refreshError instanceof Error ? refreshError.message : 'Token refresh failed',
        false
      );
      
      // Clear tokens and redirect to login
      TokenStorage.clearTokens();
      throw new Error('Authentication failed');
    }
  }

  /**
   * Check if request should not be retried
   */
  private static shouldNotRetry(error: any): boolean {
    // Don't retry on authentication errors (they're handled separately)
    if (error.message?.includes('401') || error.message?.includes('Authentication failed')) {
      return true;
    }

    // Don't retry on validation errors
    if (error.message?.includes('400') || error.message?.includes('Validation failed')) {
      return true;
    }

    // Don't retry on not found errors
    if (error.message?.includes('404') || error.message?.includes('Not found')) {
      return true;
    }

    // Don't retry on network errors if we're offline
    if (!navigator.onLine) {
      return true;
    }

    return false;
  }

  /**
   * Sleep utility for retry delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * GET request helper
   */
  static async get<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request helper
   */
  static async post<T>(endpoint: string, data?: any, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * PUT request helper
   */
  static async put<T>(endpoint: string, data?: any, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * DELETE request helper
   */
  static async delete<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * PATCH request helper
   */
  static async patch<T>(endpoint: string, data?: any, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Upload file helper
   */
  static async upload<T>(endpoint: string, file: File, options: RequestOptions = {}): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    });
  }
}

// Initialize the API client when the module is loaded
if (typeof window !== 'undefined') {
  EnhancedAPIClient.initialize();
}