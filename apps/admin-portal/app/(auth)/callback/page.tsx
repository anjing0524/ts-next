'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@repo/ui';
import { useAuth } from '@repo/ui';
import { apiRequest } from '@/lib/api';
import { TokenStorage } from '@/lib/auth/token-storage';

// 强制动态渲染，避免预渲染时访问浏览器API


/**
 * OAuth2.1授权回调处理页面
 * 处理从OAuth服务返回的授权码，完成令牌交换
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

      // 检查错误
      if (errorParam) {
        setStatus('error');
        setError(errorDescription || errorParam);
        return;
      }

      // 检查授权码
      if (!code) {
        setStatus('error');
        setError('缺少授权码');
        return;
      }

      // 获取存储的code_verifier
      const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
      if (!codeVerifier) {
        setStatus('error');
        setError('会话已过期，请重新登录');
        return;
      }

      // 验证state
      const storedState = sessionStorage.getItem('oauth_state');
      if (storedState && state !== storedState) {
        setStatus('error');
        setError('无效的请求，可能存在CSRF攻击');
        return;
      }

      // 交换授权码获取令牌
      const tokenResponse = await apiRequest<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        token_type: string;
        scope: string;
      }>(
        // 统一使用OAuth服务API标准路径
        '/api/v2/oauth/token',
        {
          method: 'POST',
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            redirect_uri: process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI || `${window.location.origin}/auth/callback`,
            client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'admin-portal-client',
            code_verifier: codeVerifier,
          }),
        }
      );

      // 清理会话存储
      sessionStorage.removeItem('oauth_code_verifier');
      sessionStorage.removeItem('oauth_state');
      sessionStorage.removeItem('oauth_nonce');

      // 统一使用TokenStorage存储令牌
      TokenStorage.setTokens({
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresIn: tokenResponse.expires_in
      });
      localStorage.setItem(
        'token_expires_at',
        (Date.now() + tokenResponse.expires_in * 1000).toString()
      );

      // 获取用户信息
      const userResponse = await fetch(`${process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001'}/api/v2/users/me`, {
        headers: {
          'Authorization': `Bearer ${tokenResponse.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!userResponse.ok) {
        throw new Error('Failed to fetch user information');
      }

      const userData = await userResponse.json();

      // 更新认证状态
      login(userData);

      // 重定向到原始页面或首页
      const redirectPath = sessionStorage.getItem('redirect_after_login') || '/dashboard';
      sessionStorage.removeItem('redirect_after_login');

      setStatus('success');

      // 延迟重定向，让用户看到成功状态
      setTimeout(() => {
        router.push(redirectPath);
      }, 1500);
    } catch (err) {
      console.error('OAuth回调处理错误:', err);
      setStatus('error');
      setError(typeof err === 'string' ? err : '认证失败，请重试');
    }
  };

  const handleRetry = () => {
    router.push('/login');
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
              {(status === 'error' && error) || '发生未知错误'}
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
                返回登录页面
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// 禁用预渲染，因为组件使用了浏览器专用API
export const dynamic = 'force-dynamic';
