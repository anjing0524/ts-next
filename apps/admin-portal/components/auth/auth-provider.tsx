'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TokenStorage } from '../../lib/auth/token-storage';
import { User } from '../../types/auth';
import { oauthClient } from '@/lib/oauth-client';

// Helper to generate random strings for PKCE
const generateRandomString = (length: number): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

// Helper to generate PKCE code challenge
const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return window
    .btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
  initiateLogin: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserInfo = useCallback(async (accessToken: string): Promise<User | null> => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL}/api/v2/oauth/userinfo`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    const initializeAuth = async () => {
      const accessToken = TokenStorage.getAccessToken();
      if (accessToken) {
        const userInfo = await fetchUserInfo(accessToken);
        if (userInfo) {
          setUser(userInfo);
        }
      }
      setIsLoading(false);
    };
    initializeAuth();
  }, [fetchUserInfo]);

  const login = useCallback(
    async (accessToken: string, refreshToken: string) => {
      TokenStorage.setTokens(accessToken, refreshToken);
      const userInfo = await fetchUserInfo(accessToken);
      if (userInfo) {
        setUser(userInfo);
      }
    },
    [fetchUserInfo],
  );

  const initiateLogin = useCallback(async () => {
    setIsLoading(true);
    const state = generateRandomString(32);
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    sessionStorage.setItem('oauth_state', state);
    sessionStorage.setItem('oauth_code_verifier', codeVerifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'admin-portal',
      redirect_uri: `${window.location.origin}/auth/callback`,
      scope: 'openid profile email offline_access',
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authorizeUrl = `${
      process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL
    }/api/v2/oauth/authorize?${params.toString()}`;

    window.location.href = authorizeUrl;
  }, []);

  const logout = useCallback(() => {
    const refreshToken = TokenStorage.getRefreshToken();
    if (refreshToken) {
      oauthClient.exchangeToken({ // Using exchangeToken for revoke, assuming endpoint is the same
        token: refreshToken,
        client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'admin-portal',
      }).catch(err => console.error('Failed to revoke token:', err));
    }
    TokenStorage.clearTokens();
    setUser(null);
    router.push('/login');
  }, [router]);

  const isAuthenticated = !!user;

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    login,
    logout,
    initiateLogin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}