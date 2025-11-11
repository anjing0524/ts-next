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
import { User } from '@/types/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
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

  // 登录处理
  const login = useCallback((userData: User) => {
    setUser(userData);
    baseLogin(userData);
  }, [baseLogin]);

  // 登出处理
  const handleLogout = useCallback(() => {
    setUser(null);
    baseLogout();
    TokenStorage.clearTokens();
  }, [baseLogout]);

  // 计算认证状态
  const isAuthenticated = !!user;

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    login,
    logout: handleLogout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}