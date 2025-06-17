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

// This is a simplified hook. In a real app, consider:
// - Secure token storage (HttpOnly cookies are best, otherwise localStorage with CSRF protection)
// - Token refresh logic
// - More robust error handling
// - Using React Context for providing auth state globally if preferred

/**
 * 模拟的客户端认证 Hook (Simulated Client-Side Authentication Hook)
 *
 * 功能 (Features):
 * - 从 localStorage 加载和保存认证令牌 (Loads and saves auth token from localStorage).
 * - (模拟) 根据令牌获取用户信息和权限 (Simulates fetching user info and permissions based on token).
 * - 提供登出功能 (Provides logout functionality).
 *
 * 注意 (Note):
 * - 这是一个简化的实现，用于UI原型设计。 (This is a simplified implementation for UI prototyping.)
 * - 生产环境中应使用更安全的令牌存储机制 (如 HttpOnly cookies)。
 *   (In a production environment, use more secure token storage like HttpOnly cookies.)
 * - 权限列表是模拟的，实际应从后端API获取或从JWT声明中解码。
 *   (Permissions list is simulated; in reality, it should be fetched from a backend API or decoded from JWT claims.)
 */
export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    error: null,
  });
  const router = useRouter();

  const fetchUserAndPermissions = useCallback(async (authToken: string) => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      // 模拟API调用或JWT解码 (Simulate API call or JWT decoding)
      // const decodedToken = jwt.decode(authToken); // Example if using a JWT library client-side
      // const userProfile = await apiClient.get('/api/v2/account/profile', { token: authToken });
      // const permissionsResponse = await apiClient.get('/api/v2/account/permissions', { token: authToken });

      // --- Placeholder/Mocked Data ---
      // In a real app, this would come from an API call or decoding the JWT
      let permissions: string[] = [];
      let username = 'mockUser';
      let id = 'mock-user-id';

      // Simulate different users/permissions based on a mock token or username
      if (authToken === 'admin-token-full-permissions') { // Example token for admin
        username = 'adminUser';
        id = 'admin-user-id-123';
        permissions = [
          'menu:dashboard:view', 'menu:system:view',
          'menu:system:user:view', 'users:list', 'users:create', 'users:read', 'users:update', 'users:delete', 'users:manage_roles',
          'menu:system:role:view', 'roles:list', 'roles:create', 'roles:read', 'roles:update', 'roles:delete', 'roles:manage_permissions',
          'menu:system:permission:view', 'permissions:list', 'permissions:create', 'permissions:read', 'permissions:update', 'permissions:delete',
          'menu:system:client:view', 'clients:list', 'clients:create', 'clients:read', 'clients:update', 'clients:delete',
          'menu:system:scope:view', 'scopes:list', 'scopes:create', 'scopes:read', 'scopes:update', 'scopes:delete',
          'menu:system:audit:view', 'audit:list',
        ];
      } else if (authToken === 'user-token-limited-permissions') { // Example token for a limited user
        username = 'limitedUser';
        id = 'limited-user-id-456';
        permissions = ['menu:dashboard:view', 'menu:profile:view', 'profile:me:read', 'profile:me:update'];
      } else {
        // Default mock for any other token
        permissions = ['menu:dashboard:view', 'menu:profile:view'];
      }
      // --- End Placeholder/Mocked Data ---

      const mockUser: AuthenticatedUser = {
        id,
        username,
        displayName: username.charAt(0).toUpperCase() + username.slice(1),
        permissions,
      };
      // --- End Placeholder Data ---

      setAuthState({ user: mockUser, token: authToken, isLoading: false, error: null });
    } catch (err) {
      console.error("Failed to fetch user/permissions:", err);
      setAuthState({ user: null, token: null, isLoading: false, error: 'Failed to load user data.' });
      // Consider removing token from localStorage if it's invalid
      if (typeof window !== 'undefined') {
        localStorage.removeItem('authToken');
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('authToken');
      if (storedToken) {
        fetchUserAndPermissions(storedToken);
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false })); // No token, not loading
      }
    }
  }, [fetchUserAndPermissions]);

  const login = async (/* username, password */) => {
    // Placeholder for actual login logic which would call the backend
    // For this hook, we assume login happens elsewhere (e.g. login page)
    // and this hook is primarily for loading the session from a stored token.
    // After successful login, the token would be stored:
    // const MOCK_TOKEN_AFTER_LOGIN = "admin-token-full-permissions"; // or "user-token-limited-permissions"
    // localStorage.setItem('authToken', MOCK_TOKEN_AFTER_LOGIN);
    // await fetchUserAndPermissions(MOCK_TOKEN_AFTER_LOGIN);
    // router.push('/admin'); // Or desired redirect path
    console.warn("useAuth: login function is a placeholder. Actual login should set 'authToken' in localStorage and call fetchUserAndPermissions or reload.");
  };

  const logout = useCallback(async () => {
    // In a real app, also call the backend logout endpoint:
    // await apiClient.post('/api/v2/auth/logout', {}, { token: authState.token });
    console.log("Logging out, clearing token.");
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken');
    }
    setAuthState({ user: null, token: null, isLoading: false, error: null });
    router.push('/login'); // Redirect to login page
  }, [router, authState.token]);

  // Function to manually set token for testing or after login page sets it
  const setToken = (token: string | null) => {
    if (token) {
        localStorage.setItem('authToken', token);
        fetchUserAndPermissions(token);
    } else {
        localStorage.removeItem('authToken');
        setAuthState({ user: null, token: null, isLoading: false, error: null });
    }
  };


  return { ...authState, login, logout, setToken, fetchUserAndPermissions };
}
