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

// hooks/useAuth.ts
// - Secure token storage: Access token in memory (via state), Refresh token in sessionStorage.
// - Token refresh logic implemented.
// - Real API calls for user profile and permissions.

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


export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null, // This will be the access_token
    isLoading: true,
    error: null,
  });
  const router = useRouter();

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || ''; // Ensure this is configured

  const performLogout = useCallback(async (shouldRevokeToken: boolean = true) => {
    const currentToken = authState.token || getCookie('auth_token');
    const refreshToken = typeof window !== 'undefined' ? sessionStorage.getItem('refresh_token') : null;

    setAuthState({ user: null, token: null, isLoading: false, error: null });
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('refresh_token');
      deleteCookie('auth_token'); // Clear access token cookie
    }

    if (shouldRevokeToken && currentToken) {
      try {
        // Attempt to revoke the refresh token if available, then access token
        // The backend /api/v2/oauth/revoke should handle revoking both if possible based on the token provided
        const tokenToRevoke = refreshToken || currentToken;
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


  const fetchUserAndPermissions = useCallback(async (accessToken: string) => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null, token: accessToken }));
    try {
      const profileResponse = await fetch(`${API_BASE_URL}/api/v2/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!profileResponse.ok) {
        if (profileResponse.status === 401) { // Token likely expired or invalid
          throw new Error('Unauthorized: Profile fetch failed'); // Trigger refresh or logout
        }
        const errorData = await profileResponse.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error_description || `Failed to fetch profile: ${profileResponse.statusText}`);
      }
      const profileData = await profileResponse.json();

      // Assuming /api/v2/auth/me returns permissions directly or we make another call
      // For simplicity, let's assume permissions are part of profileData.data.permissions
      const userPermissions = profileData.data?.permissions || [];

      const fetchedUser: AuthenticatedUser = {
        id: profileData.data.id,
        username: profileData.data.username,
        displayName: profileData.data.displayName || profileData.data.username,
        avatar: profileData.data.avatar,
        permissions: userPermissions,
      };
      setAuthState({ user: fetchedUser, token: accessToken, isLoading: false, error: null });
      setCookie('auth_token', accessToken, 1/24 * 0.95); // Store access token in cookie for ~57 mins (if 1hr expiry)

    } catch (err: any) {
      console.error("Failed to fetch user/permissions:", err.message);
      // If fetching user fails (e.g. 401), attempt to refresh the token
      if (err.message.includes('Unauthorized')) {
        const success = await refreshToken();
        if (!success) {
          performLogout(false); // If refresh fails, logout without trying to revoke (token might be invalid)
        }
      } else {
        setAuthState(prev => ({ ...prev, user: null, token: null, isLoading: false, error: 'Failed to load user data.' }));
        performLogout(false);
      }
    }
  }, [API_BASE_URL, performLogout]); // Added performLogout to dependencies

  const refreshToken = useCallback(async (): Promise<boolean> => {
    const storedRefreshToken = typeof window !== 'undefined' ? sessionStorage.getItem('refresh_token') : null;
    if (!storedRefreshToken) {
      console.log('No refresh token available.');
      return false;
    }

    try {
      const clientId = process.env.NEXT_PUBLIC_AUTH_CENTER_CLIENT_ID || 'auth-center-self';
      const response = await fetch(`${API_BASE_URL}/api/v2/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: storedRefreshToken,
          client_id: clientId, // Client ID for the admin UI
        }),
      });

      if (!response.ok) {
        console.error('Refresh token request failed:', response.status, await response.text());
        return false;
      }

      const data = await response.json();
      if (data.access_token) {
        setCookie('auth_token', data.access_token, 1/24 * 0.95); // Store new access token
        if (data.refresh_token && typeof window !== 'undefined') {
          sessionStorage.setItem('refresh_token', data.refresh_token); // Store new refresh token
        }
        await fetchUserAndPermissions(data.access_token); // Fetch user info with new token
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error refreshing token:', error);
      return false;
    }
  }, [API_BASE_URL, fetchUserAndPermissions]);


  useEffect(() => {
    const initialAccessToken = getCookie('auth_token');
    if (initialAccessToken) {
      fetchUserAndPermissions(initialAccessToken);
    } else {
      // Try to refresh if no access token but refresh token might exist (e.g. page reload after access token expired)
      const attemptRefresh = async () => {
        const success = await refreshToken();
        if (!success) {
          setAuthState(prev => ({ ...prev, isLoading: false })); // No tokens, not loading
          // If not on login page, redirect to login
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
             // Avoid immediate logout if already on login page due to refresh failure
            if(sessionStorage.getItem('refresh_token')) { // only logout if there was a token to fail
                performLogout(false);
            }
          }
        }
      };
      attemptRefresh();
    }
  }, [fetchUserAndPermissions, refreshToken, performLogout]); // Initial load & token check

  // Login function is now mostly a placeholder as actual login (OAuth flow)
  // happens on /login and /auth/callback pages.
  // This hook primarily manages the session after tokens are obtained.
  const login = async () => {
    console.warn("useAuth: login function called. OAuth flow should handle actual login. This function is a placeholder.");
    // Typically, after OAuth login, the callback page would store tokens
    // and then redirect, causing this hook's useEffect to pick them up.
  };

  // setToken is called by OAuth callback page after successful token exchange
  const setTokensAndFetchUser = useCallback(async (newAccessToken: string, newRefreshToken?: string) => {
    setCookie('auth_token', newAccessToken, 1/24 * 0.95); // Store access token in cookie
    if (newRefreshToken && typeof window !== 'undefined') {
      sessionStorage.setItem('refresh_token', newRefreshToken);
    }
    await fetchUserAndPermissions(newAccessToken);
  }, [fetchUserAndPermissions]);

  return { ...authState, login, logout: performLogout, setToken: setTokensAndFetchUser, refreshToken };
}
