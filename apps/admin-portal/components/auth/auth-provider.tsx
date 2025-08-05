/**
 * AuthProvider - Enhanced authentication provider with automatic token refresh
 * 
 * Provides:
 * - Global authentication state management
 * - Automatic token refresh
 * - Event-driven architecture
 * - Session continuity
 * - Error handling and recovery
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth as useBaseAuth } from '@repo/ui';
import { TokenStorage } from '@/lib/auth/token-storage';
import { TokenRefreshManager, AuthEventListener } from '@/lib/auth/token-refresh';
import { User } from '@/types/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
  refreshToken: () => Promise<void>;
  tokenStatus: ReturnType<TokenRefreshManager['getTokenStatus']>;
  addAuthListener: (listener: AuthEventListener) => void;
  removeAuthListener: (listener: AuthEventListener) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { login: baseLogin, logout: baseLogout, user: baseUser } = useBaseAuth();
  const [user, setUser] = useState<User | null>(baseUser as User | null);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenStatus, setTokenStatus] = useState<ReturnType<TokenRefreshManager['getTokenStatus']>>({
    hasAccessToken: false,
    hasRefreshToken: false,
    isExpiringSoon: false,
    isExpired: false,
    timeUntilExpiration: 0,
    autoRefreshActive: false,
  });

  const tokenRefreshManager = useRef<TokenRefreshManager | null>(null);
  const authListeners = useRef<AuthEventListener[]>([]);

  // 初始化认证状态
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setIsLoading(true);
        
        // 检查是否有有效的访问令牌
        const accessToken = TokenStorage.getAccessToken();
        if (accessToken) {
          // 获取用户信息
          const response = await fetch('/api/v2/users/me', {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const userData = await response.json();
            setUser(userData);
            baseLogin(userData);
          } else {
            // 令牌无效，清除存储
            TokenStorage.clearTokens();
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, [baseLogin]);

  // 初始化令牌刷新管理器
  useEffect(() => {
    if (typeof window !== 'undefined') {
      tokenRefreshManager.current = new TokenRefreshManager();
      
      // 添加内部事件监听器
      const internalListener: AuthEventListener = (event, data) => {
        console.log('Auth event:', event, data);
        
        switch (event) {
          case 'token_refreshed':
            // 令牌刷新成功，更新状态
            updateTokenStatus();
            break;
          case 'session_expired':
            // 会话过期，执行登出
            handleLogout();
            break;
          case 'token_refresh_failed':
            // 令牌刷新失败，可以添加重试逻辑
            console.warn('Token refresh failed:', data);
            break;
        }
      };

      tokenRefreshManager.current.addEventListener(internalListener);
      
      // 启动自动刷新
      tokenRefreshManager.current.startAutoRefresh();
      
      // 定期更新令牌状态
      const statusInterval = setInterval(updateTokenStatus, 30000); // 每30秒更新一次
      
      return () => {
        if (tokenRefreshManager.current) {
          tokenRefreshManager.current.removeEventListener(internalListener);
          tokenRefreshManager.current.destroy();
        }
        clearInterval(statusInterval);
      };
    }
  }, []);

  // 更新令牌状态
  const updateTokenStatus = useCallback(() => {
    if (tokenRefreshManager.current) {
      setTokenStatus(tokenRefreshManager.current.getTokenStatus());
    }
  }, []);

  // 登录处理
  const login = useCallback((userData: User) => {
    setUser(userData);
    baseLogin(userData);
    
    // 启动令牌自动刷新
    if (tokenRefreshManager.current) {
      tokenRefreshManager.current.startAutoRefresh();
    }
  }, [baseLogin]);

  // 登出处理
  const handleLogout = useCallback(() => {
    setUser(null);
    baseLogout();
    TokenStorage.clearTokens();
    
    // 销毁令牌刷新管理器
    if (tokenRefreshManager.current) {
      tokenRefreshManager.current.destroy();
      tokenRefreshManager.current = null;
    }
  }, [baseLogout]);

  // 刷新令牌
  const refreshToken = useCallback(async () => {
    if (!tokenRefreshManager.current) {
      throw new Error('Token refresh manager not initialized');
    }
    
    try {
      await tokenRefreshManager.current.refreshTokens();
    } catch (error) {
      console.error('Manual token refresh failed:', error);
      throw error;
    }
  }, []);

  // 添加认证监听器
  const addAuthListener = useCallback((listener: AuthEventListener) => {
    authListeners.current.push(listener);
    if (tokenRefreshManager.current) {
      tokenRefreshManager.current.addEventListener(listener);
    }
  }, []);

  // 移除认证监听器
  const removeAuthListener = useCallback((listener: AuthEventListener) => {
    const index = authListeners.current.indexOf(listener);
    if (index > -1) {
      authListeners.current.splice(index, 1);
    }
    if (tokenRefreshManager.current) {
      tokenRefreshManager.current.removeEventListener(listener);
    }
  }, []);

  // 计算认证状态
  const isAuthenticated = !!user && tokenStatus.hasAccessToken && !tokenStatus.isExpired;

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    login,
    logout: handleLogout,
    refreshToken,
    tokenStatus,
    addAuthListener,
    removeAuthListener,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}