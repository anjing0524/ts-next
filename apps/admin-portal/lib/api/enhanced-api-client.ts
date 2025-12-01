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
import { triggerAuthError, triggerNetworkError, triggerApiError } from '@/components/error/global-error-handler';

export interface RequestOptions extends RequestInit {
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
  private static readonly BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:6188/api/v2';
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000;
  private static readonly TIMEOUT = 30000;
  private static readonly OAUTH_SERVICE_URL = process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:6188';
  private static readonly OAUTH_CLIENT_ID = process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'auth-center-admin-client';

  private static pendingRequests = new Map<string, PendingRequest>();
  private static refreshTokenPromise: Promise<boolean> | null = null;


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
        // Add security attributes (defaults, can be overridden by options)
        credentials: 'same-origin',
        mode: 'same-origin',
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle CSRF errors
      if (response.status === 403) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.code === 'csrf_token_invalid') {
          throw new Error('CSRF token validation failed');
        }
      }

      // Handle authentication errors - attempt automatic refresh
      if (response.status === 401 && !skipAuthRefresh) {
        // Attempt to refresh the access token
        const refreshed = await this.attemptTokenRefresh();
        if (refreshed) {
          // Token was successfully refreshed, retry the request
          // Get the new access token and make the request again
          const newAccessToken = TokenStorage.getAccessToken();
          if (newAccessToken) {
            headers.set('Authorization', `Bearer ${newAccessToken}`);
            // Retry the request with the new token
            const retryResponse = await fetch(url, {
              credentials: 'same-origin',
              mode: 'same-origin',
              ...options,
              headers,
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!retryResponse.ok) {
              const errorData = await retryResponse.json().catch(() => ({}));
              throw new Error(errorData.message || `HTTP ${retryResponse.status}`);
            }
            return await retryResponse.json();
          }
        }

        // If refresh failed, clear tokens and fail the request
        TokenStorage.clearTokens();
        triggerAuthError('Session expired. Please log in again.');
        throw new Error('Token refresh failed');
      }

      // Handle other HTTP errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }

      throw error;
    }
  }

  /**
   * Attempt to refresh the access token using the refresh token
   * Handles deduplication - only one refresh request at a time
   */
  private static async attemptTokenRefresh(): Promise<boolean> {
    try {
      // If a refresh is already in progress, wait for it
      if (this.refreshTokenPromise) {
        return await this.refreshTokenPromise;
      }

      // Get the refresh token
      const refreshToken = TokenStorage.getRefreshToken();
      if (!refreshToken) {
        console.warn('No refresh token available');
        return false;
      }

      // Create the refresh promise
      this.refreshTokenPromise = this.performTokenRefresh(refreshToken);

      try {
        return await this.refreshTokenPromise;
      } finally {
        // Clear the refresh promise
        this.refreshTokenPromise = null;
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      return false;
    }
  }

  /**
   * Perform the actual token refresh request
   */
  private static async performTokenRefresh(refreshToken: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.OAUTH_SERVICE_URL}/api/v2/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.OAUTH_CLIENT_ID,
        }),
      });

      if (!response.ok) {
        console.error('Token refresh failed with status:', response.status);
        return false;
      }

      const data = await response.json();

      if (data.access_token) {
        // SECURITY: Verify that refresh token was rotated (OAuth 2.1 requirement)
        // A non-rotated refresh token could indicate a replay attack
        if (!data.refresh_token || data.refresh_token === refreshToken) {
          console.error('Security violation: Refresh token was not rotated by the server');
          // Clear tokens to force re-authentication
          TokenStorage.clearTokens();
          triggerAuthError('Security check failed. Please log in again.');
          return false;
        }

        // Store the new tokens
        TokenStorage.setTokens({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresIn: data.expires_in || 3600,
        });
        return true;
      }

      return false;
    } catch (error) {
      console.error('Token refresh request error:', error);
      return false;
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
      return csrfToken ? csrfToken.split('=')[1] || null : null;
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
