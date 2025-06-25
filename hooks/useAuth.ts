// hooks/useAuth.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
// import { apiClient } from '@/lib/apiClient'; // Assuming an API client
// import { UserProfile } from '@/types'; // Assuming a UserProfile type

// Placeholder for actual user profile type which might include permissions
interface AuthenticatedUser {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string;
  permissions: string[]; // e.g., ['users:list', 'clients:create']
}

interface AuthState {
  user: AuthenticatedUser | null;
  token: string | null; // The raw JWT token
  isLoading: boolean;
  error: string | null;
}

// Helper to get cookie by name
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

// Helper to set cookie
function setCookie(name: string, value: string, days: number = 7, path: string = '/') {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  // Add Secure in production; SameSite=Lax is a good default
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=${path}; SameSite=Lax`;
}

function deleteCookie(name: string, path: string = '/') {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; SameSite=Lax`;
}

/**
 * 认证钩子函数
 * 提供用户认证、token刷新、登录登出等功能
 */
export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null, // This will be the access_token
    isLoading: true,
    error: null,
  });
  const router = useRouter();

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || ''; // Ensure this is configured

  /**
   * 执行用户登出操作
   * @param shouldRevokeToken 是否需要撤销token
   */
  const performLogout = useCallback(async (shouldRevokeToken: boolean = true) => {
    const currentToken = authState.token || getCookie('auth_token');
    const refreshTokenValue = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;

    setAuthState({ user: null, token: null, isLoading: false, error: null });
    if (typeof window !== 'undefined') {
      localStorage.removeItem('refresh_token');
      deleteCookie('auth_token'); // Clear access token cookie
    }

    if (shouldRevokeToken && currentToken) {
      try {
        // Attempt to revoke the refresh token if available, then access token
        // The backend /api/v2/oauth/revoke should handle revoking both if possible based on the token provided
        const tokenToRevoke = refreshTokenValue || currentToken;
        const clientId = process.env.NEXT_PUBLIC_AUTH_CENTER_CLIENT_ID || 'auth-center-self'; // Client ID for the admin UI

        await fetch(`${API_BASE_URL}/api/v2/oauth/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${currentToken}`, // Use access token to authorize revoke if possible
          },
          body: new URLSearchParams({ token: tokenToRevoke, client_id: clientId }),
        });
        console.log('Tokens revoked on server (attempted).');
      } catch (revokeError) {
        console.error('Failed to revoke tokens on server:', revokeError);
      }
    }
    router.push('/login');
  }, [router, authState.token, API_BASE_URL]);

  /**
   * 刷新访问token
   * @returns Promise<boolean> 刷新是否成功
   */
  const refreshToken = useCallback(async (): Promise<boolean> => {
    const storedRefreshToken = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
    if (!storedRefreshToken) {
      return false;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: storedRefreshToken,
          client_id: process.env.NEXT_PUBLIC_AUTH_CENTER_CLIENT_ID || 'auth-center-self',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to refresh token.');
      }

      const { access_token, refresh_token: newRefreshToken } = await response.json();
      
      // Update tokens
      setAuthState(prev => ({ ...prev, token: access_token }));
      setCookie('auth_token', access_token, 1/24, '/'); // Store for 1 hour
      if (newRefreshToken) {
        localStorage.setItem('refresh_token', newRefreshToken);
      }

      return true;

    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }, [API_BASE_URL]);

  /**
   * 获取用户信息和权限
   * @param accessToken 访问token
   */
  const fetchUserAndPermissions = useCallback(async (accessToken: string): Promise<void> => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null, token: accessToken }));
    try {
      // Fetch user profile from /me endpoint
      const meResponse = await fetch(`${API_BASE_URL}/api/v2/users/me`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (meResponse.status === 401) {
        // This could mean the token is expired, try to refresh it
        throw new Error('Unauthorized');
      }
      if (!meResponse.ok) {
        throw new Error('Failed to fetch user profile.');
      }

      const userData = await meResponse.json();

      // Fetch user permissions from /me/permissions endpoint
      const permissionsResponse = await fetch(`${API_BASE_URL}/api/v2/users/me/permissions`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (!permissionsResponse.ok) {
        throw new Error('Failed to fetch user permissions.');
      }

      const permissionsData = await permissionsResponse.json();

      const userProfile: AuthenticatedUser = {
        id: userData.id,
        username: userData.username,
        displayName: userData.displayName || userData.username,
        avatar: userData.avatar,
        permissions: permissionsData.map((p: any) => p.name), // Assuming permissions are {id, name, description}
      };

      setAuthState({ user: userProfile, token: accessToken, isLoading: false, error: null });
      setCookie('auth_token', accessToken, 1/24, '/'); // Store for 1 hour

    } catch (err) {
      if (err instanceof Error && err.message === 'Unauthorized') {
        // Attempt to refresh the token
        const refreshed = await refreshToken();
        if (!refreshed) {
          // If refresh fails, logout
          performLogout(false); // No need to revoke, token is likely invalid
        } else {
          // If refresh succeeds, retry fetching user data
          const newToken = getCookie('auth_token');
          if (newToken) {
            await fetchUserAndPermissions(newToken);
          }
        }
      } else {
        console.error('Authentication error:', err);
        setAuthState((prev: AuthState) => ({ ...prev, isLoading: false, error: (err as Error).message }));
        performLogout(false);
      }
    }
  }, [API_BASE_URL, refreshToken, performLogout]);

  // 初始化时检查认证状态
  useEffect(() => {
    const token = getCookie('auth_token');
    if (token) {
      fetchUserAndPermissions(token);
    } else {
      const storedRefreshToken = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
      if (storedRefreshToken) {
        refreshToken().then((success: boolean) => {
          if (success) {
            const newToken = getCookie('auth_token');
            if (newToken) {
              fetchUserAndPermissions(newToken);
            }
          } else {
            setAuthState((prev: AuthState) => ({ ...prev, user: null, token: null, isLoading: false, error: null }));
          }
        });
      } else {
        setAuthState((prev: AuthState) => ({ ...prev, user: null, token: null, isLoading: false, error: null }));
      }
    }
  }, [fetchUserAndPermissions, refreshToken]); // Dependencies

  /**
   * 用户登录
   * @param data 登录数据 (用户名和密码)
   */
  const login = async (data: any) => {
    // This function would be called from a login page
    // It's a placeholder for your actual login logic, e.g., password grant
    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          username: data.username,
          password: data.password,
          client_id: process.env.NEXT_PUBLIC_AUTH_CENTER_CLIENT_ID || 'auth-center-self',
          // scope: 'openid profile email offline_access'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error_description || 'Login failed');
      }

      const { access_token, refresh_token } = await response.json();
      
      localStorage.setItem('refresh_token', refresh_token);
      await fetchUserAndPermissions(access_token);

      router.push('/'); // Redirect to a protected route

    } catch (error) {
      console.error('Login error:', error);
      setAuthState((prev: AuthState) => ({ ...prev, error: (error as Error).message }));
    }
  };

  return { ...authState, login, logout: performLogout, refreshToken };
}
