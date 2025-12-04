'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@repo/ui';
import { apiRequest, api } from '@/lib/api';

interface ConsentApiData {
  client: { id: string; name: string; logoUri?: string | null };
  requested_scopes: { name: string; description: string }[];
  user: { id: string; username: string | null };
  consent_form_action_url: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  state?: string;
  response_type: string;
  code_challenge?: string;
  code_challenge_method?: string;
  nonce?: string;
}

function ConsentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // 注意：不需要 useAuth()，用户信息来自 OAuth Service 的 API 响应（apiData.user）

  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const responseType = searchParams.get('response_type');
  const scope = searchParams.get('scope');
  const state = searchParams.get('state');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');
  const nonce = searchParams.get('nonce');

  const [apiData, setApiData] = useState<ConsentApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId || !redirectUri || !responseType) {
      setLoading(false);
      setError('缺少必要的OAuth参数');
      return;
    }

    // 拼接API参数
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: responseType,
      scope: scope || '',
      state: state || '',
      code_challenge: codeChallenge || '',
      code_challenge_method: codeChallengeMethod || 'S256',
      nonce: nonce || '',
    });

    // 调用OAuth服务获取同意信息
    apiRequest<ConsentApiData>(`/oauth/consent/info?${params.toString()}`)
      .then((response) => {
        setApiData(response);
        setLoading(false);
      })
      .catch((err: any) => {
        // 使用 ApiError 类判断错误类型
        // Use ApiError class to determine error type
        if (err.isSessionExpired?.()) {
          const currentUrl = encodeURIComponent(window.location.href);
          window.location.href = `/login?redirect=${currentUrl}`;
          return;
        }

        const errorMessage = typeof err === 'string' ? err : err.getUserFriendlyMessage?.() || err.message || '加载同意信息失败';
        setError(errorMessage);
        setLoading(false);
      });
  }, [
    clientId,
    redirectUri,
    responseType,
    scope,
    state,
    codeChallenge,
    codeChallengeMethod,
    nonce,
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-100 to-slate-200">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600">正在加载授权信息...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-100 to-slate-200">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">加载失败</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.reload()} className="w-full">
              重试
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 检查必要参数
  if (!clientId || !redirectUri || responseType !== 'code') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-100 to-slate-200">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">参数错误</CardTitle>
            <CardDescription>缺少必要的OAuth参数或参数格式不正确</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/')} className="w-full">
              返回首页
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 处理授权确认
  const handleConsent = async (action: 'allow' | 'deny') => {
    try {
      // 优先调用api.submitConsent，统一后端接口
      const consentParams = new URLSearchParams({
        decision: action,
        client_id: clientId!,
        redirect_uri: redirectUri!,
        scope: scope || '',
        response_type: responseType!,
        state: state || '',
        code_challenge: codeChallenge || '',
        code_challenge_method: codeChallengeMethod || 'S256',
        nonce: nonce || '',
      });
      // 调用统一的submitConsent工具函数
      const response = await api.submitConsent(action, consentParams);
      if (response.redirect_uri) {
        window.location.href = response.redirect_uri;
      } else {
        throw new Error('无效的响应');
      }
    } catch (error: any) {
      console.error('授权确认错误:', error);
      // 使用 ApiError 类判断 Session 过期
      // Use ApiError class to check session expiration
      if (error.isSessionExpired?.()) {
        const currentUrl = encodeURIComponent(window.location.href);
        window.location.href = `/login?redirect=${currentUrl}`;
        return;
      }
      const errorMessage = error.getUserFriendlyMessage?.() || '处理授权请求失败，请重试';
      setError(errorMessage);
    }
  };

  // 格式化权限范围
  const formatScopes = (scopes: string) => {
    return scopes
      .split(/[\s,_]+/)
      .filter((s) => s.trim())
      .map((s) => s.trim())
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(', ');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <Card className="w-full max-w-lg shadow-2xl border-0">
        <CardHeader className="space-y-4 text-center border-b pb-6">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
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
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <div>
            <CardTitle className="text-3xl font-bold tracking-tight text-gray-900">
              授权应用访问
            </CardTitle>
            <CardDescription className="text-gray-600 text-lg mt-2">
              应用 <strong className="text-indigo-600">{apiData?.client.name || clientId}</strong>{' '}
              正在请求访问您的账户
            </CardDescription>
            {apiData?.client.logoUri && (
              <img
                src={apiData.client.logoUri}
                alt="应用Logo"
                className="mx-auto h-12 w-12 rounded-full mt-3 border-2 border-gray-200"
              />
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center">
              <svg
                className="w-5 h-5 mr-2 text-indigo-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              请求的权限范围
            </h3>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <ul className="space-y-2">
                {apiData?.requested_scopes.map((scope) => (
                  <li key={scope.name} className="flex items-start">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    <div>
                      <strong className="font-medium text-gray-900">{scope.name}</strong>
                      <p className="text-sm text-gray-600 mt-1">{scope.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg
                className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="text-sm text-blue-800">
                  <strong>当前用户：</strong>{' '}
                  {apiData?.user.username || '未知用户'}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  如果这不是您的账户，请取消并重新登录正确的账户。
                </p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-lg font-medium text-gray-800">
              您是否授权{' '}
              <strong className="text-indigo-600">{apiData?.client.name || clientId}</strong>{' '}
              访问上述权限？
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row justify-center items-center space-y-3 sm:space-y-0 sm:space-x-4 pt-6 border-t">
          <Button
            onClick={() => handleConsent('deny')}
            variant="outline"
            size="lg"
            className="w-full sm:w-auto border-gray-300 hover:bg-gray-50 text-gray-700 font-medium"
          >
            拒绝访问
          </Button>
          <Button
            onClick={() => handleConsent('allow')}
            variant="default"
            size="lg"
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
          >
            允许访问
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function ConsentPage() {
  /**
   * 同意页面不需要检查 admin-portal 的 access_token
   *
   * 重要：同意页面是由 OAuth Service 重定向到达的。用户已经通过 OAuth Service 登录
   * （有 session_token），但可能没有 admin-portal 的 access_token。
   *
   * 认证流程：
   * 1. 用户访问 OAuth Service 的 /authorize 端点
   * 2. OAuth Service 检查 session_token（用户是否已登录）
   * 3. 如果用户未登录，OAuth Service 重定向到 /login?redirect=...
   * 4. 如果用户已登录但需要同意，OAuth Service 重定向到 /oauth/consent?...
   * 5. 同意页面调用 /oauth/consent API 获取同意信息（已包含用户信息）
   * 6. 如果 API 调用失败（如用户未登录），ConsentContent 会显示错误
   *
   * 因此，不需要在这里检查 useAuth()（admin-portal 的 access_token）
   * OAuth Service 已经保证了用户已登录
   */
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-600">加载中...</p>
          </div>
        </div>
      }
    >
      <ConsentContent />
    </Suspense>
  );
}
