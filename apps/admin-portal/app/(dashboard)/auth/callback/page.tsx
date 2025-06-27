'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { Terminal } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui';
import { TokenStorage } from '@/lib/auth/token-storage';

// 前端安全的OAuth配置
const OAuthConfig = {
  getTokenUrl: () => {
    const serviceUrl =
      process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001/datamgr_flow';
    return `${serviceUrl}/api/v2/oauth/token`;
  },
  getClientConfig: () => {
    const getRedirectUri = () => {
      if (typeof window !== 'undefined') {
        return `${window.location.origin}/auth/callback`;
      }
      return process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI || 'http://localhost:3002/auth/callback';
    };

    return {
      clientId: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'auth-center-admin-client',
      clientSecret: process.env.OAUTH_CLIENT_SECRET || 'authcenteradminclientsecret',
      redirectUri: getRedirectUri(),
    };
  },
};

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const exchangeCodeForToken = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // 检查OAuth错误
      if (error) {
        setError(errorDescription || error || 'OAuth authorization failed.');
        setIsLoading(false);
        return;
      }

      if (!code) {
        setError('Authorization code not found in callback.');
        setIsLoading(false);
        return;
      }

      // 获取存储的PKCE参数
      const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
      const storedState = sessionStorage.getItem('oauth_state');

      if (!codeVerifier) {
        setError('Code verifier not found. Please try logging in again.');
        setIsLoading(false);
        return;
      }

      // 验证state参数防止CSRF攻击
      if (storedState !== state) {
        setError('Invalid state parameter. Possible CSRF attack detected.');
        setIsLoading(false);
        return;
      }

      // 清理sessionStorage
      sessionStorage.removeItem('oauth_code_verifier');
      sessionStorage.removeItem('oauth_state');

      try {
        // 使用OAuth2授权码交换访问令牌
        const clientConfig = OAuthConfig.getClientConfig();
        const formData = new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: clientConfig.redirectUri,
          client_id: clientConfig.clientId,
          code_verifier: codeVerifier,
        });

        const response = await fetch(OAuthConfig.getTokenUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${btoa(`${clientConfig.clientId}:${clientConfig.clientSecret}`)}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error_description: 'Failed to exchange authorization code for tokens.',
          }));
          throw new Error(
            errorData.error_description || errorData.error || 'Token exchange failed.'
          );
        }

        const tokenData = await response.json();

        if (!tokenData.access_token) {
          throw new Error('No access token received from server.');
        }

        // 使用TokenStorage存储令牌
        TokenStorage.setTokens(tokenData.access_token, tokenData.refresh_token);

        // 重定向到仪表板
        const redirectTo = '/admin';
        router.push(redirectTo);
      } catch (err) {
        console.error('Token exchange error:', err);
        setError(
          err instanceof Error ? err.message : 'An unexpected error occurred during token exchange.'
        );
        setIsLoading(false);
      }
    };

    exchangeCodeForToken();
  }, [router, searchParams]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="text-lg font-semibold text-gray-700">Processing authentication...</p>
          <p className="text-sm text-gray-500">Please wait while we complete your login</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-50 p-4">
        <Alert variant="destructive" className="max-w-md">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Authentication Error</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>{error}</p>
            <button
              onClick={() => router.push('/login')}
              className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Return to Login
            </button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // 不应该到达这里，但作为后备
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <p>Redirecting...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-lg font-semibold">Loading...</p>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
