import { AuthProviderInterface, AuthUser, AuthTokens } from '@repo/ui';
import { adminApi, authApi } from './api';
import { TokenStorage } from './auth/token-storage';
import { generateCodeVerifier, generateCodeChallenge, safeUrlEncode } from '@repo/lib/browser';

// OAuth配置 - 使用环境变量进行标准化配置
export const OAuthConfig = {
  clientId: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'auth-center-admin-client',
  redirectUri: process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI || 'http://localhost:3002/auth/callback',
  authorizationEndpoint: '/api/v2/oauth/authorize',
  tokenEndpoint: '/api/v2/oauth/token',
  scope: 'openid profile offline_access admin:full_access',
};

export const authService: AuthProviderInterface = {
  async fetchUser(): Promise<AuthUser | null> {
    // SSR/Node 环境下直接返回 null，避免卡死
    if (typeof window === 'undefined') {
      return null;
    }
    const accessToken = TokenStorage.getAccessToken();
    if (!accessToken) {
      return null;
    }
    return adminApi.getUserById('me') as Promise<AuthUser | null>;
  },

  async login(): Promise<void> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateCodeVerifier();

    sessionStorage.setItem('oauth_code_verifier', codeVerifier);
    sessionStorage.setItem('oauth_state', state);

    // 检查是否有从oauth-service重定向过来的原始参数
    const originalParams = sessionStorage.getItem('oauth_original_params');
    let targetUrl = OAuthConfig.authorizationEndpoint;

    if (originalParams) {
      // 如果有原始oauth参数，直接重定向回oauth-service继续流程
      sessionStorage.removeItem('oauth_original_params');
      const params = new URLSearchParams(originalParams);
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
      params.set('state', state);
      targetUrl += `?${params.toString()}`;
    } else {
      // 正常admin-portal登录流程
      const params = new URLSearchParams({
        client_id: OAuthConfig.clientId,
        redirect_uri: OAuthConfig.redirectUri,
        response_type: 'code',
        scope: OAuthConfig.scope,
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      targetUrl += `?${params.toString()}`;
    }

    window.location.href = targetUrl;
  },

  async logout(): Promise<void> {
    await authApi.logout();
  },

  async handleCallback(code: string, state: string | null): Promise<AuthUser | null> {
    const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
    const storedState = sessionStorage.getItem('oauth_state');

    if (!codeVerifier) throw new Error('Code verifier not found.');
    if (storedState !== state) throw new Error('Invalid state parameter.');

    sessionStorage.removeItem('oauth_code_verifier');
    sessionStorage.removeItem('oauth_state');

    const tokens: AuthTokens = await authApi.exchangeCodeForToken(code, codeVerifier);
    TokenStorage.setTokens(tokens.accessToken, tokens.refreshToken);

    return this.fetchUser();
  },
};
