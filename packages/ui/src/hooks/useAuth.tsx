'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

// --- Interfaces for the Auth Provider ---

export interface AuthUser {
  id: string;
  username: string;
  permissions?: string[];
  [key: string]: any; // Allow other properties
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface AuthProviderInterface {
  fetchUser(): Promise<AuthUser | null>;
  login(username?: string): Promise<void>;
  logout(): Promise<void>;
  handleCallback(code: string, state: string | null): Promise<AuthUser | null>;
}

// --- Auth Context ---

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (user?: AuthUser | string) => void;
  logout: () => void;
  handleCallback: (code: string, state: string | null) => Promise<void>;
  hasPermission: (permission: string | string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- AuthProvider Component ---

interface AuthProviderProps {
  children: ReactNode;
  authService: AuthProviderInterface;
}

export function AuthProvider({ children, authService }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuthStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentUser = await authService.fetchUser();
      setUser(currentUser ?? null);
    } catch (e) {
      setUser(null); // Not authenticated
    } finally {
      setIsLoading(false);
    }
  }, [authService]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const login = async (user?: AuthUser | string) => {
    setIsLoading(true);
    try {
      if (typeof user === 'object' && user !== null) {
        // 如果直接传入了用户对象，直接设置用户状态
        setUser(user);
        setIsLoading(false);
      } else {
        // 否则调用 authService.login 进行 OAuth 流程
        await authService.login(user);
        // Page will be redirected by the authService
      }
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (err: any) {
      setError(err.message); // Log error but proceed with local logout
    } finally {
      setUser(null);
    }
  };

  const handleCallback = async (code: string, state: string | null) => {
    setIsLoading(true);
    try {
      const loggedInUser = await authService.handleCallback(code, state);
      setUser(loggedInUser ?? null);
    } catch (err: any) {
      setError(err.message);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const hasPermission = useCallback(
    (requiredPermission: string | string[]) => {
      if (!user?.permissions) return false;
      const permissions = new Set(user.permissions);
      if (Array.isArray(requiredPermission)) {
        return requiredPermission.every((p) => permissions.has(p));
      }
      return permissions.has(requiredPermission);
    },
    [user]
  );

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    login,
    logout,
    handleCallback,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// --- useAuth Hook ---

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
