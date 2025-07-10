'use client';

import { useAuth } from '@repo/ui';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@repo/ui';

function ConsentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const responseType = searchParams.get('response_type');
  const scope = searchParams.get('scope');
  const state = searchParams.get('state');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');

  // 检查必要参数
  if (!clientId || !redirectUri || responseType !== 'code') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">错误</CardTitle>
          </CardHeader>
          <CardContent>
            <p>缺少必要的OAuth参数（client_id、redirect_uri或response_type）。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 格式化权限范围
  const formattedScope = scope
    ? scope
        .split(/[\s,_]+/)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(', ')
    : '基础账户访问权限';

  // 处理授权确认
  const handleConsent = async (action: 'allow' | 'deny') => {
    try {
      // 构建授权确认URL
      const consentUrl = new URL('/api/v2/oauth/consent', window.location.origin);
      consentUrl.searchParams.set('client_id', clientId);
      consentUrl.searchParams.set('redirect_uri', redirectUri);
      consentUrl.searchParams.set('response_type', responseType);
      consentUrl.searchParams.set('scope', scope || '');
      consentUrl.searchParams.set('state', state || '');
      consentUrl.searchParams.set('code_challenge', codeChallenge || '');
      consentUrl.searchParams.set('code_challenge_method', codeChallengeMethod || 'S256');
      consentUrl.searchParams.set('action', action);

      // 发送授权确认请求
      const response = await fetch(consentUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          user_id: user?.id || 'unknown',
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.redirect_uri) {
          // 跳转到第三方应用
          window.location.href = result.redirect_uri;
        } else {
          // 跳转到管理后台
          router.push('/admin');
        }
      } else {
        console.error('授权确认失败');
      }
    } catch (error) {
      console.error('授权确认错误:', error);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-100 to-slate-300 dark:from-slate-900 dark:to-slate-800">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="space-y-2 text-center border-b pb-6">
          <CardTitle className="text-3xl font-bold tracking-tight">授权应用</CardTitle>
          <CardDescription className="text-gray-600 text-base">
            应用 <strong className="text-indigo-600">{clientId}</strong> 正在请求访问您的账户。
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-800">请求的权限：</h3>
            <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
              <ul className="list-disc list-inside space-y-1 text-gray-700">
                <li>
                  访问和管理您的 <strong className="font-medium">{formattedScope}</strong>。
                </li>
              </ul>
            </div>
          </div>

          <div className="text-sm text-gray-700 bg-slate-50 border border-slate-200 rounded-md p-4">
            <p>
              当前登录用户：{' '}
              <strong className="font-medium text-indigo-600">{user?.username || '未知用户'}</strong>。
            </p>
            <p className="text-xs text-gray-500 mt-1">
              如果这不是您，请取消并重新登录正确的账户。
            </p>
          </div>

          <p className="text-center font-medium text-gray-700 pt-2 text-base">
            您是否授权 <strong className="text-indigo-600">{clientId}</strong> 访问这些权限？
          </p>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-center items-center space-y-3 sm:space-y-0 sm:space-x-6 pt-6 border-t">
          <Button
            onClick={() => handleConsent('deny')}
            variant="outline"
            size="lg"
            className="w-full border-gray-400 hover:bg-gray-100 text-gray-700"
          >
            拒绝访问
          </Button>
          <Button
            onClick={() => handleConsent('allow')}
            variant="default"
            size="lg"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            允许访问
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function ConsentPage() {
  const { user, isLoading } = useAuth();

  // 如果未登录，跳转到登录页面
  if (!isLoading && !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">需要登录</CardTitle>
          </CardHeader>
          <CardContent>
            <p>您需要先登录才能进行授权确认。</p>
            <Button 
              onClick={() => window.location.href = '/login'}
              className="mt-4"
            >
              前往登录
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Suspense fallback={<div>加载中...</div>}>
      <ConsentContent />
    </Suspense>
  );
} 