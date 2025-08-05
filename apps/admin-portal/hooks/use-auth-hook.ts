/**
 * useAuthHook - Enhanced authentication hook with token management
 * 
 * Provides:
 * - Authentication state management
 * - Token refresh utilities
 * - Session monitoring
 * - Error handling
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { TokenRefreshManager, AuthEventListener } from '@/lib/auth/token-refresh';
import { TokenStorage } from '@/lib/auth/token-storage';

export interface UseAuthHookReturn {
  // Authentication state
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any;
  
  // Token status
  tokenStatus: ReturnType<TokenRefreshManager['getTokenStatus']>;
  
  // Actions
  login: (userData: any) => void;
  logout: () => void;
  refreshToken: () => Promise<void>;
  
  // Token utilities
  getTokenRemainingTime: () => number;
  isTokenExpiringSoon: (threshold?: number) => boolean;
  forceTokenRefresh: () => Promise<void>;
  
  // Event listeners
  onTokenRefreshed: (callback: (tokens: any) => void) => () => void;
  onSessionExpired: (callback: () => void) => () => void;
  onAuthError: (callback: (error: Error) => void) => () => void;
}

export function useAuthHook(): UseAuthHookReturn {
  const {
    user,
    isLoading,
    isAuthenticated,
    login,
    logout,
    refreshToken,
    tokenStatus,
    addAuthListener,
    removeAuthListener,
  } = useAuth();

  const tokenRefreshManagerRef = useRef<TokenRefreshManager | null>(null);

  // 初始化令牌刷新管理器
  useEffect(() => {
    if (typeof window !== 'undefined') {
      tokenRefreshManagerRef.current = new TokenRefreshManager();
      
      return () => {
        if (tokenRefreshManagerRef.current) {
          tokenRefreshManagerRef.current.destroy();
        }
      };
    }
  }, []);

  // 获取令牌剩余时间
  const getTokenRemainingTime = useCallback((): number => {
    return TokenStorage.getTokenRemainingTime();
  }, []);

  // 检查令牌是否即将过期
  const isTokenExpiringSoon = useCallback((threshold: number = 300): boolean => {
    if (!tokenRefreshManagerRef.current) return false;
    return tokenRefreshManagerRef.current.isTokenExpiringSoon(threshold);
  }, []);

  // 强制刷新令牌
  const forceTokenRefresh = useCallback(async (): Promise<void> => {
    if (!tokenRefreshManagerRef.current) {
      throw new Error('Token refresh manager not available');
    }
    
    try {
      await tokenRefreshManagerRef.current.refreshTokens();
    } catch (error) {
      console.error('Force token refresh failed:', error);
      throw error;
    }
  }, []);

  // 监听令牌刷新事件
  const onTokenRefreshed = useCallback((callback: (tokens: any) => void) => {
    const listener: AuthEventListener = {
      onTokenRefreshed: (newToken: string) => {
        callback(newToken);
      }
    };
    
    addAuthListener(listener);
    
    return () => {
      removeAuthListener(listener);
    };
  }, [addAuthListener, removeAuthListener]);

  // 监听会话过期事件
  const onSessionExpired = useCallback((callback: () => void) => {
    const listener: AuthEventListener = {
      onTokenExpired: () => {
        callback();
      }
    };
    
    addAuthListener(listener);
    
    return () => {
      removeAuthListener(listener);
    };
  }, [addAuthListener, removeAuthListener]);

  // 监听认证错误事件
  const onAuthError = useCallback((callback: (error: Error) => void) => {
    const listener: AuthEventListener = {
      onRefreshFailed: (error: Error) => {
        callback(error);
      }
    };
    
    addAuthListener(listener);
    
    return () => {
      removeAuthListener(listener);
    };
  }, [addAuthListener, removeAuthListener]);

  return {
    // Authentication state
    isAuthenticated,
    isLoading,
    user,
    
    // Token status
    tokenStatus,
    
    // Actions
    login,
    logout,
    refreshToken,
    
    // Token utilities
    getTokenRemainingTime,
    isTokenExpiringSoon,
    forceTokenRefresh,
    
    // Event listeners
    onTokenRefreshed,
    onSessionExpired,
    onAuthError,
  };
}