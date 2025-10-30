'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@repo/ui';
import { useAuth } from '@repo/ui';
import { apiRequest } from '@/lib/api';
import { TokenStorage } from '@/lib/auth/token-storage';

/**
 * OAuth2.1 Authorization Callback Handler
 *
 * This page handles the OAuth callback from oauth-service-rust.
 * It receives an authorization code and exchanges it for tokens.
 *
 * Security: Uses PKCE with code_verifier validation
 */
export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();

  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // Check for errors from OAuth service
      if (errorParam) {
        setStatus('error');
        setError(errorDescription || errorParam);
        return;
      }

      // Validate authorization code
      if (!code) {
        setStatus('error');
        setError('缺少授权码');
        return;
      }

      // IMPORTANT: Read from cookies, not sessionStorage
      // These were set by middleware.ts when initiating OAuth flow
      const codeVerifier = getCookie('oauth_code_verifier');
      const storedState = getCookie('oauth_state');
      const redirectPath = getCookie('oauth_redirect_path');

      if (!codeVerifier) {
        setStatus('error');
        setError('会话已过期，请重新登录');
        return;
      }

      // CSRF protection: validate state parameter
      if (storedState && state !== storedState) {
        setStatus('error');
        setError('无效的请求，可能存在CSRF攻击');
        return;
      }

      // Exchange authorization code for tokens
      const tokenResponse = await apiRequest<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        token_type: string;
        scope: string;
      }>(
        '/api/v2/oauth/token',
        {
          method: 'POST',
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            redirect_uri: process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI || `${window.location.origin}/auth/callback`,
            client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'auth-center-admin-client',
            code_verifier: codeVerifier,
          }),
        }
      );

      // Clear OAuth cookies after successful exchange
      deleteCookie('oauth_code_verifier');
      deleteCookie('oauth_state');
      deleteCookie('oauth_redirect_path');

      // Store tokens securely
      TokenStorage.setTokens({
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresIn: tokenResponse.expires_in
      });
      localStorage.setItem(
        'token_expires_at',
        (Date.now() + tokenResponse.expires_in * 1000).toString()
      );

      // Fetch user information
      const userResponse = await apiRequest<{
        id: string;
        username: string;
        email?: string;
      }>('/api/v2/oauth/userinfo', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenResponse.access_token}`,
        },
      });

      // Update auth context
      login(userResponse);

      // Redirect to original requested path or dashboard
      const finalPath = redirectPath ? decodeURIComponent(redirectPath) : '/admin';
      setStatus('success');

      // Brief delay to show success state
      setTimeout(() => {
        router.push(finalPath);
      }, 1500);
    } catch (err) {
      console.error('OAuth callback error:', err);
      setStatus('error');
      setError(typeof err === 'string' ? err : (err as any)?.message || '认证失败，请重试');
    }
  };

  const handleRetry = () => {
    router.push('/admin');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
            {status === 'processing' && (
              <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            )}
            {status === 'success' && (
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            {status === 'error' && (
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              {status === 'processing' && '正在验证身份...'}
              {status === 'success' && '认证成功'}
              {status === 'error' && '认证失败'}
            </CardTitle>
            <CardDescription className="text-gray-600 mt-2">
              {status === 'processing' && '正在处理您的登录请求...'}
              {status === 'success' && '正在重定向到管理后台...'}
              {status === 'error' && (error || '发生未知错误')}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {status === 'processing' && (
            <div className="text-center">
              <div className="animate-pulse">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-sm text-gray-500 mt-4">正在验证您的身份，请稍候...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center">
              <p className="text-green-600 font-medium">身份验证成功！正在为您准备管理后台...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center space-y-4">
              <div className="text-red-600 text-sm">{error}</div>
              <Button
                onClick={handleRetry}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                返回管理后台
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Helper function to get cookie value
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

/**
 * Helper function to delete cookie
 */
function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;

  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

export const dynamic = 'force-dynamic';
