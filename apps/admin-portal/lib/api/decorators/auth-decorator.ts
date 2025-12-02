/**
 * 认证装饰器
 * 为HTTP客户端添加自动认证和令牌刷新功能
 */

import type { HttpClient, HttpRequestOptions, HttpResponse, HttpClientDecorator, AuthConfig } from '../client/types';
import { HttpClientDecoratorBase } from '../client/http-client';
import { TokenStorage } from '../../auth/token-storage';

/**
 * 认证装饰器
 */
export class AuthDecorator extends HttpClientDecoratorBase {
  private readonly config: Required<AuthConfig>;
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(
    wrappedClient: HttpClient,
    config: AuthConfig = {}
  ) {
    super(wrappedClient);
    this.config = this.mergeConfig(config);
  }

  /**
   * 发送HTTP请求（带认证）
   */
  async request<T = any>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    const skipAuthRefresh = options.skipAuthRefresh || false;

    // 准备认证头
    const authHeaders = await this.prepareAuthHeaders();
    const requestOptions = {
      ...options,
      headers: {
        ...authHeaders,
        ...options.headers,
      },
    };

    try {
      return await this.wrappedClient.request<T>(url, requestOptions);
    } catch (error) {
      // 检查是否是认证错误
      if (this.isAuthError(error) && !skipAuthRefresh) {
        // 尝试刷新令牌
        const refreshSuccess = await this.tryRefreshToken();
        if (refreshSuccess) {
          // 使用新的令牌重试请求
          const refreshedHeaders = await this.prepareAuthHeaders();
          return this.wrappedClient.request<T>(url, {
            ...requestOptions,
            headers: {
              ...refreshedHeaders,
              ...options.headers,
            },
          });
        }
      }

      throw error;
    }
  }

  /**
   * 合并配置
   */
  private mergeConfig(config: AuthConfig): Required<AuthConfig> {
    return {
      authServiceUrl: config.authServiceUrl || process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:6188',
      clientId: config.clientId || process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'auth-center-admin-client',
      tokenRefreshUrl: config.tokenRefreshUrl || '/oauth/token',
      autoRefresh: config.autoRefresh !== false,
      refreshRetries: config.refreshRetries || 3,
    };
  }

  /**
   * 准备认证头
   */
  private async prepareAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    // 添加CSRF令牌
    const csrfToken = await this.getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    // 检查令牌是否有效
    const accessToken = await this.getAccessToken();
    if (accessToken && this.isTokenValid()) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    return headers;
  }

  /**
   * 获取访问令牌
   */
  private async getAccessToken(): Promise<string | null> {
    try {
      // 从localStorage获取令牌
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('access_token');
        return token;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 获取CSRF令牌
   */
  private async getCsrfToken(): Promise<string | null> {
    try {
      // 从localStorage获取CSRF令牌
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('csrf_token');
        return token;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 检查令牌是否有效
   */
  private isTokenValid(): boolean {
    try {
      if (typeof window === 'undefined') {
        return false;
      }

      const expiresAt = localStorage.getItem('token_expires_at');
      if (!expiresAt) {
        return false;
      }

      const expiresTime = parseInt(expiresAt, 10);
      const now = Date.now();

      // 令牌在过期前5分钟视为有效
      return now < expiresTime - 5 * 60 * 1000;
    } catch {
      return false;
    }
  }

  /**
   * 检查是否是认证错误
   */
  private isAuthError(error: any): boolean {
    return (
      error?.status === 401 ||
      error?.message?.includes('401') ||
      error?.message?.includes('Unauthorized') ||
      error?.message?.includes('invalid_token') ||
      error?.message?.includes('expired_token')
    );
  }

  /**
   * 尝试刷新令牌
   */
  private async tryRefreshToken(): Promise<boolean> {
    // 防止并发刷新
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.performTokenRefresh();

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  /**
   * 执行令牌刷新
   */
  private async performTokenRefresh(): Promise<boolean> {
    try {
      const refreshToken = await this.getRefreshToken();
      if (!refreshToken) {
        return false;
      }

      const refreshUrl = `${this.config.authServiceUrl}${this.config.tokenRefreshUrl}`;

      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.config.clientId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed with status: ${response.status}`);
      }

      const data = await response.json();

      // 保存新的令牌
      await this.saveTokens(data);

      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);

      // 刷新失败，清除令牌
      await this.clearTokens();

      return false;
    }
  }

  /**
   * 获取刷新令牌
   */
  private async getRefreshToken(): Promise<string | null> {
    try {
      // 从localStorage获取刷新令牌
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('refresh_token');
        return token;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 保存令牌
   */
  private async saveTokens(tokenData: any): Promise<void> {
    try {
      if (typeof window === 'undefined') {
        return;
      }

      const { access_token, refresh_token, expires_in, csrf_token } = tokenData;

      if (access_token) {
        localStorage.setItem('access_token', access_token);

        // 计算过期时间
        const expiresAt = Date.now() + (expires_in || 3600) * 1000;
        localStorage.setItem('token_expires_at', expiresAt.toString());
      }

      if (refresh_token) {
        localStorage.setItem('refresh_token', refresh_token);
      }

      if (csrf_token) {
        localStorage.setItem('csrf_token', csrf_token);
      }
    } catch (error) {
      console.error('Failed to save tokens:', error);
    }
  }

  /**
   * 清除令牌
   */
  private async clearTokens(): Promise<void> {
    try {
      if (typeof window === 'undefined') {
        return;
      }

      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('csrf_token');
      localStorage.removeItem('token_expires_at');
    } catch (error) {
      console.error('Failed to clear tokens:', error);
    }
  }

  /**
   * 获取认证配置
   */
  getConfig(): AuthConfig {
    return { ...this.config };
  }

  /**
   * 更新认证配置
   */
  updateConfig(config: Partial<AuthConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * 手动刷新令牌
   */
  async refreshToken(): Promise<boolean> {
    return this.tryRefreshToken();
  }

  /**
   * 检查是否已认证
   */
  async isAuthenticated(): Promise<boolean> {
    return this.isTokenValid();
  }

  /**
   * 获取当前令牌信息
   */
  async getTokenInfo(): Promise<{
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    isValid: boolean;
    expiresAt: number | null;
  }> {
    try {
      const accessToken = await this.getAccessToken();
      const refreshToken = await this.getRefreshToken();
      const expiresAt = localStorage.getItem('token_expires_at');

      return {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        isValid: this.isTokenValid(),
        expiresAt: expiresAt ? parseInt(expiresAt, 10) : null,
      };
    } catch {
      return {
        hasAccessToken: false,
        hasRefreshToken: false,
        isValid: false,
        expiresAt: null,
      };
    }
  }
}