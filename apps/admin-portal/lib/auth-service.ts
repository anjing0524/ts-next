import { AuthProviderInterface, AuthUser, AuthTokens } from '@repo/ui';
import { adminApi, authApi } from './api';
import { TokenStorage } from './auth/token-storage';
import { OAuthConfig } from '@repo/lib/client';
import { BrowserPKCEUtils } from '@repo/lib/browser';

export const authService: AuthProviderInterface = {
  async fetchUser(): Promise<AuthUser> {
    const accessToken = TokenStorage.getAccessToken();
    if (!accessToken) {
      throw new Error("No access token found");
    }
    return adminApi.getUserById('me');
  },

  async login(): Promise<void> {
    const { codeVerifier, codeChallenge } = await BrowserPKCEUtils.generatePKCEPair();
    const state = BrowserPKCEUtils.generateState();

    sessionStorage.setItem('oauth_code_verifier', codeVerifier);
    sessionStorage.setItem('oauth_state', state);

    const params = new URLSearchParams({
      client_id: OAuthConfig.getClientConfig().clientId,
      redirect_uri: OAuthConfig.getClientConfig().redirectUri,
      response_type: 'code',
      scope: 'openid profile email admin:full_access offline_access',
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    window.location.href = `${OAuthConfig.getAuthorizeUrl()}?${params.toString()}`;
  },

  async logout(): Promise<void> {
    await authApi.logout();
  },

  async handleCallback(code: string, state: string | null): Promise<AuthUser> {
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
