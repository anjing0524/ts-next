import { useState } from 'react';
import { generateCodeVerifier, generateCodeChallenge, generateState, generateNonce } from '@repo/lib/browser';

interface LoginCredentials {
  username: string;
  password: string;
}

interface OAuthConfig {
  clientId: string;
  redirectUri: string;
  oauthServiceUrl: string;
  scopes: string[];
}

interface LoginState {
  isLoading: boolean;
  error: string | null;
}

export const useOAuthLogin = (config: OAuthConfig) => {
  const [state, setState] = useState<LoginState>({
    isLoading: false,
    error: null,
  });

  const generatePKCEParams = async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();
    const nonce = generateNonce();

    // Store PKCE parameters
    sessionStorage.setItem('oauth_code_verifier', codeVerifier);
    sessionStorage.setItem('oauth_state', state);
    sessionStorage.setItem('oauth_nonce', nonce);

    return { codeVerifier, codeChallenge, state, nonce };
  };

  const initiateOAuthFlow = async (useDirectAuth: boolean = false, credentials?: LoginCredentials) => {
    setState({ isLoading: true, error: null });

    try {
      const { codeChallenge, state, nonce } = await generatePKCEParams();
      
      if (useDirectAuth && credentials) {
        // Username/password flow
        const response = await fetch(`${config.oauthServiceUrl}/api/v2/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: credentials.username,
            password: credentials.password,
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            response_type: 'code',
            scope: config.scopes.join(' '),
            state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            nonce,
          }),
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.message || '登录失败');
        }

        window.location.href = result.data.redirect_url;
      } else {
        // Standard OAuth flow
        const authParams = new URLSearchParams({
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
          response_type: 'code',
          scope: config.scopes.join(' '),
          state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          nonce,
        });

        const authorizeUrl = new URL('/api/v2/oauth/authorize', config.oauthServiceUrl);
        authorizeUrl.search = authParams.toString();
        
        window.location.href = authorizeUrl.toString();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '登录失败，请重试';
      setState({ isLoading: false, error: errorMessage });
    }
  };

  return {
    ...state,
    initiateOAuthFlow,
    clearError: () => setState(prev => ({ ...prev, error: null })),
  };
};

export const useDefaultOAuthConfig = (): OAuthConfig => {
  // Safe SSR handling - use server-safe fallback
  const getSafeRedirectUri = () => {
    if (typeof window === 'undefined') {
      return process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI || 'http://localhost:3002/auth/callback';
    }
    return process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI || `${window.location.origin}/auth/callback`;
  };

  return {
    clientId: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'admin-portal-client',
    redirectUri: getSafeRedirectUri(),
    oauthServiceUrl: process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001',
    scopes: [
      'openid',
      'profile',
      'email',
      'user:read',
      'user:write',
      'role:read',
      'role:write',
      'permission:read',
      'permission:write',
      'client:read',
      'client:write',
      'audit:read',
    ],
  };
};