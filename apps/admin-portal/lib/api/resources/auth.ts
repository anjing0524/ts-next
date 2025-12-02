/**
 * 认证资源API
 * 提供OAuth 2.1认证相关的操作
 */

import type { LoginCredentials, TokenResponse, ConsentParams } from '../index';
import { HttpClientFactory } from '../client/http-client';

/**
 * 认证资源API
 */
export class AuthResource {
  private readonly client;

  constructor(baseUrl?: string) {
    this.client = HttpClientFactory.createFullFeaturedClient(baseUrl);
  }

  /**
   * 提交同意授权
   */
  async submitConsent(action: 'allow' | 'deny', params: ConsentParams): Promise<any> {
    const response = await this.client.post(`/api/oauth/consent/${action}`, params, {
      skipCache: true,
      skipAuthRefresh: true, // 同意页面不需要认证
    });
    return response.data;
  }

  /**
   * 登录
   */
  async login(credentials: LoginCredentials): Promise<TokenResponse> {
    const response = await this.client.post<TokenResponse>('/api/auth/login', credentials, {
      skipCache: true,
      skipAuthRefresh: true, // 登录请求不需要认证
    });
    return response.data;
  }

  /**
   * 使用授权码交换令牌
   */
  async exchangeCodeForToken(code: string, codeVerifier: string): Promise<TokenResponse> {
    const response = await this.client.post<TokenResponse>('/api/oauth/token', {
      code,
      code_verifier: codeVerifier,
    }, {
      skipCache: true,
      skipAuthRefresh: true, // 令牌交换不需要认证
    });
    return response.data;
  }

  /**
   * 登出
   */
  async logout(): Promise<void> {
    await this.client.post('/api/oauth/revoke', null, {
      skipCache: true,
    });
  }

  /**
   * 刷新令牌
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const response = await this.client.post<TokenResponse>('/api/oauth/token', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }, {
      skipCache: true,
      skipAuthRefresh: true, // 令牌刷新不需要认证
    });
    return response.data;
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(): Promise<any> {
    const response = await this.client.get('/api/oauth/userinfo');
    return response.data;
  }

  /**
   * 验证令牌
   */
  async introspectToken(token: string): Promise<any> {
    const response = await this.client.post('/api/oauth/introspect', { token });
    return response.data;
  }

  /**
   * 获取授权端点
   */
  async getAuthorizationEndpoint(params: {
    response_type: string;
    client_id: string;
    redirect_uri: string;
    scope: string;
    state: string;
    code_challenge?: string;
    code_challenge_method?: string;
  }): Promise<string> {
    const queryParams = new URLSearchParams(params as any);
    return `/api/oauth/authorize?${queryParams.toString()}`;
  }
}

/**
 * 默认认证资源实例
 */
export const authResource = new AuthResource();

/**
 * 向后兼容的API助手函数
 */
export const authApi = {
  submitConsent: (action: 'allow' | 'deny', params: URLSearchParams) =>
    authResource.submitConsent(action, Object.fromEntries(params)),
  login: (credentials: any) => authResource.login(credentials),
  exchangeCodeForToken: (code: string, codeVerifier: string) =>
    authResource.exchangeCodeForToken(code, codeVerifier),
  logout: () => authResource.logout(),
  fetchUserProfile: () => authResource.getUserInfo(),
};
