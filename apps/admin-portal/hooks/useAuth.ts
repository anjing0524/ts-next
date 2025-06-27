'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TokenStorage } from '@/lib/auth/token-storage';
import { BrowserPKCEUtils } from '@repo/lib/browser';

// 前端安全的OAuth配置
const OAuthConfig = {
  getAuthorizeUrl: () => {
    const serviceUrl =
      process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001/datamgr_flow';
    return `${serviceUrl}/api/v2/oauth/authorize`;
  },
  getTokenUrl: () => {
    const serviceUrl =
      process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001/datamgr_flow';
    return `${serviceUrl}/api/v2/oauth/token`;
  },
  getUserInfoUrl: () => {
    const serviceUrl =
      process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001/datamgr_flow';
    return `${serviceUrl}/api/v2/oauth/userinfo`;
  },
  getRevokeUrl: () => {
    const serviceUrl =
      process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001/datamgr_flow';
    return `${serviceUrl}/api/v2/oauth/revoke`;
  },
  getClientConfig: () => {
    const getRedirectUri = () => {
      if (typeof window !== 'undefined') {
        return `${window.location.origin}/auth/callback`;
      }
      return process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI || 'http://localhost:3002/auth/callback';
    };

    return {
      clientId: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'auth-center-admin-client',
      clientSecret: process.env.OAUTH_CLIENT_SECRET || 'authcenteradminclientsecret',
      redirectUri: getRedirectUri(),
    };
  },
};

/**
 * 认证状态类型
 */
interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any;
  error: string | null;
}

/**
 * 用户信息类型
 */
interface UserInfo {
  sub: string;
  name?: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
}

/**
 * useAuth Hook
 * 处理OAuth2认证流程和状态管理
 */
export function useAuth() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    error: null,
  });

  /**
   * 检查用户认证状态
   * Check user authentication status
   */
  const checkAuth = useCallback(async () => {
    try {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

      const accessToken = TokenStorage.getAccessToken();
      if (!accessToken) {
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          error: null,
        });
        return false;
      }

      // 获取用户信息以验证token有效性
      const userInfo = await fetchUserInfo(accessToken);
      if (userInfo) {
        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          user: userInfo,
          error: null,
        });
        return true;
      } else {
        // Token无效，清理并重定向到登录
        TokenStorage.clearTokens();
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          error: 'Invalid or expired token',
        });
        return false;
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: error instanceof Error ? error.message : 'Authentication check failed',
      });
      return false;
    }
  }, []);

  /**
   * 获取用户信息
   * Fetch user information
   */
  const fetchUserInfo = async (accessToken: string): Promise<UserInfo | null> => {
    try {
      const response = await fetch(OAuthConfig.getUserInfoUrl(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token过期或无效
          return null;
        }
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      return null;
    }
  };

  /**
   * 刷新访问令牌
   * Refresh access token
   */
  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const refreshToken = TokenStorage.getRefreshToken();
      if (!refreshToken) {
        return false;
      }

      const clientConfig = OAuthConfig.getClientConfig();
      const response = await fetch(OAuthConfig.getTokenUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${btoa(`${clientConfig.clientId}:${clientConfig.clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        return false;
      }

      const tokenData = await response.json();
      if (tokenData.access_token) {
        TokenStorage.setTokens(tokenData.access_token, tokenData.refresh_token || refreshToken);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }, []);

  /**
   * 启动OAuth2授权码流程
   * Start OAuth2 authorization code flow
   *
   * 使用PKCE增强安全性，防止授权码拦截攻击。
   * Uses PKCE for enhanced security, preventing authorization code interception attacks.
   */
  const login = useCallback(
    async (scopes: string[] = ['openid', 'profile', 'admin:full_access']) => {
      try {
        setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

        // 生成PKCE参数对
        const pkceParams = await BrowserPKCEUtils.generatePKCEPair();

        // 生成state参数防止CSRF攻击
        const state = BrowserPKCEUtils.generateState();

        // 存储PKCE参数到sessionStorage
        sessionStorage.setItem('oauth_code_verifier', pkceParams.codeVerifier);
        sessionStorage.setItem('oauth_state', state);

        // 构建授权URL
        const authUrl = new URL(OAuthConfig.getAuthorizeUrl());
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', OAuthConfig.getClientConfig().clientId);
        authUrl.searchParams.set('redirect_uri', OAuthConfig.getClientConfig().redirectUri);
        authUrl.searchParams.set('scope', scopes.join(' '));
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', pkceParams.codeChallenge);
        authUrl.searchParams.set('code_challenge_method', pkceParams.codeChallengeMethod);

        // 重定向到授权服务器
        window.location.href = authUrl.toString();
      } catch (error) {
        console.error('Login initiation failed:', error);
        setAuthState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Login failed to start',
        }));
      }
    },
    []
  );

  /**
   * 登出用户
   * Logout user
   */
  const logout = useCallback(async () => {
    try {
      setAuthState((prev) => ({ ...prev, isLoading: true }));

      // 调用 OAuth 令牌撤销端点，优先撤销刷新令牌
      const accessToken = TokenStorage.getAccessToken();
      const refreshToken = TokenStorage.getRefreshToken();

      try {
        const revokeBody = new URLSearchParams();
        if (refreshToken) {
          revokeBody.append('token', refreshToken);
          revokeBody.append('token_type_hint', 'refresh_token');
        } else if (accessToken) {
          revokeBody.append('token', accessToken);
          revokeBody.append('token_type_hint', 'access_token');
        }

        if (revokeBody.has('token')) {
          revokeBody.append('client_id', OAuthConfig.getClientConfig().clientId);

          await fetch(OAuthConfig.getRevokeUrl(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: revokeBody,
          });
        }
      } catch (e) {
        // 撤销失败不阻塞登出流程，仅记录日志
        console.warn('Token revoke request failed', e);
      }

      // 清理本地存储的令牌
      TokenStorage.clearTokens();

      // 清理OAuth相关的sessionStorage
      sessionStorage.removeItem('oauth_code_verifier');
      sessionStorage.removeItem('oauth_state');

      // 更新状态
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
      });

      // 重定向到登录页面
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Logout failed',
      }));
    }
  }, [router]);

  /**
   * 检查当前用户是否拥有指定权限
   * Check whether current user has a given permission string
   * @param {string} permission - 权限标识如 'admin:read'
   * @returns {boolean}
   */
  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!authState.user || !Array.isArray((authState.user as any).permissions)) {
        return false;
      }
      return (authState.user as any).permissions.includes(permission);
    },
    [authState.user]
  );

  return {
    // 状态
    ...authState,

    // 方法
    login,
    logout,
    checkAuth,
    refreshToken,
    fetchUserInfo,

    // 权限工具
    hasPermission,
  };
}

export default useAuth;
