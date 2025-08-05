/**
 * TokenRefreshManager - Handles automatic token refresh functionality
 * 
 * This class provides:
 * - Token expiration detection
 * - Automatic refresh using refresh tokens
 * - Race condition prevention
 * - Graceful error handling
 * - Session continuity maintenance
 */

import { TokenStorage } from './token-storage';
import { TokenPayload } from '@/types/auth';

// 事件监听器接口
export interface AuthEventListener {
  (event: string, data?: any): void;
}

export class TokenRefreshManager {
  private static readonly REFRESH_ENDPOINT = '/api/auth/refresh';
  private static readonly DEFAULT_REFRESH_THRESHOLD = 300; // 5 minutes
  private static readonly MIN_REFRESH_THRESHOLD = 60; // 1 minute
  private static readonly MAX_REFRESH_THRESHOLD = 1800; // 30 minutes

  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<TokenPayload> | null = null;
  private isDestroyed = false;
  private eventListeners: AuthEventListener[] = [];

  /**
   * Checks if the current access token is about to expire
   * @param thresholdSeconds - Number of seconds before expiration to consider as "expiring soon"
   * @returns true if token is expiring within the threshold, false otherwise
   */
  isTokenExpiringSoon(thresholdSeconds: number = TokenRefreshManager.DEFAULT_REFRESH_THRESHOLD): boolean {
    if (typeof window === 'undefined') return false;

    const token = TokenStorage.getAccessToken();
    if (!token) return false;

    try {
      // JWT tokens have three parts separated by dots
      const parts = token.split('.');
      if (parts.length !== 3) return false;

      // Decode the payload (second part) - handle base64url encoding
      const base64Url = parts[1];
      if (!base64Url) return false;
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      
      if (!payload.exp || typeof payload.exp !== 'number') {
        return false;
      }

      const expirationTime = payload.exp * 1000; // Convert to milliseconds
      const now = Date.now();
      const thresholdMs = Math.max(
        TokenRefreshManager.MIN_REFRESH_THRESHOLD,
        Math.min(thresholdSeconds, TokenRefreshManager.MAX_REFRESH_THRESHOLD)
      ) * 1000;

      return expirationTime - now <= thresholdMs;
    } catch (error) {
      // If token is malformed, don't treat as expiring to avoid unnecessary refresh attempts
      return false;
    }
  }

  /**
   * Refreshes access token using refresh token
   * @returns Promise with new token payload
   */
  async refreshTokens(): Promise<TokenPayload> {
    // Prevent race conditions - return existing promise if refresh is already in progress
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performTokenRefresh();

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Internal method to perform the actual token refresh
   */
  private async performTokenRefresh(): Promise<TokenPayload> {
    if (this.isDestroyed) {
      throw new Error('TokenRefreshManager has been destroyed');
    }

    const refreshToken = TokenStorage.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      // 使用统一的API客户端
      const response = await fetch('/api/v2/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'admin-portal-client',
        }),
      });

      if (!response.ok) {
        // Handle authentication failures
        if (response.status === 401) {
          TokenStorage.clearTokens();
          // 触发全局登出事件
          this.emitAuthEvent('session_expired');
          throw new Error('Token refresh failed: 401 - Invalid refresh token');
        }

        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.access_token || !data.refresh_token || !data.expires_in) {
        throw new Error('Invalid response format from refresh endpoint');
      }

      const tokenPayload: TokenPayload = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      };

      // Update stored tokens
      TokenStorage.setTokens(tokenPayload.accessToken, tokenPayload.refreshToken);

      // Restart auto refresh with new token
      this.startAutoRefresh();

      // 触发令牌刷新成功事件
      this.emitAuthEvent('token_refreshed', tokenPayload);

      return tokenPayload;
    } catch (error) {
      // Network errors or other unexpected errors
      if (error instanceof Error) {
        // 触发令牌刷新失败事件
        this.emitAuthEvent('token_refresh_failed', error);
        throw error;
      }
      throw new Error('Unknown error during token refresh');
    }
  }

  /**
   * Starts automatic token refresh scheduling
   */
  startAutoRefresh(): void {
    if (this.isDestroyed) return;

    this.clearTimers();

    if (!this.isTokenExpiringSoon()) {
      return;
    }

    const scheduleRefresh = async () => {
      try {
        await this.refreshTokens();
      } catch (error) {
        console.error('Auto refresh failed:', error);
        // TokenStorage.clearTokens() is already called for 401 errors
        // For other errors, we might want to retry or handle differently
      }
    };

    // Schedule refresh for halfway to expiration or minimum threshold
    const delay = this.calculateRefreshDelay();
    this.refreshTimer = setTimeout(scheduleRefresh, delay);
  }

  /**
   * Calculates when to schedule the next refresh
   */
  private calculateRefreshDelay(): number {
    const token = TokenStorage.getAccessToken();
    if (!token) return TokenRefreshManager.DEFAULT_REFRESH_THRESHOLD * 1000;

    try {
      const parts = token.split('.');
      if (parts.length !== 3) return TokenRefreshManager.DEFAULT_REFRESH_THRESHOLD * 1000;

      const payload = JSON.parse(atob(parts[1]!));
      const expirationTime = payload.exp * 1000;
      const now = Date.now();
      const timeUntilExpiration = expirationTime - now;

      // Refresh at 75% of the token lifetime or 5 minutes before expiration, whichever is smaller
      const refreshDelay = Math.min(
        timeUntilExpiration * 0.75,
        TokenRefreshManager.DEFAULT_REFRESH_THRESHOLD * 1000
      );

      return Math.max(refreshDelay, TokenRefreshManager.MIN_REFRESH_THRESHOLD * 1000);
    } catch (error) {
      return TokenRefreshManager.DEFAULT_REFRESH_THRESHOLD * 1000;
    }
  }

  /**
   * Clears all active timers
   */
  private clearTimers(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Destroys the refresh manager and cleans up resources
   */
  destroy(): void {
    this.isDestroyed = true;
    this.clearTimers();
    
    // Cancel any in-flight refresh
    if (this.refreshPromise) {
      this.refreshPromise = null;
    }
  }

  /**
   * Gets the current refresh promise (for testing purposes)
   */
  getCurrentRefreshPromise(): Promise<TokenPayload> | null {
    return this.refreshPromise;
  }

  /**
   * Checks if auto refresh is active
   */
  isAutoRefreshActive(): boolean {
    return this.refreshTimer !== null;
  }

  /**
   * 添加事件监听器
   */
  addEventListener(listener: AuthEventListener): void {
    this.eventListeners.push(listener);
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(listener: AuthEventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * 触发认证事件
   */
  private emitAuthEvent(event: string, data?: any): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('Auth event listener error:', error);
      }
    });
  }

  /**
   * 获取令牌状态信息
   */
  getTokenStatus(): {
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    isExpiringSoon: boolean;
    isExpired: boolean;
    timeUntilExpiration: number;
    autoRefreshActive: boolean;
  } {
    const accessToken = TokenStorage.getAccessToken();
    const refreshToken = TokenStorage.getRefreshToken();
    
    return {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      isExpiringSoon: this.isTokenExpiringSoon(),
      isExpired: this.isTokenExpired(accessToken || ''),
      timeUntilExpiration: this.getTimeUntilExpiration(accessToken || ''),
      autoRefreshActive: this.isAutoRefreshActive(),
    };
  }

  /**
   * 检查令牌是否已过期
   */
  private isTokenExpired(token: string): boolean {
    if (!token) return true;
    
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return true;
      const payload = JSON.parse(atob(parts[1]!));
      return payload.exp * 1000 < Date.now();
    } catch {
      return true;
    }
  }

  /**
   * 获取令牌剩余有效时间
   */
  private getTimeUntilExpiration(token: string): number {
    if (!token) return 0;
    
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return 0;
      const payload = JSON.parse(atob(parts[1]!));
      const expirationTime = payload.exp * 1000;
      return Math.max(0, expirationTime - Date.now());
    } catch {
      return 0;
    }
  }
}