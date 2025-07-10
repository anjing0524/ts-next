import { AuthProviderInterface, AuthUser, AuthTokens } from '@repo/ui';
import { adminApi, authApi } from './api';
import { TokenStorage } from './auth/token-storage';
import { generateCodeVerifier, generateCodeChallenge, safeUrlEncode } from '@repo/lib/browser';

// OAuth配置
const OAuthConfig = {
  clientId: 'auth-center-admin-client',
  redirectUri: 'http://localhost:3000/auth/callback',
  authorizationEndpoint: 'http://localhost:3001/api/v2/oauth/authorize',
  tokenEndpoint: 'http://localhost:3001/api/v2/oauth/token',
  scope: 'openid profile email admin:full_access offline_access',
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
    return adminApi.getUserById('me');
  },

  async login(): Promise<void> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateCodeVerifier();

    sessionStorage.setItem('oauth_code_verifier', codeVerifier);
    sessionStorage.setItem('oauth_state', state);

    const params = new URLSearchParams({
      client_id: OAuthConfig.clientId,
      redirect_uri: OAuthConfig.redirectUri,
      response_type: 'code',
      scope: OAuthConfig.scope,
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${OAuthConfig.authorizationEndpoint}?${params.toString()}`;
    window.location.href = authUrl;
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
