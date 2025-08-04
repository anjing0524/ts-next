/**
 * SimplifiedTokenRefreshManager - 简化的令牌刷新管理器
 * 
 * 专注于核心刷新逻辑，提高可维护性
 */

import { SimplifiedTokenStorage } from './simplified-token-storage';
import { ErrorHandler } from '../error/error-handler';

interface RefreshConfig {
  refreshThreshold: number; // 提前多少秒刷新
  maxRetries: number;
  retryDelay: number;
}

export class SimplifiedTokenRefreshManager {
  private static instance: SimplifiedTokenRefreshManager;
  private refreshPromise: Promise<string> | null = null;
  private config: RefreshConfig;

  private constructor(config: Partial<RefreshConfig> = {}) {
    this.config = {
      refreshThreshold: 300, // 5分钟
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    };
  }

  static getInstance(config?: Partial<RefreshConfig>): SimplifiedTokenRefreshManager {
    if (!SimplifiedTokenRefreshManager.instance) {
      SimplifiedTokenRefreshManager.instance = new SimplifiedTokenRefreshManager(config);
    }
    return SimplifiedTokenRefreshManager.instance;
  }

  /**
   * 获取有效的访问令牌，自动刷新如果需要
   */
  async getValidAccessToken(): Promise<string> {
    // 检查是否有访问令牌
    let accessToken = SimplifiedTokenStorage.getAccessToken();
    
    // 如果没有访问令牌但有刷新令牌，尝试刷新
    if (!accessToken && SimplifiedTokenStorage.getRefreshToken()) {
      accessToken = await this.refreshTokens();
    }

    // 检查是否需要提前刷新
    if (accessToken && this.shouldRefreshToken()) {
      try {
        accessToken = await this.refreshTokens();
      } catch (error) {
        // 刷新失败，返回当前令牌（如果还有效）
        if (!SimplifiedTokenStorage.isTokenExpired()) {
          return accessToken;
        }
        throw error;
      }
    }

    if (!accessToken) {
      throw ErrorHandler.createAuthError('missing', 'No access token available');
    }

    return accessToken;
  }

  /**
   * 刷新令牌
   */
  async refreshTokens(): Promise<string> {
    // 防止并发刷新
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh();
    
    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * 执行实际的刷新操作
   */
  private async performRefresh(): Promise<string> {
    const refreshToken = SimplifiedTokenStorage.getRefreshToken();
    if (!refreshToken) {
      throw ErrorHandler.createAuthError('missing', 'No refresh token available');
    }

    const oauthServiceUrl = process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001';
    const clientId = process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'admin-portal-client';

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(`${oauthServiceUrl}/api/v2/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        
        // 存储新令牌
        SimplifiedTokenStorage.setTokens(
          data.access_token,
          data.refresh_token || refreshToken,
          data.expires_in || 3600
        );

        return data.access_token;
      } catch (error) {
        if (attempt === this.config.maxRetries) {
          // 最后一次尝试失败，清除令牌
          SimplifiedTokenStorage.clearTokens();
          throw ErrorHandler.createAuthError('expired', 'Token refresh failed');
        }

        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempt));
      }
    }

    throw ErrorHandler.createAuthError('expired', 'Token refresh failed after retries');
  }

  /**
   * 检查是否需要刷新令牌
   */
  private shouldRefreshToken(): boolean {
    const remainingTime = SimplifiedTokenStorage.getTokenRemainingTime();
    return remainingTime <= this.config.refreshThreshold;
  }

  /**
   * 检查会话是否有效
   */
  isSessionValid(): boolean {
    return SimplifiedTokenStorage.isValidSession();
  }

  /**
   * 强制刷新令牌
   */
  async forceRefresh(): Promise<string> {
    return this.refreshTokens();
  }

  /**
   * 清除刷新状态
   */
  clearRefreshState(): void {
    this.refreshPromise = null;
  }

  /**
   * 获取令牌状态信息
   */
  getTokenStatus(): {
    isValid: boolean;
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    remainingTime: number;
    needsRefresh: boolean;
  } {
    return {
      isValid: this.isSessionValid(),
      hasAccessToken: !!SimplifiedTokenStorage.getAccessToken(),
      hasRefreshToken: !!SimplifiedTokenStorage.getRefreshToken(),
      remainingTime: SimplifiedTokenStorage.getTokenRemainingTime(),
      needsRefresh: this.shouldRefreshToken(),
    };
  }
}