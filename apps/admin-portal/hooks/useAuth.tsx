'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TokenStorage } from '@/lib/auth/token-storage';
import { TokenRefreshManager } from '@/lib/auth/token-refresh';
import { TokenPayload, User } from '@/types/auth';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (tokens: TokenPayload, user?: User) => Promise<void>;
  logout: () => void;
  refreshTokens: () => Promise<void>;
  isTokenExpiringSoon: () => boolean;
}

/**
 * React hook for managing authentication state and token refresh
 * 
 * This hook provides:
 * - Authentication state management
 * - Automatic token refresh
 * - User session management
 * - Error handling for auth operations
 */
export function useAuth(): AuthContextValue {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    error: null,
  });

  const refreshManagerRef = useRef<TokenRefreshManager | null>(null);

  // Initialize token refresh manager
  useEffect(() => {
    if (typeof window === 'undefined') return;

    refreshManagerRef.current = new TokenRefreshManager();

    return () => {
      if (refreshManagerRef.current) {
        refreshManagerRef.current.destroy();
        refreshManagerRef.current = null;
      }
    };
  }, []);

  // Check authentication status on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkAuthStatus = () => {
      const accessToken = TokenStorage.getAccessToken();
      const isExpired = TokenStorage.isTokenExpired();
      
      setAuthState(prev => ({
        ...prev,
        isAuthenticated: !!accessToken && !isExpired,
        isLoading: false,
      }));

      // Start auto refresh if authenticated
      if (accessToken && !isExpired && refreshManagerRef.current) {
        refreshManagerRef.current.startAutoRefresh();
      }
    };

    checkAuthStatus();
  }, []);

  /**
   * Handles user login with tokens and optional user data
   */
  const login = useCallback(async (tokens: TokenPayload, user?: User) => {
    try {
      TokenStorage.setTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);
      
      setAuthState(prev => ({
        ...prev,
        isAuthenticated: true,
        user: user || prev.user,
        error: null,
      }));

      // Start auto refresh
      if (refreshManagerRef.current) {
        refreshManagerRef.current.startAutoRefresh();
      }
    } catch (error) {
      console.error('Login failed:', error);
      setAuthState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Login failed',
      }));
      throw error;
    }
  }, []);

  /**
   * Handles user logout
   */
  const logout = useCallback(() => {
    try {
      TokenStorage.clearTokens();
      
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
      });

      // Stop auto refresh
      if (refreshManagerRef.current) {
        refreshManagerRef.current.destroy();
      }
    } catch (error) {
      console.error('Logout failed:', error);
      setAuthState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Logout failed',
      }));
    }
  }, []);

  /**
   * Manually triggers token refresh
   */
  const refreshTokens = useCallback(async () => {
    if (!refreshManagerRef.current) {
      throw new Error('Token refresh manager not initialized');
    }

    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
      
      await refreshManagerRef.current.refreshTokens();
      
      // Tokens are updated internally by TokenRefreshManager
      
      setAuthState(prev => ({
        ...prev,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      console.error('Token refresh failed:', error);
      
      // If refresh fails with 401, clear tokens and logout
      if (error instanceof Error && error.message.includes('401')) {
        logout();
      } else {
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Token refresh failed',
        }));
      }
      
      throw error;
    }
  }, [logout]);

  /**
   * Checks if the current token is expiring soon
   */
  const isTokenExpiringSoon = useCallback((): boolean => {
    if (!refreshManagerRef.current) return false;
    return refreshManagerRef.current.isTokenExpiringSoon();
  }, []);

  return {
    ...authState,
    login,
    logout,
    refreshTokens,
    isTokenExpiringSoon,
  };
}

/**
 * Auth provider component for context-based auth management
 * (Can be extended to use React Context API if needed)
 */